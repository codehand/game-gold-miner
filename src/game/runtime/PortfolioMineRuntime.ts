import { getMineBalance, type MineSiteId } from '../../config';
import {
  createCatProductionModifiers,
  createEmptyCatRoster,
  assignCatToSlot,
  getRoleForSlot,
  activeGameState,
  enterMine,
  enterMineWithPendingClaim,
  previewMineOfflineGrant,
  purchaseMine,
  replaceActiveGameState,
  settlePendingMineClaim,
  suspendActiveMine,
  type CatRosterState,
  type CatSlotKey,
  type BareCatSlotKey,
  type CatAssignmentResult,
  type GameState,
  GameNumber,
  type MineEnterResult,
  type MinePurchaseResult,
  type PortfolioState,
  type OfflineGrant,
  type BoostState,
  EMPTY_BOOST_STATE,
} from '../../core';
import {
  migratePortfolioCatRoster,
  projectCatRosterToMine,
  qualifyMineCatSlot,
} from '../../core/portfolio/portfolioCatRoster';
import type { MineViewModel, PurchaseOutcome, PurchaseTarget } from '../view-model';
import {
  MineSimulationDriver,
  type MineRuntimePort,
} from './MineSimulationDriver';

export interface PortfolioMineRuntimeOptions {
  readonly portfolio: PortfolioState;
  readonly catRoster?: CatRosterState;
  readonly boostState?: BoostState;
  readonly now: () => number;
  readonly onCommandApplied?: (portfolio: PortfolioState) => void;
}

export type PortfolioCommit = (
  portfolio: PortfolioState,
  catRoster: CatRosterState,
  savedAtTimestampMs: number,
) => Promise<void>;

export type DurableMinePurchaseResult = MinePurchaseResult | {
  readonly status: 'save-failed' | 'busy';
  readonly portfolio: PortfolioState;
};

export type DurableMineEnterResult = MineEnterResult | {
  readonly status: 'save-failed' | 'busy';
  readonly portfolio: PortfolioState;
};

export type DurableCatAssignmentResult = CatAssignmentResult | {
  readonly success: false;
  readonly reason: 'save-failed' | 'busy';
};

/** Keeps the existing Phaser scene port while changing which mine it reads. */
export class PortfolioMineRuntime implements MineRuntimePort {
  readonly #now: () => number;
  readonly #onCommandApplied: ((portfolio: PortfolioState) => void) | null;
  #portfolio: PortfolioState;
  #catRoster: CatRosterState;
  #activeCatRoster: CatRosterState;
  #boostState: BoostState;
  #driver: MineSimulationDriver;
  #commandPending = false;

  public constructor(options: PortfolioMineRuntimeOptions) {
    if (options.portfolio.activeMineId === null) {
      throw new Error('Portfolio runtime requires an entered foreground mine.');
    }
    this.#now = options.now;
    this.#onCommandApplied = options.onCommandApplied ?? null;
    this.#portfolio = options.portfolio;
    this.#catRoster = migratePortfolioCatRoster(options.catRoster ?? createEmptyCatRoster());
    this.#activeCatRoster = this.#projectCatRoster();
    this.#boostState = options.boostState ?? EMPTY_BOOST_STATE;
    this.#driver = this.#createDriver();
  }

  public get portfolio(): PortfolioState {
    if (this.#portfolio.activeMineId !== null) this.#capture();
    return this.#portfolio;
  }

  public get activeMineId(): MineSiteId {
    const mineId = this.#portfolio.activeMineId;
    if (mineId === null) throw new Error('No foreground mine is selected.');
    return mineId;
  }

  public get mineSiteId(): MineSiteId {
    return this.#portfolio.activeMineId ?? this.#portfolio.selectedMineId;
  }

  public get state(): GameState {
    return this.#driver.state;
  }

  public get catRoster(): CatRosterState {
    return this.#activeCatRoster;
  }

  /** The account roster retained in the save, including Gold assignments. */
  public get fullCatRoster(): CatRosterState {
    return this.#catRoster;
  }

  public get boostState(): BoostState {
    return this.#boostState;
  }

  public get snapshot(): MineViewModel {
    return this.#driver.snapshot;
  }

  public advance(): MineViewModel {
    if (this.#commandPending || this.#portfolio.activeMineId === null) {
      return this.#driver.snapshot;
    }
    const snapshot = this.#driver.advance();
    this.#capture();
    return snapshot;
  }

  public purchase(target: PurchaseTarget): PurchaseOutcome {
    this.#assertCommandAvailable();
    this.#assertActive();
    const outcome = this.#driver.purchase(target);
    this.#capture();
    return outcome;
  }

  public purchaseMineShaftBatch(floorId: string, quantity: number): PurchaseOutcome {
    this.#assertCommandAvailable();
    this.#assertActive();
    const outcome = this.#driver.purchaseMineShaftBatch(floorId, quantity);
    this.#capture();
    return outcome;
  }

  public purchaseUpgradeBatch(
    target: Exclude<PurchaseTarget, { type: 'floor-unlock' }>,
    quantity: number,
  ): PurchaseOutcome {
    this.#assertCommandAvailable();
    this.#assertActive();
    const outcome = this.#driver.purchaseUpgradeBatch(target, quantity);
    this.#capture();
    return outcome;
  }

  public buyMine(mineId: MineSiteId): MinePurchaseResult {
    this.#assertCommandAvailable();
    if (this.#portfolio.activeMineId === null) {
      return { status: 'not-active', portfolio: this.#portfolio };
    }
    this.advance();
    const result = purchaseMine(
      this.#portfolio,
      mineId,
      this.#now(),
      createCatProductionModifiers(this.#activeCatRoster),
    );
    this.#portfolio = result.portfolio;
    if (result.status === 'purchased') {
      this.#driver.replaceState(activeGameState(this.#portfolio)!);
      this.#onCommandApplied?.(this.#portfolio);
    }
    return result;
  }

  public previewOfflineReward(mineId: MineSiteId): OfflineGrant | null {
    this.advance();
    return previewMineOfflineGrant(this.#portfolio, mineId, this.#now(), this.#boostState);
  }

  public enterMine(mineId: MineSiteId): MineEnterResult {
    this.#assertCommandAvailable();
    this.advance();
    const result = enterMine(
      this.#portfolio,
      mineId,
      this.#now(),
      createCatProductionModifiers(this.#activeCatRoster),
      this.#boostState,
    );
    if (result.status === 'entered') {
      const nextRoster = this.#projectCatRoster(result.portfolio.selectedMineId);
      const nextDriver = this.#createDriver(result.portfolio, nextRoster);
      this.#portfolio = result.portfolio;
      this.#activeCatRoster = nextRoster;
      this.#driver = nextDriver;
      this.#onCommandApplied?.(this.#portfolio);
    }
    return result;
  }

  /** Freeze foreground ticks while one cloud command owns the portfolio. */
  public beginCloudCommand(): () => void {
    this.#assertCommandAvailable();
    this.#commandPending = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#commandPending = false;
    };
  }

  /**
   * Enter at the exact pre-upload timestamp while leaving the target reward
   * outside the wallet until the server returns its authoritative amount.
   */
  public enterMineWithPendingClaim(
    mineId: MineSiteId,
    timestampMs: number,
  ): MineEnterResult {
    this.#assertCommandAvailable();
    const result = enterMineWithPendingClaim(
      this.#portfolio,
      mineId,
      timestampMs,
      createCatProductionModifiers(this.#activeCatRoster),
      this.#boostState,
    );
    if (result.status === 'entered') {
      const nextRoster = this.#projectCatRoster(result.portfolio.selectedMineId);
      const nextDriver = this.#createDriver(result.portfolio, nextRoster);
      this.#portfolio = result.portfolio;
      this.#activeCatRoster = nextRoster;
      this.#driver = nextDriver;
      this.#onCommandApplied?.(this.#portfolio);
    }
    return result;
  }

  /** Apply a server receipt to the frozen claim without replacing live state. */
  public settlePendingClaim(
    mineId: MineSiteId,
    sequence: number,
    reward: GameNumber,
  ): void {
    this.#assertCommandAvailable();
    this.#capture();
    this.#portfolio = settlePendingMineClaim(
      this.#portfolio,
      mineId,
      sequence,
      reward,
    );
    if (this.#portfolio.activeMineId !== null) {
      this.#driver.replaceState(activeGameState(this.#portfolio)!);
    }
    this.#onCommandApplied?.(this.#portfolio);
  }

  /** A failed local write leaves ownership, wallet and claim cursor unchanged. */
  public async buyMineDurably(
    mineId: MineSiteId,
    commit: PortfolioCommit,
  ): Promise<DurableMinePurchaseResult> {
    if (this.#commandPending) return { status: 'busy', portfolio: this.#portfolio };
    if (this.#portfolio.activeMineId === null) {
      return { status: 'not-active', portfolio: this.#portfolio };
    }
    this.advance();
    const timestampMs = this.#now();
    const result = purchaseMine(
      this.#portfolio,
      mineId,
      timestampMs,
      createCatProductionModifiers(this.#activeCatRoster),
    );
    if (result.status !== 'purchased') return result;
    this.#commandPending = true;
    try {
      await commit(result.portfolio, this.#catRoster, timestampMs);
      this.#portfolio = result.portfolio;
      this.#driver.replaceState(activeGameState(this.#portfolio)!);
      return result;
    } catch {
      return { status: 'save-failed', portfolio: this.#portfolio };
    } finally {
      this.#commandPending = false;
    }
  }

  /** A failed local write retains the target interval for an exact retry. */
  public async enterMineDurably(
    mineId: MineSiteId,
    commit: PortfolioCommit,
  ): Promise<DurableMineEnterResult> {
    if (this.#commandPending) return { status: 'busy', portfolio: this.#portfolio };
    this.advance();
    const timestampMs = this.#now();
    const result = enterMine(
      this.#portfolio,
      mineId,
      timestampMs,
      createCatProductionModifiers(this.#activeCatRoster),
      this.#boostState,
    );
    if (result.status !== 'entered') return result;
    let nextRoster: CatRosterState;
    let nextDriver: MineSimulationDriver;
    try {
      nextRoster = this.#projectCatRoster(result.portfolio.selectedMineId);
      nextDriver = this.#createDriver(result.portfolio, nextRoster);
    } catch {
      return { status: 'save-failed', portfolio: this.#portfolio };
    }
    this.#commandPending = true;
    try {
      await commit(result.portfolio, this.#catRoster, timestampMs);
      this.#portfolio = result.portfolio;
      this.#activeCatRoster = nextRoster;
      this.#driver = nextDriver;
      return result;
    } catch {
      return { status: 'save-failed', portfolio: this.#portfolio };
    } finally {
      this.#commandPending = false;
    }
  }

  public replaceState(state: GameState): void {
    if (this.#portfolio.activeMineId === null) {
      throw new Error('Cannot replace the state of a suspended mine.');
    }
    this.#driver.replaceState(state);
    this.#capture();
    this.#onCommandApplied?.(this.#portfolio);
  }

  /** Adopts the exact server-accepted portfolio after a revisioned command. */
  public adoptPortfolio(portfolio: PortfolioState, roster: CatRosterState = this.#catRoster): void {
    if (this.#commandPending) throw new Error('A mine command is already pending.');
    const fullRoster = migratePortfolioCatRoster(roster);
    if (portfolio.activeMineId !== null) {
      const activeRoster = projectCatRosterToMine(fullRoster, portfolio.activeMineId);
      const driver = this.#createDriver(portfolio, activeRoster);
      this.#portfolio = portfolio;
      this.#catRoster = fullRoster;
      this.#activeCatRoster = activeRoster;
      this.#driver = driver;
      return;
    }
    this.#portfolio = portfolio;
    this.#catRoster = fullRoster;
    this.#activeCatRoster = projectCatRosterToMine(fullRoster, portfolio.selectedMineId);
  }

  public replaceCatRoster(roster: CatRosterState): void {
    this.#catRoster = migratePortfolioCatRoster(roster);
    this.#activeCatRoster = this.#projectCatRoster();
    this.#driver.replaceCatRoster(this.#activeCatRoster);
    this.#onCommandApplied?.(this.#portfolio);
  }

  public async assignCatDurably(
    slotKey: CatSlotKey,
    catInstanceId: string | null,
    expectedAssignmentRevision: number,
    commit: PortfolioCommit,
  ): Promise<DurableCatAssignmentResult> {
    if (this.#commandPending) return { success: false, reason: 'busy' };
    if (slotKey.startsWith('mine:') || getRoleForSlot(slotKey) === null) {
      return { success: false, reason: 'unknown-slot' };
    }
    this.advance();
    const timestampMs = this.#now();
    const qualifiedSlot = qualifyMineCatSlot(this.activeMineId, slotKey as BareCatSlotKey);
    const result = assignCatToSlot(
      this.#catRoster,
      qualifiedSlot,
      catInstanceId,
      expectedAssignmentRevision,
      timestampMs,
    );
    if (!result.success) return result;
    const projection = projectCatRosterToMine(result.state, this.activeMineId);
    this.#commandPending = true;
    try {
      await commit(this.#portfolio, result.state, timestampMs);
      this.#catRoster = result.state;
      this.#activeCatRoster = projection;
      this.#driver.replaceCatRoster(projection);
      return result;
    } catch {
      return { success: false, reason: 'save-failed' };
    } finally {
      this.#commandPending = false;
    }
  }

  public replaceBoostState(boost: BoostState): void {
    this.#boostState = boost;
    this.#driver.replaceBoostState(
      this.#portfolio.boostMineId === this.#portfolio.activeMineId
        ? boost : EMPTY_BOOST_STATE,
    );
  }

  public bindBoostToActiveMine(boost: BoostState): void {
    this.#assertActive();
    this.#portfolio = { ...this.portfolio, boostMineId: this.activeMineId };
    this.replaceBoostState(boost);
    this.#onCommandApplied?.(this.#portfolio);
  }

  public getBoostRemainingMs(): number {
    return this.#driver.getBoostRemainingMs();
  }

  #createDriver(
    portfolio: PortfolioState = this.#portfolio,
    roster: CatRosterState = this.#activeCatRoster,
  ): MineSimulationDriver {
    const activeMineId = portfolio.activeMineId;
    if (activeMineId === null) throw new Error('No foreground mine is selected.');
    return new MineSimulationDriver({
      state: activeGameState(portfolio)!,
      balance: getMineBalance(activeMineId),
      catRoster: roster,
      boostState: portfolio.boostMineId === activeMineId
        ? this.#boostState : EMPTY_BOOST_STATE,
      now: this.#now,
      onCommandApplied: () => {
        this.#capture();
        this.#onCommandApplied?.(this.#portfolio);
      },
    });
  }

  #capture(): void {
    if (this.#portfolio.activeMineId !== null) {
      this.#portfolio = replaceActiveGameState(this.#portfolio, this.#driver.state);
    }
  }

  /** Stops full-rate simulation at a visibility boundary. */
  public suspend(timestampMs: number): PortfolioState {
    this.#assertCommandAvailable();
    this.advance();
    const boundaryMs = Math.max(timestampMs, this.#driver.state.lastUpdateTimestampMs);
    this.#portfolio = suspendActiveMine(
      this.#portfolio,
      boundaryMs,
      createCatProductionModifiers(this.#activeCatRoster),
    );
    return this.#portfolio;
  }

  #assertCommandAvailable(): void {
    if (this.#commandPending) throw new Error('Mine command is already being saved.');
  }

  #assertActive(): void {
    if (this.#portfolio.activeMineId === null) {
      throw new Error('The mine is suspended.');
    }
  }

  #projectCatRoster(mineId: MineSiteId = this.#portfolio.selectedMineId): CatRosterState {
    return projectCatRosterToMine(this.#catRoster, mineId);
  }
}

import { getMineBalance, getMineSite, MINE_SITE_IDS, type MineSiteId } from '../config';
import {
  createEmptyCatRoster,
  validateCatRoster,
  type CatRosterState,
  type CatSlotKey,
} from '../core/cats';
import { GameNumber } from '../core/numbers/GameNumber';
import {
  migratePortfolioCatRoster,
  parseMineCatSlot,
} from '../core/portfolio/portfolioCatRoster';
import {
  type MineProgressState,
  type OwnedMine,
  type PortfolioState,
} from '../core/portfolio/portfolio';
import type { GameState } from '../core/state/GameState';
import {
  createSaveDocument,
  deserializeSaveDocument,
  type SaveDocumentV3,
  type SerializedCatAssignment,
  type SerializedCatInstance,
  type SerializedGameState,
} from './saveSchema';

export const PORTFOLIO_SAVE_SCHEMA_VERSION = 4;

export type SerializedMineProgressState = Omit<SerializedGameState, 'gold'>;

export interface SerializedMineOfflineInterval {
  readonly sequence: number;
  readonly startedAtMs: number;
  readonly savedRatePerSecond: string;
}

export interface SerializedMinePendingClaim extends SerializedMineOfflineInterval {
  readonly endedAtMs: number;
}

export interface SerializedOwnedMine {
  readonly state: SerializedMineProgressState;
  readonly purchasedAtMs: number;
  readonly visitCount: number;
  readonly offlineSequence: number;
  readonly lastClaimedSequence: number;
  readonly offline: SerializedMineOfflineInterval | null;
  readonly pendingClaim: SerializedMinePendingClaim | null;
}

export interface PortfolioSaveDocumentV4 {
  readonly schemaVersion: typeof PORTFOLIO_SAVE_SCHEMA_VERSION;
  readonly savedAtTimestampMs: number;
  readonly walletGold: string;
  readonly activeMineId: MineSiteId | null;
  readonly selectedMineId: MineSiteId;
  readonly boostMineId: MineSiteId | null;
  readonly mines: Readonly<Partial<Record<MineSiteId, SerializedOwnedMine>>>;
  readonly cats: readonly SerializedCatInstance[];
  readonly assignments: readonly SerializedCatAssignment[];
  readonly assignmentRevision: number;
  readonly collectionRevision: number;
}

export interface LoadedPortfolioSaveDocument {
  readonly portfolio: PortfolioState;
  readonly catRoster: CatRosterState;
  readonly savedAtTimestampMs: number;
}

/** Builds one account document; inactive mine records contain no wallet field. */
export function createPortfolioSaveDocument(
  portfolio: PortfolioState,
  savedAtTimestampMs: number,
  catRoster: CatRosterState = createEmptyCatRoster(),
): PortfolioSaveDocumentV4 {
  assertTimestamp(savedAtTimestampMs, 'savedAtTimestampMs');
  requireMine(portfolio, 'gold');
  const roster = migratePortfolioCatRoster(catRoster);
  assertRosterMinesOwned(roster, portfolio.mines);
  const mines: Partial<Record<MineSiteId, SerializedOwnedMine>> = {};
  for (const mineId of MINE_SITE_IDS) {
    const mine = portfolio.mines[mineId];
    if (mine === undefined) continue;
    const legacyShape = createSaveDocument(
      withWallet(mine.state, portfolio.walletGold),
      getMineBalance(mineId),
      savedAtTimestampMs,
    );
    mines[mineId] = {
      state: withoutSerializedWallet(legacyShape.state),
      purchasedAtMs: mine.purchasedAtMs,
      visitCount: mine.visitCount,
      offlineSequence: mine.offlineSequence,
      lastClaimedSequence: mine.lastClaimedSequence,
      offline: mine.offline === null ? null : {
        sequence: mine.offline.sequence,
        startedAtMs: mine.offline.startedAtMs,
        savedRatePerSecond: mine.offline.savedRatePerSecond.serialize(),
      },
      pendingClaim: mine.pendingClaim === null ? null : {
        sequence: mine.pendingClaim.sequence,
        startedAtMs: mine.pendingClaim.startedAtMs,
        endedAtMs: mine.pendingClaim.endedAtMs,
        savedRatePerSecond: mine.pendingClaim.savedRatePerSecond.serialize(),
      },
    };
  }
  const document: PortfolioSaveDocumentV4 = {
    schemaVersion: PORTFOLIO_SAVE_SCHEMA_VERSION,
    savedAtTimestampMs,
    walletGold: portfolio.walletGold.serialize(),
    activeMineId: portfolio.activeMineId,
    selectedMineId: portfolio.selectedMineId,
    boostMineId: portfolio.boostMineId,
    mines,
    cats: roster.cats.map((cat) => ({ ...cat, attributes: { ...cat.attributes } })),
    assignments: roster.assignments.map((assignment) => ({ ...assignment })),
    assignmentRevision: roster.assignmentRevision,
    collectionRevision: roster.collectionRevision,
  };
  deserializePortfolioSaveDocument(document);
  return document;
}

/** Accepts old single-mine saves and creates a suspended Gold Mine interval. */
export function deserializePortfolioSaveDocument(
  candidate: unknown,
): LoadedPortfolioSaveDocument {
  const root = record(candidate, 'save');
  if (root.schemaVersion !== PORTFOLIO_SAVE_SCHEMA_VERSION) {
    const loaded = deserializeSaveDocument(candidate, getMineBalance('gold'));
    const startedAtMs = loaded.savedAtTimestampMs;
    const gold: OwnedMine = {
      state: withoutWallet(loaded.state),
      purchasedAtMs: 0,
      visitCount: 1,
      offlineSequence: 1,
      lastClaimedSequence: 0,
      offline: {
        sequence: 1,
        startedAtMs,
        savedRatePerSecond: loaded.effectiveProductionRatePerSecond,
      },
      pendingClaim: null,
    };
    return {
      portfolio: {
        activeMineId: null,
        selectedMineId: 'gold',
        boostMineId: 'gold',
        walletGold: loaded.state.gold,
        mines: { gold },
      },
      catRoster: migratePortfolioCatRoster(loaded.catRoster),
      savedAtTimestampMs: startedAtMs,
    };
  }

  exactKeys(root, [
    'schemaVersion', 'savedAtTimestampMs', 'walletGold', 'activeMineId',
    'selectedMineId', 'boostMineId', 'mines', 'cats', 'assignments', 'assignmentRevision',
    'collectionRevision',
  ], 'save');
  assertTimestamp(root.savedAtTimestampMs, 'savedAtTimestampMs');
  const savedAtTimestampMs = root.savedAtTimestampMs as number;
  const walletGold = nonNegativeNumber(root.walletGold, 'walletGold');
  const selectedMineId = mineId(root.selectedMineId, 'selectedMineId');
  const activeMineId = root.activeMineId === null
    ? null
    : mineId(root.activeMineId, 'activeMineId');
  const boostMineId = root.boostMineId === null
    ? null
    : mineId(root.boostMineId, 'boostMineId');
  if (activeMineId !== null && selectedMineId !== activeMineId) {
    throw new Error('The selected mine must be the foreground mine.');
  }
  const serializedMines = record(root.mines, 'mines');
  for (const key of Object.keys(serializedMines)) {
    mineId(key, `mines.${key}`);
  }
  if (serializedMines.gold === undefined || serializedMines[selectedMineId] === undefined ||
    (activeMineId !== null && serializedMines[activeMineId] === undefined) ||
    (boostMineId !== null && serializedMines[boostMineId] === undefined)) {
    throw new Error('Gold, selected, active and boost-bound mines must be owned.');
  }

  const goldState = record(record(serializedMines.gold, 'mines.gold').state, 'mines.gold.state');
  const catRoster = parsePortfolioCatRoster(
    root,
    goldState,
    walletGold.serialize(),
    savedAtTimestampMs,
  );
  assertRosterMinesOwned(catRoster, serializedMines);
  const mines: Partial<Record<MineSiteId, OwnedMine>> = {};
  for (const id of MINE_SITE_IDS) {
    const raw = serializedMines[id];
    if (raw === undefined) continue;
    const mine = record(raw, `mines.${id}`);
    const mineKeys = [
      'state', 'purchasedAtMs', 'visitCount', 'offlineSequence',
      'lastClaimedSequence', 'offline',
    ];
    // Early V4 saves predate configured offline-entry handoff. They migrate
    // in memory with no pending claim and serialize back to the canonical
    // shape on the next successful write.
    if (Object.hasOwn(mine, 'pendingClaim')) mineKeys.push('pendingClaim');
    exactKeys(mine, mineKeys, `mines.${id}`);
    const stateShape = record(mine.state, `mines.${id}.state`);
    if (Object.hasOwn(stateShape, 'gold')) {
      throw new Error(`mines.${id}.state cannot contain wallet gold.`);
    }
    const loadedState = deserializeSaveDocument(
      syntheticV3(stateShape, walletGold.serialize(), savedAtTimestampMs),
      getMineBalance(id),
    ).state;
    assertTimestamp(mine.purchasedAtMs, `mines.${id}.purchasedAtMs`);
    nonNegativeInteger(mine.visitCount, `mines.${id}.visitCount`);
    nonNegativeInteger(mine.offlineSequence, `mines.${id}.offlineSequence`);
    nonNegativeInteger(mine.lastClaimedSequence, `mines.${id}.lastClaimedSequence`);
    const offline = mine.offline === null
      ? null
      : parseOffline(mine.offline, id);
    const pendingClaim = mine.pendingClaim === undefined || mine.pendingClaim === null
      ? null
      : parsePendingClaim(mine.pendingClaim, id);
    const visitCount = mine.visitCount as number;
    const offlineSequence = mine.offlineSequence as number;
    const lastClaimedSequence = mine.lastClaimedSequence as number;
    const isActive = activeMineId === id;
    const expectedLastClaimedSequence = pendingClaim === null
      ? offlineSequence - (offline === null ? 0 : 1)
      : pendingClaim.sequence - 1;
    if ((mine.visitCount === 0 && (offline !== null || pendingClaim !== null)) ||
      (mine.visitCount !== 0 && activeMineId !== id && offline === null) ||
      (activeMineId === id && offline !== null) ||
      Number(mine.lastClaimedSequence) > Number(mine.offlineSequence) ||
      visitCount !== offlineSequence + (isActive ? 1 : 0) ||
      lastClaimedSequence !== expectedLastClaimedSequence ||
      (mine.purchasedAtMs as number) > loadedState.lastUpdateTimestampMs ||
      loadedState.lastUpdateTimestampMs > savedAtTimestampMs ||
      (pendingClaim !== null && (
        pendingClaim.sequence !== lastClaimedSequence + 1 ||
        pendingClaim.sequence > offlineSequence ||
        pendingClaim.startedAtMs > pendingClaim.endedAtMs ||
        pendingClaim.endedAtMs > loadedState.lastUpdateTimestampMs
      )) ||
      (offline !== null && (
        offline.sequence !== mine.offlineSequence ||
        offline.startedAtMs < loadedState.lastUpdateTimestampMs ||
        offline.startedAtMs > savedAtTimestampMs
      ))) {
      throw new Error(`mines.${id} has an inconsistent visit or offline interval.`);
    }
    mines[id] = {
      state: withoutWallet(loadedState),
      purchasedAtMs: mine.purchasedAtMs as number,
      visitCount,
      offlineSequence,
      lastClaimedSequence,
      offline,
      pendingClaim,
    };
  }
  for (const id of MINE_SITE_IDS) {
    if (mines[id] === undefined) continue;
    const prerequisiteId = getMineSite(id).prerequisiteMineId;
    if (prerequisiteId !== null && mines[prerequisiteId] === undefined) {
      throw new Error(`Mine ${id} requires ownership of ${prerequisiteId}.`);
    }
  }
  return {
    portfolio: { activeMineId, selectedMineId, boostMineId, walletGold, mines },
    catRoster,
    savedAtTimestampMs,
  };
}

/** Journal/cloud boundary: refuses legacy shapes and returns canonical v4. */
export function validatePortfolioSaveDocument(
  candidate: unknown,
): PortfolioSaveDocumentV4 {
  const root = record(candidate, 'save');
  if (root.schemaVersion !== PORTFOLIO_SAVE_SCHEMA_VERSION) {
    throw new Error('Portfolio save schema version 4 is required.');
  }
  const loaded = deserializePortfolioSaveDocument(candidate);
  return createPortfolioSaveDocument(
    loaded.portfolio,
    loaded.savedAtTimestampMs,
    loaded.catRoster,
  );
}

function syntheticV3(
  state: Record<string, unknown>,
  walletGold: string,
  savedAtTimestampMs: number,
  roster?: Record<string, unknown>,
): SaveDocumentV3 {
  return {
    schemaVersion: 3,
    savedAtTimestampMs,
    effectiveProductionRatePerSecond: '0',
    state: { ...state, gold: walletGold } as unknown as SerializedGameState,
    cats: (roster?.cats ?? []) as SerializedCatInstance[],
    assignments: (roster?.assignments ?? []) as SerializedCatAssignment[],
    assignmentRevision: (roster?.assignmentRevision ?? 0) as number,
    collectionRevision: (roster?.collectionRevision ?? 0) as number,
  };
}

function parsePortfolioCatRoster(
  root: Record<string, unknown>,
  goldState: Record<string, unknown>,
  walletGold: string,
  savedAtTimestampMs: number,
): CatRosterState {
  if (!Array.isArray(root.cats) || !Array.isArray(root.assignments)) {
    throw new Error('Portfolio cats and assignments must be arrays.');
  }
  const sourceCats = root.cats.map((value, index) => {
    const cat = record(value, `cats[${index}]`);
    if (!Object.hasOwn(cat, 'assignedSlotKey') ||
      (cat.assignedSlotKey !== null && typeof cat.assignedSlotKey !== 'string')) {
      throw new Error(`cats[${index}].assignedSlotKey is invalid.`);
    }
    return cat;
  });
  // The V3 parser still validates every cat field and both revision counters.
  // Remove assignment links temporarily because two different mines may use
  // the same short role slot; V3 supports only one mine.
  const base = deserializeSaveDocument(
    syntheticV3(goldState, walletGold, savedAtTimestampMs, {
      ...root,
      cats: sourceCats.map((cat) => ({ ...cat, assignedSlotKey: null })),
      assignments: [],
    }),
    getMineBalance('gold'),
  ).catRoster;
  const roster: CatRosterState = {
    ...base,
    cats: base.cats.map((cat, index) => ({
      ...cat,
      assignedSlotKey: sourceCats[index].assignedSlotKey as string | null,
    })),
    assignments: root.assignments.map((value, index) => {
      const assignment = record(value, `assignments[${index}]`);
      exactKeys(assignment, ['slotKey', 'catInstanceId'], `assignments[${index}]`);
      if (typeof assignment.slotKey !== 'string' ||
        typeof assignment.catInstanceId !== 'string' ||
        assignment.catInstanceId.length === 0) {
        throw new Error(`assignments[${index}] is invalid.`);
      }
      return {
        slotKey: assignment.slotKey as CatSlotKey,
        catInstanceId: assignment.catInstanceId,
      };
    }),
  };
  validateCatRoster(roster);
  return migratePortfolioCatRoster(roster);
}

function assertRosterMinesOwned(
  roster: CatRosterState,
  mines: Readonly<Partial<Record<MineSiteId, unknown>>>,
): void {
  for (const assignment of roster.assignments) {
    const slot = parseMineCatSlot(assignment.slotKey);
    if (slot === null || mines[slot.mineId] === undefined) {
      throw new Error(`Cat assignment ${assignment.slotKey} requires an owned mine.`);
    }
  }
}

function parseOffline(candidate: unknown, id: MineSiteId) {
  const interval = record(candidate, `mines.${id}.offline`);
  exactKeys(interval, ['sequence', 'startedAtMs', 'savedRatePerSecond'], `mines.${id}.offline`);
  nonNegativeInteger(interval.sequence, `mines.${id}.offline.sequence`);
  assertTimestamp(interval.startedAtMs, `mines.${id}.offline.startedAtMs`);
  return {
    sequence: interval.sequence as number,
    startedAtMs: interval.startedAtMs as number,
    savedRatePerSecond: nonNegativeNumber(
      interval.savedRatePerSecond,
      `mines.${id}.offline.savedRatePerSecond`,
    ),
  };
}

function parsePendingClaim(candidate: unknown, id: MineSiteId) {
  const claim = record(candidate, `mines.${id}.pendingClaim`);
  exactKeys(
    claim,
    ['sequence', 'startedAtMs', 'endedAtMs', 'savedRatePerSecond'],
    `mines.${id}.pendingClaim`,
  );
  nonNegativeInteger(claim.sequence, `mines.${id}.pendingClaim.sequence`);
  assertTimestamp(claim.startedAtMs, `mines.${id}.pendingClaim.startedAtMs`);
  assertTimestamp(claim.endedAtMs, `mines.${id}.pendingClaim.endedAtMs`);
  return {
    sequence: claim.sequence as number,
    startedAtMs: claim.startedAtMs as number,
    endedAtMs: claim.endedAtMs as number,
    savedRatePerSecond: nonNegativeNumber(
      claim.savedRatePerSecond,
      `mines.${id}.pendingClaim.savedRatePerSecond`,
    ),
  };
}

function requireMine(portfolio: PortfolioState, id: MineSiteId): OwnedMine {
  const mine = portfolio.mines[id];
  if (mine === undefined) throw new Error(`Mine ${id} is not owned.`);
  return mine;
}

function withWallet(state: MineProgressState, walletGold: GameNumber): GameState {
  return { ...state, gold: walletGold };
}

function withoutWallet(state: GameState): MineProgressState {
  return {
    saveVersion: state.saveVersion,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs,
    simulationTick: state.simulationTick,
    simulationRemainderMs: state.simulationRemainderMs,
    floors: state.floors,
    elevator: state.elevator,
    warehouse: state.warehouse,
  };
}

function withoutSerializedWallet(state: SerializedGameState): SerializedMineProgressState {
  return {
    saveVersion: state.saveVersion,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs,
    simulationTick: state.simulationTick,
    simulationRemainderMs: state.simulationRemainderMs,
    floors: state.floors,
    elevator: state.elevator,
    warehouse: state.warehouse,
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], path: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${path} contains missing or unknown fields.`);
  }
}

function mineId(value: unknown, path: string): MineSiteId {
  if (typeof value !== 'string' || !MINE_SITE_IDS.includes(value as MineSiteId)) {
    throw new Error(`${path} must be a configured mine id.`);
  }
  return value as MineSiteId;
}

function nonNegativeNumber(value: unknown, path: string): GameNumber {
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    throw new Error(`${path} must be a numeric string.`);
  }
  const number = GameNumber.deserialize(value);
  if (number.lessThan(0)) throw new Error(`${path} cannot be negative.`);
  return number;
}

function nonNegativeInteger(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${path} must be a non-negative safe integer.`);
  }
}

function assertTimestamp(value: unknown, path: string): void {
  nonNegativeInteger(value, path);
}

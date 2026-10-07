import type { PortfolioSaveDocumentV4 } from '../../persistence';
import type { PortfolioCommandOutcome } from './portfolioCloudCommands';

type RoutineCommands = {
  readonly pending: unknown | null;
  waitUntilIdle(): Promise<void>;
  syncRoutine(document: PortfolioSaveDocumentV4): Promise<PortfolioCommandOutcome>;
};

/** Sends the newest local snapshot promptly, coalescing edits during an upload. */
export class PortfolioRoutineSyncQueue {
  readonly #commands: RoutineCommands;
  readonly #onOutcome: (outcome: PortfolioCommandOutcome) => void;
  #latest: PortfolioSaveDocumentV4 | null = null;
  #attempt: Promise<void> | null = null;
  #blocked = false;

  public constructor(
    commands: RoutineCommands,
    onOutcome: (outcome: PortfolioCommandOutcome) => void = () => {},
  ) {
    this.#commands = commands;
    this.#onOutcome = onOutcome;
  }

  public enqueue(document: PortfolioSaveDocumentV4): void {
    this.#latest = document;
    this.#blocked = false;
    this.#start();
  }

  public async waitForAttempt(): Promise<void> {
    await this.#attempt;
  }

  #start(): void {
    if (this.#attempt !== null || this.#latest === null || this.#blocked) return;
    this.#attempt = this.#drain().finally(() => {
      this.#attempt = null;
      if (!this.#blocked) this.#start();
    });
  }

  async #drain(): Promise<void> {
    while (this.#latest !== null) {
      await this.#commands.waitUntilIdle();
      if (this.#commands.pending !== null) {
        this.#blocked = true;
        return;
      }
      const document = this.#latest;
      this.#latest = null;
      let outcome: PortfolioCommandOutcome;
      try {
        outcome = await this.#commands.syncRoutine(document);
      } catch {
        outcome = { kind: 'unavailable' };
      }
      if (outcome.kind === 'busy') {
        this.#latest ??= document;
        if (this.#commands.pending !== null) {
          this.#blocked = true;
          return;
        }
        continue;
      }
      this.#onOutcome(outcome);
      if (outcome.kind !== 'ok') {
        this.#latest ??= document;
        this.#blocked = true;
        return;
      }
    }
  }
}

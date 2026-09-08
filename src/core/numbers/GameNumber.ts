import Decimal from 'break_infinity.js';

export type GameNumberSource = GameNumber | number | string;
export type SerializedGameNumber = string;

export class GameNumber {
  readonly #value: Decimal;

  private constructor(value: Decimal) {
    this.#value = new Decimal(value);
  }

  public static from(source: GameNumberSource): GameNumber {
    return new GameNumber(GameNumber.toDecimal(source));
  }

  public static deserialize(serialized: SerializedGameNumber): GameNumber {
    return GameNumber.from(serialized);
  }

  public add(other: GameNumberSource): GameNumber {
    return new GameNumber(this.#value.add(GameNumber.toDecimal(other)));
  }

  public subtract(other: GameNumberSource): GameNumber {
    return new GameNumber(this.#value.subtract(GameNumber.toDecimal(other)));
  }

  public multiply(other: GameNumberSource): GameNumber {
    return new GameNumber(this.#value.multiply(GameNumber.toDecimal(other)));
  }

  public divide(other: GameNumberSource): GameNumber {
    return new GameNumber(this.#value.divide(GameNumber.toDecimal(other)));
  }

  public compare(other: GameNumberSource): -1 | 0 | 1 {
    return this.#value.compare(GameNumber.toDecimal(other));
  }

  public equals(other: GameNumberSource): boolean {
    return this.compare(other) === 0;
  }

  public lessThan(other: GameNumberSource): boolean {
    return this.compare(other) < 0;
  }

  public lessThanOrEqualTo(other: GameNumberSource): boolean {
    return this.compare(other) <= 0;
  }

  public greaterThan(other: GameNumberSource): boolean {
    return this.compare(other) > 0;
  }

  public greaterThanOrEqualTo(other: GameNumberSource): boolean {
    return this.compare(other) >= 0;
  }

  /**
   * Significant digits of this value, as `mantissa * 10 ** exponent`: `0` for
   * zero, and otherwise an absolute value in `[1, 10)`.
   *
   * Display code needs a value's magnitude, and an idle-game balance outruns
   * `Number.MAX_VALUE` long before it stops being worth showing; `serialize()`
   * can only express such a value as text. This pair of plain numbers gives
   * formatting exactly what it needs without leaking the underlying numeric
   * library across the boundary. Formatting itself stays outside this type.
   */
  public get mantissa(): number {
    return this.#value.mantissa;
  }

  /** Power of ten this value's {@link mantissa} is scaled by. */
  public get exponent(): number {
    return this.#value.exponent;
  }

  public serialize(): SerializedGameNumber {
    return this.#value.toString();
  }

  public toJSON(): SerializedGameNumber {
    return this.serialize();
  }

  public toString(): string {
    return this.serialize();
  }

  private static toDecimal(source: GameNumberSource): Decimal {
    if (source instanceof GameNumber) {
      return new Decimal(source.#value);
    }

    if (typeof source === 'number' && !Number.isFinite(source)) {
      throw new Error('GameNumber requires a finite numeric source.');
    }

    if (typeof source === 'string' && source.trim().length === 0) {
      throw new Error('GameNumber requires a non-empty numeric string.');
    }

    const value = new Decimal(source);

    if (!Number.isFinite(value.mantissa) || !Number.isFinite(value.exponent)) {
      throw new Error('GameNumber source must represent a finite value.');
    }

    return value;
  }
}

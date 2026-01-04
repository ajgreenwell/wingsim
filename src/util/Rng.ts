import prand, { RandomGenerator } from "pure-rand";

export class Rng {
  public readonly seed: number;
  private gen: RandomGenerator;

  constructor(seed: number) {
    this.seed = Math.trunc(seed) >>> 0;
    this.gen = prand.xoroshiro128plus(this.seed);
  }

  /**
   * Returns a random integer in [minInclusive, maxExclusive).
   * @internal
   */
  private int(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) {
      throw new Error(
        `Invalid range: [${minInclusive}, ${maxExclusive}) is empty or invalid`
      );
    }
    const [value, next] = prand.uniformIntDistribution(
      minInclusive,
      maxExclusive - 1,
      this.gen
    );
    this.gen = next;
    return value;
  }

  /**
   * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
   */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * Pick n unique items from the array (without replacement).
   * Returns a new array; does not mutate the input.
   * Throws if n > items.length.
   */
  pickMany<T>(items: readonly T[], n: number): T[] {
    if (n < 0) {
      throw new Error(`n must be non-negative, got ${n}`);
    }
    if (n > items.length) {
      throw new Error(
        `Cannot pick ${n} items from array of length ${items.length}`
      );
    }
    if (n === 0) {
      return [];
    }
    // Shuffle and take the first n items
    const shuffled = this.shuffle(items);
    return shuffled.slice(0, n);
  }

  /**
   * Pick n items from the array with replacement (items can repeat).
   * Returns a new array; does not mutate the input.
   * Throws if array is empty.
   */
  pickManyWithReplacement<T>(items: readonly T[], n: number): T[] {
    if (items.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    if (n < 0) {
      throw new Error(`n must be non-negative, got ${n}`);
    }
    const result: T[] = [];
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, items.length);
      result.push(items[idx]);
    }
    return result;
  }
}

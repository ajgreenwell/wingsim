import type { Rng } from "../util/Rng.js";

/**
 * A generic deck with discard pile that supports drawing and reshuffling.
 * When the deck is empty, the discard pile is shuffled to form a new deck.
 */
export class DiscardableDeck<T> {
  private readonly rng: Rng;
  private deck: T[];
  private discard: T[];

  constructor(items: readonly T[], rng: Rng) {
    this.rng = rng;
    this.deck = rng.shuffle(items);
    this.discard = [];
  }

  /**
   * Draw items from the deck. If deck is empty, shuffles discard pile to create new deck.
   * Throws if both deck and discard are empty and items are needed.
   */
  draw(count: number): T[] {
    if (count < 0) {
      throw new Error(`count must be non-negative, got ${count}`);
    }

    const drawn: T[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) {
          throw new Error("All cards are in use");
        }
        // Reshuffle discard into deck
        this.deck = this.rng.shuffle(this.discard);
        this.discard = [];
      }

      const item = this.deck.shift()!;
      drawn.push(item);
    }

    return drawn;
  }

  /**
   * Add items to the discard pile.
   */
  discardItems(items: readonly T[]): void {
    this.discard.push(...items);
  }

  /**
   * Get the number of items remaining in the deck.
   */
  getDeckSize(): number {
    return this.deck.length;
  }

  /**
   * Get the number of items in the discard pile.
   */
  getDiscardSize(): number {
    return this.discard.length;
  }
}

import type { BirdCard } from "../types/core.js";
import type { Rng } from "../util/Rng.js";
import { DiscardableDeck } from "./DiscardableDeck.js";

const TRAY_SIZE = 3;

/**
 * Manages the bird card deck, tray (3 face-up cards), and discard pile.
 * Uses DiscardableDeck internally for deck/discard management.
 */
export class BirdCardSupply {
  private readonly deck: DiscardableDeck<BirdCard>;
  private tray: (BirdCard | null)[];

  constructor(cards: readonly BirdCard[], rng: Rng) {
    this.deck = new DiscardableDeck(cards, rng);
    this.tray = [null, null, null];
  }

  /**
   * Draw cards from the deck. If deck is empty, shuffles discard pile to create new deck.
   * Throws if both deck and discard are empty and cards are needed.
   */
  drawFromDeck(count: number): BirdCard[] {
    return this.deck.draw(count);
  }

  /**
   * Take a card from the tray at the specified index (0, 1, or 2).
   * The slot becomes null after taking.
   */
  takeFromTray(index: number): BirdCard {
    if (index < 0 || index >= TRAY_SIZE) {
      throw new Error(`Invalid tray index: ${index}. Must be 0, 1, or 2.`);
    }

    const card = this.tray[index];
    if (card === null) {
      throw new Error(`No card at tray index ${index}`);
    }

    this.tray[index] = null;
    return card;
  }

  /**
   * Fill empty tray slots from the deck.
   * Does not throw if deck/discard are empty - just leaves slots empty.
   */
  refillTray(): void {
    for (let i = 0; i < TRAY_SIZE; i++) {
      if (this.tray[i] === null) {
        try {
          const [card] = this.deck.draw(1);
          this.tray[i] = card;
        } catch {
          // Deck and discard are empty, leave slot as null
          break;
        }
      }
    }
  }

  /**
   * Add cards to the discard pile.
   */
  discardCards(cards: readonly BirdCard[]): void {
    this.deck.discardItems(cards);
  }

  /**
   * Get the current tray state (array of length 3 with possible nulls).
   */
  getTray(): readonly (BirdCard | null)[] {
    return this.tray;
  }

  /**
   * Get the number of cards remaining in the deck.
   */
  getDeckSize(): number {
    return this.deck.getDeckSize();
  }

  /**
   * Get the number of cards in the discard pile.
   */
  getDiscardSize(): number {
    return this.deck.getDiscardSize();
  }
}

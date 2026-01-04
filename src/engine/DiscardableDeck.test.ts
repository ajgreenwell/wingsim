import { describe, it, expect } from "vitest";
import { DiscardableDeck } from "./DiscardableDeck.js";
import { Rng } from "../util/Rng.js";

describe("DiscardableDeck", () => {
  describe("constructor", () => {
    it("shuffles items deterministically with same seed", () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const deck1 = new DiscardableDeck(items, new Rng(42));
      const deck2 = new DiscardableDeck(items, new Rng(42));

      expect(deck1.draw(10)).toEqual(deck2.draw(10));
    });

    it("different seeds produce different shuffles", () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const deck1 = new DiscardableDeck(items, new Rng(42));
      const deck2 = new DiscardableDeck(items, new Rng(99));

      expect(deck1.draw(10)).not.toEqual(deck2.draw(10));
    });

    it("initializes with empty discard", () => {
      const deck = new DiscardableDeck([1, 2, 3], new Rng(42));
      expect(deck.getDiscardSize()).toBe(0);
    });

    it("sets deck size to number of items", () => {
      const deck = new DiscardableDeck([1, 2, 3, 4, 5], new Rng(42));
      expect(deck.getDeckSize()).toBe(5);
    });
  });

  describe("draw()", () => {
    it("returns correct number of items", () => {
      const deck = new DiscardableDeck([1, 2, 3, 4, 5], new Rng(42));
      const drawn = deck.draw(3);

      expect(drawn).toHaveLength(3);
      expect(deck.getDeckSize()).toBe(2);
    });

    it("returns empty array when count is 0", () => {
      const deck = new DiscardableDeck([1, 2, 3], new Rng(42));
      expect(deck.draw(0)).toEqual([]);
    });

    it("throws on negative count", () => {
      const deck = new DiscardableDeck([1, 2, 3], new Rng(42));
      expect(() => deck.draw(-1)).toThrow("count must be non-negative");
    });

    it("reshuffles discard when deck is empty", () => {
      const deck = new DiscardableDeck([1, 2, 3], new Rng(42));

      // Draw all items
      const firstDraw = deck.draw(3);
      expect(deck.getDeckSize()).toBe(0);

      // Discard them
      deck.discardItems(firstDraw);
      expect(deck.getDiscardSize()).toBe(3);

      // Draw again - should reshuffle discard
      const secondDraw = deck.draw(2);
      expect(secondDraw).toHaveLength(2);
      expect(deck.getDeckSize()).toBe(1);
      expect(deck.getDiscardSize()).toBe(0);
    });

    it("throws when both deck and discard are empty", () => {
      const deck = new DiscardableDeck([1, 2], new Rng(42));

      // Draw all items (don't discard them)
      deck.draw(2);

      expect(() => deck.draw(1)).toThrow("All cards are in use");
    });

    it("handles partial reshuffle during draw", () => {
      const deck = new DiscardableDeck([1, 2], new Rng(42));

      // Draw 1, discard it
      const first = deck.draw(1);
      deck.discardItems(first);

      // Draw 1 more (leaves deck empty)
      deck.draw(1);

      // Now deck is empty, discard has 1 item
      // Drawing 1 should reshuffle
      expect(deck.getDeckSize()).toBe(0);
      expect(deck.getDiscardSize()).toBe(1);

      const drawn = deck.draw(1);
      expect(drawn).toHaveLength(1);
    });
  });

  describe("discardItems()", () => {
    it("adds items to discard pile", () => {
      const deck = new DiscardableDeck([1, 2, 3, 4, 5], new Rng(42));

      const drawn = deck.draw(2);
      deck.discardItems(drawn);

      expect(deck.getDiscardSize()).toBe(2);
    });

    it("handles empty array", () => {
      const deck = new DiscardableDeck([1, 2, 3], new Rng(42));
      deck.discardItems([]);
      expect(deck.getDiscardSize()).toBe(0);
    });

    it("accumulates items", () => {
      const deck = new DiscardableDeck([1, 2, 3, 4, 5], new Rng(42));

      deck.discardItems(deck.draw(2));
      deck.discardItems(deck.draw(1));

      expect(deck.getDiscardSize()).toBe(3);
    });
  });

  describe("getDeckSize() and getDiscardSize()", () => {
    it("tracks sizes correctly through operations", () => {
      const deck = new DiscardableDeck([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], new Rng(42));

      expect(deck.getDeckSize()).toBe(10);
      expect(deck.getDiscardSize()).toBe(0);

      const drawn = deck.draw(4);
      expect(deck.getDeckSize()).toBe(6);

      deck.discardItems(drawn);
      expect(deck.getDiscardSize()).toBe(4);

      // Draw until empty, triggering reshuffle
      deck.draw(6);
      expect(deck.getDeckSize()).toBe(0);

      deck.draw(2); // Should reshuffle the 4 discarded items
      expect(deck.getDeckSize()).toBe(2);
      expect(deck.getDiscardSize()).toBe(0);
    });
  });

  describe("generic type support", () => {
    it("works with string items", () => {
      const deck = new DiscardableDeck(["a", "b", "c"], new Rng(42));
      const drawn = deck.draw(2);

      expect(drawn.every((item) => typeof item === "string")).toBe(true);
    });

    it("works with object items", () => {
      interface TestItem {
        id: number;
        name: string;
      }

      const items: TestItem[] = [
        { id: 1, name: "one" },
        { id: 2, name: "two" },
        { id: 3, name: "three" },
      ];

      const deck = new DiscardableDeck(items, new Rng(42));
      const drawn = deck.draw(2);

      expect(drawn).toHaveLength(2);
      expect(drawn[0]).toHaveProperty("id");
      expect(drawn[0]).toHaveProperty("name");
    });
  });
});

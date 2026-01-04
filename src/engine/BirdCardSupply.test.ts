import { describe, it, expect } from "vitest";
import { BirdCardSupply } from "./BirdCardSupply.js";
import { Rng } from "../util/Rng.js";
import type { BirdCard } from "../types/core.js";

// Helper to create minimal test bird cards
function createTestCards(count: number): BirdCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bird_${i}`,
    name: `Bird ${i}`,
    scientificName: `Testus birdus ${i}`,
    habitats: ["FOREST"],
    power: null,
    victoryPoints: i,
    nestType: "BOWL",
    eggCapacity: 2,
    foodCost: {},
    foodCostMode: "NONE",
    wingspanCentimeters: 30,
    bonusCards: [],
    flavorText: "",
    countries: [],
    categorization: null,
  })) as BirdCard[];
}

describe("BirdCardSupply", () => {
  describe("constructor", () => {
    it("shuffles cards deterministically with same seed", () => {
      const cards = createTestCards(10);

      const supply1 = new BirdCardSupply(cards, new Rng(42));
      const supply2 = new BirdCardSupply(cards, new Rng(42));

      // Draw all cards and compare - should be in same order
      const drawn1 = supply1.drawFromDeck(10);
      const drawn2 = supply2.drawFromDeck(10);

      expect(drawn1.map((c) => c.id)).toEqual(drawn2.map((c) => c.id));
    });

    it("different seeds produce different shuffles", () => {
      const cards = createTestCards(10);

      const supply1 = new BirdCardSupply(cards, new Rng(42));
      const supply2 = new BirdCardSupply(cards, new Rng(99));

      const drawn1 = supply1.drawFromDeck(10);
      const drawn2 = supply2.drawFromDeck(10);

      expect(drawn1.map((c) => c.id)).not.toEqual(drawn2.map((c) => c.id));
    });

    it("initializes with empty tray", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      expect(supply.getTray()).toEqual([null, null, null]);
    });

    it("initializes with empty discard", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      expect(supply.getDiscardSize()).toBe(0);
    });
  });

  describe("drawFromDeck()", () => {
    it("returns cards from top of deck", () => {
      const cards = createTestCards(5);
      const supply = new BirdCardSupply(cards, new Rng(42));

      const initialSize = supply.getDeckSize();
      const drawn = supply.drawFromDeck(2);

      expect(drawn).toHaveLength(2);
      expect(supply.getDeckSize()).toBe(initialSize - 2);
    });

    it("returns empty array when count is 0", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      expect(supply.drawFromDeck(0)).toEqual([]);
    });

    it("throws on negative count", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      expect(() => supply.drawFromDeck(-1)).toThrow("count must be non-negative");
    });

    it("reshuffles discard when deck is empty", () => {
      const cards = createTestCards(5);
      const supply = new BirdCardSupply(cards, new Rng(42));

      // Draw all cards
      const firstDraw = supply.drawFromDeck(5);
      expect(supply.getDeckSize()).toBe(0);

      // Discard them
      supply.discardCards(firstDraw);
      expect(supply.getDiscardSize()).toBe(5);

      // Draw again - should reshuffle discard
      const secondDraw = supply.drawFromDeck(3);
      expect(secondDraw).toHaveLength(3);
      expect(supply.getDeckSize()).toBe(2);
      expect(supply.getDiscardSize()).toBe(0);
    });

    it("throws when both deck and discard are empty", () => {
      const cards = createTestCards(3);
      const supply = new BirdCardSupply(cards, new Rng(42));

      // Draw all cards (don't discard them - simulating cards in play)
      supply.drawFromDeck(3);

      expect(() => supply.drawFromDeck(1)).toThrow("All cards are in use");
    });
  });

  describe("takeFromTray()", () => {
    it("returns card and sets slot to null", () => {
      const supply = new BirdCardSupply(createTestCards(10), new Rng(42));
      supply.refillTray();

      const cardAtSlot0 = supply.getTray()[0];
      expect(cardAtSlot0).not.toBeNull();

      const taken = supply.takeFromTray(0);
      expect(taken).toBe(cardAtSlot0);
      expect(supply.getTray()[0]).toBeNull();
    });

    it("throws on invalid index", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      supply.refillTray();

      expect(() => supply.takeFromTray(-1)).toThrow("Invalid tray index");
      expect(() => supply.takeFromTray(3)).toThrow("Invalid tray index");
    });

    it("throws on empty slot", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      // Tray is empty by default
      expect(() => supply.takeFromTray(0)).toThrow("No card at tray index 0");
    });
  });

  describe("refillTray()", () => {
    it("fills empty slots from deck", () => {
      const supply = new BirdCardSupply(createTestCards(10), new Rng(42));

      expect(supply.getTray()).toEqual([null, null, null]);
      supply.refillTray();

      const tray = supply.getTray();
      expect(tray[0]).not.toBeNull();
      expect(tray[1]).not.toBeNull();
      expect(tray[2]).not.toBeNull();
    });

    it("only fills null slots", () => {
      const supply = new BirdCardSupply(createTestCards(10), new Rng(42));
      supply.refillTray();

      const originalCard = supply.getTray()[1];
      supply.takeFromTray(0);
      supply.takeFromTray(2);

      supply.refillTray();

      const tray = supply.getTray();
      expect(tray[0]).not.toBeNull();
      expect(tray[1]).toBe(originalCard); // Unchanged
      expect(tray[2]).not.toBeNull();
    });

    it("leaves slots empty if deck and discard are exhausted", () => {
      const supply = new BirdCardSupply(createTestCards(2), new Rng(42));
      supply.refillTray();

      // Only 2 cards, so third slot should be null
      const tray = supply.getTray();
      expect(tray[0]).not.toBeNull();
      expect(tray[1]).not.toBeNull();
      expect(tray[2]).toBeNull();
    });
  });

  describe("discardCards()", () => {
    it("adds cards to discard pile", () => {
      const cards = createTestCards(5);
      const supply = new BirdCardSupply(cards, new Rng(42));

      expect(supply.getDiscardSize()).toBe(0);

      const drawn = supply.drawFromDeck(2);
      supply.discardCards(drawn);

      expect(supply.getDiscardSize()).toBe(2);
    });

    it("handles empty array", () => {
      const supply = new BirdCardSupply(createTestCards(5), new Rng(42));
      supply.discardCards([]);
      expect(supply.getDiscardSize()).toBe(0);
    });
  });

  describe("getDeckSize() and getDiscardSize()", () => {
    it("tracks sizes correctly through operations", () => {
      const supply = new BirdCardSupply(createTestCards(10), new Rng(42));

      expect(supply.getDeckSize()).toBe(10);
      expect(supply.getDiscardSize()).toBe(0);

      const drawn = supply.drawFromDeck(3);
      expect(supply.getDeckSize()).toBe(7);

      supply.discardCards(drawn);
      expect(supply.getDiscardSize()).toBe(3);

      supply.refillTray();
      expect(supply.getDeckSize()).toBe(4);
    });
  });
});

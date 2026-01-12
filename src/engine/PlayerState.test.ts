import { describe, it, expect } from "vitest";
import { PlayerState } from "./PlayerState.js";
import { PlayerBoard } from "./PlayerBoard.js";
import type { BirdCard, BonusCard, FoodByType } from "../types/core.js";

// Helper to create a mock bird card
function createMockBirdCard(overrides: Partial<BirdCard> = {}): BirdCard {
  return {
    id: "test_bird",
    name: "Test Bird",
    scientificName: "Testus birdus",
    habitats: ["FOREST", "GRASSLAND", "WETLAND"],
    power: null,
    victoryPoints: 3,
    nestType: "BOWL",
    eggCapacity: 4,
    foodCost: {},
    foodCostMode: "NONE",
    wingspanCentimeters: 30,
    bonusCards: [],
    flavorText: "",
    countries: [],
    categorization: null,
    ...overrides,
  };
}

// Helper to create a mock bonus card
function createMockBonusCard(overrides: Partial<BonusCard> = {}): BonusCard {
  return {
    id: "test_bonus",
    name: "Test Bonus",
    condition: "Test condition",
    scoringType: "TIERED",
    scoring: [{ minCount: 1, points: 3 }],
    explanatoryText: null,
    percentageOfEligibleBirds: 50,
    ...overrides,
  };
}

describe("PlayerState", () => {
  describe("create()", () => {
    it("creates a player with given id and empty defaults", () => {
      const player = PlayerState.create("alice");

      expect(player.id).toBe("alice");
      expect(player.hand).toEqual([]);
      expect(player.bonusCards).toEqual([]);
      expect(player.food).toEqual({});
      expect(player.turnsRemaining).toBe(8);
      expect(player.board).toBeInstanceOf(PlayerBoard);
    });

    it("creates a player with provided hand and bonus cards", () => {
      const bird = createMockBirdCard({ id: "robin" });
      const bonus = createMockBonusCard({ id: "forest_bonus" });
      const player = PlayerState.create("bob", [bird], [bonus]);

      expect(player.hand).toEqual([bird]);
      expect(player.bonusCards).toEqual([bonus]);
    });
  });

  describe("from()", () => {
    it("creates a player with custom configuration", () => {
      const bird = createMockBirdCard({ id: "sparrow" });
      const bonus = createMockBonusCard({ id: "wetland_bonus" });
      const food: FoodByType = { SEED: 2, INVERTEBRATE: 1 };
      const board = PlayerBoard.empty();

      const player = PlayerState.from("charlie", {
        hand: [bird],
        bonusCards: [bonus],
        food,
        turnsRemaining: 5,
        board,
      });

      expect(player.id).toBe("charlie");
      expect(player.hand).toEqual([bird]);
      expect(player.bonusCards).toEqual([bonus]);
      expect(player.food).toEqual(food);
      expect(player.turnsRemaining).toBe(5);
      expect(player.board).toBe(board);
    });

    it("uses defaults for missing config values", () => {
      const player = PlayerState.from("dave", { turnsRemaining: 3 });

      expect(player.id).toBe("dave");
      expect(player.hand).toEqual([]);
      expect(player.bonusCards).toEqual([]);
      expect(player.food).toEqual({});
      expect(player.turnsRemaining).toBe(3);
      expect(player.board).toBeInstanceOf(PlayerBoard);
    });
  });

  describe("getTotalFood()", () => {
    it("returns 0 for empty food", () => {
      const player = PlayerState.create("p1");
      expect(player.getTotalFood()).toBe(0);
    });

    it("returns sum of all food types", () => {
      const player = PlayerState.from("p1", {
        food: { SEED: 2, INVERTEBRATE: 3, FISH: 1 },
      });
      expect(player.getTotalFood()).toBe(6);
    });

    it("handles partial food object", () => {
      const player = PlayerState.from("p1", {
        food: { RODENT: 4 },
      });
      expect(player.getTotalFood()).toBe(4);
    });
  });

  describe("hasFood()", () => {
    it("returns false when player has no food", () => {
      const player = PlayerState.create("p1");
      expect(player.hasFood("SEED")).toBe(false);
    });

    it("returns true when player has enough of the food type", () => {
      const player = PlayerState.from("p1", {
        food: { SEED: 3 },
      });
      expect(player.hasFood("SEED")).toBe(true);
      expect(player.hasFood("SEED", 2)).toBe(true);
      expect(player.hasFood("SEED", 3)).toBe(true);
    });

    it("returns false when player does not have enough", () => {
      const player = PlayerState.from("p1", {
        food: { SEED: 2 },
      });
      expect(player.hasFood("SEED", 3)).toBe(false);
    });

    it("returns false for food type player does not have", () => {
      const player = PlayerState.from("p1", {
        food: { SEED: 5 },
      });
      expect(player.hasFood("FISH")).toBe(false);
    });
  });

  describe("getEligibleBirdsToPlay()", () => {
    it("returns empty array when hand is empty", () => {
      const player = PlayerState.create("p1");
      expect(player.getEligibleBirdsToPlay()).toEqual([]);
    });

    it("returns all birds with NONE food cost mode", () => {
      const bird1 = createMockBirdCard({ id: "bird1", foodCostMode: "NONE" });
      const bird2 = createMockBirdCard({ id: "bird2", foodCostMode: "NONE" });
      const player = PlayerState.from("p1", {
        hand: [bird1, bird2],
      });

      expect(player.getEligibleBirdsToPlay()).toEqual([bird1, bird2]);
    });

    describe("AND food cost mode", () => {
      it("returns bird when player has all required food", () => {
        const bird = createMockBirdCard({
          id: "expensive_bird",
          foodCostMode: "AND",
          foodCost: { SEED: 1, INVERTEBRATE: 2 },
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
          food: { SEED: 2, INVERTEBRATE: 3 },
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([bird]);
      });

      it("does not return bird when missing one food type", () => {
        const bird = createMockBirdCard({
          id: "expensive_bird",
          foodCostMode: "AND",
          foodCost: { SEED: 1, INVERTEBRATE: 2 },
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
          food: { SEED: 2 }, // Missing INVERTEBRATE
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([]);
      });

      it("does not return bird when not enough of a food type", () => {
        const bird = createMockBirdCard({
          id: "expensive_bird",
          foodCostMode: "AND",
          foodCost: { SEED: 1, INVERTEBRATE: 2 },
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
          food: { SEED: 2, INVERTEBRATE: 1 }, // Not enough INVERTEBRATE
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([]);
      });

      it("returns bird when food cost is empty (no requirements)", () => {
        const bird = createMockBirdCard({
          id: "free_bird",
          foodCostMode: "AND",
          foodCost: {},
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([bird]);
      });
    });

    describe("OR food cost mode", () => {
      it("returns bird when player has any of the required food types", () => {
        const bird = createMockBirdCard({
          id: "flexible_bird",
          foodCostMode: "OR",
          foodCost: { SEED: 1, FISH: 1 },
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
          food: { FISH: 1 }, // Has fish but not seed
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([bird]);
      });

      it("does not return bird when player has none of required food types", () => {
        const bird = createMockBirdCard({
          id: "flexible_bird",
          foodCostMode: "OR",
          foodCost: { SEED: 1, FISH: 1 },
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
          food: { RODENT: 5 }, // Has food but not the right types
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([]);
      });

      it("returns bird when OR food cost is empty", () => {
        const bird = createMockBirdCard({
          id: "free_bird",
          foodCostMode: "OR",
          foodCost: {},
        });
        const player = PlayerState.from("p1", {
          hand: [bird],
        });

        expect(player.getEligibleBirdsToPlay()).toEqual([bird]);
      });
    });

    it("filters mixed hand correctly", () => {
      const affordableBird = createMockBirdCard({
        id: "affordable",
        foodCostMode: "AND",
        foodCost: { SEED: 1 },
      });
      const expensiveBird = createMockBirdCard({
        id: "expensive",
        foodCostMode: "AND",
        foodCost: { FISH: 3 },
      });
      const freeBird = createMockBirdCard({
        id: "free",
        foodCostMode: "NONE",
      });

      const player = PlayerState.from("p1", {
        hand: [affordableBird, expensiveBird, freeBird],
        food: { SEED: 2 },
      });

      const eligible = player.getEligibleBirdsToPlay();
      expect(eligible).toContain(affordableBird);
      expect(eligible).toContain(freeBird);
      expect(eligible).not.toContain(expensiveBird);
      expect(eligible).toHaveLength(2);
    });
  });

  describe("mutability", () => {
    it("allows modifying hand", () => {
      const player = PlayerState.create("p1");
      const bird = createMockBirdCard({ id: "new_bird" });

      player.hand.push(bird);
      expect(player.hand).toHaveLength(1);
      expect(player.hand[0]).toBe(bird);
    });

    it("allows modifying food", () => {
      const player = PlayerState.create("p1");

      player.food.SEED = 3;
      expect(player.food.SEED).toBe(3);
    });

    it("allows modifying turnsRemaining", () => {
      const player = PlayerState.create("p1");

      player.turnsRemaining = 5;
      expect(player.turnsRemaining).toBe(5);
    });

    it("allows modifying bonusCards", () => {
      const player = PlayerState.create("p1");
      const bonus = createMockBonusCard({ id: "new_bonus" });

      player.bonusCards.push(bonus);
      expect(player.bonusCards).toHaveLength(1);
    });
  });

  describe("board property", () => {
    it("provides access to the player board", () => {
      const player = PlayerState.create("p1");

      expect(player.board).toBeInstanceOf(PlayerBoard);
      expect(player.board.getAllBirds()).toEqual([]);
    });

    it("uses provided board from config", () => {
      const board = PlayerBoard.empty();
      const player = PlayerState.from("p1", { board });

      expect(player.board).toBe(board);
    });
  });
});

import { describe, it, expect } from "vitest";
import { PlayerBoard } from "./PlayerBoard.js";
import type { BirdInstance, BirdCard, Habitat } from "../types/core.js";

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

// Helper to create a mock bird instance
function createMockBirdInstance(
  id: string,
  cardOverrides: Partial<BirdCard> = {},
  instanceOverrides: Partial<Omit<BirdInstance, "id" | "card">> = {}
): BirdInstance {
  return {
    id,
    card: createMockBirdCard({ id: id.split("_").pop() ?? id, ...cardOverrides }),
    cachedFood: {},
    tuckedCards: [],
    eggs: 0,
    ...instanceOverrides,
  };
}

describe("PlayerBoard", () => {
  describe("empty()", () => {
    it("creates a board with all null slots", () => {
      const board = PlayerBoard.empty();

      expect(board.getHabitat("FOREST")).toHaveLength(5);
      expect(board.getHabitat("GRASSLAND")).toHaveLength(5);
      expect(board.getHabitat("WETLAND")).toHaveLength(5);

      expect(board.getAllBirds()).toHaveLength(0);
    });
  });

  describe("from()", () => {
    it("creates a board from existing data", () => {
      const bird = createMockBirdInstance("p1_FOREST_0_robin");
      const data = {
        FOREST: [bird, null, null, null, null] as Array<BirdInstance | null>,
        GRASSLAND: Array(5).fill(null) as Array<BirdInstance | null>,
        WETLAND: Array(5).fill(null) as Array<BirdInstance | null>,
      };

      const board = PlayerBoard.from(data);
      expect(board.getSlot("FOREST", 0)).toBe(bird);
      expect(board.getAllBirds()).toHaveLength(1);
    });

    it("creates a copy of the input data", () => {
      const bird = createMockBirdInstance("p1_FOREST_0_robin");
      const data = {
        FOREST: [bird, null, null, null, null] as Array<BirdInstance | null>,
        GRASSLAND: Array(5).fill(null) as Array<BirdInstance | null>,
        WETLAND: Array(5).fill(null) as Array<BirdInstance | null>,
      };

      const board = PlayerBoard.from(data);
      data.FOREST[0] = null; // Modify original

      expect(board.getSlot("FOREST", 0)).toBe(bird); // Board unchanged
    });
  });

  describe("getLeftmostEmptyColumn()", () => {
    it("returns 0 for empty habitat", () => {
      const board = PlayerBoard.empty();
      expect(board.getLeftmostEmptyColumn("FOREST")).toBe(0);
    });

    it("returns correct column when birds are placed", () => {
      const board = PlayerBoard.empty();
      board.setSlot("FOREST", 0, createMockBirdInstance("p1_FOREST_0_a"));
      board.setSlot("FOREST", 1, createMockBirdInstance("p1_FOREST_1_b"));

      expect(board.getLeftmostEmptyColumn("FOREST")).toBe(2);
    });

    it("returns 5 when habitat is full", () => {
      const board = PlayerBoard.empty();
      for (let i = 0; i < 5; i++) {
        board.setSlot("FOREST", i, createMockBirdInstance(`p1_FOREST_${i}_bird`));
      }

      expect(board.getLeftmostEmptyColumn("FOREST")).toBe(5);
    });
  });

  describe("getBirdsWithBrownPowers()", () => {
    it("returns empty array for empty habitat", () => {
      const board = PlayerBoard.empty();
      expect(board.getBirdsWithBrownPowers("FOREST")).toEqual([]);
    });

    it("returns birds with WHEN_ACTIVATED powers in right-to-left order", () => {
      const board = PlayerBoard.empty();
      const bird1 = createMockBirdInstance("p1_FOREST_0_a", {
        power: {
          handlerId: "test1",
          trigger: "WHEN_ACTIVATED",
          params: {},
          text: "Test power 1",
        },
      });
      const bird2 = createMockBirdInstance("p1_FOREST_1_b", {
        power: {
          handlerId: "test2",
          trigger: "WHEN_ACTIVATED",
          params: {},
          text: "Test power 2",
        },
      });
      const bird3 = createMockBirdInstance("p1_FOREST_2_c", {
        power: null, // No power
      });

      board.setSlot("FOREST", 0, bird1);
      board.setSlot("FOREST", 1, bird2);
      board.setSlot("FOREST", 2, bird3);

      const result = board.getBirdsWithBrownPowers("FOREST");
      expect(result).toEqual([bird2.id, bird1.id]); // Right-to-left
    });

    it("excludes birds with non-brown powers", () => {
      const board = PlayerBoard.empty();
      const brownBird = createMockBirdInstance("p1_FOREST_0_brown", {
        power: {
          handlerId: "brown",
          trigger: "WHEN_ACTIVATED",
          params: {},
          text: "Brown",
        },
      });
      const pinkBird = createMockBirdInstance("p1_FOREST_1_pink", {
        power: {
          handlerId: "pink",
          trigger: "ONCE_BETWEEN_TURNS",
          params: {},
          text: "Pink",
        },
      });
      const whiteBird = createMockBirdInstance("p1_FOREST_2_white", {
        power: {
          handlerId: "white",
          trigger: "WHEN_PLAYED",
          params: {},
          text: "White",
        },
      });

      board.setSlot("FOREST", 0, brownBird);
      board.setSlot("FOREST", 1, pinkBird);
      board.setSlot("FOREST", 2, whiteBird);

      const result = board.getBirdsWithBrownPowers("FOREST");
      expect(result).toEqual([brownBird.id]);
    });
  });

  describe("findBirdInstance()", () => {
    it("returns null for empty board", () => {
      const board = PlayerBoard.empty();
      expect(board.findBirdInstance("nonexistent")).toBeNull();
    });

    it("finds bird by ID", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance("p1_GRASSLAND_0_sparrow");
      board.setSlot("GRASSLAND", 0, bird);

      expect(board.findBirdInstance("p1_GRASSLAND_0_sparrow")).toBe(bird);
    });

    it("searches across all habitats", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance("p1_WETLAND_3_duck");
      board.setSlot("WETLAND", 3, bird);

      expect(board.findBirdInstance("p1_WETLAND_3_duck")).toBe(bird);
    });
  });

  describe("getBirdHabitat()", () => {
    it("returns null for nonexistent bird", () => {
      const board = PlayerBoard.empty();
      expect(board.getBirdHabitat("nonexistent")).toBeNull();
    });

    it("returns correct habitat for bird", () => {
      const board = PlayerBoard.empty();
      board.setSlot("GRASSLAND", 2, createMockBirdInstance("p1_GRASSLAND_2_x"));

      expect(board.getBirdHabitat("p1_GRASSLAND_2_x")).toBe("GRASSLAND");
    });
  });

  describe("getAllBirds()", () => {
    it("returns empty array for empty board", () => {
      const board = PlayerBoard.empty();
      expect(board.getAllBirds()).toEqual([]);
    });

    it("returns all birds across all habitats", () => {
      const board = PlayerBoard.empty();
      const bird1 = createMockBirdInstance("p1_FOREST_0_a");
      const bird2 = createMockBirdInstance("p1_GRASSLAND_0_b");
      const bird3 = createMockBirdInstance("p1_WETLAND_0_c");

      board.setSlot("FOREST", 0, bird1);
      board.setSlot("GRASSLAND", 0, bird2);
      board.setSlot("WETLAND", 0, bird3);

      const birds = board.getAllBirds();
      expect(birds).toHaveLength(3);
      expect(birds).toContain(bird1);
      expect(birds).toContain(bird2);
      expect(birds).toContain(bird3);
    });
  });

  describe("getBirdsInHabitat()", () => {
    it("returns only birds in specified habitat", () => {
      const board = PlayerBoard.empty();
      const forestBird = createMockBirdInstance("p1_FOREST_0_a");
      const grasslandBird = createMockBirdInstance("p1_GRASSLAND_0_b");

      board.setSlot("FOREST", 0, forestBird);
      board.setSlot("GRASSLAND", 0, grasslandBird);

      expect(board.getBirdsInHabitat("FOREST")).toEqual([forestBird]);
      expect(board.getBirdsInHabitat("GRASSLAND")).toEqual([grasslandBird]);
      expect(board.getBirdsInHabitat("WETLAND")).toEqual([]);
    });
  });

  describe("getRemainingEggCapacities()", () => {
    it("returns empty object for empty board", () => {
      const board = PlayerBoard.empty();
      expect(board.getRemainingEggCapacities()).toEqual({});
    });

    it("calculates remaining capacity correctly", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance(
        "p1_FOREST_0_a",
        { eggCapacity: 4 },
        { eggs: 1 }
      );
      board.setSlot("FOREST", 0, bird);

      expect(board.getRemainingEggCapacities()).toEqual({
        "p1_FOREST_0_a": 3,
      });
    });

    it("excludes birds at full capacity", () => {
      const board = PlayerBoard.empty();
      const fullBird = createMockBirdInstance(
        "p1_FOREST_0_full",
        { eggCapacity: 2 },
        { eggs: 2 }
      );
      const partialBird = createMockBirdInstance(
        "p1_FOREST_1_partial",
        { eggCapacity: 3 },
        { eggs: 1 }
      );

      board.setSlot("FOREST", 0, fullBird);
      board.setSlot("FOREST", 1, partialBird);

      const caps = board.getRemainingEggCapacities();
      expect(caps).not.toHaveProperty("p1_FOREST_0_full");
      expect(caps["p1_FOREST_1_partial"]).toBe(2);
    });
  });

  describe("getEggsOnBirds()", () => {
    it("returns empty object for empty board", () => {
      const board = PlayerBoard.empty();
      expect(board.getEggsOnBirds()).toEqual({});
    });

    it("returns eggs for birds that have eggs", () => {
      const board = PlayerBoard.empty();
      const birdWithEggs = createMockBirdInstance(
        "p1_FOREST_0_a",
        {},
        { eggs: 3 }
      );
      const birdNoEggs = createMockBirdInstance("p1_FOREST_1_b", {}, { eggs: 0 });

      board.setSlot("FOREST", 0, birdWithEggs);
      board.setSlot("FOREST", 1, birdNoEggs);

      const eggs = board.getEggsOnBirds();
      expect(eggs).toEqual({ "p1_FOREST_0_a": 3 });
    });
  });

  describe("getBirdsWithNestType()", () => {
    it("returns birds with matching nest type", () => {
      const board = PlayerBoard.empty();
      const bowlBird = createMockBirdInstance("p1_FOREST_0_bowl", {
        nestType: "BOWL",
      });
      const cavityBird = createMockBirdInstance("p1_FOREST_1_cavity", {
        nestType: "CAVITY",
      });

      board.setSlot("FOREST", 0, bowlBird);
      board.setSlot("FOREST", 1, cavityBird);

      expect(board.getBirdsWithNestType("BOWL")).toEqual([bowlBird]);
      expect(board.getBirdsWithNestType("CAVITY")).toEqual([cavityBird]);
    });

    it("includes WILD nest type birds", () => {
      const board = PlayerBoard.empty();
      const wildBird = createMockBirdInstance("p1_FOREST_0_wild", {
        nestType: "WILD",
      });
      const bowlBird = createMockBirdInstance("p1_FOREST_1_bowl", {
        nestType: "BOWL",
      });

      board.setSlot("FOREST", 0, wildBird);
      board.setSlot("FOREST", 1, bowlBird);

      const result = board.getBirdsWithNestType("BOWL");
      expect(result).toContain(wildBird);
      expect(result).toContain(bowlBird);
    });

    it("excludes specified bird ID", () => {
      const board = PlayerBoard.empty();
      const bird1 = createMockBirdInstance("p1_FOREST_0_a", { nestType: "BOWL" });
      const bird2 = createMockBirdInstance("p1_FOREST_1_b", { nestType: "BOWL" });

      board.setSlot("FOREST", 0, bird1);
      board.setSlot("FOREST", 1, bird2);

      const result = board.getBirdsWithNestType("BOWL", "p1_FOREST_0_a");
      expect(result).toEqual([bird2]);
    });
  });

  describe("countBirdsInHabitat()", () => {
    it("returns 0 for empty habitat", () => {
      const board = PlayerBoard.empty();
      expect(board.countBirdsInHabitat("FOREST")).toBe(0);
    });

    it("counts birds correctly", () => {
      const board = PlayerBoard.empty();
      board.setSlot("FOREST", 0, createMockBirdInstance("p1_FOREST_0_a"));
      board.setSlot("FOREST", 2, createMockBirdInstance("p1_FOREST_2_b"));

      expect(board.countBirdsInHabitat("FOREST")).toBe(2);
    });
  });

  describe("getSlot() / setSlot()", () => {
    it("gets and sets slots correctly", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance("p1_FOREST_0_x");

      expect(board.getSlot("FOREST", 0)).toBeNull();
      board.setSlot("FOREST", 0, bird);
      expect(board.getSlot("FOREST", 0)).toBe(bird);
    });

    it("can clear a slot", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance("p1_FOREST_0_x");

      board.setSlot("FOREST", 0, bird);
      board.setSlot("FOREST", 0, null);
      expect(board.getSlot("FOREST", 0)).toBeNull();
    });
  });

  describe("toRecord()", () => {
    it("returns a copy of the board data", () => {
      const board = PlayerBoard.empty();
      const bird = createMockBirdInstance("p1_FOREST_0_x");
      board.setSlot("FOREST", 0, bird);

      const record = board.toRecord();
      expect(record.FOREST[0]).toBe(bird);

      // Modifying record should not affect board
      record.FOREST[0] = null;
      expect(board.getSlot("FOREST", 0)).toBe(bird);
    });
  });
});

/**
 * Unit tests for ScenarioBuilder.
 *
 * These tests verify that the ScenarioBuilder correctly constructs game states
 * from declarative scenario configurations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DataRegistry } from "../../data/DataRegistry.js";
import {
  ScenarioBuilder,
  type ScenarioConfig,
} from "./ScenarioBuilder.js";

describe("ScenarioBuilder", () => {
  let registry: DataRegistry;
  let builder: ScenarioBuilder;

  beforeEach(() => {
    registry = new DataRegistry();
    builder = new ScenarioBuilder(registry);
  });

  // Minimal valid scenario configuration for testing
  const createMinimalConfig = (
    overrides?: Partial<ScenarioConfig>
  ): ScenarioConfig => ({
    name: "Test Scenario",
    description: "A minimal test scenario",
    targetHandlers: ["testHandler"],
    players: [
      {
        id: "alice",
        hand: [],
        bonusCards: [],
        food: {},
        board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
      },
      {
        id: "bob",
        hand: [],
        bonusCards: [],
        food: {},
        board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
      },
    ],
    turns: [],
    birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
    ...overrides,
  });

  describe("build()", () => {
    // Verifies that build() returns the correct structure with gameState, agents, and config
    it("returns BuiltScenario with correct structure", () => {
      const config = createMinimalConfig();
      const result = builder.build(config);

      expect(result).toHaveProperty("gameState");
      expect(result).toHaveProperty("agents");
      expect(result).toHaveProperty("config");
      expect(result.config).toBe(config);
    });

    // Verifies that one ScriptedAgent is created for each player in the config
    it("creates ScriptedAgent for each player", () => {
      const config = createMinimalConfig();
      const result = builder.build(config);

      expect(result.agents).toHaveLength(2);
      expect(result.agents[0].playerId).toBe("alice");
      expect(result.agents[1].playerId).toBe("bob");
    });

    // Verifies that turn block grouping correctly flattens choices per player
    it("groups turn blocks by player correctly", () => {
      const config = createMinimalConfig({
        turns: [
          {
            player: "alice",
            choices: [{ kind: "turnAction", action: "GAIN_FOOD", takeBonus: false }],
          },
          {
            player: "bob",
            choices: [{ kind: "turnAction", action: "LAY_EGGS", takeBonus: false }],
          },
          {
            player: "alice",
            choices: [{ kind: "activatePower", activate: true }],
          },
        ],
      });

      const result = builder.build(config);

      // Alice should have 2 choices: turnAction + activatePower
      expect(result.agents[0].getRemainingChoiceCount()).toBe(2);
      // Bob should have 1 choice: turnAction
      expect(result.agents[1].getRemainingChoiceCount()).toBe(1);
    });
  });

  describe("player state creation", () => {
    // Verifies that player hand cards are correctly looked up from registry
    it("creates player with specified hand cards", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: ["canada_goose", "american_robin"],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");

      expect(alice.hand).toHaveLength(2);
      expect(alice.hand.map((c) => c.id)).toContain("canada_goose");
      expect(alice.hand.map((c) => c.id)).toContain("american_robin");
    });

    // Verifies that player bonus cards are correctly looked up from registry
    it("creates player with specified bonus cards", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: ["anatomist", "cartographer"],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");

      expect(alice.bonusCards).toHaveLength(2);
      expect(alice.bonusCards.map((c) => c.id)).toContain("anatomist");
      expect(alice.bonusCards.map((c) => c.id)).toContain("cartographer");
    });

    // Verifies that player food supply is correctly initialized
    it("creates player with specified food", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: { SEED: 3, INVERTEBRATE: 2, FISH: 1 },
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");

      expect(alice.food.SEED).toBe(3);
      expect(alice.food.INVERTEBRATE).toBe(2);
      expect(alice.food.FISH).toBe(1);
    });

    // Verifies that birds are placed on the board in correct habitats and positions
    it("creates player board with birds in correct positions", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [{ cardId: "barn_owl" }, { cardId: "eastern_screech_owl" }],
              GRASSLAND: [{ cardId: "killdeer" }],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");

      // Check FOREST birds
      const forestSlot0 = alice.board.getSlot("FOREST", 0);
      const forestSlot1 = alice.board.getSlot("FOREST", 1);
      expect(forestSlot0).not.toBeNull();
      expect(forestSlot0!.card.id).toBe("barn_owl");
      expect(forestSlot1).not.toBeNull();
      expect(forestSlot1!.card.id).toBe("eastern_screech_owl");

      // Check GRASSLAND birds
      const grasslandSlot0 = alice.board.getSlot("GRASSLAND", 0);
      expect(grasslandSlot0).not.toBeNull();
      expect(grasslandSlot0!.card.id).toBe("killdeer");

      // Check WETLAND is empty
      expect(alice.board.countBirdsInHabitat("WETLAND")).toBe(0);
    });

    // Verifies that bird instance IDs follow the {playerId}_{cardId} convention
    it("creates bird instances with correct ID format", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [{ cardId: "barn_owl" }],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");
      const bird = alice.board.getSlot("FOREST", 0);

      expect(bird!.id).toBe("alice_barn_owl");
    });

    // Verifies that bird placement eggs are correctly initialized
    it("creates birds with specified eggs", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [{ cardId: "barn_owl", eggs: 3 }],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");
      const bird = alice.board.getSlot("FOREST", 0);

      expect(bird!.eggs).toBe(3);
    });

    // Verifies that bird placement cached food is correctly initialized
    it("creates birds with specified cached food", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [
                { cardId: "barn_owl", cachedFood: { RODENT: 2, INVERTEBRATE: 1 } },
              ],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");
      const bird = alice.board.getSlot("FOREST", 0);

      expect(bird!.cachedFood.RODENT).toBe(2);
      expect(bird!.cachedFood.INVERTEBRATE).toBe(1);
    });

    // Verifies that bird placement tucked cards are correctly initialized
    it("creates birds with specified tucked cards", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [
                {
                  cardId: "barn_owl",
                  tuckedCards: ["canada_goose", "american_robin"],
                },
              ],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);
      const alice = result.gameState.findPlayer("alice");
      const bird = alice.board.getSlot("FOREST", 0);

      expect(bird!.tuckedCards).toHaveLength(2);
      expect(bird!.tuckedCards).toContain("canada_goose");
      expect(bird!.tuckedCards).toContain("american_robin");
    });
  });

  describe("birdfeeder setup", () => {
    // Verifies that birdfeeder is initialized with specified dice
    it("creates birdfeeder with specified dice", () => {
      const config = createMinimalConfig({
        birdfeeder: ["RODENT", "RODENT", "SEED", "FISH", "SEED_INVERTEBRATE"],
      });

      const result = builder.build(config);
      const dice = result.gameState.birdfeeder.getDiceInFeeder();

      expect(dice).toHaveLength(5);
      expect(dice.filter((d) => d === "RODENT")).toHaveLength(2);
      expect(dice.filter((d) => d === "SEED")).toHaveLength(1);
      expect(dice.filter((d) => d === "FISH")).toHaveLength(1);
      expect(dice.filter((d) => d === "SEED_INVERTEBRATE")).toHaveLength(1);
    });

    // Verifies that dice can be taken from the preset birdfeeder
    it("allows taking dice from birdfeeder", () => {
      const config = createMinimalConfig({
        birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      });

      const result = builder.build(config);
      const takenDie = result.gameState.birdfeeder.takeDie("SEED");

      expect(takenDie).toBe("SEED");
      expect(result.gameState.birdfeeder.getDiceInFeeder()).toHaveLength(4);
    });
  });

  describe("bird tray setup", () => {
    // Verifies that bird tray is filled with specified cards
    it("creates bird tray with specified cards", () => {
      const config = createMinimalConfig({
        birdTray: ["canada_goose", "american_robin", "baltimore_oriole"],
      });

      const result = builder.build(config);
      const tray = result.gameState.birdCardSupply.getTray();

      expect(tray[0]?.id).toBe("canada_goose");
      expect(tray[1]?.id).toBe("american_robin");
      expect(tray[2]?.id).toBe("baltimore_oriole");
    });

    // Verifies that null slots in tray config remain empty
    it("handles null slots in tray config", () => {
      const config = createMinimalConfig({
        birdTray: ["canada_goose", null, "baltimore_oriole"],
      });

      const result = builder.build(config);
      const tray = result.gameState.birdCardSupply.getTray();

      expect(tray[0]?.id).toBe("canada_goose");
      expect(tray[1]).toBeNull();
      expect(tray[2]?.id).toBe("baltimore_oriole");
    });
  });

  describe("deck stacking", () => {
    // Verifies that deckTopCards are placed at the top of the deck and drawn first
    it("stacks specified cards on top of bird deck", () => {
      const config = createMinimalConfig({
        deckTopCards: ["canada_goose", "american_robin", "baltimore_oriole"],
        birdTray: ["killdeer", "barn_owl", "eastern_screech_owl"],
      });

      const result = builder.build(config);

      // Draw cards from deck and verify order
      const drawn1 = result.gameState.birdCardSupply.drawFromDeck(1);
      expect(drawn1[0].id).toBe("canada_goose");

      const drawn2 = result.gameState.birdCardSupply.drawFromDeck(1);
      expect(drawn2[0].id).toBe("american_robin");

      const drawn3 = result.gameState.birdCardSupply.drawFromDeck(1);
      expect(drawn3[0].id).toBe("baltimore_oriole");
    });
  });

  describe("card removal", () => {
    // Verifies that cards dealt to players are removed from the deck
    it("removes player hand cards from deck", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: ["canada_goose"],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);

      // Draw many cards and verify canada_goose is not among them
      const drawnCards: string[] = [];
      for (let i = 0; i < 50; i++) {
        try {
          const drawn = result.gameState.birdCardSupply.drawFromDeck(1);
          drawnCards.push(drawn[0].id);
        } catch {
          break;
        }
      }

      expect(drawnCards).not.toContain("canada_goose");
    });

    // Verifies that cards on player boards are removed from the deck
    it("removes board cards from deck", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [{ cardId: "barn_owl" }],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);

      // Draw many cards and verify barn_owl is not among them
      const drawnCards: string[] = [];
      for (let i = 0; i < 50; i++) {
        try {
          const drawn = result.gameState.birdCardSupply.drawFromDeck(1);
          drawnCards.push(drawn[0].id);
        } catch {
          break;
        }
      }

      expect(drawnCards).not.toContain("barn_owl");
    });

    // Verifies that tucked cards are also removed from the deck
    it("removes tucked cards from deck", () => {
      const config = createMinimalConfig({
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: {},
            board: {
              FOREST: [{ cardId: "barn_owl", tuckedCards: ["canada_goose"] }],
              GRASSLAND: [],
              WETLAND: [],
            },
          },
          {
            id: "bob",
            hand: [],
            bonusCards: [],
            food: {},
            board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
          },
        ],
      });

      const result = builder.build(config);

      // Draw many cards and verify both barn_owl and canada_goose are not among them
      const drawnCards: string[] = [];
      for (let i = 0; i < 50; i++) {
        try {
          const drawn = result.gameState.birdCardSupply.drawFromDeck(1);
          drawnCards.push(drawn[0].id);
        } catch {
          break;
        }
      }

      expect(drawnCards).not.toContain("barn_owl");
      expect(drawnCards).not.toContain("canada_goose");
    });
  });

  describe("game state initialization", () => {
    // Verifies that round, turn, and activePlayerIndex are correctly set
    it("sets correct round and turn numbers", () => {
      const config = createMinimalConfig({
        startRound: 3,
        startTurn: 5,
        startingPlayerIndex: 1,
      });

      const result = builder.build(config);

      expect(result.gameState.round).toBe(3);
      expect(result.gameState.turn).toBe(5);
      expect(result.gameState.activePlayerIndex).toBe(1);
    });

    // Verifies that default values are used when not specified
    it("uses default values when not specified", () => {
      const config = createMinimalConfig();
      const result = builder.build(config);

      expect(result.gameState.round).toBe(1);
      expect(result.gameState.turn).toBe(1);
      expect(result.gameState.activePlayerIndex).toBe(0);
    });

    // Verifies that round goals are set up
    it("sets up round goals", () => {
      const config = createMinimalConfig();
      const result = builder.build(config);

      expect(result.gameState.roundGoals).toHaveLength(4);
    });
  });

  describe("deterministic seeding", () => {
    // Verifies that the same seed produces the same deck order
    it("produces same deck order with same seed", () => {
      const config1 = createMinimalConfig({ seed: 42 });
      const config2 = createMinimalConfig({ seed: 42 });

      const result1 = builder.build(config1);
      const result2 = builder.build(config2);

      // Draw several cards and compare
      const drawn1 = result1.gameState.birdCardSupply.drawFromDeck(5);
      const drawn2 = result2.gameState.birdCardSupply.drawFromDeck(5);

      expect(drawn1.map((c) => c.id)).toEqual(drawn2.map((c) => c.id));
    });

    // Verifies that different seeds produce different deck orders
    it("produces different deck order with different seed", () => {
      const config1 = createMinimalConfig({ seed: 42 });
      const config2 = createMinimalConfig({ seed: 99 });

      const result1 = builder.build(config1);
      const result2 = builder.build(config2);

      // Draw several cards and compare (should be different with high probability)
      const drawn1 = result1.gameState.birdCardSupply.drawFromDeck(5);
      const drawn2 = result2.gameState.birdCardSupply.drawFromDeck(5);

      // Not strictly equal (probabilistically different)
      expect(drawn1.map((c) => c.id)).not.toEqual(drawn2.map((c) => c.id));
    });
  });
});

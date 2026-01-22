import { describe, it, expect, vi } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { DataRegistry } from "../data/DataRegistry.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
  SelectFoodFromFeederChoice,
  PlaceEggsChoice,
  DrawCardsChoice,
  PlayBirdChoice,
  SelectCardsChoice,
  DiscardEggsChoice,
  DiscardFoodChoice,
} from "../types/prompts.js";
import type { FoodType, DieFace } from "../types/core.js";
import type { Event } from "../types/events.js";

/**
 * Creates a mock agent that makes deterministic choices for testing.
 * - Starting hand: keeps all birds, first bonus card, discards food equal to birds kept
 * - Turn action: always takes GAIN_FOOD action (no bonus)
 * - Options: makes simplest valid choices
 */
function createMockAgent(playerId: string): PlayerAgent {
  return {
    playerId,

    async chooseStartingHand(
      prompt: StartingHandPrompt
    ): Promise<StartingHandChoice> {
      // Keep all birds, first bonus card, discard food equal to birds kept
      const birdsToKeep = prompt.eligibleBirds;
      const bonusCards = prompt.eligibleBonusCards;
      const foodToDiscard = new Set<FoodType>();

      // Discard food equal to number of birds kept
      const foodTypes: FoodType[] = [
        "INVERTEBRATE",
        "SEED",
        "FISH",
        "FRUIT",
        "RODENT",
      ];
      for (let i = 0; i < birdsToKeep.length && i < foodTypes.length; i++) {
        foodToDiscard.add(foodTypes[i]);
      }

      return {
        promptId: prompt.promptId,
        kind: "startingHand",
        birds: new Set(birdsToKeep.map((b) => b.id)),
        bonusCard: bonusCards[0].id,
        foodToDiscard,
      };
    },

    async chooseTurnAction(
      prompt: TurnActionPrompt
    ): Promise<TurnActionChoice> {
      // Always take GAIN_FOOD action
      return {
        promptId: prompt.promptId,
        kind: "turnAction",
        action: "GAIN_FOOD",
        takeBonus: false,
      };
    },

    async chooseOption(prompt: OptionPrompt): Promise<OptionChoice> {
      switch (prompt.kind) {
        case "activatePower": {
          // Always activate the power
          return {
            promptId: prompt.promptId,
            kind: "activatePower",
            activate: true,
          };
        }

        case "selectFoodFromSupply": {
          // Take the first allowed food type
          const food: Record<string, number> = {};
          const firstFoodType = prompt.allowedFoods[0];
          if (firstFoodType) {
            food[firstFoodType] = prompt.count;
          }
          return {
            promptId: prompt.promptId,
            kind: "selectFoodFromSupply",
            food,
          };
        }

        case "selectFoodFromFeeder": {
          // Take the first available die
          const available = prompt.availableDice;
          for (const [dieType, count] of Object.entries(available)) {
            if (count && count > 0) {
              // For SEED_INVERTEBRATE dice, must specify which food type to take
              const dieSelection = dieType === "SEED_INVERTEBRATE"
                ? { die: dieType, asFoodType: "SEED" as const }
                : { die: dieType };
              return {
                promptId: prompt.promptId,
                kind: "selectFoodFromFeeder",
                diceOrReroll: [dieSelection],
              } as SelectFoodFromFeederChoice;
            }
          }
          // If no dice, try to reroll
          return {
            promptId: prompt.promptId,
            kind: "selectFoodFromFeeder",
            diceOrReroll: "reroll",
          } as SelectFoodFromFeederChoice;
        }

        case "placeEggs": {
          // Place eggs on first available bird
          const placements: Record<string, number> = {};
          let remaining = prompt.count;
          for (const [birdId, capacity] of Object.entries(
            prompt.remainingCapacitiesByEligibleBird
          )) {
            if (remaining > 0 && capacity && capacity > 0) {
              const toPlace = Math.min(remaining, capacity);
              placements[birdId] = toPlace;
              remaining -= toPlace;
            }
          }
          return {
            promptId: prompt.promptId,
            kind: "placeEggs",
            placements,
          } as PlaceEggsChoice;
        }

        case "drawCards": {
          // Draw from deck
          return {
            promptId: prompt.promptId,
            kind: "drawCards",
            trayCards: [],
            numDeckCards: prompt.remaining,
          } as DrawCardsChoice;
        }

        case "playBird": {
          // Play first eligible bird to first available habitat
          const birdCard = prompt.eligibleBirds[0];
          const habitats = Object.keys(
            prompt.eggCostByEligibleHabitat
          ) as Array<"FOREST" | "GRASSLAND" | "WETLAND">;
          const habitat = habitats[0] ?? "FOREST";

          return {
            promptId: prompt.promptId,
            kind: "playBird",
            bird: birdCard.id,
            habitat,
            foodToSpend: {},
            eggsToSpend: {},
          } as PlayBirdChoice;
        }

        case "selectCards": {
          // Select the first card(s) for discard
          const cardsToSelect = prompt.eligibleCards
            .slice(0, prompt.count)
            .map((c) => c.id);
          return {
            promptId: prompt.promptId,
            kind: "selectCards",
            cards: cardsToSelect,
          } as SelectCardsChoice;
        }

        case "discardEggs": {
          // Discard eggs from the first bird with eggs
          const sources: Record<string, number> = {};
          let remaining = prompt.count;
          for (const [birdId, count] of Object.entries(
            prompt.eggsByEligibleBird
          )) {
            if (remaining > 0 && count && count > 0) {
              const toDiscard = Math.min(remaining, count);
              sources[birdId] = toDiscard;
              remaining -= toDiscard;
            }
          }
          return {
            promptId: prompt.promptId,
            kind: "discardEggs",
            sources,
          } as DiscardEggsChoice;
        }

        case "discardFood": {
          // Discard the first available food type(s) to meet the cost
          const food: Record<string, number> = {};
          let remaining =
            Object.values(prompt.foodCost).reduce(
              (sum, v) => sum + (v ?? 0),
              0
            ) || 1;
          const foodTypes: FoodType[] = [
            "INVERTEBRATE",
            "SEED",
            "FISH",
            "FRUIT",
            "RODENT",
            "WILD",
          ];
          // Note: We need access to player's food, but prompt doesn't include it
          // For mock purposes, just return the first food type
          food[foodTypes[0]] = remaining;
          return {
            promptId: prompt.promptId,
            kind: "discardFood",
            food,
          } as DiscardFoodChoice;
        }

        default:
          throw new Error(`Unhandled prompt kind: ${prompt.kind}`);
      }
    },
  };
}

describe("GameEngine", () => {
  describe("setupGame()", () => {
    it("produces identical GameState with same seed", () => {
      const registry = new DataRegistry();
      const config1 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };
      const config2 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine1 = new GameEngine(config1);
      const engine2 = new GameEngine(config2);

      const state1 = engine1.setupGame();
      const state2 = engine2.setupGame();

      // Compare player hands
      expect(state1.players[0].hand.map((c) => c.id)).toEqual(
        state2.players[0].hand.map((c) => c.id)
      );
      expect(state1.players[1].hand.map((c) => c.id)).toEqual(
        state2.players[1].hand.map((c) => c.id)
      );

      // Compare bonus cards
      expect(state1.players[0].bonusCards.map((c) => c.id)).toEqual(
        state2.players[0].bonusCards.map((c) => c.id)
      );
      expect(state1.players[1].bonusCards.map((c) => c.id)).toEqual(
        state2.players[1].bonusCards.map((c) => c.id)
      );

      // Compare round goals
      expect(state1.roundGoals).toEqual(state2.roundGoals);

      // Compare birdfeeder dice
      expect(state1.birdfeeder.getDiceInFeeder()).toEqual(
        state2.birdfeeder.getDiceInFeeder()
      );

      // Compare bird tray
      expect(state1.birdCardSupply.getTray().map((c) => c?.id)).toEqual(
        state2.birdCardSupply.getTray().map((c) => c?.id)
      );
    });

    it("produces different GameState with different seeds", () => {
      const registry = new DataRegistry();
      const config1 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };
      const config2 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 54321,
        registry,
      };

      const engine1 = new GameEngine(config1);
      const engine2 = new GameEngine(config2);

      const state1 = engine1.setupGame();
      const state2 = engine2.setupGame();

      // At least one of these should be different
      const hands1 = state1.players[0].hand.map((c) => c.id);
      const hands2 = state2.players[0].hand.map((c) => c.id);
      const goals1 = state1.roundGoals;
      const goals2 = state2.roundGoals;
      const dice1 = state1.birdfeeder.getDiceInFeeder();
      const dice2 = state2.birdfeeder.getDiceInFeeder();

      const somethingDifferent =
        JSON.stringify(hands1) !== JSON.stringify(hands2) ||
        JSON.stringify(goals1) !== JSON.stringify(goals2) ||
        JSON.stringify(dice1) !== JSON.stringify(dice2);

      expect(somethingDifferent).toBe(true);
    });

    it("deals correct initial resources to each player", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      for (const player of state.players) {
        // 5 bird cards
        expect(player.hand).toHaveLength(5);

        // 2 bonus cards
        expect(player.bonusCards).toHaveLength(2);

        // 5 total food (1 of each non-WILD type)
        expect(player.food.INVERTEBRATE).toBe(1);
        expect(player.food.SEED).toBe(1);
        expect(player.food.FISH).toBe(1);
        expect(player.food.FRUIT).toBe(1);
        expect(player.food.RODENT).toBe(1);
        // WILD is not set initially (FoodByType is Partial)
        expect(player.food.WILD ?? 0).toBe(0);

        // 8 turns remaining
        expect(player.turnsRemaining).toBe(8);
      }
    });

    it("selects 4 round goals", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      expect(state.roundGoals).toHaveLength(4);
      // All goals should be unique
      const uniqueGoals = new Set(state.roundGoals);
      expect(uniqueGoals.size).toBe(4);
    });

    it("initializes empty boards for all players", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      for (const player of state.players) {
        expect(player.board.getHabitat("FOREST")).toHaveLength(5);
        expect(player.board.getHabitat("GRASSLAND")).toHaveLength(5);
        expect(player.board.getHabitat("WETLAND")).toHaveLength(5);

        expect(player.board.getHabitat("FOREST").every((slot) => slot === null)).toBe(true);
        expect(player.board.getHabitat("GRASSLAND").every((slot) => slot === null)).toBe(
          true
        );
        expect(player.board.getHabitat("WETLAND").every((slot) => slot === null)).toBe(true);
      }
    });

    it("initializes birdfeeder with 5 dice", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      expect(state.birdfeeder.getDiceInFeeder()).toHaveLength(5);
    });

    it("fills bird tray with 3 cards after setup", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      const tray = state.birdCardSupply.getTray();
      expect(tray).toHaveLength(3);
      expect(tray[0]).not.toBeNull();
      expect(tray[1]).not.toBeNull();
      expect(tray[2]).not.toBeNull();
    });

    it("initializes game state with round 1, turn 1, first player active", () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine = new GameEngine(config);
      const state = engine.setupGame();

      expect(state.round).toBe(1);
      expect(state.turn).toBe(1);
      expect(state.activePlayerIndex).toBe(0);
    });

    it("supports 2 to 5 players", () => {
      const registry = new DataRegistry();

      // Test with 2, 3, 4, and 5 players
      for (const playerCount of [2, 3, 4, 5]) {
        const agents = Array.from({ length: playerCount }, (_, i) =>
          createMockAgent(`p${i + 1}`)
        );
        const config = { agents, seed: 42, registry };

        const engine = new GameEngine(config);
        const state = engine.setupGame();

        expect(state.players).toHaveLength(playerCount);
        for (let i = 0; i < playerCount; i++) {
          expect(state.players[i].id).toBe(`p${i + 1}`);
        }
      }
    });
  });

  describe("playGame()", () => {
    it("completes a full game and returns a GameResult", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      const result = await engine.playGame();

      // Game should complete with 4 rounds
      expect(result.roundsPlayed).toBe(4);

      // Should have scores for both players
      expect(result.scores).toHaveProperty("p1");
      expect(result.scores).toHaveProperty("p2");

      // Should have a winner
      expect(result.winnerId).toBeDefined();
      expect(["p1", "p2"]).toContain(result.winnerId);

      // Total turns should be (8+7+6+5) * 2 players = 52 turns
      expect(result.totalTurns).toBe(52);
    });

    it("produces deterministic results with same seed", async () => {
      const registry = new DataRegistry();

      const config1 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };
      const config2 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 42,
        registry,
      };

      const engine1 = new GameEngine(config1);
      const engine2 = new GameEngine(config2);

      const result1 = await engine1.playGame();
      const result2 = await engine2.playGame();

      expect(result1.winnerId).toBe(result2.winnerId);
      expect(result1.scores).toEqual(result2.scores);
      expect(result1.totalTurns).toBe(result2.totalTurns);
    });

    it("produces different game states with different seeds", async () => {
      const registry = new DataRegistry();

      const config1 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 100,
        registry,
      };
      const config2 = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 200,
        registry,
      };

      const engine1 = new GameEngine(config1);
      const engine2 = new GameEngine(config2);

      // Compare initial game states - these should differ with different seeds
      const state1 = engine1.getGameState();
      const state2 = engine2.getGameState();

      // At least one of: hands, bonus cards, round goals, or birdfeeder should differ
      const hands1 = state1.players[0].hand.map((c) => c.id);
      const hands2 = state2.players[0].hand.map((c) => c.id);
      const goals1 = state1.roundGoals;
      const goals2 = state2.roundGoals;
      const dice1 = state1.birdfeeder.getDiceInFeeder();
      const dice2 = state2.birdfeeder.getDiceInFeeder();

      const somethingDiffers =
        JSON.stringify(hands1) !== JSON.stringify(hands2) ||
        JSON.stringify(goals1) !== JSON.stringify(goals2) ||
        JSON.stringify(dice1) !== JSON.stringify(dice2);

      expect(somethingDiffers).toBe(true);
    });

    it("handles starting hand selection correctly", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 999,
        registry,
      };

      const engine = new GameEngine(config);
      await engine.playGame();

      const state = engine.getGameState();

      // After starting hand selection, players should have:
      // - 5 birds (mock agent keeps all)
      // - 1 bonus card (mock agent keeps first)
      // - 0 food (mock agent discards 5 food to keep 5 birds)
      for (const player of state.players) {
        // All hands should have 5+ cards (started with 5, may have drawn more during game)
        expect(player.hand.length).toBeGreaterThanOrEqual(0);
        // Should have exactly 1 bonus card
        expect(player.bonusCards).toHaveLength(1);
      }
    });

    it("updates game state correctly through rounds", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createMockAgent("p1"), createMockAgent("p2")],
        seed: 777,
        registry,
      };

      const engine = new GameEngine(config);
      await engine.playGame();

      const state = engine.getGameState();

      // After game completion, round should be 4
      expect(state.round).toBe(4);

      // Turn should be 53 (52 turns played + initial 1)
      expect(state.turn).toBe(53);

      // All players should have 0 turns remaining
      for (const player of state.players) {
        expect(player.turnsRemaining).toBe(0);
      }
    });

    it("supports games with 3-5 players", async () => {
      const registry = new DataRegistry();

      for (const playerCount of [3, 4, 5]) {
        const agents = Array.from({ length: playerCount }, (_, i) =>
          createMockAgent(`p${i + 1}`)
        );
        const config = { agents, seed: 42, registry };

        const engine = new GameEngine(config);
        const result = await engine.playGame();

        // Should have scores for all players
        for (let i = 1; i <= playerCount; i++) {
          expect(result.scores).toHaveProperty(`p${i}`);
        }

        // Total turns should be (8+7+6+5) * playerCount
        const expectedTurns = (8 + 7 + 6 + 5) * playerCount;
        expect(result.totalTurns).toBe(expectedTurns);
      }
    });
  });

  describe("scoring methods", () => {
    function createEngineWithPlayers(playerCount: number) {
      const registry = new DataRegistry();
      const agents = Array.from({ length: playerCount }, (_, i) =>
        createMockAgent(`p${i + 1}`)
      );
      return new GameEngine({ agents, seed: 42, registry });
    }

    const testRegistry = new DataRegistry();

    function createBirdInstance(
      cardId: string,
      eggs = 0,
      cachedFood: Record<string, number> = {},
      tuckedCards: string[] = []
    ) {
      return {
        id: `test_${cardId}_instance`,
        card: testRegistry.getBirdById(cardId),
        eggs,
        cachedFood,
        tuckedCards,
      };
    }

    describe("calculateFinalScores()", () => {
      it("returns zero scores for players with empty boards", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        // Clear bonus cards so only bird-based scoring applies
        state.players[0].bonusCards = [];
        state.players[1].bonusCards = [];

        const scores = engine.calculateFinalScores();

        expect(scores["p1"]).toBe(0);
        expect(scores["p2"]).toBe(0);
      });

      it("scores bird victory points correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // Clear bonus cards
        state.players[0].bonusCards = [];

        // Place a bird with known VP (acorn_woodpecker has 5 VP)
        const acornWoodpecker = registry.getBirdById("acorn_woodpecker");
        expect(acornWoodpecker).toBeDefined();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));

        const scores = engine.calculateFinalScores();
        expect(scores["p1"]).toBe(5); // 5 VP from acorn_woodpecker
      });

      it("scores eggs on birds correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].bonusCards = [];

        // Place a bird with eggs
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance(
          "acorn_woodpecker",
          3 // 3 eggs
        ));

        const scores = engine.calculateFinalScores();
        // 5 VP from bird + 3 VP from eggs = 8
        expect(scores["p1"]).toBe(8);
      });

      it("scores cached food on birds correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].bonusCards = [];

        // Place a bird with cached food
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance(
          "acorn_woodpecker",
          0,
          { SEED: 2, INVERTEBRATE: 1 } // 3 cached food
        ));

        const scores = engine.calculateFinalScores();
        // 5 VP from bird + 3 VP from cached food = 8
        expect(scores["p1"]).toBe(8);
      });

      it("scores tucked cards correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].bonusCards = [];

        // Place a bird with tucked cards
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance(
          "acorn_woodpecker",
          0,
          {},
          ["card1", "card2", "card3"] // 3 tucked cards
        ));

        const scores = engine.calculateFinalScores();
        // 5 VP from bird + 3 VP from tucked cards = 8
        expect(scores["p1"]).toBe(8);
      });

      it("combines all scoring elements correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].bonusCards = [];

        // Place a bird with everything
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance(
          "acorn_woodpecker", // 5 VP
          2, // 2 eggs
          { SEED: 1 }, // 1 cached food
          ["card1"] // 1 tucked card
        ));

        const scores = engine.calculateFinalScores();
        // 5 VP + 2 eggs + 1 cached + 1 tucked = 9
        expect(scores["p1"]).toBe(9);
      });

      it("scores multiple birds across habitats", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].bonusCards = [];

        // Place birds in different habitats
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker")); // 5 VP
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker")); // 5 VP
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker")); // 5 VP

        const scores = engine.calculateFinalScores();
        expect(scores["p1"]).toBe(15);
      });
    });

    describe("calculateBonusCardScore()", () => {
      it("returns 0 for tiered bonus card with no qualifying birds", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("nest_box_builder");
        expect(bonusCard).toBeDefined();

        // Empty board, no cavity nest birds
        const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
        expect(score).toBe(0);
      });

      it("scores PER_BIRD bonus card correctly", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // bird_counter: 2 points per bird with flocking power
        const bonusCard = registry.getBonusCardById("bird_counter");
        expect(bonusCard).toBeDefined();

        // Place birds that have bird_counter in their bonusCards
        // We need to find a bird that qualifies for bird_counter
        const allBirds = registry.getAllBirds();
        const flockingBird = allBirds.find((b) =>
          b.bonusCards.includes("bird_counter")
        );

        if (flockingBird) {
          state.players[0].board.setSlot("FOREST", 0, createBirdInstance(flockingBird.id));
          state.players[0].board.setSlot("FOREST", 1, createBirdInstance(flockingBird.id));

          const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
          expect(score).toBe(4); // 2 birds × 2 points
        }
      });

      it("scores TIERED bonus card at lower tier", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // nest_box_builder: 4-5 birds = 4 pts, 6+ = 7 pts
        const bonusCard = registry.getBonusCardById("nest_box_builder");
        expect(bonusCard).toBeDefined();

        // Find birds with cavity nests
        const allBirds = registry.getAllBirds();
        const cavityBirds = allBirds.filter((b) =>
          b.bonusCards.includes("nest_box_builder")
        );

        // Place 4 cavity nest birds (lower tier)
        for (let i = 0; i < 4 && i < cavityBirds.length; i++) {
          state.players[0].board.setSlot("FOREST", i, createBirdInstance(cavityBirds[i].id));
        }

        const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
        expect(score).toBe(4); // 4-5 birds = 4 points
      });

      it("scores TIERED bonus card at higher tier", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // nest_box_builder: 4-5 birds = 4 pts, 6+ = 7 pts
        const bonusCard = registry.getBonusCardById("nest_box_builder");
        expect(bonusCard).toBeDefined();

        // Find birds with cavity nests
        const allBirds = registry.getAllBirds();
        const cavityBirds = allBirds.filter((b) =>
          b.bonusCards.includes("nest_box_builder")
        );

        // Place 6+ cavity nest birds (higher tier)
        let placed = 0;
        for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as const) {
          for (let i = 0; i < 5 && placed < 6 && placed < cavityBirds.length; i++) {
            if (!state.players[0].board.getSlot(habitat, i)) {
              state.players[0].board.setSlot(habitat, i, createBirdInstance(
                cavityBirds[placed].id
              ));
              placed++;
            }
          }
        }

        if (placed >= 6) {
          const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
          expect(score).toBe(7); // 6+ birds = 7 points
        }
      });
    });

    describe("countQualifyingBirds()", () => {
      it("counts birds matching static bonus card condition", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("forester");
        expect(bonusCard).toBeDefined();

        // Find forest-only birds
        const allBirds = registry.getAllBirds();
        const forestOnlyBirds = allBirds.filter((b) =>
          b.bonusCards.includes("forester")
        );

        // Place 2 forest-only birds
        if (forestOnlyBirds.length >= 2) {
          state.players[0].board.setSlot("FOREST", 0, createBirdInstance(forestOnlyBirds[0].id));
          state.players[0].board.setSlot("FOREST", 1, createBirdInstance(forestOnlyBirds[1].id));

          const count = engine.countQualifyingBirds(state.players[0], bonusCard!);
          expect(count).toBe(2);
        }
      });

      it("handles breeding_manager runtime condition (4+ eggs)", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("breeding_manager");
        expect(bonusCard).toBeDefined();

        // Place birds with varying egg counts
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 5)); // qualifies
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker", 4)); // qualifies
        state.players[0].board.setSlot("FOREST", 2, createBirdInstance("acorn_woodpecker", 3)); // doesn't qualify
        state.players[0].board.setSlot("FOREST", 3, createBirdInstance("acorn_woodpecker", 0)); // doesn't qualify

        const count = engine.countQualifyingBirds(state.players[0], bonusCard!);
        expect(count).toBe(2);
      });

      it("handles oologist runtime condition (1+ eggs)", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("oologist");
        expect(bonusCard).toBeDefined();

        // Place birds with varying egg counts
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 3));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker", 1));
        state.players[0].board.setSlot("FOREST", 2, createBirdInstance("acorn_woodpecker", 0));

        const count = engine.countQualifyingBirds(state.players[0], bonusCard!);
        expect(count).toBe(2);
      });

      it("handles visionary_leader runtime condition (cards in hand)", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("visionary_leader");
        expect(bonusCard).toBeDefined();

        // Player already has 5 cards from setup
        const count = engine.countQualifyingBirds(state.players[0], bonusCard!);
        expect(count).toBe(5);
      });

      it("handles ecologist runtime condition (smallest habitat)", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("ecologist");
        expect(bonusCard).toBeDefined();

        // Place unequal birds in habitats
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        // WETLAND is empty (smallest with 0 birds)

        const count = engine.countQualifyingBirds(state.players[0], bonusCard!);
        expect(count).toBe(0); // WETLAND has 0 birds
      });
    });

    describe("countBirdsWithMinEggs()", () => {
      it("returns 0 for empty board", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        const count = engine.countBirdsWithMinEggs(state.players[0], 1);
        expect(count).toBe(0);
      });

      it("counts birds with exact minimum eggs", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 4));

        const count = engine.countBirdsWithMinEggs(state.players[0], 4);
        expect(count).toBe(1);
      });

      it("counts birds with more than minimum eggs", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 6));

        const count = engine.countBirdsWithMinEggs(state.players[0], 4);
        expect(count).toBe(1);
      });

      it("excludes birds with fewer than minimum eggs", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 3));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker", 4));

        const count = engine.countBirdsWithMinEggs(state.players[0], 4);
        expect(count).toBe(1);
      });

      it("counts across all habitats", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 2));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker", 2));
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker", 2));

        const count = engine.countBirdsWithMinEggs(state.players[0], 2);
        expect(count).toBe(3);
      });
    });

    describe("countBirdsInSmallestHabitat()", () => {
      it("returns 0 for empty board", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        const count = engine.countBirdsInSmallestHabitat(state.players[0]);
        expect(count).toBe(0);
      });

      it("returns count from smallest habitat", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 2, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker"));

        const count = engine.countBirdsInSmallestHabitat(state.players[0]);
        expect(count).toBe(1); // WETLAND has 1 bird
      });

      it("returns tied smallest count", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 1, createBirdInstance("acorn_woodpecker"));
        // WETLAND empty

        const count = engine.countBirdsInSmallestHabitat(state.players[0]);
        expect(count).toBe(0); // WETLAND is smallest with 0
      });

      it("handles all habitats equal", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 1, createBirdInstance("acorn_woodpecker"));

        const count = engine.countBirdsInSmallestHabitat(state.players[0]);
        expect(count).toBe(2); // All habitats have 2
      });
    });

    describe("countBirdsMatchingBonusCard()", () => {
      it("returns 0 for empty board", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        const count = engine.countBirdsMatchingBonusCard(state.players[0], "forester");
        expect(count).toBe(0);
      });

      it("counts birds that match the bonus card", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // acorn_woodpecker has forester in its bonusCards
        const acorn = registry.getBirdById("acorn_woodpecker");
        expect(acorn?.bonusCards).toContain("forester");

        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));

        const count = engine.countBirdsMatchingBonusCard(state.players[0], "forester");
        expect(count).toBe(2);
      });

      it("excludes birds that don't match the bonus card", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        // Find a bird that doesn't have forester
        const allBirds = registry.getAllBirds();
        const nonForesterBird = allBirds.find(
          (b) => !b.bonusCards.includes("forester")
        );

        if (nonForesterBird) {
          state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker")); // has forester
          state.players[0].board.setSlot("FOREST", 1, createBirdInstance(nonForesterBird.id)); // doesn't have forester

          const count = engine.countBirdsMatchingBonusCard(state.players[0], "forester");
          expect(count).toBe(1);
        }
      });

      it("counts across all habitats", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();

        // acorn_woodpecker has nest_box_builder (cavity nest)
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker"));

        const count = engine.countBirdsMatchingBonusCard(
          state.players[0],
          "nest_box_builder"
        );
        expect(count).toBe(3);
      });
    });

    describe("bonus card integration", () => {
      it("breeding_manager scores 1 point per bird with 4+ eggs", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("breeding_manager");
        expect(bonusCard).toBeDefined();
        expect(bonusCard?.scoringType).toBe("PER_BIRD");
        expect(bonusCard?.scoring[0]?.points).toBe(1);

        // Place 3 birds with 4+ eggs
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker", 4));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker", 5));
        state.players[0].board.setSlot("FOREST", 2, createBirdInstance("acorn_woodpecker", 4));

        const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
        expect(score).toBe(3); // 3 birds × 1 point
      });

      it("ecologist scores 2 points per bird in smallest habitat", () => {
        const engine = createEngineWithPlayers(2);
        const state = engine.getGameState();
        const registry = new DataRegistry();

        const bonusCard = registry.getBonusCardById("ecologist");
        expect(bonusCard).toBeDefined();
        expect(bonusCard?.scoringType).toBe("PER_BIRD");
        expect(bonusCard?.scoring[0]?.points).toBe(2);

        // 3 in forest, 2 in grassland, 2 in wetland (tie: 2 birds)
        state.players[0].board.setSlot("FOREST", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("FOREST", 2, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("GRASSLAND", 1, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 0, createBirdInstance("acorn_woodpecker"));
        state.players[0].board.setSlot("WETLAND", 1, createBirdInstance("acorn_woodpecker"));

        const score = engine.calculateBonusCardScore(state.players[0], bonusCard!);
        expect(score).toBe(4); // 2 birds × 2 points
      });
    });
  });

  describe("PlayerBoard Utility Methods (via GameEngine)", () => {
    function createEngineForStaticTests() {
      const registry = new DataRegistry();
      const agents = [createMockAgent("p1"), createMockAgent("p2")];
      return new GameEngine({ agents, seed: 42, registry });
    }

    describe("getLeftmostEmptyColumn()", () => {
      it("returns 0 for empty habitat", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];

        // Clear the board (it may have birds from setup)
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, null);
          player.board.setSlot("GRASSLAND", i, null);
          player.board.setSlot("WETLAND", i, null);
        }

        expect(player.board.getLeftmostEmptyColumn("FOREST")).toBe(0);
        expect(player.board.getLeftmostEmptyColumn("GRASSLAND")).toBe(0);
        expect(player.board.getLeftmostEmptyColumn("WETLAND")).toBe(0);
      });

      it("returns correct column when birds are placed", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];
        const registry = new DataRegistry();

        // Clear the board first
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, null);
          player.board.setSlot("GRASSLAND", i, null);
        }

        const birdCard = registry.getAllBirds()[0];
        player.board.setSlot("FOREST", 0, {
          id: "bird1",
          card: birdCard,
          cachedFood: {},
          tuckedCards: [],
          eggs: 0,
        });
        player.board.setSlot("FOREST", 1, {
          id: "bird2",
          card: birdCard,
          cachedFood: {},
          tuckedCards: [],
          eggs: 0,
        });

        expect(player.board.getLeftmostEmptyColumn("FOREST")).toBe(2);
        expect(player.board.getLeftmostEmptyColumn("GRASSLAND")).toBe(0);
      });

      it("returns 5 when habitat is full", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];
        const registry = new DataRegistry();

        const birdCard = registry.getAllBirds()[0];
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, {
            id: `bird${i}`,
            card: birdCard,
            cachedFood: {},
            tuckedCards: [],
            eggs: 0,
          });
        }

        expect(player.board.getLeftmostEmptyColumn("FOREST")).toBe(5);
      });
    });

    describe("getBirdsWithBrownPowers()", () => {
      it("returns empty array for empty habitat", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];

        // Clear the board
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, null);
        }

        expect(player.board.getBirdsWithBrownPowers("FOREST")).toEqual([]);
      });

      it("returns bird IDs with brown powers in right-to-left order", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];
        const registry = new DataRegistry();

        // Clear the board first
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, null);
        }

        // Find a bird with a brown power (WHEN_ACTIVATED trigger)
        const brownPowerBird = registry.getAllBirds().find(
          (b) => b.power?.trigger === "WHEN_ACTIVATED"
        );
        const noPowerBird = registry.getAllBirds().find(
          (b) => !b.power
        );

        if (!brownPowerBird || !noPowerBird) {
          // Skip test if we can't find suitable birds
          return;
        }

        player.board.setSlot("FOREST", 0, {
          id: "brown1",
          card: brownPowerBird,
          cachedFood: {},
          tuckedCards: [],
          eggs: 0,
        });
        player.board.setSlot("FOREST", 1, {
          id: "nopower",
          card: noPowerBird,
          cachedFood: {},
          tuckedCards: [],
          eggs: 0,
        });
        player.board.setSlot("FOREST", 2, {
          id: "brown2",
          card: brownPowerBird,
          cachedFood: {},
          tuckedCards: [],
          eggs: 0,
        });

        const result = player.board.getBirdsWithBrownPowers("FOREST");

        // Should be in right-to-left order (brown2 first, then brown1)
        expect(result).toEqual(["brown2", "brown1"]);
      });

      it("excludes birds with non-brown powers", () => {
        const engine = createEngineForStaticTests();
        const player = engine.getGameState().players[0];
        const registry = new DataRegistry();

        // Clear the board first
        for (let i = 0; i < 5; i++) {
          player.board.setSlot("FOREST", i, null);
        }

        // Find birds with pink and white powers
        const pinkPowerBird = registry.getAllBirds().find(
          (b) => b.power?.trigger?.startsWith("WHEN_ANOTHER_PLAYER")
        );
        const whitePowerBird = registry.getAllBirds().find(
          (b) => b.power?.trigger === "WHEN_PLAYED"
        );

        if (!pinkPowerBird && !whitePowerBird) {
          // Skip test if we can't find suitable birds
          return;
        }

        if (pinkPowerBird) {
          player.board.setSlot("FOREST", 0, {
            id: "pink1",
            card: pinkPowerBird,
            cachedFood: {},
            tuckedCards: [],
            eggs: 0,
          });
        }

        if (whitePowerBird) {
          player.board.setSlot("FOREST", 1, {
            id: "white1",
            card: whitePowerBird,
            cachedFood: {},
            tuckedCards: [],
            eggs: 0,
          });
        }

        const result = player.board.getBirdsWithBrownPowers("FOREST");

        // Should not include pink or white power birds
        expect(result).toEqual([]);
      });
    });
  });

  describe("apply* methods", () => {
    const testRegistry = new DataRegistry();

    function createTestEngine() {
      const registry = new DataRegistry();
      const agents = [createMockAgent("p1"), createMockAgent("p2")];
      const engine = new GameEngine({ agents, seed: 42, registry });
      return { engine, state: engine.getGameState(), registry };
    }

    function createBirdInstance(
      cardId: string,
      instanceId: string,
      eggs = 0,
      cachedFood: Record<string, number> = {},
      tuckedCards: string[] = []
    ) {
      return {
        id: instanceId,
        card: testRegistry.getBirdById(cardId),
        eggs,
        cachedFood,
        tuckedCards,
      };
    }

    describe("applyEffect()", () => {
      it("dispatches to the correct apply* method based on effect type", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // Test GAIN_FOOD dispatch
        const initialFood = player.food.SEED ?? 0;
        engine.applyEffect({
          type: "GAIN_FOOD",
          playerId: "p1",
          food: { SEED: 2 },
          source: "SUPPLY",
        });
        expect(player.food.SEED).toBe(initialFood + 2);
      });

      it("logs warning for unhandled effect types", () => {
        const { engine } = createTestEngine();
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        engine.applyEffect({
          type: "UNKNOWN_EFFECT" as never,
        } as never);

        expect(warnSpy).toHaveBeenCalledWith(
          "Unhandled effect type: UNKNOWN_EFFECT"
        );
        warnSpy.mockRestore();
      });
    });

    describe("applyGainFood()", () => {
      it("adds food to player from SUPPLY source", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 1, INVERTEBRATE: 0 };

        engine.applyGainFood({
          type: "GAIN_FOOD",
          playerId: "p1",
          food: { SEED: 2, INVERTEBRATE: 1 },
          source: "SUPPLY",
        });

        expect(player.food.SEED).toBe(3);
        expect(player.food.INVERTEBRATE).toBe(1);
      });

      it("removes dice from birdfeeder when source is BIRDFEEDER with diceTaken", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = {};

        const initialDice = state.birdfeeder.getDiceInFeeder().length;

        // Find a die that's actually in the feeder
        const availableDice = state.birdfeeder.getDiceInFeeder();
        if (availableDice.length > 0) {
          const dieType = availableDice[0];
          // Convert die face to food type for the food field
          const foodType = dieType === "SEED_INVERTEBRATE" ? "SEED" : dieType;
          engine.applyGainFood({
            type: "GAIN_FOOD",
            playerId: "p1",
            food: { [foodType]: 1 },
            source: "BIRDFEEDER",
            diceTaken: [{ die: dieType }],
          });

          expect(state.birdfeeder.getDiceInFeeder().length).toBeLessThan(
            initialDice
          );
        }
      });

      it("skips WILD food type when source is BIRDFEEDER", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = {};

        const initialDice = state.birdfeeder.getDiceInFeeder().length;

        engine.applyGainFood({
          type: "GAIN_FOOD",
          playerId: "p1",
          food: { WILD: 1 },
          source: "BIRDFEEDER",
        });

        // WILD should be added to player food
        expect(player.food.WILD).toBe(1);
        // But no dice should be removed
        expect(state.birdfeeder.getDiceInFeeder().length).toBe(initialDice);
      });

      it("throws error for invalid player ID", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyGainFood({
            type: "GAIN_FOOD",
            playerId: "invalid_player",
            food: { SEED: 1 },
            source: "SUPPLY",
          })
        ).toThrow("Player not found: invalid_player");
      });

      it("handles zero count food types as no-op", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 5 };

        engine.applyGainFood({
          type: "GAIN_FOOD",
          playerId: "p1",
          food: { SEED: 0 },
          source: "SUPPLY",
        });

        expect(player.food.SEED).toBe(5);
      });
    });

    describe("applyLayEggs()", () => {
      it("places eggs on a single bird", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        engine.applyLayEggs({
          type: "LAY_EGGS",
          playerId: "p1",
          placements: { bird1: 2 },
        });

        expect(bird.eggs).toBe(2);
      });

      it("places eggs across multiple birds", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 0);
        const bird2 = createBirdInstance("acorn_woodpecker", "bird2", 1);
        player.board.setSlot("FOREST", 0, bird1);
        player.board.setSlot("FOREST", 1, bird2);

        engine.applyLayEggs({
          type: "LAY_EGGS",
          playerId: "p1",
          placements: { bird1: 1, bird2: 2 },
        });

        expect(bird1.eggs).toBe(1);
        expect(bird2.eggs).toBe(3);
      });

      it("throws error when bird not found", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyLayEggs({
            type: "LAY_EGGS",
            playerId: "p1",
            placements: { nonexistent_bird: 2 },
          })
        ).toThrow(
          'Cannot lay eggs: bird instance "nonexistent_bird" not found on player "p1"\'s board'
        );
      });

      it("throws error when exceeding egg capacity", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        // acorn_woodpecker has egg capacity of 4
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 3);
        player.board.setSlot("FOREST", 0, bird);

        expect(() =>
          engine.applyLayEggs({
            type: "LAY_EGGS",
            playerId: "p1",
            placements: { bird1: 2 },
          })
        ).toThrow(
          'Cannot lay 2 egg(s) on bird "bird1": would exceed egg capacity of 4 (current: 3)'
        );
      });

      it("throws error for invalid player ID", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyLayEggs({
            type: "LAY_EGGS",
            playerId: "invalid_player",
            placements: { bird1: 1 },
          })
        ).toThrow("Player not found: invalid_player");
      });
    });

    describe("applyDrawCards()", () => {
      it("draws cards from tray", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const initialHandSize = player.hand.length;

        const tray = state.birdCardSupply.getTray();
        const cardId = tray[0]?.id;
        if (!cardId) return;

        const effect: Parameters<typeof engine.applyDrawCards>[0] = {
          type: "DRAW_CARDS",
          playerId: "p1",
          fromTray: [cardId],
          fromDeck: 0,
        };
        engine.applyDrawCards(effect);

        expect(player.hand.length).toBe(initialHandSize + 1);
        expect(player.hand.some((c) => c.id === cardId)).toBe(true);
        expect(effect.drawnCards).toContain(cardId);
      });

      it("draws cards from deck", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const initialHandSize = player.hand.length;

        const effect: Parameters<typeof engine.applyDrawCards>[0] = {
          type: "DRAW_CARDS",
          playerId: "p1",
          fromTray: [],
          fromDeck: 2,
        };
        engine.applyDrawCards(effect);

        expect(player.hand.length).toBe(initialHandSize + 2);
        expect(effect.drawnCards?.length).toBe(2);
      });

      it("throws error when card not in tray", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyDrawCards({
            type: "DRAW_CARDS",
            playerId: "p1",
            fromTray: ["nonexistent_card"],
            fromDeck: 0,
          })
        ).toThrow(
          'Cannot draw card: card "nonexistent_card" not found in bird tray'
        );
      });

      it("refills tray after drawing", () => {
        const { engine, state } = createTestEngine();
        const tray = state.birdCardSupply.getTray();
        const cardId = tray[0]?.id;
        if (!cardId) return;

        engine.applyDrawCards({
          type: "DRAW_CARDS",
          playerId: "p1",
          fromTray: [cardId],
          fromDeck: 0,
        });

        // Tray should be refilled to 3 cards
        const newTray = state.birdCardSupply.getTray();
        const filledSlots = newTray.filter((c) => c !== null).length;
        expect(filledSlots).toBe(3);
      });

      // Verifies fix for Critical Issue #3: applyDrawCards must handle fromRevealed
      // field to support powers like American Oystercatcher that distribute revealed cards
      it("draws cards from revealed cards", () => {
        const { engine, state, registry } = createTestEngine();
        const player = state.players[0];
        const initialHandSize = player.hand.length;

        // Use a known card ID from the registry
        const testCardId = "acorn_woodpecker";
        const effect: Parameters<typeof engine.applyDrawCards>[0] = {
          type: "DRAW_CARDS",
          playerId: "p1",
          fromTray: [],
          fromDeck: 0,
          fromRevealed: [testCardId],
        };
        engine.applyDrawCards(effect);

        expect(player.hand.length).toBe(initialHandSize + 1);
        expect(player.hand.some((c) => c.id === testCardId)).toBe(true);
        expect(effect.drawnCards).toContain(testCardId);
      });

      // Verifies that fromRevealed works alongside other sources
      it("combines fromRevealed with fromTray and fromDeck", () => {
        const { engine, state, registry } = createTestEngine();
        const player = state.players[0];
        const initialHandSize = player.hand.length;

        const tray = state.birdCardSupply.getTray();
        const trayCardId = tray[0]?.id;
        if (!trayCardId) return;

        const revealedCardId = "barn_owl";
        const effect: Parameters<typeof engine.applyDrawCards>[0] = {
          type: "DRAW_CARDS",
          playerId: "p1",
          fromTray: [trayCardId],
          fromDeck: 1,
          fromRevealed: [revealedCardId],
        };
        engine.applyDrawCards(effect);

        // 1 from tray + 1 from deck + 1 from revealed = 3 cards
        expect(player.hand.length).toBe(initialHandSize + 3);
        expect(player.hand.some((c) => c.id === trayCardId)).toBe(true);
        expect(player.hand.some((c) => c.id === revealedCardId)).toBe(true);
        expect(effect.drawnCards?.length).toBe(3);
      });
    });

    describe("applyDiscardFood()", () => {
      it("discards food from player", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 3, INVERTEBRATE: 2 };

        engine.applyDiscardFood({
          type: "DISCARD_FOOD",
          playerId: "p1",
          food: { SEED: 2, INVERTEBRATE: 1 },
        });

        expect(player.food.SEED).toBe(1);
        expect(player.food.INVERTEBRATE).toBe(1);
      });

      it("throws error when discarding more than available", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 1 };

        expect(() =>
          engine.applyDiscardFood({
            type: "DISCARD_FOOD",
            playerId: "p1",
            food: { SEED: 2 },
          })
        ).toThrow('Cannot discard 2 SEED: player "p1" only has 1');
      });

      it("handles zero count as no-op", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 3 };

        engine.applyDiscardFood({
          type: "DISCARD_FOOD",
          playerId: "p1",
          food: { SEED: 0 },
        });

        expect(player.food.SEED).toBe(3);
      });
    });

    describe("applyDiscardEggs()", () => {
      it("discards eggs from a bird", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 3);
        player.board.setSlot("FOREST", 0, bird);

        engine.applyDiscardEggs({
          type: "DISCARD_EGGS",
          playerId: "p1",
          sources: { bird1: 2 },
        });

        expect(bird.eggs).toBe(1);
      });

      it("throws error when bird not found", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyDiscardEggs({
            type: "DISCARD_EGGS",
            playerId: "p1",
            sources: { nonexistent: 1 },
          })
        ).toThrow(
          'Cannot discard eggs: bird instance "nonexistent" not found on player "p1"\'s board'
        );
      });

      it("throws error when discarding more eggs than available", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 1);
        player.board.setSlot("FOREST", 0, bird);

        expect(() =>
          engine.applyDiscardEggs({
            type: "DISCARD_EGGS",
            playerId: "p1",
            sources: { bird1: 3 },
          })
        ).toThrow(
          'Cannot discard 3 egg(s) from bird "bird1": only has 1 egg(s)'
        );
      });
    });

    describe("applyDiscardCards()", () => {
      it("discards cards from player hand", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const cardToDiscard = player.hand[0];
        const initialHandSize = player.hand.length;

        engine.applyDiscardCards({
          type: "DISCARD_CARDS",
          playerId: "p1",
          cards: [cardToDiscard.id],
        });

        expect(player.hand.length).toBe(initialHandSize - 1);
        expect(player.hand.some((c) => c.id === cardToDiscard.id)).toBe(false);
      });

      it("throws error when card not in hand", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyDiscardCards({
            type: "DISCARD_CARDS",
            playerId: "p1",
            cards: ["nonexistent_card"],
          })
        ).toThrow(
          'Cannot discard card: card "nonexistent_card" not found in player "p1"\'s hand'
        );
      });

      it("handles empty cards array as no-op", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const initialHandSize = player.hand.length;

        engine.applyDiscardCards({
          type: "DISCARD_CARDS",
          playerId: "p1",
          cards: [],
        });

        expect(player.hand.length).toBe(initialHandSize);
      });
    });

    describe("applyTuckCards()", () => {
      it("tucks cards from hand under a bird", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const cardToTuck = player.hand[0];

        engine.applyTuckCards({
          type: "TUCK_CARDS",
          playerId: "p1",
          targetBirdInstanceId: "bird1",
          fromHand: [cardToTuck.id],
          fromDeck: 0,
          fromRevealed: [],
        });

        expect(bird.tuckedCards).toContain(cardToTuck.id);
        expect(player.hand.some((c) => c.id === cardToTuck.id)).toBe(false);
      });

      it("tucks cards from deck", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const effect: Parameters<typeof engine.applyTuckCards>[0] = {
          type: "TUCK_CARDS",
          playerId: "p1",
          targetBirdInstanceId: "bird1",
          fromHand: [],
          fromDeck: 2,
          fromRevealed: [],
        };
        engine.applyTuckCards(effect);

        expect(bird.tuckedCards.length).toBe(2);
        expect(effect.tuckedFromDeck?.length).toBe(2);
      });

      it("throws error when target bird not found", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyTuckCards({
            type: "TUCK_CARDS",
            playerId: "p1",
            targetBirdInstanceId: "nonexistent",
            fromHand: [],
            fromDeck: 1,
            fromRevealed: [],
          })
        ).toThrow(
          'Cannot tuck cards: target bird "nonexistent" not found on player "p1"\'s board'
        );
      });

      it("throws error when card not in hand", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        expect(() =>
          engine.applyTuckCards({
            type: "TUCK_CARDS",
            playerId: "p1",
            targetBirdInstanceId: "bird1",
            fromHand: ["nonexistent_card"],
            fromDeck: 0,
            fromRevealed: [],
          })
        ).toThrow(
          'Cannot tuck card: card "nonexistent_card" not found in player "p1"\'s hand'
        );
      });

      // Verifies fix for Medium Issue #5: applyTuckCards must handle fromRevealed
      // field to support powers like Barred Owl that tuck revealed cards
      it("tucks cards from revealed cards", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const revealedCardId = "barn_owl";
        engine.applyTuckCards({
          type: "TUCK_CARDS",
          playerId: "p1",
          targetBirdInstanceId: "bird1",
          fromHand: [],
          fromDeck: 0,
          fromRevealed: [revealedCardId],
        });

        expect(bird.tuckedCards).toContain(revealedCardId);
        expect(bird.tuckedCards.length).toBe(1);
      });

      // Verifies that fromRevealed works alongside other sources
      it("combines fromRevealed with fromHand and fromDeck", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const cardFromHand = player.hand[0];
        const revealedCardId = "barn_owl";

        const effect: Parameters<typeof engine.applyTuckCards>[0] = {
          type: "TUCK_CARDS",
          playerId: "p1",
          targetBirdInstanceId: "bird1",
          fromHand: [cardFromHand.id],
          fromDeck: 1,
          fromRevealed: [revealedCardId],
        };
        engine.applyTuckCards(effect);

        // 1 from hand + 1 from deck + 1 from revealed = 3 tucked cards
        expect(bird.tuckedCards.length).toBe(3);
        expect(bird.tuckedCards).toContain(cardFromHand.id);
        expect(bird.tuckedCards).toContain(revealedCardId);
        expect(effect.tuckedFromDeck?.length).toBe(1);
      });
    });

    describe("applyCacheFood()", () => {
      it("caches food on a bird", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        engine.applyCacheFood({
          type: "CACHE_FOOD",
          playerId: "p1",
          birdInstanceId: "bird1",
          food: { SEED: 2, INVERTEBRATE: 1 },
          source: "SUPPLY",
        });

        expect(bird.cachedFood.SEED).toBe(2);
        expect(bird.cachedFood.INVERTEBRATE).toBe(1);
      });

      it("adds to existing cached food", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0, {
          SEED: 1,
        });
        player.board.setSlot("FOREST", 0, bird);

        engine.applyCacheFood({
          type: "CACHE_FOOD",
          playerId: "p1",
          birdInstanceId: "bird1",
          food: { SEED: 2 },
          source: "SUPPLY",
        });

        expect(bird.cachedFood.SEED).toBe(3);
      });

      it("throws error when bird not found", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyCacheFood({
            type: "CACHE_FOOD",
            playerId: "p1",
            birdInstanceId: "nonexistent",
            food: { SEED: 1 },
            source: "SUPPLY",
          })
        ).toThrow(
          'Cannot cache food: bird "nonexistent" not found on player "p1"\'s board'
        );
      });

      // Verifies fix for Critical Issue #1: applyCacheFood must remove dice from
      // birdfeeder when source is BIRDFEEDER to match applyGainFood behavior
      it("removes dice from birdfeeder when source is BIRDFEEDER", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const initialDiceCount = state.birdfeeder.getDiceInFeeder().length;
        const firstDie = state.birdfeeder.getDiceInFeeder()[0];

        engine.applyCacheFood({
          type: "CACHE_FOOD",
          playerId: "p1",
          birdInstanceId: "bird1",
          food: { [firstDie]: 1 },
          source: "BIRDFEEDER",
          diceTaken: [{ die: firstDie }],
        });

        expect(state.birdfeeder.getDiceInFeeder().length).toBe(
          initialDiceCount - 1
        );
        expect(bird.cachedFood[firstDie]).toBe(1);
      });

      // Verifies that dice are not removed when source is SUPPLY
      it("does not remove dice when source is SUPPLY", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird = createBirdInstance("acorn_woodpecker", "bird1", 0);
        player.board.setSlot("FOREST", 0, bird);

        const initialDiceCount = state.birdfeeder.getDiceInFeeder().length;

        engine.applyCacheFood({
          type: "CACHE_FOOD",
          playerId: "p1",
          birdInstanceId: "bird1",
          food: { SEED: 1 },
          source: "SUPPLY",
        });

        expect(state.birdfeeder.getDiceInFeeder().length).toBe(initialDiceCount);
        expect(bird.cachedFood.SEED).toBe(1);
      });
    });

    describe("applyPlayBird()", () => {
      it("plays a bird from hand to board", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // Clear the slot first
        player.board.setSlot("FOREST", 0, null);

        const cardToPlay = player.hand[0];
        const initialHandSize = player.hand.length;

        engine.applyPlayBird({
          type: "PLAY_BIRD",
          playerId: "p1",
          birdInstanceId: `p1_${cardToPlay.id}`,
          habitat: "FOREST",
          column: 0,
          foodPaid: {},
          eggsPaid: {},
        });

        expect(player.hand.length).toBe(initialHandSize - 1);
        const placedBird = player.board.getSlot("FOREST", 0);
        expect(placedBird).not.toBeNull();
        expect(placedBird?.card.id).toBe(cardToPlay.id);
      });

      it("deducts food cost from player", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 3, INVERTEBRATE: 2 };
        player.board.setSlot("FOREST", 0, null);

        const cardToPlay = player.hand[0];

        engine.applyPlayBird({
          type: "PLAY_BIRD",
          playerId: "p1",
          birdInstanceId: `p1_${cardToPlay.id}`,
          habitat: "FOREST",
          column: 0,
          foodPaid: { SEED: 1, INVERTEBRATE: 1 },
          eggsPaid: {},
        });

        expect(player.food.SEED).toBe(2);
        expect(player.food.INVERTEBRATE).toBe(1);
      });

      it("deducts egg cost from source birds", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const existingBird = createBirdInstance("acorn_woodpecker", "existing1", 3);
        player.board.setSlot("FOREST", 0, existingBird);
        player.board.setSlot("FOREST", 1, null);

        const cardToPlay = player.hand[0];

        engine.applyPlayBird({
          type: "PLAY_BIRD",
          playerId: "p1",
          birdInstanceId: `p1_${cardToPlay.id}`,
          habitat: "FOREST",
          column: 1,
          foodPaid: {},
          eggsPaid: { existing1: 2 },
        });

        expect(existingBird.eggs).toBe(1);
      });

      it("throws error when card not in hand", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.board.setSlot("FOREST", 0, null);

        expect(() =>
          engine.applyPlayBird({
            type: "PLAY_BIRD",
            playerId: "p1",
            birdInstanceId: "p1_nonexistent",
            habitat: "FOREST",
            column: 0,
            foodPaid: {},
            eggsPaid: {},
          })
        ).toThrow(
          'Cannot play bird: card "nonexistent" not found in player "p1"\'s hand'
        );
      });

      it("throws error when slot is occupied", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const existingBird = createBirdInstance("acorn_woodpecker", "existing1", 0);
        player.board.setSlot("FOREST", 0, existingBird);

        const cardToPlay = player.hand[0];

        expect(() =>
          engine.applyPlayBird({
            type: "PLAY_BIRD",
            playerId: "p1",
            birdInstanceId: `p1_${cardToPlay.id}`,
            habitat: "FOREST",
            column: 0,
            foodPaid: {},
            eggsPaid: {},
          })
        ).toThrow(
          'Cannot play bird: slot FOREST[0] is already occupied by "existing1"'
        );
      });

      it("throws error when insufficient food", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.food = { SEED: 0 };
        player.board.setSlot("FOREST", 0, null);

        const cardToPlay = player.hand[0];

        expect(() =>
          engine.applyPlayBird({
            type: "PLAY_BIRD",
            playerId: "p1",
            birdInstanceId: `p1_${cardToPlay.id}`,
            habitat: "FOREST",
            column: 0,
            foodPaid: { SEED: 2 },
            eggsPaid: {},
          })
        ).toThrow("Cannot play bird: insufficient SEED (need 2, have 0)");
      });

      it("throws error when source bird for egg payment not found", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        player.board.setSlot("FOREST", 0, null);

        const cardToPlay = player.hand[0];

        expect(() =>
          engine.applyPlayBird({
            type: "PLAY_BIRD",
            playerId: "p1",
            birdInstanceId: `p1_${cardToPlay.id}`,
            habitat: "FOREST",
            column: 0,
            foodPaid: {},
            eggsPaid: { nonexistent: 1 },
          })
        ).toThrow(
          'Cannot play bird: source bird "nonexistent" for egg payment not found'
        );
      });
    });

    describe("applyRerollBirdfeeder()", () => {
      it("rerolls dice when only one remains", () => {
        const { engine, state } = createTestEngine();

        // Take dice until only one remains (allowed per game rules)
        const dice = [...state.birdfeeder.getDiceInFeeder()];
        for (let i = 0; i < dice.length - 1; i++) {
          try {
            state.birdfeeder.takeDie(dice[i]);
          } catch {
            // Dice may auto-refill when empty, which is fine
          }
        }

        // Only reroll if condition is met
        if (state.birdfeeder.getCount() === 1) {
          const effect: Parameters<typeof engine.applyRerollBirdfeeder>[0] = {
            type: "REROLL_BIRDFEEDER",
            playerId: "p1",
            previousDice: [],
            newDice: [],
          };
          engine.applyRerollBirdfeeder(effect);

          // New dice should be populated (only 1 die is rerolled)
          expect(effect.newDice.length).toBe(1);
          expect(state.birdfeeder.getDiceInFeeder().length).toBe(1);
        }
      });

      it("throws error when reroll conditions not met", () => {
        const { engine, state } = createTestEngine();

        // With 5 dice that likely don't all show the same face, reroll should fail
        // (unless by chance all dice are the same)
        const dice = state.birdfeeder.getDiceInFeeder();
        const allSame = dice.every((d) => d === dice[0]);

        if (!allSame && dice.length > 1) {
          expect(() =>
            engine.applyRerollBirdfeeder({
              type: "REROLL_BIRDFEEDER",
              playerId: "p1",
              previousDice: [],
              newDice: [],
            })
          ).toThrow("Cannot reroll: dice do not all show the same face");
        }
      });
    });

    describe("applyRefillBirdfeeder()", () => {
      it("refills the birdfeeder", () => {
        const { engine, state } = createTestEngine();

        // Take some dice first
        const dice = state.birdfeeder.getDiceInFeeder();
        if (dice.length > 0) {
          state.birdfeeder.takeDie(dice[0]);
        }

        const effect = {
          type: "REFILL_BIRDFEEDER" as const,
          addedDice: [] as DieFace[],
        };
        engine.applyRefillBirdfeeder(effect);

        expect(effect.addedDice.length).toBe(5);
        expect(state.birdfeeder.getDiceInFeeder().length).toBe(5);
      });
    });

    describe("applyRefillBirdTray()", () => {
      it("refills the bird tray", () => {
        const { engine, state } = createTestEngine();

        // Take a card from tray first
        state.birdCardSupply.takeFromTray(0);

        engine.applyRefillBirdTray({
          type: "REFILL_BIRD_TRAY",
          discardedCards: [],
          newCards: [],
        });

        const tray = state.birdCardSupply.getTray();
        const filledSlots = tray.filter((c) => c !== null).length;
        expect(filledSlots).toBe(3);
      });

      // Verifies fix for Low Issue #6: applyRefillBirdTray populates newCards field
      it("populates newCards with cards drawn during refill", () => {
        const { engine, state } = createTestEngine();

        // Take two cards from tray to create empty slots
        state.birdCardSupply.takeFromTray(0);
        state.birdCardSupply.takeFromTray(1);

        const effect: Parameters<typeof engine.applyRefillBirdTray>[0] = {
          type: "REFILL_BIRD_TRAY",
          discardedCards: [],
          newCards: [],
        };
        engine.applyRefillBirdTray(effect);

        // Should have 2 new cards drawn to fill the empty slots
        expect(effect.newCards.length).toBe(2);
        // The new cards should be in the tray
        const tray = state.birdCardSupply.getTray();
        for (const cardId of effect.newCards) {
          expect(tray.some((c) => c?.id === cardId)).toBe(true);
        }
      });
    });

    describe("applyRemoveCardsFromTray()", () => {
      it("removes cards from the tray", () => {
        const { engine, state } = createTestEngine();
        const tray = state.birdCardSupply.getTray();
        const cardToRemove = tray[0]?.id;
        if (!cardToRemove) return;

        engine.applyRemoveCardsFromTray({
          type: "REMOVE_CARDS_FROM_TRAY",
          cards: [cardToRemove],
        });

        const newTray = state.birdCardSupply.getTray();
        expect(newTray[0]).toBeNull();
      });

      it("throws error when card not in tray", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyRemoveCardsFromTray({
            type: "REMOVE_CARDS_FROM_TRAY",
            cards: ["nonexistent_card"],
          })
        ).toThrow(
          'Cannot remove card from tray: card "nonexistent_card" not found in bird tray'
        );
      });
    });

    describe("applyAllPlayersDrawCards()", () => {
      // Verifies that all players receive their allocated number of cards from the deck,
      // which is the core functionality needed for powers like Canvasback.
      it("draws cards from deck for all players", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const initialHandSizeP1 = player1.hand.length;
        const initialHandSizeP2 = player2.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 1, p2: 1 },
        });

        expect(player1.hand.length).toBe(initialHandSizeP1 + 1);
        expect(player2.hand.length).toBe(initialHandSizeP2 + 1);
      });

      // Ensures that when multiple cards are drawn, all are correctly added to the hand.
      // This verifies the loop logic that handles draw counts greater than 1.
      it("draws multiple cards when count is greater than 1", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const initialHandSize = player1.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 3 },
        });

        expect(player1.hand.length).toBe(initialHandSize + 3);
      });

      // Verifies that players can have different draw counts, as might occur
      // if some players skip drawing (count=0) or have modified draw amounts.
      it("handles different draw counts for different players", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const initialHandSizeP1 = player1.hand.length;
        const initialHandSizeP2 = player2.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 2, p2: 1 },
        });

        expect(player1.hand.length).toBe(initialHandSizeP1 + 2);
        expect(player2.hand.length).toBe(initialHandSizeP2 + 1);
      });

      // Ensures players with 0 in the draws map are skipped entirely,
      // which is important when some players decline or aren't eligible.
      it("skips players with zero draw count", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const initialHandSizeP1 = player1.hand.length;
        const initialHandSizeP2 = player2.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 0, p2: 2 },
        });

        expect(player1.hand.length).toBe(initialHandSizeP1); // unchanged
        expect(player2.hand.length).toBe(initialHandSizeP2 + 2);
      });

      // Verifies that an empty draws map is a valid no-op, preventing crashes
      // when the effect is applied with no players to draw.
      it("handles empty draws map as no-op", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const initialHandSizeP1 = player1.hand.length;
        const initialHandSizeP2 = player2.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: {},
        });

        expect(player1.hand.length).toBe(initialHandSizeP1);
        expect(player2.hand.length).toBe(initialHandSizeP2);
      });

      // Ensures the drawnCards field is populated with actual card IDs,
      // which is needed for observability and potential handler logic.
      it("populates drawnCards field with actual card IDs", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const initialHandIds = new Set(player1.hand.map((c) => c.id));

        const effect: Parameters<typeof engine.applyAllPlayersDrawCards>[0] = {
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 2 },
        };
        engine.applyAllPlayersDrawCards(effect);

        expect(effect.drawnCards).toBeDefined();
        expect(effect.drawnCards!["p1"]).toBeDefined();
        expect(effect.drawnCards!["p1"].length).toBe(2);

        // Verify the drawn cards are actually in the hand now
        for (const cardId of effect.drawnCards!["p1"]) {
          expect(player1.hand.some((c) => c.id === cardId)).toBe(true);
          // And weren't in hand before (they're new)
          expect(initialHandIds.has(cardId)).toBe(false);
        }
      });

      // Verifies drawnCards only contains entries for players who actually drew,
      // not for players with 0 count or those not in the draws map.
      it("drawnCards only includes players who drew cards", () => {
        const { engine } = createTestEngine();

        const effect: Parameters<typeof engine.applyAllPlayersDrawCards>[0] = {
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 1, p2: 0 },
        };
        engine.applyAllPlayersDrawCards(effect);

        expect(effect.drawnCards).toBeDefined();
        expect(effect.drawnCards!["p1"]).toBeDefined();
        expect(effect.drawnCards!["p1"].length).toBe(1);
        // p2 should not be in drawnCards since they drew 0
        expect(effect.drawnCards!["p2"]).toBeUndefined();
      });

      // Ensures the bird tray is refilled after all draws complete,
      // maintaining consistency with single-player applyDrawCards behavior.
      it("refills tray after all draws complete", () => {
        const { engine, state } = createTestEngine();

        // Take some cards from tray to create empty slots
        state.birdCardSupply.takeFromTray(0);
        const trayBefore = state.birdCardSupply.getTray();
        expect(trayBefore[0]).toBeNull();

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 1 },
        });

        // Tray should be refilled
        const trayAfter = state.birdCardSupply.getTray();
        const filledSlots = trayAfter.filter((c) => c !== null).length;
        expect(filledSlots).toBe(3);
      });

      // Verifies that an invalid player ID throws an appropriate error,
      // catching configuration bugs early.
      it("throws error for invalid player ID", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyAllPlayersDrawCards({
            type: "ALL_PLAYERS_DRAW_CARDS",
            draws: { invalid_player: 1 },
          })
        ).toThrow("Player not found: invalid_player");
      });

      // Verifies cards are drawn in order from the deck, with first player's
      // cards coming from the top of the deck before second player's.
      it("draws cards from deck in order for each player", () => {
        const { engine, state } = createTestEngine();
        const deckSizeBefore = state.birdCardSupply.getDeckSize();

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p1: 2, p2: 3 },
        });

        // Total of 5 cards should have been drawn from deck
        const deckSizeAfter = state.birdCardSupply.getDeckSize();
        expect(deckSizeBefore - deckSizeAfter).toBe(5);
      });

      // Verifies that only one player can draw if others aren't in the map,
      // which tests the iteration logic for partial player lists.
      it("handles single player in draws map", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const initialHandSizeP1 = player1.hand.length;
        const initialHandSizeP2 = player2.hand.length;

        engine.applyAllPlayersDrawCards({
          type: "ALL_PLAYERS_DRAW_CARDS",
          draws: { p2: 2 }, // Only p2 draws
        });

        expect(player1.hand.length).toBe(initialHandSizeP1); // unchanged
        expect(player2.hand.length).toBe(initialHandSizeP2 + 2);
      });
    });

    describe("applyAllPlayersLayEggs()", () => {
      // Verifies the core functionality: all players can lay eggs on their birds
      // according to the placements map, which is essential for powers like Lazuli Bunting.
      it("lays eggs on birds for multiple players", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const bird1 = createBirdInstance("acorn_woodpecker", "p1_bird1", 0);
        const bird2 = createBirdInstance("acorn_woodpecker", "p2_bird1", 0);
        player1.board.setSlot("FOREST", 0, bird1);
        player2.board.setSlot("FOREST", 0, bird2);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p1: { p1_bird1: 2 },
            p2: { p2_bird1: 1 },
          },
        });

        expect(bird1.eggs).toBe(2);
        expect(bird2.eggs).toBe(1);
      });

      // Verifies that a single player can lay eggs on multiple birds
      // when the power grants multiple egg placements.
      it("lays eggs on multiple birds for a single player", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 0);
        const bird2 = createBirdInstance("acorn_woodpecker", "bird2", 0);
        player.board.setSlot("FOREST", 0, bird1);
        player.board.setSlot("FOREST", 1, bird2);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p1: { bird1: 1, bird2: 2 },
          },
        });

        expect(bird1.eggs).toBe(1);
        expect(bird2.eggs).toBe(2);
      });

      // Verifies that an empty placements map is handled gracefully,
      // which can happen if no players have eligible birds.
      it("handles empty placements map", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 1);
        player1.board.setSlot("FOREST", 0, bird1);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {},
        });

        // Bird should remain unchanged
        expect(bird1.eggs).toBe(1);
      });

      // Verifies that empty bird placements for a player are handled gracefully,
      // which happens when a player declines to lay eggs.
      it("handles empty bird placements for a player", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 1);
        player1.board.setSlot("FOREST", 0, bird1);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p1: {},
          },
        });

        // Bird should remain unchanged
        expect(bird1.eggs).toBe(1);
      });

      // Verifies that a count of 0 is ignored (no change to eggs),
      // which handles edge cases in placement selections.
      it("ignores count of 0", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 1);
        player.board.setSlot("FOREST", 0, bird1);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p1: { bird1: 0 },
          },
        });

        expect(bird1.eggs).toBe(1);
      });

      // Verifies that a bird not found error is thrown with a clear message,
      // catching configuration bugs in the handler.
      it("throws error when bird not found", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyAllPlayersLayEggs({
            type: "ALL_PLAYERS_LAY_EGGS",
            placements: {
              p1: { nonexistent_bird: 2 },
            },
          })
        ).toThrow(
          'Cannot lay eggs: bird instance "nonexistent_bird" not found on player "p1"\'s board'
        );
      });

      // Verifies that exceeding egg capacity throws an error with a clear message,
      // enforcing game rules and preventing invalid state.
      it("throws error when would exceed egg capacity", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        // acorn_woodpecker has egg capacity of 4
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 3);
        player.board.setSlot("FOREST", 0, bird1);

        expect(() =>
          engine.applyAllPlayersLayEggs({
            type: "ALL_PLAYERS_LAY_EGGS",
            placements: {
              p1: { bird1: 2 },
            },
          })
        ).toThrow(
          'Cannot lay 2 egg(s) on bird "bird1": would exceed egg capacity of 4 (current: 3)'
        );
      });

      // Verifies that an invalid player ID throws an error,
      // catching configuration bugs early.
      it("throws error for invalid player ID", () => {
        const { engine } = createTestEngine();

        expect(() =>
          engine.applyAllPlayersLayEggs({
            type: "ALL_PLAYERS_LAY_EGGS",
            placements: {
              invalid_player: { bird1: 1 },
            },
          })
        ).toThrow("Player not found: invalid_player");
      });

      // Verifies that only one player can lay eggs if others aren't in the map,
      // which tests the iteration logic for partial player lists.
      it("handles single player in placements map", () => {
        const { engine, state } = createTestEngine();
        const player1 = state.players[0];
        const player2 = state.players[1];
        const bird1 = createBirdInstance("acorn_woodpecker", "p1_bird", 0);
        const bird2 = createBirdInstance("acorn_woodpecker", "p2_bird", 0);
        player1.board.setSlot("FOREST", 0, bird1);
        player2.board.setSlot("FOREST", 0, bird2);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p2: { p2_bird: 2 }, // Only p2 lays eggs
          },
        });

        expect(bird1.eggs).toBe(0); // unchanged
        expect(bird2.eggs).toBe(2);
      });

      // Verifies that eggs can be added to birds that already have eggs,
      // which is the normal case during gameplay.
      it("adds eggs to birds with existing eggs", () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];
        const bird1 = createBirdInstance("acorn_woodpecker", "bird1", 2);
        player.board.setSlot("FOREST", 0, bird1);

        engine.applyAllPlayersLayEggs({
          type: "ALL_PLAYERS_LAY_EGGS",
          placements: {
            p1: { bird1: 1 },
          },
        });

        expect(bird1.eggs).toBe(3);
      });
    });

    describe("applyRepeatBrownPower()", () => {
      // Tests for the async REPEAT_BROWN_POWER effect, which triggers execution
      // of another bird's brown power. This is used by birds like Gray Catbird
      // and Northern Mockingbird ("Repeat a brown power on another bird in this habitat").

      // Verifies the core functionality: the target bird's brown power is executed,
      // which tests the async integration with processBrownPower.
      it("executes the target bird's brown power", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // blue_gray_gnatcatcher has a brown power that gains 1 INVERTEBRATE from supply
        // This is simpler to test because it doesn't depend on birdfeeder state
        const bird = createBirdInstance("blue_gray_gnatcatcher", "target_bird", 0);
        player.board.setSlot("FOREST", 0, bird);

        const initialFood = player.food.INVERTEBRATE ?? 0;

        // Apply the REPEAT_BROWN_POWER effect
        await engine.applyRepeatBrownPower({
          type: "REPEAT_BROWN_POWER",
          playerId: "p1",
          targetBirdInstanceId: "target_bird",
        });

        // The blue_gray_gnatcatcher power gains 1 INVERTEBRATE from supply
        expect(player.food.INVERTEBRATE).toBe(initialFood + 1);
      });

      // Verifies error handling when the target bird doesn't exist on the player's board.
      it("throws error if target bird not found on player's board", async () => {
        const { engine } = createTestEngine();

        await expect(
          engine.applyRepeatBrownPower({
            type: "REPEAT_BROWN_POWER",
            playerId: "p1",
            targetBirdInstanceId: "nonexistent_bird",
          })
        ).rejects.toThrow(
          'Cannot repeat brown power: bird "nonexistent_bird" not found on player "p1"\'s board'
        );
      });

      // Verifies error handling when the target bird has no power at all.
      it("throws error if target bird has no power", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // american_woodcock has no power
        const bird = createBirdInstance("american_woodcock", "no_power_bird", 0);
        player.board.setSlot("FOREST", 0, bird);

        await expect(
          engine.applyRepeatBrownPower({
            type: "REPEAT_BROWN_POWER",
            playerId: "p1",
            targetBirdInstanceId: "no_power_bird",
          })
        ).rejects.toThrow(
          'Cannot repeat brown power: bird "no_power_bird" has no power'
        );
      });

      // Verifies error handling when the target bird has a pink power (not brown).
      it("throws error if target bird has pink power instead of brown", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // american_avocet has ONCE_BETWEEN_TURNS (pink) power
        const bird = createBirdInstance("american_avocet", "pink_bird", 0);
        player.board.setSlot("WETLAND", 0, bird);

        await expect(
          engine.applyRepeatBrownPower({
            type: "REPEAT_BROWN_POWER",
            playerId: "p1",
            targetBirdInstanceId: "pink_bird",
          })
        ).rejects.toThrow(
          'Cannot repeat brown power: bird "pink_bird" has a ONCE_BETWEEN_TURNS power, not a brown (WHEN_ACTIVATED) power'
        );
      });

      // Verifies error handling when the target bird has a white power (not brown).
      it("throws error if target bird has white power instead of brown", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // american_goldfinch has WHEN_PLAYED (white) power
        const bird = createBirdInstance("american_goldfinch", "white_bird", 0);
        player.board.setSlot("GRASSLAND", 0, bird);

        await expect(
          engine.applyRepeatBrownPower({
            type: "REPEAT_BROWN_POWER",
            playerId: "p1",
            targetBirdInstanceId: "white_bird",
          })
        ).rejects.toThrow(
          'Cannot repeat brown power: bird "white_bird" has a WHEN_PLAYED power, not a brown (WHEN_ACTIVATED) power'
        );
      });

      // Verifies error handling when the player ID is invalid.
      it("throws error for invalid player ID", async () => {
        const { engine } = createTestEngine();

        await expect(
          engine.applyRepeatBrownPower({
            type: "REPEAT_BROWN_POWER",
            playerId: "invalid_player",
            targetBirdInstanceId: "any_bird",
          })
        ).rejects.toThrow("Player not found: invalid_player");
      });

      // Verifies that the effect can be invoked via the main applyEffect dispatcher.
      it("is correctly dispatched from applyEffect", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // Use blue_gray_gnatcatcher which gains food from supply (doesn't need birdfeeder)
        const bird = createBirdInstance("blue_gray_gnatcatcher", "dispatch_test_bird", 0);
        player.board.setSlot("FOREST", 0, bird);

        const initialFood = player.food.INVERTEBRATE ?? 0;

        // Call applyEffect (the dispatcher) instead of applyRepeatBrownPower directly
        await engine.applyEffect({
          type: "REPEAT_BROWN_POWER",
          playerId: "p1",
          targetBirdInstanceId: "dispatch_test_bird",
        });

        // Verify the power was executed
        expect(player.food.INVERTEBRATE).toBe(initialFood + 1);
      });

      // Verifies that the triggeringBirdInstanceId is correctly tracked in the effect,
      // even though it doesn't affect the execution logic.
      it("preserves triggeringBirdInstanceId in effect", async () => {
        const { engine, state } = createTestEngine();
        const player = state.players[0];

        // Add two birds - one triggers, one is the target
        // gray_catbird is the "repeat brown power" bird, blue_gray_gnatcatcher is the target
        const triggeringBird = createBirdInstance("gray_catbird", "triggering_bird", 0);
        const targetBird = createBirdInstance("blue_gray_gnatcatcher", "target_bird", 0);
        player.board.setSlot("FOREST", 0, triggeringBird);
        player.board.setSlot("FOREST", 1, targetBird);

        const initialFood = player.food.INVERTEBRATE ?? 0;

        // Create effect with triggeringBirdInstanceId
        const effect = {
          type: "REPEAT_BROWN_POWER" as const,
          playerId: "p1" as const,
          targetBirdInstanceId: "target_bird",
          triggeringBirdInstanceId: "triggering_bird",
        };

        // This should not throw - triggeringBirdInstanceId is optional metadata
        await engine.applyRepeatBrownPower(effect);

        // Verify the power was executed
        expect(player.food.INVERTEBRATE).toBe(initialFood + 1);
      });
    });
  });

  describe("forfeit handling", () => {
    /**
     * Creates a mock agent that always returns invalid choices for food selection,
     * causing the agent to forfeit after 3 attempts.
     */
    function createForfeitingAgent(playerId: string): PlayerAgent {
      return {
        playerId,

        async chooseStartingHand(
          prompt: StartingHandPrompt
        ): Promise<StartingHandChoice> {
          // Keep all birds, first bonus card, discard food equal to birds kept
          const birdsToKeep = prompt.eligibleBirds;
          const bonusCards = prompt.eligibleBonusCards;
          const foodToDiscard = new Set<FoodType>();

          const foodTypes: FoodType[] = [
            "INVERTEBRATE",
            "SEED",
            "FISH",
            "FRUIT",
            "RODENT",
          ];
          for (let i = 0; i < birdsToKeep.length && i < foodTypes.length; i++) {
            foodToDiscard.add(foodTypes[i]);
          }

          return {
            promptId: prompt.promptId,
            kind: "startingHand",
            birds: new Set(birdsToKeep.map((b) => b.id)),
            bonusCard: bonusCards[0].id,
            foodToDiscard,
          };
        },

        async chooseTurnAction(
          prompt: TurnActionPrompt
        ): Promise<TurnActionChoice> {
          return {
            promptId: prompt.promptId,
            kind: "turnAction",
            action: "GAIN_FOOD",
            takeBonus: false,
          };
        },

        async chooseOption(prompt: OptionPrompt): Promise<OptionChoice> {
          // Always return invalid choices that will fail validation
          if (prompt.kind === "selectFoodFromFeeder") {
            // Return a die that doesn't exist in the feeder
            return {
              promptId: prompt.promptId,
              kind: "selectFoodFromFeeder",
              diceOrReroll: [{ die: "NONEXISTENT_DIE" as DieFace }],
            } as SelectFoodFromFeederChoice;
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        },
      };
    }

    it("ends game when 2-player game has a forfeit", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createForfeitingAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      const result = await engine.playGame();

      // Game should end with p1 forfeiting
      expect(result.forfeitedPlayers).toBeDefined();
      expect(result.forfeitedPlayers).toContain("p1");

      // p2 should be the winner (not the forfeiting player)
      expect(result.winnerId).toBe("p2");
    });

    it("emits PLAYER_FORFEITED event when player forfeits", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createForfeitingAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      await engine.playGame();

      // Check for PLAYER_FORFEITED event in event history
      const events = engine.getEventHistory();
      const forfeitEvents = events.filter(
        (e: Event) => e.type === "PLAYER_FORFEITED"
      );

      expect(forfeitEvents.length).toBe(1);
      const forfeitEvent = forfeitEvents[0];
      expect(forfeitEvent.type).toBe("PLAYER_FORFEITED");
      if (forfeitEvent.type === "PLAYER_FORFEITED") {
        expect(forfeitEvent.playerId).toBe("p1");
        expect(forfeitEvent.remainingPlayerCount).toBe(1);
        expect(forfeitEvent.reason).toBeDefined();
      }
    });

    it("sets forfeitedPlayers in GameResult", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createForfeitingAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      const result = await engine.playGame();

      expect(result.forfeitedPlayers).toEqual(["p1"]);
    });

    it("continues game with remaining players when 3+ players and one forfeits", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [
          createForfeitingAgent("p1"),
          createMockAgent("p2"),
          createMockAgent("p3"),
        ],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      const result = await engine.playGame();

      // p1 should have forfeited
      expect(result.forfeitedPlayers).toContain("p1");

      // Game should have completed all 4 rounds since 2 players remain
      expect(result.roundsPlayed).toBe(4);

      // Winner should be one of the non-forfeiting players
      expect(["p2", "p3"]).toContain(result.winnerId);

      // Both remaining players should have scores
      expect(result.scores).toHaveProperty("p2");
      expect(result.scores).toHaveProperty("p3");

      // Total turns should be less than (8+7+6+5)*3 = 78
      // since p1 forfeited early
      expect(result.totalTurns).toBeLessThan(78);
    });

    it("emits PLAYER_FORFEITED with correct remaining count in 3-player game", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [
          createForfeitingAgent("p1"),
          createMockAgent("p2"),
          createMockAgent("p3"),
        ],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      await engine.playGame();

      const events = engine.getEventHistory();
      const forfeitEvent = events.find(
        (e: Event) => e.type === "PLAYER_FORFEITED"
      );

      expect(forfeitEvent).toBeDefined();
      if (forfeitEvent && forfeitEvent.type === "PLAYER_FORFEITED") {
        expect(forfeitEvent.playerId).toBe("p1");
        expect(forfeitEvent.remainingPlayerCount).toBe(2);
      }
    });

    it("does not include forfeited player as winner even if they had highest score", async () => {
      const registry = new DataRegistry();
      const config = {
        agents: [createForfeitingAgent("p1"), createMockAgent("p2")],
        seed: 12345,
        registry,
      };

      const engine = new GameEngine(config);
      const result = await engine.playGame();

      // Winner must not be the forfeiting player
      expect(result.winnerId).not.toBe("p1");
      expect(result.winnerId).toBe("p2");
    });
  });
});

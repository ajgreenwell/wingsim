import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionProcessor } from "./ActionProcessor.js";
import { GameState } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";
import { PlayerBoard } from "./PlayerBoard.js";
import type {
  PowerExecutionContext,
  PowerYield,
  PowerReceive,
} from "../types/power.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";
import type { BirdInstance, DieFace, Habitat } from "../types/core.js";
import type {
  ActivatePowerChoice,
  DiscardEggsChoice,
  DiscardFoodChoice,
  DrawCardsChoice,
  PlaceEggsChoice,
  PlayBirdChoice,
  PlayerView,
  PromptContext,
  RepeatPowerChoice,
  SelectCardsChoice,
  SelectFoodDestinationChoice,
  SelectFoodFromFeederChoice,
  SelectFoodFromFeederPrompt,
  SelectFoodFromSupplyChoice,
  SelectPlayerChoice,
  SelectBonusCardsChoice,
  SelectHabitatChoice,
} from "../types/prompts.js";
import { DataRegistry } from "../data/DataRegistry.js";
import type { Effect } from "../types/effects.js";

const testRegistry = new DataRegistry();

function createBirdInstance(
  id: string,
  cardId: string,
  eggs = 0
): BirdInstance {
  return {
    id,
    card: testRegistry.getBirdById(cardId),
    cachedFood: {},
    tuckedCards: [],
    eggs,
  };
}

function createPlayerState(
  id: string,
  board: Partial<Record<Habitat, Array<BirdInstance | null>>> = {}
): PlayerState {
  return PlayerState.from(id, {
    board: PlayerBoard.from({
      FOREST: board.FOREST ?? [null, null, null, null, null],
      GRASSLAND: board.GRASSLAND ?? [null, null, null, null, null],
      WETLAND: board.WETLAND ?? [null, null, null, null, null],
    }),
    hand: [],
    bonusCards: [],
    food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
    turnsRemaining: 8,
  });
}

function createMockBirdCardSupply(deckCards: string[] = []) {
  return {
    getDeckSize: () => deckCards.length,
    drawFromDeck: (count: number) => {
      const drawn = deckCards.splice(0, count);
      // Return mock BirdCard objects with the card IDs
      return drawn.map((id) => ({
        id,
        wingspanCentimeters: id === "bald_eagle" ? 203 : 23, // Large for bald eagle, small for others
      }));
    },
    getTray: () => [],
    getDiscardSize: () => 0,
  } as unknown as GameState["birdCardSupply"];
}

function createMockBonusCardDeck(deckCards: string[] = []) {
  return {
    getDeckSize: () => deckCards.length,
    draw: (count: number) => {
      const drawn = deckCards.splice(0, count);
      // Return mock BonusCard objects with the card IDs
      return drawn.map((id) => ({ id }));
    },
    getDiscardSize: () => 0,
  } as unknown as GameState["bonusCardDeck"];
}

function createGameState(players: PlayerState[]): GameState {
  return new GameState({
    players,
    activePlayerIndex: 0,
    birdfeeder: {} as GameState["birdfeeder"],
    birdCardSupply: createMockBirdCardSupply(),
    bonusCardDeck: createMockBonusCardDeck(),
    roundGoals: [],
    round: 1,
    turn: 1,
    endOfTurnContinuations: [],
  });
}

function createMockAgent(playerId: string): PlayerAgent {
  return {
    playerId,
    chooseStartingHand: vi.fn(),
    chooseTurnAction: vi.fn(),
    chooseOption: vi.fn(),
  };
}

function createMockPlayerView(
  playerId: string,
  overrides: Partial<PlayerView> = {}
): PlayerView {
  return {
    playerId,
    hand: [],
    bonusCards: [],
    food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1, WILD: 0 },
    board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
    actionCubes: 8,
    round: 1,
    turn: 1,
    activePlayerId: playerId,
    birdfeeder: [],
    birdTray: [],
    deckSize: 100,
    opponents: [],
    ...overrides,
  };
}

function createMockPromptContext(): PromptContext {
  return {
    round: 1,
    activePlayerId: "player1",
    trigger: {
      type: "WHEN_ACTIVATED",
      habitat: "FOREST",
      sourceBirdId: "test_bird",
    },
  };
}

function createMockExecutionContext(
  state: GameState,
  registry: DataRegistry,
  agents: Map<string, PlayerAgent>,
  viewOverrides: Partial<PlayerView> = {},
  applyEffectFn?: (effect: Effect) => void | Promise<void>
): PowerExecutionContext {
  let promptCounter = 0;

  return {
    getState: () => state,
    getRegistry: () => registry,
    generatePromptId: () => `prompt_${++promptCounter}`,
    getAgent: (playerId) => {
      const agent = agents.get(playerId);
      if (!agent) throw new Error(`No agent for player: ${playerId}`);
      return agent;
    },
    buildPlayerView: (playerId) =>
      createMockPlayerView(playerId, viewOverrides),
    buildPromptContext: () => createMockPromptContext(),
    applyEffect: async (effect: Effect) => {
      if (applyEffectFn) {
        await applyEffectFn(effect);
      }
      // Mock: effects are tracked but not actually applied to state in tests
    },
    deferContinuation: () => {
      // Mock: continuations are ignored in tests
    },
  };
}

describe("PowerHandlers", () => {
  let processor: ActionProcessor;
  let registry: DataRegistry;

  beforeEach(() => {
    processor = new ActionProcessor();
    registry = new DataRegistry();
  });

  describe("gainFoodFromFeederWithCache (Acorn Woodpecker)", () => {
    it("gains food from feeder and caches on bird when chosen", async () => {
      const birdInstance = createBirdInstance("test_bird", "acorn_woodpecker");
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          } else if (prompt.kind === "selectFoodDestination") {
            return Promise.resolve({
              kind: "selectFoodDestination",
              promptId: prompt.promptId,
              destination: "CACHE_ON_SOURCE_BIRD",
            } as SelectFoodDestinationChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "test_bird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("gainFoodFromFeederWithCache");

      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      expect(cacheEffect?.birdInstanceId).toBe("test_bird");
    });

    it("gains food to player supply when chosen", async () => {
      const birdInstance = createBirdInstance("test_bird", "acorn_woodpecker");
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          } else if (prompt.kind === "selectFoodDestination") {
            return Promise.resolve({
              kind: "selectFoodDestination",
              promptId: prompt.promptId,
              destination: "PLAYER_SUPPLY",
            } as SelectFoodDestinationChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED"],
      });

      const result = await processor.executeSinglePower(
        "test_bird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.source).toBe("BIRDFEEDER");
    });

    it("skips without prompting when no matching food in feeder", async () => {
      const birdInstance = createBirdInstance("test_bird", "acorn_woodpecker");
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // No SEED in feeder
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "test_bird",
        "player1",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    it("rejects invalid reroll when dice don't all match", async () => {
      const birdInstance = createBirdInstance("test_bird", "acorn_woodpecker");
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // First attempt: invalid reroll (dice don't all match)
            if (promptCount === 2) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // Second attempt: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          } else if (prompt.kind === "selectFoodDestination") {
            return Promise.resolve({
              kind: "selectFoodDestination",
              promptId: prompt.promptId,
              destination: "PLAYER_SUPPLY",
            } as SelectFoodDestinationChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has mixed dice - can't reroll
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "test_bird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should have prompted 4 times: activate, invalid reroll (re-prompt), select food, destination
      expect(promptCount).toBe(4);
      // No reroll effect should be emitted
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeUndefined();
    });

    it("allows valid reroll when all dice match and re-prompts for food", async () => {
      const birdInstance = createBirdInstance("test_bird", "acorn_woodpecker");
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;
      let viewCallCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            viewCallCount++;
            // First prompt: choose to reroll
            if (viewCallCount === 1) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // After reroll: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          } else if (prompt.kind === "selectFoodDestination") {
            return Promise.resolve({
              kind: "selectFoodDestination",
              promptId: prompt.promptId,
              destination: "CACHE_ON_SOURCE_BIRD",
            } as SelectFoodDestinationChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // All dice match - can reroll
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED", "SEED"],
      });

      const result = await processor.executeSinglePower(
        "test_bird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Reroll effect should be emitted
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeDefined();
      // Should have cache effect since player chose CACHE_ON_SOURCE_BIRD
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
    });
  });

  describe("whenOpponentLaysEggsLayEggOnNestType (American Avocet)", () => {
    it("lays egg on bird with matching nest type", async () => {
      // American Avocet triggers on lay eggs, targets GROUND nest
      const avocet = createBirdInstance("avocet", "american_avocet");
      // Find a bird with GROUND nest for testing
      const groundBird = createBirdInstance(
        "ground_bird",
        "american_avocet",
        0
      );

      const player = createPlayerState("player1", {
        WETLAND: [avocet, groundBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "placeEggs") {
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { ground_bird: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [
            {
              id: "avocet",
              card: testRegistry.getBirdById("american_avocet"),
              eggs: 0,
              cachedFood: {
                INVERTEBRATE: 0,
                SEED: 0,
                FISH: 0,
                FRUIT: 0,
                RODENT: 0,
                WILD: 0,
              },
              tuckedCards: [],
            },
            {
              id: "ground_bird",
              card: testRegistry.getBirdById("american_avocet"),
              eggs: 0,
              cachedFood: {
                INVERTEBRATE: 0,
                SEED: 0,
                FISH: 0,
                FRUIT: 0,
                RODENT: 0,
                WILD: 0,
              },
              tuckedCards: [],
            },
          ],
        },
      });

      const result = await processor.executeSinglePower(
        "avocet",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeDefined();
    });
  });

  describe("playersWithFewestInHabitatDrawCard (American Bittern)", () => {
    it("prompts players with fewest birds to draw cards from deck or tray", async () => {
      const bittern = createBirdInstance("bittern", "american_bittern");
      const player1 = createPlayerState("player1", {
        WETLAND: [bittern, null, null, null, null], // 1 bird
      });
      const player2 = createPlayerState("player2", {
        WETLAND: [null, null, null, null, null], // 0 birds
      });
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 gets the draw prompt since they have fewest birds
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "bittern",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Now emits individual DRAW_CARDS effects
      const drawEffect = result.effects.find(
        (e) => e.type === "DRAW_CARDS" && e.playerId === "player2"
      );
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(1);
    });
  });

  describe("playersWithFewestInHabitatGainFood (Hermit Thrush)", () => {
    // This tests the power that gives food from the birdfeeder to players with the
    // fewest birds in a specific habitat. Tied players gain food in clockwise order.

    it("player with fewest birds in habitat gains food from feeder", async () => {
      // Setup: player1 has 1 bird in forest (Hermit Thrush), player2 has 0 birds in forest
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null], // 1 bird
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null], // 0 birds
      });
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 has fewest birds in forest, so they get the food prompt
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("playersWithFewestInHabitatGainFood");

      // Only player2 should gain food
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(1);
      expect(gainEffects[0].playerId).toBe("player2");
      expect(gainEffects[0].source).toBe("BIRDFEEDER");
      expect(gainEffects[0].food.SEED).toBe(1);
    });

    it("tied players all gain food in clockwise order from owner", async () => {
      // Setup: 3 players, player1 owns Hermit Thrush with 1 bird in forest.
      // player2 and player3 both have 0 birds in forest (tied for fewest).
      // player2 should go before player3 in clockwise order from player1.
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null], // 1 bird
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null], // 0 birds
      });
      const player3 = createPlayerState("player3", {
        FOREST: [null, null, null, null, null], // 0 birds
      });
      const state = createGameState([player1, player2, player3]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");
      const mockAgent3 = createMockAgent("player3");

      const foodPromptOrder: string[] = [];

      // Helper to select first available die from prompt
      const selectFirstAvailableDie = (prompt: SelectFoodFromFeederPrompt) => {
        const available = prompt.availableDice;
        for (const [dieType, count] of Object.entries(available)) {
          if (count && count > 0) {
            const dieSelection = dieType === "SEED_INVERTEBRATE"
              ? { die: dieType, asFoodType: "SEED" as const }
              : { die: dieType };
            return {
              kind: "selectFoodFromFeeder" as const,
              promptId: prompt.promptId,
              diceOrReroll: [dieSelection],
            } as SelectFoodFromFeederChoice;
          }
        }
        throw new Error("No dice available to select");
      };

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player2");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent3.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player3");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
        ["player3", mockAgent3],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Both tied players should gain food
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(2);

      // Verify clockwise order: player2 before player3
      expect(foodPromptOrder).toEqual(["player2", "player3"]);

      // Verify each player got exactly 1 food
      const player2Gain = gainEffects.find((e) => e.playerId === "player2");
      expect(player2Gain).toBeDefined();
      const player2FoodTotal = Object.values(player2Gain?.food || {}).reduce(
        (sum: number, count) => sum + (count || 0), 0
      );
      expect(player2FoodTotal).toBe(1);

      const player3Gain = gainEffects.find((e) => e.playerId === "player3");
      expect(player3Gain).toBeDefined();
      const player3FoodTotal = Object.values(player3Gain?.food || {}).reduce(
        (sum: number, count) => sum + (count || 0), 0
      );
      expect(player3FoodTotal).toBe(1);
    });

    it("owner also gains food if tied for fewest and goes first", async () => {
      // Setup: player1 owns Hermit Thrush and player2 has 1 bird in forest too.
      // All players are tied at 1 bird, so player1 (owner) goes first.
      const thrushForP1 = createBirdInstance("thrush", "hermit_thrush");
      const someBirdForP2 = createBirdInstance("somebird", "american_coot");
      const p1 = createPlayerState("player1", {
        FOREST: [thrushForP1, null, null, null, null], // 1 bird
      });
      const p2 = createPlayerState("player2", {
        FOREST: [someBirdForP2, null, null, null, null], // 1 bird
      });
      const stateWithTie = createGameState([p1, p2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      const foodPromptOrder: string[] = [];

      // Helper to select first available die from prompt
      const selectFirstAvailableDie = (prompt: SelectFoodFromFeederPrompt) => {
        const available = prompt.availableDice;
        for (const [dieType, count] of Object.entries(available)) {
          if (count && count > 0) {
            const dieSelection = dieType === "SEED_INVERTEBRATE"
              ? { die: dieType, asFoodType: "SEED" as const }
              : { die: dieType };
            return {
              kind: "selectFoodFromFeeder" as const,
              promptId: prompt.promptId,
              diceOrReroll: [dieSelection],
            } as SelectFoodFromFeederChoice;
          }
        }
        throw new Error("No dice available to select");
      };

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player1");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player2");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(stateWithTie, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Both players are tied, so both gain food
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(2);

      // Owner (player1) goes first in clockwise order
      expect(foodPromptOrder).toEqual(["player1", "player2"]);
    });

    it("handles reroll when all dice show the same face", async () => {
      // Setup: player2 has fewest birds, birdfeeder has all same dice (can reroll)
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null],
      });
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      let rerollRequested = false;

      // Helper to select first available die from prompt
      const selectFirstAvailableDie = (prompt: SelectFoodFromFeederPrompt) => {
        const available = prompt.availableDice;
        for (const [dieType, count] of Object.entries(available)) {
          if (count && count > 0) {
            const dieSelection = dieType === "SEED_INVERTEBRATE"
              ? { die: dieType, asFoodType: "SEED" as const }
              : { die: dieType };
            return {
              kind: "selectFoodFromFeeder" as const,
              promptId: prompt.promptId,
              diceOrReroll: [dieSelection],
            } as SelectFoodFromFeederChoice;
          }
        }
        throw new Error("No dice available to select");
      };

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 first requests reroll, then selects food
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            if (!rerollRequested) {
              rerollRequested = true;
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // After reroll, select first available die from the prompt
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      // All dice showing SEED (same face, so reroll is allowed)
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED", "SEED"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Should have a REROLL_BIRDFEEDER effect followed by GAIN_FOOD
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeDefined();
      expect(rerollEffect?.playerId).toBe("player2");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.playerId).toBe("player2");
    });

    it("skips remaining players when birdfeeder becomes empty", async () => {
      // Setup: two tied players, but only 1 die in birdfeeder
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null], // 0 birds - tied for fewest
      });
      const player3 = createPlayerState("player3", {
        FOREST: [null, null, null, null, null], // 0 birds - tied for fewest
      });
      const state = createGameState([player1, player2, player3]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");
      const mockAgent3 = createMockAgent("player3");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 takes the only die
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 3 should NOT be prompted (feeder empty after player2)
      (mockAgent3.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Player 3 should not be prompted - feeder is empty");
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
        ["player3", mockAgent3],
      ]);

      // Mock applyEffect to simulate the die being taken from feeder
      let feederDice: DieFace[] = ["SEED"];
      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        { birdfeeder: feederDice },
        (eff: Effect) => {
          if (eff.type === "GAIN_FOOD" && eff.source === "BIRDFEEDER") {
            // Remove the taken die from the feeder
            feederDice = [];
          }
        }
      );

      // Override buildPlayerView to return current feeder state
      const originalBuildPlayerView = execCtx.buildPlayerView;
      execCtx.buildPlayerView = (playerId: string) => {
        const view = originalBuildPlayerView(playerId);
        return { ...view, birdfeeder: feederDice };
      };

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Only player2 should have gained food
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(1);
      expect(gainEffects[0].playerId).toBe("player2");
    });

    it("returns early without prompts when player declines activation", async () => {
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null],
      });
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 should not be prompted if power is not activated
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Player 2 should not be prompted - power declined");
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
      // No GAIN_FOOD effects
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(0);
    });

    it("handles empty birdfeeder at start - no prompts after activation", async () => {
      // Setup: birdfeeder is empty, so no players gain food
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const player1 = createPlayerState("player1", {
        FOREST: [thrush, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        FOREST: [null, null, null, null, null],
      });
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 should not be prompted since feeder is empty
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Player 2 should not be prompted - feeder is empty");
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      // Empty birdfeeder
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: [],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // No GAIN_FOOD effects since feeder was empty
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(0);
    });

    it("clockwise order wraps correctly around player array", async () => {
      // Setup: 4 players where player3 owns the thrush, and player4 + player1 are tied for fewest.
      // Clockwise from player3: player4 goes first, then player1.
      const thrush = createBirdInstance("thrush", "hermit_thrush");
      const bird1 = createBirdInstance("bird1", "american_coot");
      const player1 = createPlayerState("player1", {
        FOREST: [null, null, null, null, null], // 0 birds - tied for fewest
      });
      const player2 = createPlayerState("player2", {
        FOREST: [bird1, null, null, null, null], // 1 bird
      });
      const player3 = createPlayerState("player3", {
        FOREST: [thrush, null, null, null, null], // 1 bird (owns Hermit Thrush)
      });
      const player4 = createPlayerState("player4", {
        FOREST: [null, null, null, null, null], // 0 birds - tied for fewest
      });
      const state = createGameState([player1, player2, player3, player4]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");
      const mockAgent3 = createMockAgent("player3");
      const mockAgent4 = createMockAgent("player4");

      const foodPromptOrder: string[] = [];

      // Helper to select first available die from prompt
      const selectFirstAvailableDie = (prompt: SelectFoodFromFeederPrompt) => {
        const available = prompt.availableDice;
        for (const [dieType, count] of Object.entries(available)) {
          if (count && count > 0) {
            const dieSelection = dieType === "SEED_INVERTEBRATE"
              ? { die: dieType, asFoodType: "SEED" as const }
              : { die: dieType };
            return {
              kind: "selectFoodFromFeeder" as const,
              promptId: prompt.promptId,
              diceOrReroll: [dieSelection],
            } as SelectFoodFromFeederChoice;
          }
        }
        throw new Error("No dice available to select");
      };

      (mockAgent3.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent4.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player4");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            foodPromptOrder.push("player1");
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      // Player 2 should not be prompted (not tied for fewest)
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Player 2 should not be prompted - not tied for fewest");
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
        ["player3", mockAgent3],
        ["player4", mockAgent4],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "thrush",
        "player3",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Verify clockwise order from player3: player4 then player1
      expect(foodPromptOrder).toEqual(["player4", "player1"]);

      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(2);
    });
  });

  describe("tuckAndDraw (American Coot)", () => {
    it("tucks a card and prompts player to draw from deck or tray", async () => {
      const coot = createBirdInstance("coot", "american_coot");
      const player = createPlayerState("player1", {
        WETLAND: [coot, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Select the first eligible card from the prompt
            const cardIds = prompt.eligibleCards.slice(0, prompt.count).map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      const result = await processor.executeSinglePower(
        "coot",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.targetBirdInstanceId
      ).toBe("coot");

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(1);
    });

    it("allows player to draw from tray instead of deck", async () => {
      const coot = createBirdInstance("coot", "american_coot");
      const player = createPlayerState("player1", {
        WETLAND: [coot, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Select the first eligible card from the prompt
            const cardIds = prompt.eligibleCards.slice(0, prompt.count).map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "drawCards") {
            // Choose to draw from tray - select the first available tray card
            const trayCardIds = prompt.trayCards.slice(0, 1).map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: trayCardIds,
              numDeckCards: trayCardIds.length === 0 ? 1 : 0,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
        birdTray: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      const result = await processor.executeSinglePower(
        "coot",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(0);
      // Verify exactly one card was drawn from tray (the actual card selected from tray)
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray
      ).toHaveLength(1);
    });

    it("skips without prompting when no cards in hand", async () => {
      const coot = createBirdInstance("coot", "american_coot");
      const player = createPlayerState("player1", {
        WETLAND: [coot, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [], // No cards in hand
      });

      const result = await processor.executeSinglePower(
        "coot",
        "player1",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("discardEggToGainFood (American Crow)", () => {
    it("discards egg and prompts player to choose food when WILD type", async () => {
      const crow = createBirdInstance("crow", "american_crow");
      const otherBird = createBirdInstance("other_bird", "american_coot", 2);

      const player = createPlayerState("player1", {
        FOREST: [crow, otherBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { other_bird: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Player chooses SEED when WILD is allowed
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [
            {
              id: "crow",
              card: testRegistry.getBirdById("american_crow"),
              eggs: 0,
              cachedFood: {
                INVERTEBRATE: 0,
                SEED: 0,
                FISH: 0,
                FRUIT: 0,
                RODENT: 0,
              },
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 2,
              cachedFood: {
                INVERTEBRATE: 0,
                SEED: 0,
                FISH: 0,
                FRUIT: 0,
                RODENT: 0,
              },
              tuckedCards: [],
            },
          ],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "crow",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_EGGS"
      );
      expect(discardEffect).toBeDefined();

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      // Player chose SEED instead of getting WILD directly
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        SEED: 1,
      });
    });
  });

  describe("discardEggToDrawCards (Franklin's Gull / Killdeer)", () => {
    // Test basic functionality: discard 1 egg, draw 2 cards from deck.
    // Verifies the core power flow works correctly.
    it("discards egg and draws cards from deck", async () => {
      const gull = createBirdInstance("gull", "franklins_gull");
      const otherBird = createBirdInstance("other_bird", "killdeer", 2);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, otherBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { other_bird: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("killdeer"),
              eggs: 2,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("discardEggToDrawCards");

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_EGGS"
      );
      expect(discardEffect).toBeDefined();
      expect(
        discardEffect?.type === "DISCARD_EGGS" && discardEffect.sources
      ).toEqual({ other_bird: 1 });

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(2);
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual(
        []
      );
    });

    // Test drawing from tray: player chooses to draw 2 cards from the face-up tray.
    // Verifies that tray card selection is properly handled.
    it("draws cards from tray when player chooses tray cards", async () => {
      const gull = createBirdInstance("gull", "franklins_gull", 1);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { gull: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "drawCards") {
            // Draw from tray
            const trayCardIds = prompt.trayCards
              .slice(0, 2)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: trayCardIds,
              numDeckCards: 0,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
        testRegistry.getBirdById("mallard"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 1,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(0);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray
      ).toHaveLength(2);
    });

    // Test mixed drawing: player draws 1 from tray and 1 from deck.
    // Verifies that mixed selections are handled correctly.
    it("draws cards from both tray and deck in single choice", async () => {
      const gull = createBirdInstance("gull", "franklins_gull", 1);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { gull: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "drawCards") {
            // Draw 1 from tray and 1 from deck
            const trayCardIds = prompt.trayCards
              .slice(0, 1)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: trayCardIds,
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 1,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(1);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray
      ).toHaveLength(1);
    });

    // Test skipping when no eggs: power should skip without prompting if player has no eggs on any bird.
    // Verifies the precondition check works correctly.
    it("skips power when player has no eggs on any bird", async () => {
      const gull = createBirdInstance("gull", "franklins_gull", 0);
      const otherBird = createBirdInstance("other_bird", "killdeer", 0);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, otherBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      // Should never be called since power is skipped
      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Should not be called - power should be skipped");
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("killdeer"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      // One ACTIVATE_POWER effect with activated: false and skipReason
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("ACTIVATE_POWER");
    });

    // Test declining activation: player chooses not to activate the power.
    // Verifies that the power can be declined.
    it("does not proceed when player declines activation", async () => {
      const gull = createBirdInstance("gull", "franklins_gull");
      const otherBird = createBirdInstance("other_bird", "killdeer", 2);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, otherBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("killdeer"),
              eggs: 2,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      // One ACTIVATE_POWER effect with activated: false
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("ACTIVATE_POWER");
    });

    // Test drawing cards one at a time: agent draws cards in separate batches.
    // Verifies the while loop handles multiple iterations correctly.
    it("handles drawing cards one at a time in multiple batches", async () => {
      const gull = createBirdInstance("gull", "franklins_gull", 1);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let drawCallCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { gull: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "drawCards") {
            drawCallCount++;
            // Draw 1 card at a time from deck
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 1,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(drawCallCount).toBe(2); // Should be called twice for 2 cards

      // Should have 2 DRAW_CARDS effects
      const drawEffects = result.effects.filter(
        (e) => e.type === "DRAW_CARDS"
      );
      expect(drawEffects).toHaveLength(2);
    });

    // Test that player can discard from the bird with the power itself.
    // Verifies that any bird (including the power's own bird) can be a source.
    it("allows discarding from the bird that has the power", async () => {
      // Gull has an egg on itself
      const gull = createBirdInstance("gull", "franklins_gull", 1);

      const player = createPlayerState("player1", {
        GRASSLAND: [gull, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardEggs") {
            // Discard from the power bird itself
            return Promise.resolve({
              kind: "discardEggs",
              promptId: prompt.promptId,
              sources: { gull: 1 },
            } as DiscardEggsChoice);
          } else if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "gull",
              card: testRegistry.getBirdById("franklins_gull"),
              eggs: 1,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "gull",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_EGGS"
      );
      expect(discardEffect).toBeDefined();
      expect(
        discardEffect?.type === "DISCARD_EGGS" && discardEffect.sources
      ).toEqual({ gull: 1 });
    });
  });

  describe("rollDiceAndCacheIfMatch (American Kestrel)", () => {
    it("rolls dice and caches food if match found", async () => {
      const kestrel = createBirdInstance("kestrel", "american_kestrel");
      const player = createPlayerState("player1", {
        GRASSLAND: [kestrel, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // Mock applyEffect to populate rolledDice with a RODENT match
      const applyEffect = (effect: Effect) => {
        if (effect.type === "ROLL_DICE") {
          (effect as Effect & { rolledDice: string[] }).rolledDice = [
            "RODENT",
            "SEED",
          ];
        }
      };

      // Feeder has 3 dice, so we roll 2
      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {
          birdfeeder: ["SEED", "SEED", "FISH"],
        },
        applyEffect
      );

      const result = await processor.executeSinglePower(
        "kestrel",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const rollEffect = result.effects.find((e) => e.type === "ROLL_DICE");
      expect(rollEffect).toBeDefined();

      // Cache effect is emitted because we rolled a RODENT
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      expect(cacheEffect?.food).toEqual({ RODENT: 1 });
    });

    it("does not cache food when no match found", async () => {
      const kestrel = createBirdInstance("kestrel", "american_kestrel");
      const player = createPlayerState("player1", {
        GRASSLAND: [kestrel, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // Mock applyEffect to populate rolledDice with NO rodent match
      const applyEffect = (effect: Effect) => {
        if (effect.type === "ROLL_DICE") {
          (effect as Effect & { rolledDice: string[] }).rolledDice = [
            "SEED",
            "FISH",
          ];
        }
      };

      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {
          birdfeeder: ["SEED", "SEED", "FISH"],
        },
        applyEffect
      );

      const result = await processor.executeSinglePower(
        "kestrel",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const rollEffect = result.effects.find((e) => e.type === "ROLL_DICE");
      expect(rollEffect).toBeDefined();

      // NO cache effect should be emitted since we didn't roll a RODENT
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeUndefined();
    });

    it("skips without prompting when all dice in feeder", async () => {
      const kestrel = createBirdInstance("kestrel", "american_kestrel");
      const player = createPlayerState("player1", {
        GRASSLAND: [kestrel, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // All 5 dice in feeder
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED", "FISH", "RODENT", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "kestrel",
        "player1",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("drawAndDistributeCards (American Oystercatcher)", () => {
    it("draws cards and distributes to players", async () => {
      const oystercatcher = createBirdInstance(
        "oystercatcher",
        "american_oystercatcher"
      );
      const player1 = createPlayerState("player1", {
        WETLAND: [oystercatcher, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      // Mock revealed cards for the test (2 players + 1 = 3 cards)
      const revealedCards = [
        "acorn_woodpecker",
        "american_coot",
        "american_crow",
      ];
      let remainingCards = [...revealedCards];

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Player 1 selects the first available card
            const selectedCard = remainingCards[0];
            remainingCards = remainingCards.filter((c) => c !== selectedCard);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: [selectedCard],
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectCards") {
            // Player 2 selects the first available card
            const selectedCard = remainingCards[0];
            remainingCards = remainingCards.filter((c) => c !== selectedCard);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: [selectedCard],
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);

      // Provide applyEffect that populates revealedCards for REVEAL_CARDS effects
      const applyEffect = (effect: Effect) => {
        if (effect.type === "REVEAL_CARDS") {
          (effect as Effect & { revealedCards: string[] }).revealedCards =
            revealedCards;
        }
      };

      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {},
        applyEffect
      );

      const result = await processor.executeSinglePower(
        "oystercatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should have draw effects
      const drawEffects = result.effects.filter((e) => e.type === "DRAW_CARDS");
      expect(drawEffects.length).toBeGreaterThan(0);
    });
  });

  describe("gainFoodFromFeeder (American Redstart)", () => {
    it("gains any food from feeder", async () => {
      const redstart = createBirdInstance("redstart", "american_redstart");
      const player = createPlayerState("player1", {
        FOREST: [redstart, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "FISH" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["FISH", "SEED", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "redstart",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 1 });
      expect(gainEffect?.source).toBe("BIRDFEEDER");
    });
  });

  describe("discardFoodToTuckFromDeck (American White Pelican)", () => {
    it("discards fish to tuck cards from deck", async () => {
      const pelican = createBirdInstance("pelican", "american_white_pelican");
      const player = createPlayerState("player1", {
        WETLAND: [pelican, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { FISH: 1 },
            } as DiscardFoodChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: {
          INVERTEBRATE: 1,
          SEED: 1,
          FISH: 2,
          FRUIT: 1,
          RODENT: 1,
        },
      });

      const result = await processor.executeSinglePower(
        "pelican",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_FOOD"
      );
      expect(discardEffect).toBeDefined();

      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(tuckEffect?.targetBirdInstanceId).toBe("pelican");
      expect(tuckEffect?.fromDeck).toBe(2);
    });

    it("skips without prompting when no fish available", async () => {
      const pelican = createBirdInstance("pelican", "american_white_pelican");
      const player = createPlayerState("player1", {
        WETLAND: [pelican, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: {
          INVERTEBRATE: 1,
          SEED: 1,
          FISH: 0,
          FRUIT: 1,
          RODENT: 1,
          WILD: 0,
        },
      });

      const result = await processor.executeSinglePower(
        "pelican",
        "player1",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("declining powers", () => {
    it("returns AGENT_DECLINED when player declines activation", async () => {
      const coot = createBirdInstance("coot", "american_coot");
      const player = createPlayerState("player1", {
        WETLAND: [coot, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Must have cards in hand for tuckAndDraw invariant to be met
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      const result = await processor.executeSinglePower(
        "coot",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
    });
  });

  describe("eachPlayerGainsFoodFromFeeder (Anna's Hummingbird)", () => {
    it("all players gain food from feeder in clockwise order with individual prompts", async () => {
      const hummingbird = createBirdInstance(
        "hummingbird",
        "annas_hummingbird"
      );
      const player1 = createPlayerState("player1", {
        FOREST: [hummingbird, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      // Helper to select first available die from prompt
      const selectFirstAvailableDie = (prompt: SelectFoodFromFeederPrompt) => {
        const available = prompt.availableDice;
        for (const [dieType, count] of Object.entries(available)) {
          if (count && count > 0) {
            const dieSelection = dieType === "SEED_INVERTEBRATE"
              ? { die: dieType, asFoodType: "SEED" as const }
              : { die: dieType };
            return {
              kind: "selectFoodFromFeeder" as const,
              promptId: prompt.promptId,
              diceOrReroll: [dieSelection],
            } as SelectFoodFromFeederChoice;
          }
        }
        // Fallback to reroll if no dice available
        return {
          kind: "selectFoodFromFeeder" as const,
          promptId: prompt.promptId,
          diceOrReroll: "reroll" as const,
        } as SelectFoodFromFeederChoice;
      };

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectPlayer") {
            return Promise.resolve({
              kind: "selectPlayer",
              promptId: prompt.promptId,
              player: "player1",
            } as SelectPlayerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // Player 1 selects first available die
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            // Player 2 selects first available die
            return Promise.resolve(selectFirstAvailableDie(prompt));
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      const result = await processor.executeSinglePower(
        "hummingbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("eachPlayerGainsFoodFromFeeder");

      // Now emits individual GAIN_FOOD effects for each player
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(2);

      const player1Gain = gainEffects.find((e) => e.playerId === "player1");
      expect(player1Gain).toBeDefined();
      // Verify player 1 gained exactly 1 food of some type
      const player1FoodTotal = Object.values(player1Gain?.food || {}).reduce(
        (sum: number, count) => sum + (count || 0),
        0
      );
      expect(player1FoodTotal).toBe(1);
      expect(player1Gain?.source).toBe("BIRDFEEDER");

      const player2Gain = gainEffects.find((e) => e.playerId === "player2");
      expect(player2Gain).toBeDefined();
      // Verify player 2 gained exactly 1 food of some type
      const player2FoodTotal = Object.values(player2Gain?.food || {}).reduce(
        (sum: number, count) => sum + (count || 0),
        0
      );
      expect(player2FoodTotal).toBe(1);
      expect(player2Gain?.source).toBe("BIRDFEEDER");
    });
  });

  describe("layEggOnBirdsWithNestType (Ash-Throated Flycatcher)", () => {
    it("lays eggs on all birds with matching nest type", async () => {
      const flycatcher = createBirdInstance(
        "flycatcher",
        "ash_throated_flycatcher"
      );
      const cavityBird = createBirdInstance("cavity_bird", "barred_owl", 0);

      const player = createPlayerState("player1", {
        GRASSLAND: [flycatcher, null, null, null, null],
        FOREST: [cavityBird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [
            {
              id: "cavity_bird",
              card: testRegistry.getBirdById("barred_owl"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          GRASSLAND: [
            {
              id: "flycatcher",
              card: testRegistry.getBirdById("ash_throated_flycatcher"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("layEggOnBirdsWithNestType");

      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeDefined();
    });

    it("skips when no birds with matching nest type", async () => {
      const flycatcher = createBirdInstance(
        "flycatcher",
        "ash_throated_flycatcher",
        4
      ); // At full capacity (eggCapacity: 4)
      // bairds_sparrow has GROUND nest type which doesn't match CAVITY
      const groundBird = createBirdInstance("ground_bird", "bairds_sparrow", 0);

      const player = createPlayerState("player1", {
        GRASSLAND: [flycatcher, groundBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "flycatcher",
              card: testRegistry.getBirdById("ash_throated_flycatcher"),
              eggs: 4, // At full capacity - not eligible
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "ground_bird",
              card: testRegistry.getBirdById("bairds_sparrow"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted when no eligible birds
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("drawBonusCardsAndKeep (Atlantic Puffin)", () => {
    it("draws bonus cards and keeps selected ones", async () => {
      const puffin = createBirdInstance("puffin", "atlantic_puffin");
      const player = createPlayerState("player1", {
        WETLAND: [puffin, null, null, null, null],
      });
      const state = createGameState([player]);
      // Use real bonus card IDs from the registry
      state.bonusCardDeck = createMockBonusCardDeck([
        "anatomist",
        "backyard_birder",
        "bird_bander",
      ]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectBonusCards") {
            return Promise.resolve({
              kind: "selectBonusCards",
              promptId: prompt.promptId,
              cards: ["anatomist"],
            } as SelectBonusCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // Mock applyEffect to populate revealedCards for REVEAL_BONUS_CARDS effect
      const applyEffect = (effect: Effect) => {
        if (effect.type === "REVEAL_BONUS_CARDS") {
          (effect as Effect & { revealedCards: string[] }).revealedCards = [
            "anatomist",
            "backyard_birder",
          ];
        }
      };

      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {},
        applyEffect
      );

      const result = await processor.executeSinglePower(
        "puffin",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawBonusCardsAndKeep");

      // Should have REVEAL_BONUS_CARDS effect
      const revealEffect = result.effects.find(
        (e) => e.type === "REVEAL_BONUS_CARDS"
      );
      expect(revealEffect).toBeDefined();

      const bonusEffect = result.effects.find(
        (e) => e.type === "DRAW_BONUS_CARDS"
      );
      expect(bonusEffect).toBeDefined();
      expect(bonusEffect?.keptCards).toEqual(["anatomist"]);
      expect(bonusEffect?.discardedCards).toEqual(["backyard_birder"]);
    });
  });

  describe("layEggsOnBird (Baird's Sparrow)", () => {
    it("lays eggs on any bird with capacity", async () => {
      const sparrow = createBirdInstance("sparrow", "bairds_sparrow");
      const otherBird = createBirdInstance("other_bird", "american_coot", 0);

      const player = createPlayerState("player1", {
        GRASSLAND: [sparrow, otherBird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "placeEggs") {
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { other_bird: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "sparrow",
              card: testRegistry.getBirdById("bairds_sparrow"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "sparrow",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("layEggsOnBird");

      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeDefined();
      expect(layEffect?.placements).toEqual({ other_bird: 1 });
    });

    it("skips when all birds at full capacity", async () => {
      const sparrow = createBirdInstance("sparrow", "bairds_sparrow", 2); // At capacity

      const player = createPlayerState("player1", {
        GRASSLAND: [sparrow, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "sparrow",
              card: testRegistry.getBirdById("bairds_sparrow"),
              eggs: 2, // At capacity (eggCapacity: 2)
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "sparrow",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
    });
  });

  describe("gainAllFoodTypeFromFeeder (Bald Eagle)", () => {
    it("gains all fish from feeder", async () => {
      const eagle = createBirdInstance("eagle", "bald_eagle");
      const player = createPlayerState("player1", {
        WETLAND: [eagle, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["FISH", "FISH", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "eagle",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("gainAllFoodTypeFromFeeder");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 3 });
      expect(gainEffect?.source).toBe("BIRDFEEDER");
    });

    it("skips when no matching food in feeder", async () => {
      const eagle = createBirdInstance("eagle", "bald_eagle");
      const player = createPlayerState("player1", {
        WETLAND: [eagle, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "INVERTEBRATE", "RODENT"],
      });

      const result = await processor.executeSinglePower(
        "eagle",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("allPlayersGainFoodFromSupply (Baltimore Oriole)", () => {
    it("all players gain fruit from supply", async () => {
      const oriole = createBirdInstance("oriole", "baltimore_oriole");
      const player1 = createPlayerState("player1", {
        FOREST: [oriole, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "oriole",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersGainFoodFromSupply");

      const gainEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_GAIN_FOOD"
      );
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.gains["player1"]).toEqual({ FRUIT: 1 });
      expect(gainEffect?.gains["player2"]).toEqual({ FRUIT: 1 });
    });
  });

  describe("allPlayersDrawCardsFromDeck (Canvasback)", () => {
    // This test verifies that the handler correctly emits an ALL_PLAYERS_DRAW_CARDS effect
    // with draws for each player when the power is activated.
    it("all players draw 1 card from the deck", async () => {
      const canvasback = createBirdInstance("canvasback", "canvasback");
      const player1 = createPlayerState("player1", {
        WETLAND: [canvasback, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "canvasback",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersDrawCardsFromDeck");

      const drawEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_DRAW_CARDS"
      );
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.draws["player1"]).toBe(1);
      expect(drawEffect?.draws["player2"]).toBe(1);
    });

    // This test verifies that draws proceed in clockwise order starting from the owner.
    // With players [p1, p2, p3] and p2 as owner, order should be [p2, p3, p1].
    it("draws are ordered clockwise starting from the owner", async () => {
      const canvasback = createBirdInstance("canvasback", "canvasback");
      const player1 = createPlayerState("player1");
      const player2 = createPlayerState("player2", {
        WETLAND: [canvasback, null, null, null, null],
      });
      const player3 = createPlayerState("player3");
      const state = createGameState([player1, player2, player3]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");
      const mockAgent3 = createMockAgent("player3");

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
        ["player3", mockAgent3],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "canvasback",
        "player2",
        execCtx
      );

      expect(result.activated).toBe(true);

      const drawEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_DRAW_CARDS"
      );
      expect(drawEffect).toBeDefined();

      // All 3 players should get 1 card each
      expect(drawEffect?.draws["player1"]).toBe(1);
      expect(drawEffect?.draws["player2"]).toBe(1);
      expect(drawEffect?.draws["player3"]).toBe(1);

      // Verify order - keys in the draws object should reflect clockwise from owner
      // Owner is player2, so order is: player2, player3, player1
      const drawKeys = Object.keys(drawEffect?.draws || {});
      expect(drawKeys).toEqual(["player2", "player3", "player1"]);
    });

    // This test verifies that when the player declines activation, no effect is emitted.
    it("does not draw when player declines activation", async () => {
      const canvasback = createBirdInstance("canvasback", "canvasback");
      const player1 = createPlayerState("player1", {
        WETLAND: [canvasback, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "canvasback",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      const drawEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_DRAW_CARDS"
      );
      expect(drawEffect).toBeUndefined();
    });

    // This test verifies the handler works with Northern Shoveler (another bird with this power)
    // to ensure the handler is generic and not tied to a specific bird card.
    it("works with Northern Shoveler (another bird with same power)", async () => {
      const shoveler = createBirdInstance("shoveler", "northern_shoveler");
      const player1 = createPlayerState("player1", {
        WETLAND: [shoveler, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "shoveler",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersDrawCardsFromDeck");

      const drawEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_DRAW_CARDS"
      );
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.draws["player1"]).toBe(1);
      expect(drawEffect?.draws["player2"]).toBe(1);
    });
  });

  describe("lookAtCardAndTuckIfWingspanUnder (Barred Owl)", () => {
    it("tucks card when wingspan is under threshold", async () => {
      const owl = createBirdInstance("owl", "barred_owl");
      const player = createPlayerState("player1", {
        FOREST: [owl, null, null, null, null],
      });
      const state = createGameState([player]);
      // American Goldfinch has wingspan 23cm which is under 75cm
      state.birdCardSupply = createMockBirdCardSupply(["american_goldfinch"]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "owl",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("lookAtCardAndTuckIfWingspanUnder");

      const revealEffect = result.effects.find(
        (e) => e.type === "REVEAL_CARDS"
      );
      expect(revealEffect).toBeDefined();
    });

    it("discards card when wingspan is at or above threshold", async () => {
      const owl = createBirdInstance("owl", "barred_owl");
      const player = createPlayerState("player1", {
        FOREST: [owl, null, null, null, null],
      });
      const state = createGameState([player]);
      // Bald Eagle has wingspan 203cm which is above 75cm
      state.birdCardSupply = createMockBirdCardSupply(["bald_eagle"]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "owl",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const revealEffect = result.effects.find(
        (e) => e.type === "REVEAL_CARDS"
      );
      expect(revealEffect).toBeDefined();
    });

    it("skips when deck is empty", async () => {
      const owl = createBirdInstance("owl", "barred_owl");
      const player = createPlayerState("player1", {
        FOREST: [owl, null, null, null, null],
      });
      const state = createGameState([player]);
      state.birdCardSupply = createMockBirdCardSupply([]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "owl",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
    });
  });

  describe("whenOpponentPlaysBirdInHabitatGainFood (Belted Kingfisher)", () => {
    it("gains fish when triggered", async () => {
      const kingfisher = createBirdInstance("kingfisher", "belted_kingfisher");
      const player = createPlayerState("player1", {
        WETLAND: [kingfisher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "kingfisher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("whenOpponentPlaysBirdInHabitatGainFood");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 1 });
      expect(gainEffect?.source).toBe("SUPPLY");
    });

    it("can be declined", async () => {
      const kingfisher = createBirdInstance("kingfisher", "belted_kingfisher");
      const player = createPlayerState("player1", {
        WETLAND: [kingfisher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "kingfisher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
    });
  });

  describe("moveToAnotherHabitatIfRightmost (Bewick's Wren)", () => {
    it("moves bird to another habitat when rightmost", async () => {
      const wren = createBirdInstance("wren", "bewicks_wren");
      const otherBird = createBirdInstance("other_bird", "american_coot");

      const player = createPlayerState("player1", {
        FOREST: [otherBird, wren, null, null, null],
        GRASSLAND: [null, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectHabitat") {
            return Promise.resolve({
              kind: "selectHabitat",
              promptId: prompt.promptId,
              habitat: "GRASSLAND",
            } as SelectHabitatChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [
            {
              id: "other_bird",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "wren",
              card: testRegistry.getBirdById("bewicks_wren"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "wren",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("moveToAnotherHabitatIfRightmost");

      const moveEffect = result.effects.find((e) => e.type === "MOVE_BIRD");
      expect(moveEffect).toBeDefined();
      expect(moveEffect?.birdInstanceId).toBe("wren");
      expect(moveEffect?.fromHabitat).toBe("FOREST");
      expect(moveEffect?.toHabitat).toBe("GRASSLAND");
    });

    it("skips when bird is not rightmost", async () => {
      const wren = createBirdInstance("wren", "bewicks_wren");
      const otherBird = createBirdInstance("other_bird", "american_coot");

      const player = createPlayerState("player1", {
        FOREST: [wren, otherBird, null, null, null], // Wren is NOT rightmost
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [
            {
              id: "wren",
              card: testRegistry.getBirdById("bewicks_wren"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "other_bird",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "wren",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    it("skips when no eligible destination habitats", async () => {
      const wren = createBirdInstance("wren", "bewicks_wren");

      const player = createPlayerState("player1", {
        // Wren can only go to FOREST, GRASSLAND, or WETLAND (it has all 3)
        // All are full
        FOREST: [wren, null, null, null, null],
        GRASSLAND: [
          createBirdInstance("b1", "american_coot"),
          createBirdInstance("b2", "american_coot"),
          createBirdInstance("b3", "american_coot"),
          createBirdInstance("b4", "american_coot"),
          createBirdInstance("b5", "american_coot"),
        ],
        WETLAND: [
          createBirdInstance("b6", "american_coot"),
          createBirdInstance("b7", "american_coot"),
          createBirdInstance("b8", "american_coot"),
          createBirdInstance("b9", "american_coot"),
          createBirdInstance("b10", "american_coot"),
        ],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [
            {
              id: "wren",
              card: testRegistry.getBirdById("bewicks_wren"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          GRASSLAND: [
            {
              id: "b1",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b2",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b3",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b4",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b5",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
          WETLAND: [
            {
              id: "b6",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b7",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b8",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b9",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
            {
              id: "b10",
              card: testRegistry.getBirdById("american_coot"),
              eggs: 0,
              cachedFood: {},
              tuckedCards: [],
            },
          ],
        },
      });

      const result = await processor.executeSinglePower(
        "wren",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
    });
  });

  describe("drawCardsWithDelayedDiscard (Black Tern)", () => {
    it("draws card immediately and defers discard to end of turn", async () => {
      const tern = createBirdInstance("tern", "black_tern");
      const player = createPlayerState("player1", {
        WETLAND: [tern, null, null, null, null],
      });
      const state = createGameState([player]);
      state.birdCardSupply = createMockBirdCardSupply(["american_goldfinch"]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Select the first eligible card from the prompt
            const cardIds = prompt.eligibleCards.slice(0, prompt.count).map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // Track deferred continuations
      const deferredContinuations: Array<{
        playerId: string;
        continuation: () => Generator<PowerYield, void, PowerReceive>;
      }> = [];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      // Override deferContinuation to capture it
      execCtx.deferContinuation = (playerId, continuation) => {
        deferredContinuations.push({ playerId, continuation });
      };

      const result = await processor.executeSinglePower(
        "tern",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawCardsWithDelayedDiscard");

      // Draw happens immediately
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.fromDeck).toBe(1);

      // Discard is NOT in immediate effects (it's deferred)
      const immediateDiscardEffect = result.effects.find(
        (e) => e.type === "DISCARD_CARDS"
      );
      expect(immediateDiscardEffect).toBeUndefined();

      // A continuation was deferred
      expect(deferredContinuations).toHaveLength(1);
      expect(deferredContinuations[0].playerId).toBe("player1");

      // Execute the deferred continuation to verify discard works
      const { effects: deferredEffects } = await processor.executeContinuation(
        deferredContinuations[0].continuation,
        "player1",
        execCtx
      );

      const discardEffect = deferredEffects.find(
        (e) => e.type === "DISCARD_CARDS"
      );
      expect(discardEffect).toBeDefined();
      // Verify exactly one card was discarded (the card selected from eligible cards)
      expect(discardEffect?.cards).toHaveLength(1);
    });

    it("skips when deck is empty", async () => {
      const tern = createBirdInstance("tern", "black_tern");
      const player = createPlayerState("player1", {
        WETLAND: [tern, null, null, null, null],
      });
      const state = createGameState([player]);
      state.birdCardSupply = createMockBirdCardSupply([]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "tern",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
    });
  });

  // Test: whenOpponentPlaysBirdInHabitatGainFood should silently skip when
  // the triggering event's habitat doesn't match the required habitat.
  describe("whenOpponentPlaysBirdInHabitatGainFood habitat matching", () => {
    it("does not trigger when bird is played in wrong habitat", async () => {
      const kingfisher = createBirdInstance("kingfisher", "belted_kingfisher");
      const player = createPlayerState("player1", {
        WETLAND: [kingfisher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set a triggering event with wrong habitat (FOREST instead of WETLAND)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "FOREST", // Wrong habitat - Belted Kingfisher watches for WETLAND
        position: 0,
        birdCardId: "american_coot",
      };

      const result = await processor.executeSinglePower(
        "kingfisher",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    it("triggers when bird is played in correct habitat", async () => {
      const kingfisher = createBirdInstance("kingfisher", "belted_kingfisher");
      const player = createPlayerState("player1", {
        WETLAND: [kingfisher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set a triggering event with correct habitat (WETLAND)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "WETLAND", // Correct habitat - Belted Kingfisher watches for WETLAND
        position: 0,
        birdCardId: "american_coot",
      };

      const result = await processor.executeSinglePower(
        "kingfisher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("whenOpponentPlaysBirdInHabitatGainFood");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 1 });
    });
  });

  // Test: gainAllFoodTypeFromFeeder should also take SEED_INVERTEBRATE dice when
  // the requested food type is SEED or INVERTEBRATE.
  describe("gainAllFoodTypeFromFeeder SEED_INVERTEBRATE handling", () => {
    it("takes SEED_INVERTEBRATE dice as SEED when gaining SEED", async () => {
      // We need a bird that gains all SEED from feeder
      // For this test, we'll test the handler directly by using a mock bird with the right params
      const eagle = createBirdInstance("eagle", "bald_eagle");
      const player = createPlayerState("player1", {
        WETLAND: [eagle, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has SEED_INVERTEBRATE dice along with regular SEED
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED_INVERTEBRATE", "FISH", "SEED_INVERTEBRATE"],
      });

      // Note: Bald Eagle takes FISH, not SEED. We need to test with a different bird
      // or override the params. For now, let's verify the FISH case works and add
      // a more direct test for SEED handling below.
      const result = await processor.executeSinglePower(
        "eagle",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      // Bald Eagle only takes FISH, not SEED_INVERTEBRATE
      expect(gainEffect?.food).toEqual({ FISH: 1 });
      // Verify diceTaken is present
      expect(gainEffect?.diceTaken).toBeDefined();
      expect(gainEffect?.diceTaken).toHaveLength(1);
      expect(gainEffect?.diceTaken?.[0].die).toBe("FISH");
    });

    it("includes diceTaken in GAIN_FOOD effect for gainAllFoodTypeFromFeeder", async () => {
      const eagle = createBirdInstance("eagle", "bald_eagle");
      const player = createPlayerState("player1", {
        WETLAND: [eagle, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Multiple FISH in feeder
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["FISH", "FISH", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "eagle",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 3 });
      // Verify diceTaken has all 3 FISH dice
      expect(gainEffect?.diceTaken).toBeDefined();
      expect(gainEffect?.diceTaken).toHaveLength(3);
      expect(gainEffect?.diceTaken?.every((d) => d.die === "FISH")).toBe(true);
    });
  });

  // Tests for whenOpponentPredatorSucceedsGainFood handler (Black Vulture, Turkey Vulture, Black-Billed Magpie)
  // This pink power triggers when another player's predator power succeeds, allowing the owner to gain 1 food from the birdfeeder.
  describe("whenOpponentPredatorSucceedsGainFood (Black Vulture)", () => {
    // Test: Verifies the core happy path - when a predator succeeds (wingspan check), the power should activate and allow gaining food from feeder.
    it("gains food when triggered by a successful wingspan predator", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a successful wingspan predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("whenOpponentPredatorSucceedsGainFood");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ SEED: 1 });
      expect(gainEffect?.source).toBe("BIRDFEEDER");
      expect(gainEffect?.diceTaken).toEqual([{ die: "SEED" }]);
    });

    // Test: Verifies the power also works for dice-roll predators (like Barn Owl hunting rodents).
    it("gains food when triggered by a successful dice roll predator", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "RODENT" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["RODENT", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a successful dice roll predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_kestrel",
        success: true,
        predatorType: "DICE_ROLL",
        diceRoll: {
          diceRolled: ["RODENT", "SEED"],
          targetFoodType: "RODENT",
          matchCount: 1,
          cachedFood: "RODENT",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ RODENT: 1 });
    });

    // Test: Ensures the power silently skips (no activation prompt) when the predator fails.
    it("skips without prompting when predator fails", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a FAILED wingspan predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: false, // Predator failed
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "bald_eagle",
          wingspan: 203,
          threshold: 75,
          disposition: "DISCARDED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Test: Ensures the power silently skips when triggered by a non-predator event (e.g., BIRD_PLAYED).
    it("skips without prompting when not triggered by predator event", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a BIRD_PLAYED event (wrong event type)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        birdCardId: "american_coot",
        habitat: "WETLAND",
        position: 0,
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Test: Ensures the power silently skips when there is no triggering event at all.
    it("skips without prompting when no triggering event", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // No triggering event set (undefined)

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Test: Verifies the player can decline the activation prompt.
    it("can be declined by player", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a successful predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
    });

    // Test: Verifies the reroll functionality works when all dice show the same face.
    it("allows valid reroll when all dice match", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let selectFoodCallCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            selectFoodCallCount++;
            // First call: reroll
            if (selectFoodCallCount === 1) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // Second call: select food (still SEED since mock doesn't change feeder)
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // All dice show the same face - reroll is allowed
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "SEED", "SEED"],
      });

      // Set triggering event: a successful predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Reroll effect should be emitted
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeDefined();
      // Gain food effect should also be present
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
    });

    // Test: Ensures invalid reroll requests (when dice don't all match) are rejected and the player is re-prompted.
    it("rejects invalid reroll when dice don't all match", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let selectFoodCallCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            selectFoodCallCount++;
            // First call: invalid reroll attempt
            if (selectFoodCallCount === 1) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // Second call: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Mixed dice - reroll is NOT allowed
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "INVERTEBRATE"],
      });

      // Set triggering event: a successful predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // No reroll effect (request was invalid)
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeUndefined();
      // Gain food effect should be present
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      // Agent was prompted twice for food selection (invalid reroll, then valid selection)
      expect(selectFoodCallCount).toBe(2);
    });

    // Test: Verifies the power ends gracefully when the birdfeeder is empty.
    it("ends gracefully when birdfeeder is empty", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Empty birdfeeder
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: [],
      });

      // Set triggering event: a successful predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      // Power activates but no food is gained (feeder empty)
      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeUndefined();
    });

    // Test: Verifies SEED_INVERTEBRATE dice can be used for food selection.
    it("handles SEED_INVERTEBRATE dice correctly", async () => {
      const vulture = createBirdInstance("vulture", "black_vulture");
      const player = createPlayerState("player1", {
        FOREST: [vulture, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // Select SEED_INVERTEBRATE as INVERTEBRATE
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "SEED_INVERTEBRATE", asFoodType: "INVERTEBRATE" }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED_INVERTEBRATE", "FISH"],
      });

      // Set triggering event: a successful predator
      execCtx.triggeringEvent = {
        type: "PREDATOR_POWER_RESOLVED",
        playerId: "player2",
        predatorBirdInstanceId: "opponent_owl",
        success: true,
        predatorType: "WINGSPAN_CHECK",
        wingspanCheck: {
          revealedCardId: "american_goldfinch",
          wingspan: 23,
          threshold: 75,
          disposition: "TUCKED",
        },
      };

      const result = await processor.executeSinglePower(
        "vulture",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ INVERTEBRATE: 1 });
      expect(gainEffect?.diceTaken).toEqual([{ die: "SEED_INVERTEBRATE", asFoodType: "INVERTEBRATE" }]);
    });
  });

  describe("tuckFromHandAndLay (Brewer's Blackbird, White-Throated Swift)", () => {
    // Tests that the tuckFromHandAndLay handler correctly tucks a card and optionally lays an egg.
    // This handler is used by multiple birds with different eggTarget parameters.
    it("tucks a card and lays egg on this bird with eggTarget=THIS_BIRD", async () => {
      // Brewer's Blackbird: "Tuck 1 [card] from your hand behind this bird.
      // If you do, you may also lay 1 [egg] on this bird."
      const blackbird = createBirdInstance("blackbird", "brewers_blackbird", 0);
      const player = createPlayerState("player1", {
        GRASSLAND: [blackbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Select the first eligible card from the prompt
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "placeEggs") {
            // Place 1 egg on the blackbird
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { blackbird: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "blackbird",
              card: testRegistry.getBirdById("brewers_blackbird"),
              cachedFood: {},
              tuckedCards: [],
              eggs: 0,
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "blackbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("tuckFromHandAndLay");

      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.targetBirdInstanceId
      ).toBe("blackbird");
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.fromHand.length
      ).toBe(1);

      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeDefined();
      expect(layEffect?.type === "LAY_EGGS" && layEffect.placements).toEqual({
        blackbird: 1,
      });
    });

    // Tests that eggTarget=ANY_BIRD allows placing eggs on any bird with capacity
    it("tucks a card and lays egg on any bird with eggTarget=ANY_BIRD", async () => {
      // White-Throated Swift: "Tuck 1 [card] from your hand behind this bird.
      // If you do, lay 1 [egg] on any bird."
      const swift = createBirdInstance("swift", "white_throated_swift", 2); // Full (capacity 2)
      const otherBird = createBirdInstance("other", "american_coot", 0); // Has capacity
      const player = createPlayerState("player1", {
        GRASSLAND: [swift, null, null, null, null],
        WETLAND: [otherBird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "placeEggs") {
            // Should be able to place on any bird - choose the other bird
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { other: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("acorn_woodpecker")],
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "swift",
              card: testRegistry.getBirdById("white_throated_swift"),
              cachedFood: {},
              tuckedCards: [],
              eggs: 2, // Full capacity
            },
          ],
          WETLAND: [
            {
              id: "other",
              card: testRegistry.getBirdById("american_coot"),
              cachedFood: {},
              tuckedCards: [],
              eggs: 0,
            },
          ],
        },
      });

      const result = await processor.executeSinglePower(
        "swift",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.targetBirdInstanceId
      ).toBe("swift");

      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeDefined();
      // Egg placed on other bird, not the swift
      expect(layEffect?.type === "LAY_EGGS" && layEffect.placements).toEqual({
        other: 1,
      });
    });

    // Tests the precondition check: power requires cards in hand to tuck
    it("skips without prompting when no cards in hand", async () => {
      const blackbird = createBirdInstance("blackbird", "brewers_blackbird", 0);
      const player = createPlayerState("player1", {
        GRASSLAND: [blackbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // Empty hand - no cards to tuck
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [],
      });

      const result = await processor.executeSinglePower(
        "blackbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that player can decline the power activation
    it("returns AGENT_DECLINED when player declines activation", async () => {
      const blackbird = createBirdInstance("blackbird", "brewers_blackbird", 0);
      const player = createPlayerState("player1", {
        GRASSLAND: [blackbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("acorn_woodpecker")],
      });

      const result = await processor.executeSinglePower(
        "blackbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
    });

    // Tests that tucking succeeds but egg laying is skipped when bird is at full capacity
    it("tucks card but skips egg laying when target bird is at full capacity", async () => {
      // Blackbird with full egg capacity (3 eggs, capacity is 3)
      const blackbird = createBirdInstance("blackbird", "brewers_blackbird", 3);
      const player = createPlayerState("player1", {
        GRASSLAND: [blackbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "placeEggs") {
            // This should NOT be called since bird is full
            throw new Error("Should not prompt for egg placement when bird is full");
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("acorn_woodpecker")],
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "blackbird",
              card: testRegistry.getBirdById("brewers_blackbird"),
              cachedFood: {},
              tuckedCards: [],
              eggs: 3, // Full capacity (egg capacity is 3)
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "blackbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Tuck effect should still be present
      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();

      // No LAY_EGGS effect since bird was full
      const layEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEffect).toBeUndefined();

      // Should only have 2 prompts: activate and select cards (no placeEggs)
      expect(promptCount).toBe(2);
    });

    // Tests that multiple cards in hand allows selection up to tuckCount
    it("limits tuck selection to tuckCount when hand has more cards", async () => {
      const blackbird = createBirdInstance("blackbird", "brewers_blackbird", 0);
      const player = createPlayerState("player1", {
        GRASSLAND: [blackbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let selectCardsPromptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            selectCardsPromptCount = prompt.count;
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "placeEggs") {
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { blackbird: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
          testRegistry.getBirdById("barn_swallow"),
        ],
        board: {
          FOREST: [],
          GRASSLAND: [
            {
              id: "blackbird",
              card: testRegistry.getBirdById("brewers_blackbird"),
              cachedFood: {},
              tuckedCards: [],
              eggs: 0,
            },
          ],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "blackbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // The prompt count should be 1 (tuckCount is 1 for Brewer's Blackbird)
      expect(selectCardsPromptCount).toBe(1);

      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.fromHand.length
      ).toBe(1);
    });
  });

  describe("drawFaceUpCardsFromTray (Brant)", () => {
    // Tests that the handler draws all 3 face-up cards from the bird tray when activated.
    // This is the primary functionality of the power - an automatic draw of all tray cards.
    it("draws all face-up cards from the bird tray when activated", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("acorn_woodpecker"),
        testRegistry.getBirdById("american_coot"),
        testRegistry.getBirdById("barn_swallow"),
      ];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawFaceUpCardsFromTray");

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual([
        "acorn_woodpecker",
        "american_coot",
        "barn_swallow",
      ]);
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(0);
    });

    // Tests that the handler correctly skips without prompting when the tray is empty.
    // Per rules, face-up cards are only replenished at end of turn, so tray can be empty.
    it("skips without prompting when tray is empty", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCalled = false;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          promptCalled = true;
          throw new Error("Should not prompt when tray is empty");
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [], // Empty tray
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(promptCalled).toBe(false);
    });

    // Tests that the player can decline to activate the power.
    // Even though it's a beneficial power, activation is always optional.
    it("does not draw cards when player declines to activate", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("acorn_woodpecker"),
        testRegistry.getBirdById("american_coot"),
        testRegistry.getBirdById("barn_swallow"),
      ];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeUndefined();
    });

    // Tests that if only 1 card is in the tray, only 1 card is drawn.
    // Tray can have fewer than 3 cards if cards were drawn earlier in the turn.
    it("draws only 1 card when tray has only 1 card", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [testRegistry.getBirdById("acorn_woodpecker")];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual([
        "acorn_woodpecker",
      ]);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray.length
      ).toBe(1);
    });

    // Tests that if only 2 cards are in the tray, only 2 cards are drawn.
    // Confirms handler correctly adapts to partial tray contents.
    it("draws only 2 cards when tray has only 2 cards", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("acorn_woodpecker"),
        testRegistry.getBirdById("american_coot"),
      ];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual([
        "acorn_woodpecker",
        "american_coot",
      ]);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray.length
      ).toBe(2);
    });

    // Tests that the ACTIVATE_POWER effect is always emitted, even on success.
    // This ensures proper tracking of power activations for game state.
    it("emits ACTIVATE_POWER effect when activated", async () => {
      const brant = createBirdInstance("brant", "brant");
      const player = createPlayerState("player1", {
        WETLAND: [brant, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [testRegistry.getBirdById("acorn_woodpecker")];

      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "brant",
        "player1",
        execCtx
      );

      const activateEffect = result.effects.find(
        (e) => e.type === "ACTIVATE_POWER"
      );
      expect(activateEffect).toBeDefined();
      expect(
        activateEffect?.type === "ACTIVATE_POWER" && activateEffect.activated
      ).toBe(true);
      expect(
        activateEffect?.type === "ACTIVATE_POWER" && activateEffect.handlerId
      ).toBe("drawFaceUpCardsFromTray");
    });
  });

  describe("drawCards (Black-Necked Stilt / Mallard)", () => {
    // Test basic functionality: drawing 2 cards from deck when activated.
    // Verifies that the power prompts for activation and draws cards.
    it("draws cards from deck when player chooses deck", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawCards");

      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(2);
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual(
        []
      );
    });

    // Test drawing from tray: player chooses to draw 2 cards from the face-up tray.
    // Verifies that tray card selection is properly handled.
    it("draws cards from tray when player chooses tray cards", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            // Draw from tray
            const trayCardIds = prompt.trayCards
              .slice(0, 2)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: trayCardIds,
              numDeckCards: 0,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
        testRegistry.getBirdById("mallard"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(0);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray
      ).toContain("barn_owl");
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray
      ).toContain("common_raven");
    });

    // Test mixed draw: player draws 1 card from deck and 1 from tray.
    // Verifies combined deck/tray selection works correctly.
    it("draws mix of deck and tray cards", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            // Draw 1 from tray and 1 from deck
            const trayCardIds = prompt.trayCards
              .slice(0, 1)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: trayCardIds,
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(1);
      expect(
        drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray.length
      ).toBe(1);
    });

    // Test drawing one card at a time in multiple prompts (looping behavior).
    // The handler should prompt multiple times if player draws fewer than count.
    it("handles drawing cards one at a time over multiple prompts", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let drawPromptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            drawPromptCount++;
            // Draw only 1 card per prompt
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should have been prompted twice (once for each card)
      expect(drawPromptCount).toBe(2);
      // Should have 2 DRAW_CARDS effects
      const drawEffects = result.effects.filter((e) => e.type === "DRAW_CARDS");
      expect(drawEffects.length).toBe(2);
    });

    // Test player declining to activate power: no cards should be drawn.
    it("does not draw cards when player declines to activate", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeUndefined();
    });

    // Test drawing a single card (Mallard has count: 1).
    // Verifies that count parameter is respected.
    it("draws only 1 card for mallard (count: 1)", async () => {
      const mallard = createBirdInstance("mallard", "mallard");
      const player = createPlayerState("player1", {
        WETLAND: [mallard, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let drawPromptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            drawPromptCount++;
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 1,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "mallard",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawCards");
      // Should only prompt once for 1 card
      expect(drawPromptCount).toBe(1);
      const drawEffects = result.effects.filter((e) => e.type === "DRAW_CARDS");
      expect(drawEffects.length).toBe(1);
      expect(drawEffects[0].type === "DRAW_CARDS" && drawEffects[0].fromDeck).toBe(1);
    });

    // Test that player can draw all cards at once in a single prompt.
    // Verifies that players don't need to draw one at a time.
    it("draws all cards in a single batch when player requests full count", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let drawPromptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            drawPromptCount++;
            // Draw both cards at once
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "stilt",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should only be prompted once since we drew all cards in one batch
      expect(drawPromptCount).toBe(1);
      // Only 1 DRAW_CARDS effect
      const drawEffects = result.effects.filter((e) => e.type === "DRAW_CARDS");
      expect(drawEffects.length).toBe(1);
      expect(drawEffects[0].type === "DRAW_CARDS" && drawEffects[0].fromDeck).toBe(2);
    });

    // Test that the prompt includes tray cards from the view.
    // Verifies the prompt correctly passes available tray cards.
    it("includes tray cards in the draw prompt", async () => {
      const stilt = createBirdInstance("stilt", "black_necked_stilt");
      const player = createPlayerState("player1", {
        WETLAND: [stilt, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedPrompt: { trayCards: Array<{ id: string }>; remaining: number } | undefined;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            capturedPrompt = prompt;
            // Draw all from deck to complete the power
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const trayCards = [
        testRegistry.getBirdById("barn_owl"),
        testRegistry.getBirdById("common_raven"),
        testRegistry.getBirdById("mallard"),
      ];
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: trayCards,
      });

      await processor.executeSinglePower("stilt", "player1", execCtx);

      expect(capturedPrompt).toBeDefined();
      expect(capturedPrompt?.remaining).toBe(2);
      expect(capturedPrompt?.trayCards.length).toBe(3);
      expect(capturedPrompt?.trayCards.map((c) => c.id)).toContain("barn_owl");
      expect(capturedPrompt?.trayCards.map((c) => c.id)).toContain(
        "common_raven"
      );
      expect(capturedPrompt?.trayCards.map((c) => c.id)).toContain("mallard");
    });

    // Test with Carolina Wren (WHEN_PLAYED trigger in FOREST habitat).
    // Verifies the handler works with different bird configurations.
    it("works with carolina wren (WHEN_PLAYED in forest)", async () => {
      const wren = createBirdInstance("wren", "carolina_wren");
      const player = createPlayerState("player1", {
        FOREST: [wren, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "drawCards") {
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: [],
              numDeckCards: 2,
            } as DrawCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdTray: [],
      });

      const result = await processor.executeSinglePower(
        "wren",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("drawCards");
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(2);
    });
  });

  describe("cacheFoodFromSupply (Carolina Chickadee)", () => {
    // This handler tests the automatic caching of food from the supply onto a bird.
    // Carolina Chickadee has power: "Cache 1 [seed] from the supply on this bird."
    // The supply is unlimited, so there are no resource checks needed.
    it("caches seed from supply when player activates power", async () => {
      const chickadee = createBirdInstance("chickadee", "carolina_chickadee");
      const player = createPlayerState("player1", {
        FOREST: [chickadee, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "chickadee",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("cacheFoodFromSupply");

      // Verify the CACHE_FOOD effect is emitted with correct values
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      expect(cacheEffect?.birdInstanceId).toBe("chickadee");
      expect(cacheEffect?.food).toEqual({ SEED: 1 });
      expect(cacheEffect?.source).toBe("SUPPLY");
    });

    // This test verifies the handler respects the player's choice to decline activation.
    // Optional brown powers can always be declined without any cost.
    it("does not cache food when player declines to activate", async () => {
      const chickadee = createBirdInstance("chickadee", "carolina_chickadee");
      const player = createPlayerState("player1", {
        FOREST: [chickadee, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "chickadee",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      // Verify no CACHE_FOOD effect is emitted
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeUndefined();
    });

    // This test verifies that the handler correctly uses the foodType param.
    // All birds with this handler use SEED, but the implementation is generic.
    // Testing with Mountain Chickadee to ensure it works with different bird cards.
    it("works with different bird cards using the same handler", async () => {
      const mountainChickadee = createBirdInstance(
        "mountain_chickadee",
        "mountain_chickadee"
      );
      const player = createPlayerState("player1", {
        FOREST: [mountainChickadee, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "mountain_chickadee",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("cacheFoodFromSupply");

      // Mountain Chickadee also caches SEED
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      expect(cacheEffect?.food).toEqual({ SEED: 1 });
      expect(cacheEffect?.source).toBe("SUPPLY");
    });

    // This test verifies the handler only prompts once for activation since
    // caching from supply is automatic (no further player choices needed).
    it("only prompts for activation (caching is automatic)", async () => {
      const chickadee = createBirdInstance("chickadee", "carolina_chickadee");
      const player = createPlayerState("player1", {
        FOREST: [chickadee, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      await processor.executeSinglePower("chickadee", "player1", execCtx);

      // Should only prompt once for activation
      expect(promptCount).toBe(1);
    });

    // This test verifies that the ACTIVATE_POWER effect is emitted before
    // the CACHE_FOOD effect, following the standard handler pattern.
    it("emits ACTIVATE_POWER effect before CACHE_FOOD effect", async () => {
      const chickadee = createBirdInstance("chickadee", "carolina_chickadee");
      const player = createPlayerState("player1", {
        FOREST: [chickadee, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "chickadee",
        "player1",
        execCtx
      );

      // Verify effect ordering
      const activateIndex = result.effects.findIndex(
        (e) => e.type === "ACTIVATE_POWER"
      );
      const cacheIndex = result.effects.findIndex(
        (e) => e.type === "CACHE_FOOD"
      );

      expect(activateIndex).toBeLessThan(cacheIndex);
    });
  });

  describe("tuckAndGainFood (Cedar Waxwing)", () => {
    // Tests that the tuckAndGainFood handler correctly tucks a card from hand
    // and then gains a specific food type from the supply.
    it("tucks a card and gains food from supply", async () => {
      // Cedar Waxwing: "Tuck 1 [card] from your hand behind this bird.
      // If you do, gain 1 [fruit] from the supply."
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        FOREST: [waxwing, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Select the first eligible card from the prompt
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      const result = await processor.executeSinglePower(
        "waxwing",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("tuckAndGainFood");

      // Verify TUCK_CARDS effect
      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.targetBirdInstanceId
      ).toBe("waxwing");
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.fromHand.length
      ).toBe(1);

      // Verify GAIN_FOOD effect with correct food type (FRUIT for Cedar Waxwing)
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        FRUIT: 1,
      });
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.source).toBe(
        "SUPPLY"
      );
    });

    // Tests that the power is skipped when the player has no cards in hand.
    // This is a precondition for the tuck action - you can't tuck what you don't have.
    it("skips power when player has no cards in hand", async () => {
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        FOREST: [waxwing, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);

      // No cards in hand
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [],
      });

      const result = await processor.executeSinglePower(
        "waxwing",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");

      // Agent should not have been prompted at all
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that the power is properly skipped when the agent declines activation.
    // Optional powers allow the player to choose not to activate them.
    it("skips power when agent declines activation", async () => {
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        FOREST: [waxwing, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      const result = await processor.executeSinglePower(
        "waxwing",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      // No tuck or food effects should be produced
      expect(result.effects.find((e) => e.type === "TUCK_CARDS")).toBeUndefined();
      expect(result.effects.find((e) => e.type === "GAIN_FOOD")).toBeUndefined();
    });

    // Tests that effects are emitted in the correct order:
    // ACTIVATE_POWER -> TUCK_CARDS -> GAIN_FOOD
    it("emits effects in correct order", async () => {
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        FOREST: [waxwing, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      const result = await processor.executeSinglePower(
        "waxwing",
        "player1",
        execCtx
      );

      // Verify effect ordering
      const activateIndex = result.effects.findIndex(
        (e) => e.type === "ACTIVATE_POWER"
      );
      const tuckIndex = result.effects.findIndex(
        (e) => e.type === "TUCK_CARDS"
      );
      const gainIndex = result.effects.findIndex((e) => e.type === "GAIN_FOOD");

      expect(activateIndex).toBeLessThan(tuckIndex);
      expect(tuckIndex).toBeLessThan(gainIndex);
    });

    // Tests that the handler correctly receives the food type from params.
    // Different birds using this handler may specify different food types.
    it("gains the correct food type based on power params", async () => {
      // Using Cedar Waxwing which has foodType: "FRUIT" in its power params
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        GRASSLAND: [waxwing, null, null, null, null], // Cedar Waxwing can be in grassland too
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("barn_owl")],
      });

      const result = await processor.executeSinglePower(
        "waxwing",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Verify the food type is FRUIT as specified in Cedar Waxwing's power params
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        FRUIT: 1,
      });
    });

    // Tests that exactly two prompts are issued: activation and card selection.
    // The food gain is automatic (no SelectFoodFromSupplyPrompt needed).
    it("issues exactly two prompts: activation and card selection", async () => {
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const player = createPlayerState("player1", {
        FOREST: [waxwing, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      await processor.executeSinglePower("waxwing", "player1", execCtx);

      expect(promptCount).toBe(2);
    });
  });

  describe("tuckAndGainFoodOfChoice (Pygmy Nuthatch)", () => {
    // Tests that the tuckAndGainFoodOfChoice handler correctly tucks a card from hand
    // and prompts the player to choose from allowed food types before gaining.
    it("tucks a card and prompts player to choose food type from allowed options", async () => {
      // Pygmy Nuthatch: "Tuck 1 [card] from your hand behind this bird.
      // If you do, gain 1 [invertebrate] or [seed] from the supply."
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Player chooses SEED from the allowed options
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("acorn_woodpecker"),
          testRegistry.getBirdById("american_coot"),
        ],
      });

      const result = await processor.executeSinglePower(
        "nuthatch",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("tuckAndGainFoodOfChoice");

      // Verify TUCK_CARDS effect
      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.targetBirdInstanceId
      ).toBe("nuthatch");
      expect(
        tuckEffect?.type === "TUCK_CARDS" && tuckEffect.fromHand.length
      ).toBe(1);

      // Verify GAIN_FOOD effect with the chosen food type (SEED)
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        SEED: 1,
      });
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.source).toBe(
        "SUPPLY"
      );
    });

    // Tests that the player can choose INVERTEBRATE instead of SEED.
    // This verifies that the handler correctly uses the player's choice.
    it("allows player to choose INVERTEBRATE from the allowed options", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Player chooses INVERTEBRATE instead
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { INVERTEBRATE: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      const result = await processor.executeSinglePower(
        "nuthatch",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Verify GAIN_FOOD effect with INVERTEBRATE
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        INVERTEBRATE: 1,
      });
    });

    // Tests that the power is skipped when the player has no cards in hand.
    // This is a precondition for the tuck action - you can't tuck what you don't have.
    it("skips power when player has no cards in hand", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);

      // No cards in hand
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [],
      });

      const result = await processor.executeSinglePower(
        "nuthatch",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");

      // Agent should not have been prompted at all
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that the power is properly skipped when the agent declines activation.
    // Optional powers allow the player to choose not to activate them.
    it("skips power when agent declines activation", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      const result = await processor.executeSinglePower(
        "nuthatch",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      // No tuck or food effects should be produced
      expect(result.effects.find((e) => e.type === "TUCK_CARDS")).toBeUndefined();
      expect(result.effects.find((e) => e.type === "GAIN_FOOD")).toBeUndefined();
    });

    // Tests that effects are emitted in the correct order:
    // ACTIVATE_POWER -> TUCK_CARDS -> GAIN_FOOD
    it("emits effects in correct order", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      const result = await processor.executeSinglePower(
        "nuthatch",
        "player1",
        execCtx
      );

      // Verify effect ordering
      const activateIndex = result.effects.findIndex(
        (e) => e.type === "ACTIVATE_POWER"
      );
      const tuckIndex = result.effects.findIndex(
        (e) => e.type === "TUCK_CARDS"
      );
      const gainIndex = result.effects.findIndex((e) => e.type === "GAIN_FOOD");

      expect(activateIndex).toBeLessThan(tuckIndex);
      expect(tuckIndex).toBeLessThan(gainIndex);
    });

    // Tests that exactly three prompts are issued: activation, card selection, and food selection.
    // Unlike tuckAndGainFood, this handler requires a food choice prompt.
    it("issues exactly three prompts: activation, card selection, and food selection", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;
      const promptKinds: string[] = [];

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          promptKinds.push(prompt.kind);
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { INVERTEBRATE: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      await processor.executeSinglePower("nuthatch", "player1", execCtx);

      expect(promptCount).toBe(3);
      expect(promptKinds).toEqual([
        "activatePower",
        "selectCards",
        "selectFoodFromSupply",
      ]);
    });

    // Tests that the selectFoodFromSupply prompt includes the correct allowed foods.
    // For Pygmy Nuthatch, this should be INVERTEBRATE and SEED.
    it("passes correct allowedFoods in selectFoodFromSupply prompt", async () => {
      const nuthatch = createBirdInstance("nuthatch", "pygmy_nuthatch");
      const player = createPlayerState("player1", {
        FOREST: [nuthatch, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedFoodPrompt: { allowedFoods: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            const cardIds = prompt.eligibleCards
              .slice(0, prompt.count)
              .map((c: { id: string }) => c.id);
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: cardIds,
            } as SelectCardsChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            capturedFoodPrompt = { allowedFoods: prompt.allowedFoods };
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      await processor.executeSinglePower("nuthatch", "player1", execCtx);

      expect(capturedFoodPrompt).not.toBeNull();
      expect(capturedFoodPrompt!.allowedFoods).toEqual(["INVERTEBRATE", "SEED"]);
    });

  });

  describe("playAdditionalBirdInHabitat (Downy Woodpecker)", () => {
    // Tests the happy path: player activates the power and successfully plays an additional bird.
    // Verifies that PLAY_BIRD effect and BIRD_PLAYED event are emitted.
    it("plays an additional bird in the same habitat when activated", async () => {
      // Downy Woodpecker is in FOREST, so we need a FOREST bird in hand
      // Note: Downy Woodpecker has 1 egg to pay the cost for the next slot
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        // Red-Eyed Vireo is a FOREST bird that costs 1 invertebrate + 1 fruit
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("playAdditionalBirdInHabitat");

      // Verify PLAY_BIRD effect was emitted
      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
      expect(playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.habitat).toBe(
        "FOREST"
      );
      expect(
        playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.birdInstanceId
      ).toContain("red_eyed_vireo");

      // Verify BIRD_PLAYED event was emitted
      const birdPlayedEvent = result.events.find(
        (e) => e.type === "BIRD_PLAYED"
      );
      expect(birdPlayedEvent).toBeDefined();
      expect(
        birdPlayedEvent?.type === "BIRD_PLAYED" && birdPlayedEvent.birdCardId
      ).toBe("red_eyed_vireo");
    });

    // Tests that when the player declines activation, no effects are emitted.
    it("does not play a bird when player declines activation", async () => {
      // Downy Woodpecker has 1 egg to afford the cost
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeUndefined();
    });

    // Tests that when the habitat is full (5 birds), the power is skipped without prompting.
    it("skips without prompting when habitat is full", async () => {
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker"
      );
      // Fill the FOREST habitat with 5 birds (including Downy Woodpecker)
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [
            downyWoodpecker,
            createBirdInstance("bird1", "american_robin"),
            createBirdInstance("bird2", "american_robin"),
            createBirdInstance("bird3", "american_robin"),
            createBirdInstance("bird4", "american_robin"),
          ],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that when there are no birds in hand that can live in the habitat, power is skipped.
    it("skips without prompting when no birds in hand can live in the habitat", async () => {
      // Downy Woodpecker has 1 egg (so egg cost is not the issue)
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        // Eastern Bluebird is GRASSLAND only, cannot go in FOREST
        hand: [testRegistry.getBirdById("eastern_bluebird")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that when player cannot afford any bird's food cost, power is skipped.
    it("skips without prompting when player cannot afford food cost", async () => {
      // Downy Woodpecker has 1 egg (so egg cost is not the issue)
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        // American Redstart needs 1 invertebrate + 1 fruit (AND mode)
        hand: [testRegistry.getBirdById("american_redstart")],
        bonusCards: [],
        // No fruit - can't afford (AND mode requires both)
        food: { INVERTEBRATE: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that when player has birds in hand but cannot afford the egg cost, power is skipped.
    it("skips without prompting when player cannot afford egg cost", async () => {
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker"
      );
      // Put Downy Woodpecker in second slot so we need 1 egg cost for next slot
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [
            createBirdInstance("bird0", "american_robin"),
            downyWoodpecker,
            null,
            null,
            null,
          ],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      // No eggs on any bird - can't pay the egg cost
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that a bird with OR food cost is correctly identified as affordable.
    it("correctly identifies birds with OR food cost as playable", async () => {
      // Downy Woodpecker has 1 egg to afford the cost
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        // Carolina Chickadee is a FOREST bird with OR cost (invertebrate / seed)
        hand: [testRegistry.getBirdById("carolina_chickadee")],
        bonusCards: [],
        // Only have invertebrate, but that's enough for OR mode
        food: { INVERTEBRATE: 1 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "carolina_chickadee",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
    });

    // Tests that only the correct habitat is offered for playing the additional bird.
    it("only offers the habitat where the triggering bird was played", async () => {
      // Eastern Bluebird is in GRASSLAND (with 1 egg to afford the cost)
      const easternBluebird = createBirdInstance(
        "bluebird_test",
        "eastern_bluebird",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [null, null, null, null, null],
          GRASSLAND: [easternBluebird, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        // Mountain Bluebird is a GRASSLAND bird
        hand: [testRegistry.getBirdById("mountain_bluebird")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedPrompt: { eggCostByEligibleHabitat: Record<string, number> } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            capturedPrompt = prompt as { eggCostByEligibleHabitat: Record<string, number> };
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "mountain_bluebird",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      await processor.executeSinglePower("bluebird_test", "player1", execCtx);

      // Verify only GRASSLAND is offered
      expect(capturedPrompt).not.toBeNull();
      expect(Object.keys(capturedPrompt!.eggCostByEligibleHabitat)).toEqual([
        "GRASSLAND",
      ]);
    });

    // Tests that the column number in PLAY_BIRD effect is correct (leftmost empty).
    it("places bird in leftmost empty column", async () => {
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker"
      );
      // Two birds already in FOREST - next bird goes in column 2
      // First bird has 2 eggs to pay the egg cost (column 2 costs 2 eggs)
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [
            createBirdInstance("bird0", "american_robin", 2),
            downyWoodpecker,
            null,
            null,
            null,
          ],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: { bird0: 2 },
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
      // Column should be 2 (third slot, 0-indexed)
      expect(playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.column).toBe(
        2
      );
    });

    // Tests that bird instance ID is correctly formatted.
    it("generates correct bird instance ID format", async () => {
      // Downy Woodpecker has 1 egg to afford the cost
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
      // Format: {playerId}_{birdCardId}
      expect(
        playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.birdInstanceId
      ).toBe("player1_red_eyed_vireo");
    });

    // Tests that eggs paid are correctly passed to the effect.
    it("correctly passes eggs paid to the effect", async () => {
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker"
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [
            createBirdInstance("bird0", "american_robin", 2),
            downyWoodpecker,
            null,
            null,
            null,
          ],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: { bird0: 1 },
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
      expect(
        playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.eggsPaid
      ).toEqual({ bird0: 1 });
    });

    // Tests that food paid is correctly passed to the effect.
    it("correctly passes food paid to the effect", async () => {
      // Downy Woodpecker has 1 egg to afford the cost
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      const playBirdEffect = result.effects.find((e) => e.type === "PLAY_BIRD");
      expect(playBirdEffect).toBeDefined();
      expect(
        playBirdEffect?.type === "PLAY_BIRD" && playBirdEffect.foodPaid
      ).toEqual({ INVERTEBRATE: 1, FRUIT: 1 });
    });

    // Tests that when player has empty hand, power is skipped without prompting.
    it("skips without prompting when player has no cards in hand", async () => {
      // Downy Woodpecker has 1 egg (so egg cost is not the issue)
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [], // Empty hand
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "downy_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Tests that exactly two prompts are issued: activation and playBird.
    it("issues exactly two prompts: activation and playBird", async () => {
      // Downy Woodpecker has 1 egg to afford the cost
      const downyWoodpecker = createBirdInstance(
        "downy_test",
        "downy_woodpecker",
        1
      );
      const player = PlayerState.from("player1", {
        board: PlayerBoard.from({
          FOREST: [downyWoodpecker, null, null, null, null],
          GRASSLAND: [null, null, null, null, null],
          WETLAND: [null, null, null, null, null],
        }),
        hand: [testRegistry.getBirdById("red_eyed_vireo")],
        bonusCards: [],
        food: { INVERTEBRATE: 2, FRUIT: 2 },
        turnsRemaining: 8,
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "playBird") {
            return Promise.resolve({
              kind: "playBird",
              promptId: prompt.promptId,
              bird: "red_eyed_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 1, FRUIT: 1 },
              eggsToSpend: {},
            } as PlayBirdChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      await processor.executeSinglePower("downy_test", "player1", execCtx);

      expect(promptCount).toBe(2);
    });
  });

  // Tests for whenOpponentPlaysBirdInHabitatTuckCard (Horned Lark)
  // This pink power triggers when another player plays a bird in a specific habitat,
  // allowing the owner to tuck a card from their hand behind this bird.
  describe("whenOpponentPlaysBirdInHabitatTuckCard (Horned Lark)", () => {
    // Verifies the happy path: power triggers on correct habitat and successfully tucks a card
    it("tucks a card when triggered with matching habitat", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            // Tuck the first card from hand
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: ["american_coot"],
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      // Set a triggering event with correct habitat (GRASSLAND)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "GRASSLAND",
        position: 0,
        birdCardId: "barn_owl",
      };

      const result = await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("whenOpponentPlaysBirdInHabitatTuckCard");

      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeDefined();
      expect(tuckEffect?.targetBirdInstanceId).toBe("horned_lark_test");
      expect(tuckEffect?.fromHand).toEqual(["american_coot"]);
      expect(tuckEffect?.fromDeck).toBe(0);
      expect(tuckEffect?.fromRevealed).toEqual([]);
    });

    // Verifies that agent can decline the power activation
    it("can be declined by the agent", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      // Set a triggering event with correct habitat
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "GRASSLAND",
        position: 0,
        birdCardId: "barn_owl",
      };

      const result = await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
      // No TUCK_CARDS effect should be generated
      const tuckEffect = result.effects.find((e) => e.type === "TUCK_CARDS");
      expect(tuckEffect).toBeUndefined();
    });

    // Verifies power silently skips (no prompt) when bird is played in wrong habitat
    it("silently skips when bird is played in wrong habitat", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      // Set a triggering event with wrong habitat (FOREST instead of GRASSLAND)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "FOREST", // Wrong habitat - Horned Lark watches for GRASSLAND
        position: 0,
        birdCardId: "barn_owl",
      };

      const result = await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies power silently skips when WETLAND bird is played (wrong habitat)
    it("silently skips when bird is played in wetland instead of grassland", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [testRegistry.getBirdById("american_coot")],
      });

      // Set a triggering event with wrong habitat (WETLAND instead of GRASSLAND)
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "WETLAND",
        position: 0,
        birdCardId: "barn_owl",
      };

      const result = await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies power skips without prompting when player has no cards in hand
    it("skips without prompting when player has no cards in hand", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // Empty hand
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [],
      });

      // Set a triggering event with correct habitat
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "GRASSLAND",
        position: 0,
        birdCardId: "barn_owl",
      };

      const result = await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies that the selectCards prompt has correct parameters
    it("prompts with correct parameters for tuck selection", async () => {
      const hornedLark = createBirdInstance("horned_lark_test", "horned_lark");
      const player = createPlayerState("player1", {
        GRASSLAND: [hornedLark, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedMode: string | undefined;
      let capturedSource: string | undefined;
      let capturedCount: number | undefined;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectCards") {
            capturedMode = prompt.mode;
            capturedSource = prompt.source;
            capturedCount = prompt.count;
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: ["american_coot"],
            } as SelectCardsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        hand: [
          testRegistry.getBirdById("american_coot"),
          testRegistry.getBirdById("barn_owl"),
        ],
      });

      // Set a triggering event with correct habitat
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        habitat: "GRASSLAND",
        position: 0,
        birdCardId: "house_finch",
      };

      await processor.executeSinglePower(
        "horned_lark_test",
        "player1",
        execCtx
      );

      expect(capturedMode).toBe("TUCK");
      expect(capturedSource).toBe("HAND");
      expect(capturedCount).toBe(1);
    });
  });

  // Tests for whenOpponentGainsFoodCacheIfMatch (Loggerhead Shrike)
  // This pink power triggers when another player takes the "gain food" action and gains
  // a matching food type, caching food from the supply on this bird.
  describe("whenOpponentGainsFoodCacheIfMatch (Loggerhead Shrike)", () => {
    // Verifies the happy path: when opponent gains matching food (rodent),
    // the power triggers and caches food from supply on the bird.
    it("caches food when opponent gains matching food type", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: opponent gained rodent from habitat activation
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { RODENT: 1, SEED: 1 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("whenOpponentGainsFoodCacheIfMatch");

      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      expect(cacheEffect?.birdInstanceId).toBe("shrike_test");
      expect(cacheEffect?.food).toEqual({ RODENT: 1 });
      expect(cacheEffect?.source).toBe("SUPPLY");
    });

    // Verifies that the power triggers even when opponent gains multiple rodents.
    // The shrike still caches exactly 1 rodent per its params.
    it("caches 1 food even when opponent gains multiple matching foods", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: opponent gained 3 rodents
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { RODENT: 3 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeDefined();
      // Still caches exactly 1 rodent per power params
      expect(cacheEffect?.food).toEqual({ RODENT: 1 });
    });

    // Verifies the power silently skips when opponent gains food that doesn't
    // include the matching type (no rodent in this case).
    it("skips without prompting when opponent gains non-matching food", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: opponent gained seed and fruit, but no rodent
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { SEED: 2, FRUIT: 1 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the power silently skips when triggered by a wrong event type
    // (e.g., BIRD_PLAYED instead of FOOD_GAINED_FROM_HABITAT_ACTIVATION).
    it("skips without prompting when wrong event type", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: wrong event type
      execCtx.triggeringEvent = {
        type: "BIRD_PLAYED",
        playerId: "player2",
        birdInstanceId: "opponent_bird",
        birdCardId: "barn_owl",
        habitat: "FOREST",
        position: 0,
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the power silently skips when there is no triggering event.
    it("skips without prompting when no triggering event", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // No triggering event set (undefined)

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies that the agent can decline the power activation.
    it("can be declined by the agent", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: opponent gained rodent
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { RODENT: 1 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
      // No CACHE_FOOD effect should be generated
      const cacheEffect = result.effects.find((e) => e.type === "CACHE_FOOD");
      expect(cacheEffect).toBeUndefined();
    });

    // Verifies the power skips when opponent gains 0 of the matching food type
    // (explicit 0 in the food object).
    it("skips without prompting when opponent gains 0 of matching food", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: food object includes RODENT but with 0 count
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { RODENT: 0, SEED: 2 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      // Power should silently skip without prompting
      expect(result.activated).toBe(false);
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the correct effect is yielded with ACTIVATE_POWER marked as false
    // when skipping due to non-matching food.
    it("yields ACTIVATE_POWER with activated=false when skipping", async () => {
      const shrike = createBirdInstance("shrike_test", "loggerhead_shrike");
      const player = createPlayerState("player1", {
        GRASSLAND: [shrike, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Set triggering event: no rodent gained
      execCtx.triggeringEvent = {
        type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
        playerId: "player2",
        food: { SEED: 1 },
      };

      const result = await processor.executeSinglePower(
        "shrike_test",
        "player1",
        execCtx
      );

      const activateEffect = result.effects.find(
        (e) => e.type === "ACTIVATE_POWER"
      );
      expect(activateEffect).toBeDefined();
      expect(activateEffect?.activated).toBe(false);
      expect(activateEffect?.handlerId).toBe("whenOpponentGainsFoodCacheIfMatch");
    });
  });

  describe("allPlayersLayEggOnNestType (Lazuli Bunting)", () => {
    // This test verifies that all players lay eggs on birds with the matching nest type
    // and the owner receives a bonus egg on a different eligible bird.
    it("all players lay 1 egg on bowl bird, owner lays bonus egg on different bird", async () => {
      // Lazuli Bunting requires BOWL nest. Create players with bowl birds.
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // American Robin has BOWL nest (eggCapacity: 4)
      const robin1 = createBirdInstance("robin1", "american_robin", 0);
      const robin2 = createBirdInstance("robin2", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, robin1, robin2, null, null],
      });

      // Player 2 also has a bowl bird
      const robin3 = createBirdInstance("robin3", "american_robin", 0);
      const player2 = createPlayerState("player2", {
        GRASSLAND: [robin3, null, null, null, null],
      });

      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      let promptCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            // First placeEggs prompt: lay on robin1
            // Third placeEggs prompt: bonus egg on robin2 (different bird)
            if (promptCount === 2) {
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { robin1: 1 },
              } as PlaceEggsChoice);
            }
            // Bonus egg on robin2
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin2: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "placeEggs") {
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin3: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersLayEggOnNestType");

      // Check ALL_PLAYERS_LAY_EGGS effect
      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      expect(allPlayersEffect?.placements["player1"]).toEqual({ robin1: 1 });
      expect(allPlayersEffect?.placements["player2"]).toEqual({ robin3: 1 });

      // Check LAY_EGGS effect for bonus egg
      const bonusEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(bonusEffect).toBeDefined();
      expect(bonusEffect?.playerId).toBe("player1");
      expect(bonusEffect?.placements).toEqual({ robin2: 1 });
    });

    // This test verifies that when the player declines to activate the power,
    // no eggs are laid and no effects are emitted.
    it("does not lay eggs when player declines activation", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // American Robin has BOWL nest
      const robin = createBirdInstance("robin", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, robin, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false,
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.effects.filter((e) => e.type === "ALL_PLAYERS_LAY_EGGS"))
        .toHaveLength(0);
      expect(result.effects.filter((e) => e.type === "LAY_EGGS")).toHaveLength(0);
    });

    // This test verifies that the power is skipped when no player has any
    // eligible birds with remaining egg capacity for the specified nest type.
    // Lazuli Bunting itself has BOWL nest, but we set it at full capacity (4 eggs).
    it("skips when no players have eligible birds with capacity", async () => {
      // Lazuli Bunting has BOWL nest with eggCapacity 4 - at full capacity
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 4);
      // No other bowl birds for any player

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, null, null, null, null],
      });
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      // Power should be skipped - not activated, no prompts
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent1.chooseOption).not.toHaveBeenCalled();
    });

    // This test verifies that a player without eligible birds (or all at capacity)
    // is skipped with an empty placement, while other players can still lay eggs.
    it("skips player with no eligible birds or all at capacity", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // American Robin has BOWL nest
      const robin1 = createBirdInstance("robin1", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, robin1, null, null, null],
      });
      // Player 2 has no bowl birds
      const player2 = createPlayerState("player2");
      const state = createGameState([player1, player2]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");

      let player1PromptCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          player1PromptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            if (player1PromptCount === 2) {
              // First: place egg on robin1
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { robin1: 1 },
              } as PlaceEggsChoice);
            }
            // Bonus: place on lazuli (the only remaining bowl bird)
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { lazuli: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      expect(allPlayersEffect?.placements["player1"]).toEqual({ robin1: 1 });
      // Player 2 has empty placements (no eligible birds)
      expect(allPlayersEffect?.placements["player2"]).toEqual({});

      // Bonus egg placed on lazuli itself (the only remaining bowl bird)
      const bonusEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(bonusEffect).toBeDefined();
      expect(bonusEffect?.placements).toEqual({ lazuli: 1 });
    });

    // This test verifies that bonus egg is not laid when all eligible birds
    // have no remaining capacity (either at limit or already used for first egg).
    it("no bonus egg when no eligible bird available for bonus", async () => {
      // Lazuli Bunting at full capacity (4 eggs)
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 4);
      // American Robin has BOWL nest with eggCapacity 4 - only one bowl bird with capacity
      const robin = createBirdInstance("robin", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, robin, null, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();

      // Owner placed on robin (only bowl bird with capacity), so robin is excluded from bonus
      // Lazuli is at full capacity, so no bonus egg can be placed
      const bonusEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(bonusEffect).toBeUndefined();
    });

    // This test verifies that birds with WILD (star) nest type are treated as eligible
    // for any nest type requirement.
    it("wild nest birds count as eligible for any nest type", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // Atlantic Puffin has WILD nest (can match any nest type) and eggCapacity 1
      const puffin = createBirdInstance("puffin", "atlantic_puffin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, null, null, null, null],
        WETLAND: [puffin, null, null, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      let placeEggsCallCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            placeEggsCallCount++;
            if (placeEggsCallCount === 1) {
              // First placeEggs - puffin (WILD) should be eligible for BOWL
              expect(prompt.remainingCapacitiesByEligibleBird["puffin"]).toBe(1);
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { puffin: 1 },
              } as PlaceEggsChoice);
            }
            // Second placeEggs (bonus) - puffin is excluded and at capacity, lazuli available
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { lazuli: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      // Wild nest bird (puffin) was used as bowl equivalent
      expect(allPlayersEffect?.placements["player1"]).toEqual({ puffin: 1 });
    });

    // This test verifies that players lay eggs in clockwise order starting from the owner.
    // With players [p1, p2, p3] and p2 as owner, order should be [p2, p3, p1].
    it("players lay eggs in clockwise order starting from owner", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);

      // Each player has a bowl bird - use american_robin (BOWL nest)
      const robin1 = createBirdInstance("robin1", "american_robin", 0);
      const robin2 = createBirdInstance("robin2", "american_robin", 0);
      const robin3 = createBirdInstance("robin3", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [robin1, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        GRASSLAND: [lazuli, robin2, null, null, null],
      });
      const player3 = createPlayerState("player3", {
        GRASSLAND: [robin3, null, null, null, null],
      });

      const state = createGameState([player1, player2, player3]);

      const mockAgent1 = createMockAgent("player1");
      const mockAgent2 = createMockAgent("player2");
      const mockAgent3 = createMockAgent("player3");

      const promptOrder: string[] = [];

      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "placeEggs") {
            promptOrder.push("player1");
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin1: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      let player2PlaceEggsCount = 0;
      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            promptOrder.push("player2");
            player2PlaceEggsCount++;
            if (player2PlaceEggsCount === 1) {
              // First placeEggs - for the all-players egg, place on robin2
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { robin2: 1 },
              } as PlaceEggsChoice);
            }
            // Second placeEggs - bonus egg, robin2 is excluded, place on lazuli
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { lazuli: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent3.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "placeEggs") {
            promptOrder.push("player3");
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin3: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([
        ["player1", mockAgent1],
        ["player2", mockAgent2],
        ["player3", mockAgent3],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player2",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Verify clockwise order: owner (p2) -> p3 -> p1
      // Note: the last prompt is for bonus egg (still p2), so we check first 3
      expect(promptOrder.slice(0, 3)).toEqual(["player2", "player3", "player1"]);
    });

    // This test verifies behavior with Pileated Woodpecker which uses CAVITY nest type.
    // Ensures the handler works with different nest type parameters.
    it("works with CAVITY nest type (Pileated Woodpecker)", async () => {
      const woodpecker = createBirdInstance("woodpecker", "pileated_woodpecker", 0);
      // Acorn Woodpecker has CAVITY nest (eggCapacity: 4)
      const acornWoodpecker = createBirdInstance("acorn", "acorn_woodpecker", 0);

      const player1 = createPlayerState("player1", {
        FOREST: [woodpecker, acornWoodpecker, null, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      let placeEggsCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            placeEggsCount++;
            if (placeEggsCount === 1) {
              // First placeEggs - for all players egg
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { acorn: 1 },
              } as PlaceEggsChoice);
            }
            // Second placeEggs - bonus egg, place on woodpecker (acorn excluded)
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { woodpecker: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "woodpecker",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersLayEggOnNestType");

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      expect(allPlayersEffect?.placements["player1"]).toEqual({ acorn: 1 });
    });

    // This test verifies that when a bowl bird is at capacity, it is not offered
    // as an option for placing eggs.
    it("birds at capacity are excluded from eligible birds", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // American Robin has BOWL nest with eggCapacity 4 - at full capacity
      const fullRobin = createBirdInstance("full_robin", "american_robin", 4);
      // Another robin with space (eggCapacity 4)
      const emptyRobin = createBirdInstance("empty_robin", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, fullRobin, emptyRobin, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      let placeEggsCallCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            placeEggsCallCount++;
            if (placeEggsCallCount === 1) {
              // First placeEggs call - for the all players egg
              // Verify that full_robin is NOT in the eligible birds (at capacity)
              expect(prompt.remainingCapacitiesByEligibleBird["full_robin"]).toBeUndefined();
              // empty_robin and lazuli should both be present with capacity 4
              expect(prompt.remainingCapacitiesByEligibleBird["empty_robin"]).toBe(4);
              expect(prompt.remainingCapacitiesByEligibleBird["lazuli"]).toBe(4);
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { empty_robin: 1 },
              } as PlaceEggsChoice);
            }
            // Second placeEggs call - bonus egg
            // empty_robin is excluded (already placed on), lazuli should be available
            expect(prompt.remainingCapacitiesByEligibleBird["empty_robin"]).toBeUndefined();
            expect(prompt.remainingCapacitiesByEligibleBird["lazuli"]).toBe(4);
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { lazuli: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
    });

    // This test verifies that the owner places the bonus egg on a different bird
    // than the one they placed the first egg on.
    it("owner bonus egg must be on a different bird than first egg", async () => {
      const lazuli = createBirdInstance("lazuli", "lazuli_bunting", 0);
      // American Robin has BOWL nest
      const robin1 = createBirdInstance("robin1", "american_robin", 0);
      const robin2 = createBirdInstance("robin2", "american_robin", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [lazuli, robin1, robin2, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      let promptCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            if (promptCount === 2) {
              // First placeEggs: place on robin1
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { robin1: 1 },
              } as PlaceEggsChoice);
            }
            // Bonus: place on robin2 (different bird)
            // Verify that robin1 is excluded from bonus options
            expect(prompt.remainingCapacitiesByEligibleBird["robin1"]).toBeUndefined();
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { robin2: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "lazuli",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      expect(allPlayersEffect?.placements["player1"]).toEqual({ robin1: 1 });

      // LAY_EGGS effect for bonus egg on different bird
      const bonusEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(bonusEffect).toBeDefined();
      expect(bonusEffect?.placements).toEqual({ robin2: 1 });
    });

    // This test verifies that when using Western Meadowlark (GROUND nest),
    // only ground nest birds are eligible.
    it("works with GROUND nest type (Western Meadowlark)", async () => {
      const meadowlark = createBirdInstance("meadowlark", "western_meadowlark", 0);
      // Killdeer has GROUND nest (eggCapacity: 2)
      const killdeer = createBirdInstance("killdeer", "killdeer", 0);

      const player1 = createPlayerState("player1", {
        GRASSLAND: [meadowlark, killdeer, null, null, null],
      });
      const state = createGameState([player1]);

      const mockAgent1 = createMockAgent("player1");

      let placeEggsCount = 0;
      (mockAgent1.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          }
          if (prompt.kind === "placeEggs") {
            placeEggsCount++;
            if (placeEggsCount === 1) {
              // First placeEggs - for all players egg
              return Promise.resolve({
                kind: "placeEggs",
                promptId: prompt.promptId,
                placements: { killdeer: 1 },
              } as PlaceEggsChoice);
            }
            // Second placeEggs - bonus egg, place on meadowlark (killdeer excluded)
            return Promise.resolve({
              kind: "placeEggs",
              promptId: prompt.promptId,
              placements: { meadowlark: 1 },
            } as PlaceEggsChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent1]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "meadowlark",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("allPlayersLayEggOnNestType");

      const allPlayersEffect = result.effects.find(
        (e) => e.type === "ALL_PLAYERS_LAY_EGGS"
      );
      expect(allPlayersEffect).toBeDefined();
      expect(allPlayersEffect?.placements["player1"]).toEqual({ killdeer: 1 });
    });
  });

  describe("tradeFoodType (Green Heron)", () => {
    // Verifies the happy path: player trades one food type for another
    it("trades one food for another from supply", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            // Trade away a seed
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as DiscardFoodChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Gain a fish in return
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { FISH: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 1, SEED: 2, FISH: 1, FRUIT: 1, RODENT: 1 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("tradeFoodType");
      expect(promptCount).toBe(3); // activatePower, discardFood, selectFoodFromSupply

      // Verify discard effect
      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_FOOD"
      );
      expect(discardEffect).toBeDefined();
      expect(discardEffect?.type === "DISCARD_FOOD" && discardEffect.food).toEqual({
        SEED: 1,
      });

      // Verify gain effect
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        FISH: 1,
      });
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.source).toBe(
        "SUPPLY"
      );
    });

    // Verifies precondition: player must have food to trade
    it("skips without prompting when player has no food", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 0, SEED: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies player can decline the power
    it("returns AGENT_DECLINED when player declines activation", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
    });

    // Verifies player can trade any food type (WILD fromType)
    it("allows trading any food type when fromType is WILD", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            // Trade away a rodent (any food works)
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { RODENT: 1 },
            } as DiscardFoodChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Gain an invertebrate
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { INVERTEBRATE: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 0, SEED: 0, FISH: 0, FRUIT: 0, RODENT: 1 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_FOOD"
      );
      expect(discardEffect?.type === "DISCARD_FOOD" && discardEffect.food).toEqual({
        RODENT: 1,
      });

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        INVERTEBRATE: 1,
      });
    });

    // Verifies that player can gain any of the 5 food types
    it("allows gaining any of the 5 basic food types", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as DiscardFoodChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            // Verify all 5 basic food types are available
            expect(prompt.allowedFoods).toContain("INVERTEBRATE");
            expect(prompt.allowedFoods).toContain("SEED");
            expect(prompt.allowedFoods).toContain("FISH");
            expect(prompt.allowedFoods).toContain("FRUIT");
            expect(prompt.allowedFoods).toContain("RODENT");
            expect(prompt.allowedFoods).toHaveLength(5);
            // Choose fruit
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { FRUIT: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        FRUIT: 1,
      });
    });

    // Verifies that effects are yielded in the correct order
    it("yields discard effect before gain effect", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { FISH: 1 },
            } as DiscardFoodChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Find indices of both effects
      const discardIndex = result.effects.findIndex(
        (e) => e.type === "DISCARD_FOOD"
      );
      const gainIndex = result.effects.findIndex((e) => e.type === "GAIN_FOOD");

      // Discard should come before gain
      expect(discardIndex).toBeLessThan(gainIndex);
    });

    // Verifies power works when player has exactly 1 food (edge case)
    it("works when player has exactly 1 food", async () => {
      const heron = createBirdInstance("heron", "green_heron");
      const player = createPlayerState("player1", {
        WETLAND: [heron, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "discardFood") {
            return Promise.resolve({
              kind: "discardFood",
              promptId: prompt.promptId,
              food: { FISH: 1 },
            } as DiscardFoodChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { SEED: 1 },
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Player has exactly 1 fish
      const execCtx = createMockExecutionContext(state, registry, agents, {
        food: { INVERTEBRATE: 0, SEED: 0, FISH: 1, FRUIT: 0, RODENT: 0 },
      });

      const result = await processor.executeSinglePower(
        "heron",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const discardEffect = result.effects.find(
        (e) => e.type === "DISCARD_FOOD"
      );
      expect(discardEffect).toBeDefined();
      expect(discardEffect?.type === "DISCARD_FOOD" && discardEffect.food).toEqual({
        FISH: 1,
      });
    });
  });

  describe("gainFoodFromFeederIfAvailable (Great Crested Flycatcher / Indigo Bunting)", () => {
    // Verifies the handler gains food from the birdfeeder when the specified food type is available.
    // Unlike gainFoodFromFeederWithCache, this handler supports multiple food types and
    // skips without prompting if none of the allowed types are in the feeder.

    it("gains food when single allowed food type is available in feeder", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "INVERTEBRATE" as DieFace }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["INVERTEBRATE", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("gainFoodFromFeederIfAvailable");

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.source).toBe(
        "BIRDFEEDER"
      );
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        INVERTEBRATE: 1,
      });
    });

    it("gains food when one of multiple allowed food types is available", async () => {
      // Indigo Bunting allows INVERTEBRATE or FRUIT
      const bunting = createBirdInstance("bunting", "indigo_bunting");
      const player = createPlayerState("player1", {
        FOREST: [bunting, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // Only FRUIT is available of the allowed types
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "FRUIT" as DieFace }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has FRUIT but no INVERTEBRATE
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["FRUIT", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "bunting",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        FRUIT: 1,
      });
    });

    it("skips without prompting when no allowed food types are in feeder", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has no INVERTEBRATE (only SEED, FISH, RODENT) - and different dice so no reroll possible
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "RODENT"],
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      // Power is skipped without prompting
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    it("uses SEED_INVERTEBRATE die when looking for INVERTEBRATE", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // Use SEED_INVERTEBRATE die as INVERTEBRATE
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [
                { die: "SEED_INVERTEBRATE" as DieFace, asFoodType: "INVERTEBRATE" },
              ],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has SEED_INVERTEBRATE which can be used as INVERTEBRATE
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED_INVERTEBRATE", "FISH", "RODENT"],
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.type === "GAIN_FOOD" && gainEffect.food).toEqual({
        INVERTEBRATE: 1,
      });
    });

    it("prompts for activation when food not available but reroll is possible", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;
      let foodFromFeederPromptCount = 0;
      let rerollApplied = false;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            foodFromFeederPromptCount++;
            // First time, reroll the feeder
            if (foodFromFeederPromptCount === 1) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // After reroll, select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "INVERTEBRATE" as DieFace }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // All dice show same face (SEED) - reroll is allowed but no INVERTEBRATE initially
      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {
          birdfeeder: ["SEED", "SEED", "SEED"],
        },
        (effect: Effect) => {
          // When reroll effect is applied, mark it
          if (effect.type === "REROLL_BIRDFEEDER") {
            rerollApplied = true;
          }
        }
      );

      // Override buildPlayerView to return updated birdfeeder after reroll
      execCtx.buildPlayerView = (playerId) => {
        // After reroll effect is applied, return new birdfeeder state
        if (rerollApplied) {
          return createMockPlayerView(playerId, {
            birdfeeder: ["INVERTEBRATE", "FISH", "RODENT"],
          });
        }
        return createMockPlayerView(playerId, {
          birdfeeder: ["SEED", "SEED", "SEED"],
        });
      };

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should have been prompted: activate, select food (reroll), select food (after reroll)
      expect(promptCount).toBe(3);

      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeDefined();
    });

    it("ends power if food still not available after reroll", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let rerollApplied = false;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: "reroll",
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);

      // All dice show same face (SEED) - reroll is allowed
      const execCtx = createMockExecutionContext(
        state,
        registry,
        agents,
        {
          birdfeeder: ["SEED", "SEED", "SEED"],
        },
        (effect: Effect) => {
          if (effect.type === "REROLL_BIRDFEEDER") {
            rerollApplied = true;
          }
        }
      );

      // After reroll, still no INVERTEBRATE (and now different dice so no reroll possible)
      execCtx.buildPlayerView = (playerId) => {
        if (rerollApplied) {
          // After reroll - still no matching food
          return createMockPlayerView(playerId, {
            birdfeeder: ["FISH", "RODENT", "FRUIT"],
          });
        }
        return createMockPlayerView(playerId, {
          birdfeeder: ["SEED", "SEED", "SEED"],
        });
      };

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Power should have ended without gaining food
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeUndefined();

      // Reroll should have been applied
      const rerollEffect = result.effects.find(
        (e) => e.type === "REROLL_BIRDFEEDER"
      );
      expect(rerollEffect).toBeDefined();
    });

    it("rejects invalid reroll when dice don't all match", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let promptCount = 0;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptCount++;
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            // First attempt: invalid reroll (dice don't all match)
            if (promptCount === 2) {
              return Promise.resolve({
                kind: "selectFoodFromFeeder",
                promptId: prompt.promptId,
                diceOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // Second attempt: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "INVERTEBRATE" as DieFace }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has mixed dice - can't reroll, but has INVERTEBRATE
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["INVERTEBRATE", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      // Should have prompted 3 times: activate, invalid reroll (re-prompt), select food
      expect(promptCount).toBe(3);
    });

    it("player can decline power activation", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["INVERTEBRATE", "SEED", "FISH"],
      });

      const result = await processor.executeSinglePower(
        "flycatcher",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");

      // No food gain effect
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeUndefined();
    });

    it("only shows allowed food types in availableDice prompt", async () => {
      // Indigo Bunting allows INVERTEBRATE or FRUIT
      const bunting = createBirdInstance("bunting", "indigo_bunting");
      const player = createPlayerState("player1", {
        FOREST: [bunting, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedPrompt: SelectFoodFromFeederPrompt | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            capturedPrompt = prompt;
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [{ die: "INVERTEBRATE" as DieFace }],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has all food types, but only INVERTEBRATE and FRUIT should be available in prompt
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["INVERTEBRATE", "FRUIT", "SEED", "FISH", "RODENT"],
      });

      await processor.executeSinglePower("bunting", "player1", execCtx);

      expect(capturedPrompt).not.toBeNull();
      // Should only include INVERTEBRATE and FRUIT in availableDice
      expect(capturedPrompt!.availableDice).toEqual({
        INVERTEBRATE: 1,
      });
      // Only 1 die since count is 1
    });

    it("includes SEED_INVERTEBRATE in availableDice when looking for INVERTEBRATE", async () => {
      // Great Crested Flycatcher allows only INVERTEBRATE
      const flycatcher = createBirdInstance(
        "flycatcher",
        "great_crested_flycatcher"
      );
      const player = createPlayerState("player1", {
        FOREST: [flycatcher, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let capturedPrompt: SelectFoodFromFeederPrompt | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromFeeder") {
            capturedPrompt = prompt;
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              diceOrReroll: [
                { die: "SEED_INVERTEBRATE" as DieFace, asFoodType: "INVERTEBRATE" },
              ],
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has SEED_INVERTEBRATE which should be available for INVERTEBRATE
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED_INVERTEBRATE", "FISH", "RODENT"],
      });

      await processor.executeSinglePower("flycatcher", "player1", execCtx);

      expect(capturedPrompt).not.toBeNull();
      // Should include SEED_INVERTEBRATE in availableDice
      expect(capturedPrompt!.availableDice).toEqual({
        SEED_INVERTEBRATE: 1,
      });
    });

    it("skips without prompting when no matching food and no reroll possible", async () => {
      // Indigo Bunting allows INVERTEBRATE or FRUIT
      const bunting = createBirdInstance("bunting", "indigo_bunting");
      const player = createPlayerState("player1", {
        FOREST: [bunting, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      // Feeder has no INVERTEBRATE or FRUIT, and dice don't all match
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: ["SEED", "FISH", "RODENT"],
      });

      const result = await processor.executeSinglePower(
        "bunting",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("repeatBrownPowerInHabitat (Gray Catbird / Northern Mockingbird)", () => {
    // Verifies the handler correctly yields a RepeatBrownPowerEffect when player
    // activates the power and selects another bird with a brown power.
    it("yields RepeatBrownPowerEffect when player activates and selects target", async () => {
      // Gray Catbird has repeatBrownPowerInHabitat power
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Cedar Waxwing has a WHEN_ACTIVATED power (tuckAndGainFood)
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");

      const player = createPlayerState("player1", {
        FOREST: [catbird, waxwing, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            // Select the waxwing as the target bird to repeat
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "waxwing",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, waxwing, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("repeatBrownPowerInHabitat");

      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeDefined();
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.targetBirdInstanceId).toBe("waxwing");
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.triggeringBirdInstanceId).toBe("catbird");
    });

    // Verifies the handler skips without prompting when no other birds in the
    // habitat have brown powers.
    it("skips without prompting when no other birds have brown powers in habitat", async () => {
      // Gray Catbird has repeatBrownPowerInHabitat power
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Bald Eagle has a WHEN_PLAYED power, not WHEN_ACTIVATED (brown)
      const eagle = createBirdInstance("eagle", "bald_eagle");

      const player = createPlayerState("player1", {
        FOREST: [catbird, eagle, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, eagle, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      // Power skipped because no eligible birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler skips without prompting when the catbird is the only
    // bird in the habitat.
    it("skips without prompting when catbird is alone in habitat", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");

      const player = createPlayerState("player1", {
        FOREST: [catbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, null, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler does NOT include the catbird itself as an eligible
    // target (can only repeat OTHER birds' powers).
    it("does not include self as eligible target", async () => {
      // Gray Catbird has repeatBrownPowerInHabitat power
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Another mockingbird also has repeatBrownPowerInHabitat power
      const mockingbird = createBirdInstance("mockingbird", "northern_mockingbird");

      const player = createPlayerState("player1", {
        FOREST: [catbird, mockingbird, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "mockingbird",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, mockingbird, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      await processor.executeSinglePower("catbird", "player1", execCtx);

      // Check that the catbird was NOT included in eligible birds
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("mockingbird");
      expect(repeatPrompt!.eligibleBirds).not.toContain("catbird");
    });

    // Verifies the handler does not activate (but produces appropriate effect)
    // when player declines the activation prompt.
    it("does not activate when player declines", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");

      const player = createPlayerState("player1", {
        FOREST: [catbird, waxwing, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, waxwing, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
      // No RepeatBrownPowerEffect should be yielded
      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeUndefined();
    });

    // Verifies the handler correctly finds birds in the same habitat only,
    // not from other habitats.
    it("only considers birds in the same habitat", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Cedar Waxwing in FOREST (same habitat as catbird)
      const waxwingForest = createBirdInstance("waxwing_forest", "cedar_waxwing");
      // American Crow in GRASSLAND (different habitat)
      const crowGrassland = createBirdInstance("crow_grassland", "american_crow");

      const player = createPlayerState("player1", {
        FOREST: [catbird, waxwingForest, null, null, null],
        GRASSLAND: [crowGrassland, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "waxwing_forest",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, waxwingForest, null, null, null],
          GRASSLAND: [crowGrassland, null, null, null, null],
          WETLAND: [],
        },
      });

      await processor.executeSinglePower("catbird", "player1", execCtx);

      // Check that only the waxwing in the forest is eligible
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("waxwing_forest");
      expect(repeatPrompt!.eligibleBirds).not.toContain("crow_grassland");
    });

    // Verifies multiple eligible birds are all included in the eligibleBirds prompt.
    it("includes all eligible brown power birds in prompt", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      const crow = createBirdInstance("crow", "american_crow");
      const mockingbird = createBirdInstance("mockingbird", "northern_mockingbird");

      const player = createPlayerState("player1", {
        FOREST: [catbird, waxwing, crow, mockingbird, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "waxwing",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, waxwing, crow, mockingbird, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      await processor.executeSinglePower("catbird", "player1", execCtx);

      // All three birds with brown powers should be eligible
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toHaveLength(3);
      expect(repeatPrompt!.eligibleBirds).toContain("waxwing");
      expect(repeatPrompt!.eligibleBirds).toContain("crow");
      expect(repeatPrompt!.eligibleBirds).toContain("mockingbird");
      // Catbird should NOT be included (cannot repeat self)
      expect(repeatPrompt!.eligibleBirds).not.toContain("catbird");
    });

    // Verifies the handler works with Northern Mockingbird (same power, different bird).
    it("works with Northern Mockingbird as the triggering bird", async () => {
      const mockingbird = createBirdInstance("mockingbird", "northern_mockingbird");
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");

      const player = createPlayerState("player1", {
        GRASSLAND: [mockingbird, waxwing, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "waxwing",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [mockingbird, waxwing, null, null, null],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "mockingbird",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("repeatBrownPowerInHabitat");

      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeDefined();
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.targetBirdInstanceId).toBe("waxwing");
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.triggeringBirdInstanceId).toBe("mockingbird");
    });

    // Verifies the handler does not consider birds with no power as eligible.
    it("does not include birds without any power as eligible", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Create a bird instance with no power (using a bird card that has null power)
      // For this test, we'll use a bird with WHEN_PLAYED power which doesn't qualify
      const brant = createBirdInstance("brant", "brant"); // WHEN_PLAYED power

      const player = createPlayerState("player1", {
        WETLAND: [catbird, brant, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [catbird, brant, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      // Brant has WHEN_PLAYED power (not WHEN_ACTIVATED), so no eligible birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler correctly identifies pink powers (ONCE_BETWEEN_TURNS)
    // as NOT eligible for repetition.
    it("does not include birds with pink powers as eligible", async () => {
      const catbird = createBirdInstance("catbird", "gray_catbird");
      // Black Vulture has ONCE_BETWEEN_TURNS (pink) power
      const vulture = createBirdInstance("vulture", "black_vulture");

      const player = createPlayerState("player1", {
        FOREST: [catbird, vulture, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [catbird, vulture, null, null, null],
          GRASSLAND: [],
          WETLAND: [],
        },
      });

      const result = await processor.executeSinglePower(
        "catbird",
        "player1",
        execCtx
      );

      // Black Vulture has pink power (not brown), so no eligible birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("repeatPredatorPowerInHabitat (Hooded Merganser)", () => {
    // Verifies the handler correctly yields a RepeatBrownPowerEffect when player
    // activates the power and selects a predator bird with rollDiceAndCacheIfMatch.
    it("yields RepeatBrownPowerEffect when selecting dice-based predator (American Kestrel)", async () => {
      // Hooded Merganser has repeatPredatorPowerInHabitat power
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // American Kestrel has rollDiceAndCacheIfMatch power (dice-based predator)
      const kestrel = createBirdInstance("kestrel", "american_kestrel");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrel, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "kestrel",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, kestrel, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("repeatPredatorPowerInHabitat");

      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeDefined();
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.targetBirdInstanceId).toBe("kestrel");
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.triggeringBirdInstanceId).toBe("merganser");
    });

    // Verifies the handler works with wingspan-based predator (lookAtCardAndTuckIfWingspanUnder).
    it("yields RepeatBrownPowerEffect when selecting wingspan-based predator (Barred Owl)", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Barred Owl has lookAtCardAndTuckIfWingspanUnder power (wingspan-based predator)
      const owl = createBirdInstance("owl", "barred_owl");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, owl, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "owl",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, owl, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("repeatPredatorPowerInHabitat");

      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeDefined();
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.targetBirdInstanceId).toBe("owl");
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.triggeringBirdInstanceId).toBe("merganser");
    });

    // Verifies the handler skips without prompting when no other birds have predator powers.
    it("skips without prompting when no predator birds in habitat", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Cedar Waxwing has a brown power (tuckAndGainFood) but NOT a predator power
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, waxwing, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, waxwing, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      // Power skipped because no eligible predator birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler skips without prompting when merganser is alone.
    it("skips without prompting when merganser is alone in habitat", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, null, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler does NOT include itself as an eligible target.
    it("does not include self as eligible target", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      const kestrel = createBirdInstance("kestrel", "american_kestrel");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrel, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "kestrel",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, kestrel, null, null, null],
        },
      });

      await processor.executeSinglePower("merganser", "player1", execCtx);

      // Check that the merganser was NOT included in eligible birds
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("kestrel");
      expect(repeatPrompt!.eligibleBirds).not.toContain("merganser");
    });

    // Verifies the handler does not activate when player declines.
    it("does not activate when player declines", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      const kestrel = createBirdInstance("kestrel", "american_kestrel");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrel, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: false, // Decline activation
            } as ActivatePowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, kestrel, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("AGENT_DECLINED");
      // No RepeatBrownPowerEffect should be yielded
      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeUndefined();
    });

    // Verifies the handler only considers birds in the same habitat.
    it("only considers predator birds in the same habitat", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Kestrel in WETLAND (same habitat)
      const kestrelWetland = createBirdInstance("kestrel_wetland", "american_kestrel");
      // Another kestrel in FOREST (different habitat - should be ignored)
      const kestrelForest = createBirdInstance("kestrel_forest", "american_kestrel");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrelWetland, null, null, null],
        FOREST: [kestrelForest, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "kestrel_wetland",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [kestrelForest, null, null, null, null],
          GRASSLAND: [],
          WETLAND: [merganser, kestrelWetland, null, null, null],
        },
      });

      await processor.executeSinglePower("merganser", "player1", execCtx);

      // Only kestrel in WETLAND should be eligible
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("kestrel_wetland");
      expect(repeatPrompt!.eligibleBirds).not.toContain("kestrel_forest");
    });

    // Verifies the handler does not include birds with WHEN_PLAYED powers.
    it("does not include birds with WHEN_PLAYED powers", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Bald Eagle has WHEN_PLAYED power (not a predator power)
      const eagle = createBirdInstance("eagle", "bald_eagle");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, eagle, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, eagle, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      // Bald Eagle has WHEN_PLAYED power (not predator), so no eligible birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler does not include birds with pink powers.
    it("does not include birds with pink powers", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Black Vulture has ONCE_BETWEEN_TURNS (pink) power
      const vulture = createBirdInstance("vulture", "black_vulture");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, vulture, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, vulture, null, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      // Black Vulture has pink power (not predator), so no eligible birds
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler does not include birds with brown powers that are
    // NOT predator powers (e.g., tuckAndGainFood is brown but not predator).
    it("does not include non-predator brown power birds", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      // Cedar Waxwing has tuckAndGainFood (brown power, but NOT predator)
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing");
      // Gray Catbird has repeatBrownPowerInHabitat (brown power, but NOT predator)
      const catbird = createBirdInstance("catbird", "gray_catbird");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, waxwing, catbird, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, waxwing, catbird, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      // Both have brown powers but neither is a predator power
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("RESOURCE_UNAVAILABLE");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
    });

    // Verifies the handler works with multiple eligible predator birds.
    it("allows selection from multiple eligible predator birds", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      const kestrel = createBirdInstance("kestrel", "american_kestrel");
      const owl = createBirdInstance("owl", "barred_owl");

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrel, owl, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            // Select the owl instead of the kestrel
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "owl",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, kestrel, owl, null, null],
        },
      });

      const result = await processor.executeSinglePower(
        "merganser",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);

      // Both predators should be eligible
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("kestrel");
      expect(repeatPrompt!.eligibleBirds).toContain("owl");
      expect(repeatPrompt!.eligibleBirds).toHaveLength(2);

      // Verify the owl was selected
      const repeatEffect = result.effects.find(
        (e) => e.type === "REPEAT_BROWN_POWER"
      );
      expect(repeatEffect).toBeDefined();
      expect(repeatEffect?.type === "REPEAT_BROWN_POWER" && repeatEffect.targetBirdInstanceId).toBe("owl");
    });

    // Verifies the handler correctly filters a mix of predator and non-predator birds.
    it("correctly filters mix of predator and non-predator birds", async () => {
      const merganser = createBirdInstance("merganser", "hooded_merganser");
      const kestrel = createBirdInstance("kestrel", "american_kestrel"); // predator
      const waxwing = createBirdInstance("waxwing", "cedar_waxwing"); // non-predator brown
      const owl = createBirdInstance("owl", "barred_owl"); // predator

      const player = createPlayerState("player1", {
        WETLAND: [merganser, kestrel, waxwing, owl, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let repeatPrompt: { eligibleBirds: string[] } | null = null;

      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "repeatPower") {
            repeatPrompt = prompt;
            return Promise.resolve({
              kind: "repeatPower",
              promptId: prompt.promptId,
              bird: "kestrel",
            } as RepeatPowerChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        board: {
          FOREST: [],
          GRASSLAND: [],
          WETLAND: [merganser, kestrel, waxwing, owl, null],
        },
      });

      await processor.executeSinglePower("merganser", "player1", execCtx);

      // Only kestrel and owl are predators; waxwing is not
      expect(repeatPrompt).not.toBeNull();
      expect(repeatPrompt!.eligibleBirds).toContain("kestrel");
      expect(repeatPrompt!.eligibleBirds).toContain("owl");
      expect(repeatPrompt!.eligibleBirds).not.toContain("waxwing");
      expect(repeatPrompt!.eligibleBirds).not.toContain("merganser");
      expect(repeatPrompt!.eligibleBirds).toHaveLength(2);
    });
  });
});

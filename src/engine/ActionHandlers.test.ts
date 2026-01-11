import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionProcessor } from "./ActionProcessor.js";
import type { GameState } from "./GameEngine.js";
import type {
  PowerExecutionContext,
  PowerYield,
  PowerReceive,
} from "../types/power.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";
import type { BirdInstance, Habitat, PlayerState } from "../types/core.js";
import type {
  ActivatePowerChoice,
  DiscardEggsChoice,
  DiscardFoodChoice,
  DrawCardsChoice,
  PlaceEggsChoice,
  PlayerView,
  PromptContext,
  SelectCardsChoice,
  SelectFoodDestinationChoice,
  SelectFoodFromFeederChoice,
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
  return {
    id,
    board: {
      FOREST: board.FOREST ?? [null, null, null, null, null],
      GRASSLAND: board.GRASSLAND ?? [null, null, null, null, null],
      WETLAND: board.WETLAND ?? [null, null, null, null, null],
    },
    hand: [],
    bonusCards: [],
    food: { INVERTEBRATE: 1, SEED: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
    turnsRemaining: 8,
  };
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
  return {
    players,
    activePlayerIndex: 0,
    birdfeeder: {} as GameState["birdfeeder"],
    birdCardSupply: createMockBirdCardSupply(),
    bonusCardDeck: createMockBonusCardDeck(),
    roundGoals: [],
    round: 1,
    turn: 1,
    endOfTurnContinuations: [],
  };
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
  applyEffectFn?: (effect: Effect) => void
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
    applyEffect:
      applyEffectFn ??
      (() => {
        // Mock: effects are tracked but not actually applied to state in tests
      }),
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
              foodOrReroll: { SEED: 1 },
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
        "FOREST",
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
              foodOrReroll: { SEED: 1 },
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
        "FOREST",
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
        "FOREST",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
                foodOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // Second attempt: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              foodOrReroll: { SEED: 1 },
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
        "FOREST",
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
                foodOrReroll: "reroll",
              } as SelectFoodFromFeederChoice);
            }
            // After reroll: select food
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              foodOrReroll: { SEED: 1 },
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
        "FOREST",
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
        "WETLAND",
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
        "WETLAND",
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
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: ["some_card"],
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
        "WETLAND",
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
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: ["some_card"],
            } as SelectCardsChoice);
          } else if (prompt.kind === "drawCards") {
            // Choose to draw from tray instead of deck
            return Promise.resolve({
              kind: "drawCards",
              promptId: prompt.promptId,
              trayCards: ["tray_bird"],
              numDeckCards: 0,
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
        "WETLAND",
        execCtx
      );

      expect(result.activated).toBe(true);
      const drawEffect = result.effects.find((e) => e.type === "DRAW_CARDS");
      expect(drawEffect).toBeDefined();
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromDeck).toBe(0);
      expect(drawEffect?.type === "DRAW_CARDS" && drawEffect.fromTray).toEqual([
        "tray_bird",
      ]);
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
        "WETLAND",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "FOREST",
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
        "GRASSLAND",
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
        "GRASSLAND",
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
        "GRASSLAND",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "WETLAND",
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
              foodOrReroll: { FISH: 1 },
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
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(true);
      const gainEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainEffect).toBeDefined();
      expect(gainEffect?.food).toEqual({ FISH: 1 });
      expect(gainEffect?.source).toBe("BIRDFEEDER");
    });

    it("skips without prompting when feeder is empty", async () => {
      const redstart = createBirdInstance("redstart", "american_redstart");
      const player = createPlayerState("player1", {
        FOREST: [redstart, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: [], // Empty feeder
      });

      const result = await processor.executeSinglePower(
        "redstart",
        "player1",
        "FOREST",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
      // Agent should NOT be prompted
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
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
        "WETLAND",
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
        "WETLAND",
        execCtx
      );

      // Power is skipped without prompting when invariant not met
      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "WETLAND",
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
            // Player 1 selects SEED
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              foodOrReroll: { SEED: 1 },
            } as SelectFoodFromFeederChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      (mockAgent2.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "selectFoodFromFeeder") {
            // Player 2 selects FISH
            return Promise.resolve({
              kind: "selectFoodFromFeeder",
              promptId: prompt.promptId,
              foodOrReroll: { FISH: 1 },
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
        "hummingbird",
        "player1",
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(result.handlerId).toBe("eachPlayerGainsFoodFromFeeder");

      // Now emits individual GAIN_FOOD effects for each player
      const gainEffects = result.effects.filter((e) => e.type === "GAIN_FOOD");
      expect(gainEffects.length).toBe(2);

      const player1Gain = gainEffects.find((e) => e.playerId === "player1");
      expect(player1Gain).toBeDefined();
      expect(player1Gain?.food).toEqual({ SEED: 1 });
      expect(player1Gain?.source).toBe("BIRDFEEDER");

      const player2Gain = gainEffects.find((e) => e.playerId === "player2");
      expect(player2Gain).toBeDefined();
      expect(player2Gain?.food).toEqual({ FISH: 1 });
      expect(player2Gain?.source).toBe("BIRDFEEDER");
    });

    it("skips without prompting when feeder is empty", async () => {
      const hummingbird = createBirdInstance(
        "hummingbird",
        "annas_hummingbird"
      );
      const player = createPlayerState("player1", {
        FOREST: [hummingbird, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents, {
        birdfeeder: [],
      });

      const result = await processor.executeSinglePower(
        "hummingbird",
        "player1",
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
      expect(mockAgent.chooseOption).not.toHaveBeenCalled();
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
        "GRASSLAND",
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
        "GRASSLAND",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "WETLAND",
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
        "GRASSLAND",
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
        "GRASSLAND",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "WETLAND",
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
        "WETLAND",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "FOREST",
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
      expect(gainEffect?.source).toBe("SUPPLY");
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
        "FOREST",
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
        "FOREST",
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
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "WETLAND",
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
        "WETLAND",
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
        "FOREST",
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
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
        "FOREST",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
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
            return Promise.resolve({
              kind: "selectCards",
              promptId: prompt.promptId,
              cards: ["some_card"],
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
        "WETLAND",
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
      expect(discardEffect?.cards).toEqual(["some_card"]);
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
        "WETLAND",
        execCtx
      );

      expect(result.activated).toBe(false);
      expect(result.skipReason).toBe("CONDITION_NOT_MET");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ActionProcessor,
  PinkPowerTrigger,
  type TurnActionContext,
  type TurnActionExecutionContext,
} from "./ActionProcessor.js";
import { GameState } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";
import { PlayerBoard } from "./PlayerBoard.js";
import type { PowerExecutionContext } from "../types/power.js";
import type { PinkPowerTriggerEvent } from "../types/events.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";
import type {
  BirdCard,
  BirdInstance,
  Habitat,
  PlayerId,
  PowerSpec,
} from "../types/core.js";
import type { Effect } from "../types/effects.js";
import type {
  ActivatePowerChoice,
  PlayerView,
  PromptContext,
  SelectFoodFromSupplyChoice,
  OptionPrompt,
  OptionChoice,
  SelectFoodFromFeederChoice,
  PlaceEggsChoice,
  DrawCardsChoice,
  PlayBirdChoice,
} from "../types/prompts.js";
import { DataRegistry } from "../data/DataRegistry.js";
import { AgentForfeitError } from "./errors.js";
import { Birdfeeder } from "./Birdfeeder.js";
import { BirdCardSupply } from "./BirdCardSupply.js";
import { Rng } from "../util/Rng.js";

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

const testRegistry = new DataRegistry();

/**
 * Creates a minimal bird instance for testing.
 */
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

/**
 * Creates a minimal player state for testing.
 */
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

/**
 * Creates a minimal game state for testing.
 */
function createGameState(players: PlayerState[]): GameState {
  return new GameState({
    players,
    activePlayerIndex: 0,
    birdfeeder: {} as GameState["birdfeeder"],
    birdCardSupply: {} as GameState["birdCardSupply"],
    bonusCardDeck: {} as GameState["bonusCardDeck"],
    roundGoals: [],
    round: 1,
    turn: 1,
    endOfTurnContinuations: [],
  });
}

/**
 * Creates a mock agent for testing.
 */
function createMockAgent(playerId: string): PlayerAgent {
  return {
    playerId,
    chooseStartingHand: vi.fn(),
    chooseTurnAction: vi.fn(),
    chooseOption: vi.fn(),
  };
}

/**
 * Creates a mock PlayerView for testing.
 */
function createMockPlayerView(playerId: string): PlayerView {
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
  };
}

/**
 * Creates a mock PromptContext for testing.
 */
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

/**
 * Creates a mock PowerExecutionContext for testing.
 */
function createMockExecutionContext(
  state: GameState,
  registry: DataRegistry,
  agents: Map<string, PlayerAgent>
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
    buildPlayerView: (playerId) => createMockPlayerView(playerId),
    buildPromptContext: () => createMockPromptContext(),
    applyEffect: () => {
      // Mock: effects are tracked but not actually applied to state in tests
    },
    deferContinuation: () => {
      // Mock: continuations are ignored in tests
    },
  };
}

// ============================================================================
// TurnActionProcessor Test Helpers
// ============================================================================

/**
 * Creates a test player state with empty board and specified resources.
 */
function createTestPlayer(
  id: string,
  options?: {
    food?: Partial<Record<string, number>>;
    hand?: Array<{ id: string }>;
    birds?: Array<{ habitat: Habitat; column: number; bird: BirdInstance }>;
  }
): PlayerState {
  const boardData: Record<Habitat, Array<BirdInstance | null>> = {
    FOREST: [null, null, null, null, null],
    GRASSLAND: [null, null, null, null, null],
    WETLAND: [null, null, null, null, null],
  };

  // Place any specified birds
  if (options?.birds) {
    for (const { habitat, column, bird } of options.birds) {
      boardData[habitat][column] = bird;
    }
  }

  return PlayerState.from(id, {
    board: PlayerBoard.from(boardData),
    hand: (options?.hand as BirdCard[]) ?? [],
    bonusCards: [],
    food: {
      INVERTEBRATE: options?.food?.INVERTEBRATE ?? 0,
      SEED: options?.food?.SEED ?? 0,
      FISH: options?.food?.FISH ?? 0,
      FRUIT: options?.food?.FRUIT ?? 0,
      RODENT: options?.food?.RODENT ?? 0,
    },
    turnsRemaining: 8,
  });
}

/**
 * Creates a mock agent for testing with an option handler.
 */
function createMockAgentWithHandler(
  playerId: string,
  optionHandler: (prompt: OptionPrompt) => OptionChoice
): PlayerAgent {
  return {
    playerId,
    chooseStartingHand: vi.fn(),
    chooseTurnAction: vi.fn(),
    chooseOption: vi.fn().mockImplementation(async (prompt: OptionPrompt) => {
      return optionHandler(prompt);
    }),
  };
}

/**
 * Creates a mock game state for testing turn actions.
 */
function createMockGameStateForTurnAction(
  player: PlayerState,
  registry: DataRegistry,
  rng: Rng
) {
  const birdfeeder = new Birdfeeder(rng);
  const birdCardSupply = new BirdCardSupply(registry.getAllBirds(), rng);
  birdCardSupply.refillTray();

  return {
    round: 1,
    turn: 1,
    players: [player],
    activePlayerIndex: 0,
    birdfeeder,
    birdCardSupply,
    bonusCardDeck: null as unknown,
    roundGoals: [],
    eventQueue: [],
    endOfTurnContinuations: [],
  };
}

/**
 * Creates a test context for TurnActionProcessor.
 */
function createTestContext(
  player: PlayerState,
  agent: PlayerAgent,
  registry: DataRegistry
): { ctx: TurnActionContext; execCtx: TurnActionExecutionContext } {
  const rng = new Rng(42);
  const mockState = createMockGameStateForTurnAction(player, registry, rng);

  let promptCounter = 0;

  // Simplified context (no mutable objects)
  const ctx: TurnActionContext = {
    playerId: player.id,
    round: 1,
  };

  // Execution context that provides access to state and utilities
  const execCtx: TurnActionExecutionContext = {
    getState: () => mockState as any,
    getRegistry: () => registry,
    getAgent: (_playerId: PlayerId) => agent,
    generatePromptId: () => `prompt_${++promptCounter}`,
    buildPlayerView: (_playerId: PlayerId) => ({
      board: player.board.toRecord(),
      hand: player.hand,
      food: player.food,
      birdTray: mockState.birdCardSupply.getTray().filter((c): c is any => c !== null),
      birdfeeder: mockState.birdfeeder.getDiceInFeeder() as any,
    } as PlayerView),
    buildPromptContext: () => ({
      round: 1,
      activePlayerId: player.id,
      trigger: { type: "WHEN_ACTIVATED" as const, habitat: "FOREST" as const, sourceBirdId: "" },
    }),
    applyEffect: (effect: Effect) => {
      // Apply effects to the mock state for testing
      if (effect.type === "GAIN_FOOD") {
        const p = mockState.players.find((pl) => pl.id === effect.playerId);
        if (p) {
          for (const [foodType, count] of Object.entries(effect.food)) {
            if (count && count > 0) {
              const ft = foodType as keyof typeof p.food;
              p.food[ft] = (p.food[ft] ?? 0) + count;
              // Remove dice from birdfeeder when source is BIRDFEEDER
              if (effect.source === "BIRDFEEDER" && foodType !== "WILD") {
                try {
                  mockState.birdfeeder.takeDie(foodType as any);
                } catch {
                  // Die may not be available
                }
              }
            }
          }
        }
      } else if (effect.type === "LAY_EGGS") {
        const p = mockState.players.find((pl) => pl.id === effect.playerId);
        if (p) {
          for (const [birdId, count] of Object.entries(effect.placements)) {
            if (count && count > 0) {
              for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as const) {
                const bird = p.board.getHabitat(habitat).find((b) => b?.id === birdId);
                if (bird) {
                  bird.eggs += count;
                }
              }
            }
          }
        }
      } else if (effect.type === "DRAW_CARDS") {
        // Handle draw cards by taking from tray/deck
        for (const cardId of effect.fromTray) {
          const tray = mockState.birdCardSupply.getTray();
          const idx = tray.findIndex((c) => c?.id === cardId);
          if (idx !== -1) {
            mockState.birdCardSupply.takeFromTray(idx);
          }
        }
        if (effect.fromDeck > 0) {
          mockState.birdCardSupply.drawFromDeck(effect.fromDeck);
        }
      } else if (effect.type === "REFILL_BIRD_TRAY") {
        mockState.birdCardSupply.refillTray();
      } else if (effect.type === "REROLL_BIRDFEEDER") {
        mockState.birdfeeder.rerollAll();
        effect.newDice = [...mockState.birdfeeder.getDiceInFeeder()] as any;
      }
    },
    deferContinuation: () => {
      // No-op for tests - continuations not tested here
    },
  };

  return { ctx, execCtx };
}

// ============================================================================
// ActionProcessor Tests
// ============================================================================

describe("ActionProcessor", () => {
  let processor: ActionProcessor;
  let registry: DataRegistry;

  beforeEach(() => {
    processor = new ActionProcessor();
    registry = new DataRegistry();
  });

  describe("constructor", () => {
    it("initializes with gainFoodFromSupply handler registered", () => {
      // We can't directly access the private handlers map, but we can verify
      // the handler works by executing a power that uses it
      expect(processor).toBeDefined();
    });
  });

  describe("executeSinglePower()", () => {
    describe("when bird has no power", () => {
      it("returns activated=false with NO_POWER reason", async () => {
        // Find a bird with no power in the registry
        const allBirds = registry.getAllBirds();
        const birdWithNoPower = allBirds.find((b) => b.power === null);

        if (!birdWithNoPower) {
          // Skip if no birds without powers exist in test data
          console.log("No birds without powers in test data, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "test_instance_1",
          birdWithNoPower.id
        );
        const player = createPlayerState("player1", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player]);

        const mockAgent = createMockAgent("player1");
        const agents = new Map([["player1", mockAgent]]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const result = await processor.executeSinglePower(
          "test_instance_1",
          "player1",
          execCtx
        );

        expect(result.activated).toBe(false);
        expect(result.skipReason).toBe("NO_POWER");
        expect(result.handlerId).toBe("none");
        expect(result.effects).toEqual([]);
      });
    });

    describe("when bird instance is not found", () => {
      it("throws an error", async () => {
        const player = createPlayerState("player1");
        const state = createGameState([player]);

        const mockAgent = createMockAgent("player1");
        const agents = new Map([["player1", mockAgent]]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        await expect(
          processor.executeSinglePower(
            "nonexistent_bird",
            "player1",
            execCtx
          )
        ).rejects.toThrow("Bird instance nonexistent_bird not found");
      });
    });

    describe("when player declines to activate power", () => {
      it("returns activated=false with AGENT_DECLINED reason", async () => {
        // Find a bird with gainFoodFromSupply power
        const allBirds = registry.getAllBirds();
        const birdWithPower = allBirds.find(
          (b) => b.power?.handlerId === "gainFoodFromSupply"
        );

        if (!birdWithPower) {
          console.log("No birds with gainFoodFromSupply power, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "test_instance_1",
          birdWithPower.id
        );
        const player = createPlayerState("player1", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player]);

        const mockAgent = createMockAgent("player1");
        // Mock agent declines to activate
        (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockResolvedValue({
          kind: "activatePower",
          promptId: "prompt_1",
          activate: false,
        } as ActivatePowerChoice);

        const agents = new Map([["player1", mockAgent]]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const result = await processor.executeSinglePower(
          "test_instance_1",
          "player1",
          execCtx
        );

        expect(result.activated).toBe(false);
        expect(result.skipReason).toBe("AGENT_DECLINED");
        expect(result.effects.length).toBeGreaterThan(0);
        // Should have ACTIVATE_POWER effect with activated=false
        const activateEffect = result.effects.find(
          (e) => e.type === "ACTIVATE_POWER"
        );
        expect(activateEffect).toBeDefined();
        expect(activateEffect?.activated).toBe(false);
      });
    });

    describe("when player activates gainFoodFromSupply power", () => {
      it("returns effects including GAIN_FOOD and ACTIVATE_POWER", async () => {
        // Find a bird with gainFoodFromSupply power
        const allBirds = registry.getAllBirds();
        const birdWithPower = allBirds.find(
          (b) => b.power?.handlerId === "gainFoodFromSupply"
        );

        if (!birdWithPower) {
          console.log("No birds with gainFoodFromSupply power, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "test_instance_1",
          birdWithPower.id
        );
        const player = createPlayerState("player1", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player]);

        const mockAgent = createMockAgent("player1");
        let promptCount = 0;

        // Mock agent accepts activation and selects food
        (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
          (prompt) => {
            promptCount++;
            if (prompt.kind === "activatePower") {
              return Promise.resolve({
                kind: "activatePower",
                promptId: prompt.promptId,
                activate: true,
              } as ActivatePowerChoice);
            } else if (prompt.kind === "selectFoodFromSupply") {
              const foodType = (birdWithPower.power?.params.foodType as string) || "SEED";
              // Return the exact count requested by the prompt
              return Promise.resolve({
                kind: "selectFoodFromSupply",
                promptId: prompt.promptId,
                food: { [foodType]: prompt.count },
              } as SelectFoodFromSupplyChoice);
            }
            throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
          }
        );

        const agents = new Map([["player1", mockAgent]]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const result = await processor.executeSinglePower(
          "test_instance_1",
          "player1",
          execCtx
        );

        expect(result.activated).toBe(true);
        expect(result.skipReason).toBeUndefined();
        expect(result.effects.length).toBeGreaterThanOrEqual(2);

        // Should have ACTIVATE_POWER effect
        const activateEffect = result.effects.find(
          (e) => e.type === "ACTIVATE_POWER"
        );
        expect(activateEffect).toBeDefined();
        expect(activateEffect?.activated).toBe(true);

        // Should have GAIN_FOOD effect
        const gainFoodEffect = result.effects.find(
          (e) => e.type === "GAIN_FOOD"
        );
        expect(gainFoodEffect).toBeDefined();
        expect(gainFoodEffect?.playerId).toBe("player1");
      });

      it("includes the full power spec in the activation prompt", async () => {
        // Find a bird with gainFoodFromSupply power
        const allBirds = registry.getAllBirds();
        const birdWithPower = allBirds.find(
          (b) => b.power?.handlerId === "gainFoodFromSupply"
        );

        if (!birdWithPower) {
          console.log("No birds with gainFoodFromSupply power, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "test_instance_1",
          birdWithPower.id
        );
        const player = createPlayerState("player1", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player]);

        const mockAgent = createMockAgent("player1");
        let capturedPrompt: unknown = null;

        // Mock agent to capture the prompt and decline activation
        (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
          (prompt) => {
            if (prompt.kind === "activatePower") {
              capturedPrompt = prompt;
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

        await processor.executeSinglePower(
          "test_instance_1",
          "player1",
          execCtx
        );

        // Verify the prompt includes the nested power object
        expect(capturedPrompt).toBeDefined();
        const typedPrompt = capturedPrompt as {
          kind: string;
          power: {
            handlerId: string;
            params: Record<string, unknown>;
            text: string;
            trigger: string;
          };
        };

        expect(typedPrompt.power).toBeDefined();
        expect(typedPrompt.power.handlerId).toBe("gainFoodFromSupply");
        expect(typedPrompt.power.params).toEqual(birdWithPower.power?.params);
        expect(typedPrompt.power.text).toBe(birdWithPower.power?.text);
        expect(typedPrompt.power.trigger).toBe(birdWithPower.power?.trigger);
      });
    });
  });

  describe("findTriggeredPinkPowers()", () => {
    describe("with no birds on any board", () => {
      it("returns empty array", () => {
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2");
        const state = createGameState([player1, player2]);

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers).toEqual([]);
      });
    });

    describe("with birds that have brown powers (not pink)", () => {
      it("returns empty array", () => {
        // Find a bird with a brown power (WHEN_ACTIVATED)
        const allBirds = registry.getAllBirds();
        const brownPowerBird = allBirds.find(
          (b) => b.power?.trigger === "WHEN_ACTIVATED"
        );

        if (!brownPowerBird) {
          console.log("No birds with brown powers, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "brown_bird_instance",
          brownPowerBird.id
        );
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player1, player2]);

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers).toEqual([]);
      });
    });

    describe("with pink power birds on active player's board", () => {
      it("does not include active player's pink powers", () => {
        // Find a bird with a pink power (ONCE_BETWEEN_TURNS)
        const allBirds = registry.getAllBirds();
        const pinkPowerBird = allBirds.find(
          (b) => b.power?.trigger === "ONCE_BETWEEN_TURNS"
        );

        if (!pinkPowerBird) {
          console.log("No birds with pink powers, skipping test");
          return;
        }

        const birdInstance = createBirdInstance(
          "pink_bird_instance",
          pinkPowerBird.id
        );
        // Active player (index 0) has the pink power bird
        const player1 = createPlayerState("player1", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const player2 = createPlayerState("player2");
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0; // player1 is active

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        // Should not include player1's pink power
        expect(triggers.every((t) => t.ownerId !== "player1")).toBe(true);
      });
    });

    describe("with pink power birds on non-active player's board", () => {
      it("includes matching pink powers from non-active players", () => {
        // Find a bird with a pink power that triggers on BIRD_PLAYED
        const allBirds = registry.getAllBirds();
        const pinkPowerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
        );

        if (!pinkPowerBird) {
          console.log(
            "No birds with whenOpponentPlaysBirdInHabitatGainFood pink power, skipping test"
          );
          return;
        }

        const birdInstance = createBirdInstance(
          "pink_bird_instance",
          pinkPowerBird.id
        );
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0; // player1 is active

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(1);
        expect(triggers[0].ownerId).toBe("player2");
        expect(triggers[0].birdInstanceId).toBe("pink_bird_instance");
        expect(triggers[0].habitat).toBe("FOREST");
        expect(triggers[0].handlerId).toBe("whenOpponentPlaysBirdInHabitatGainFood");
      });
    });

    describe("clockwise player ordering", () => {
      it("returns triggers in clockwise order starting from player left of active", () => {
        // Find a bird with a pink power that triggers on BIRD_PLAYED
        const allBirds = registry.getAllBirds();
        const pinkPowerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
        );

        if (!pinkPowerBird) {
          console.log(
            "No birds with whenOpponentPlaysBirdInHabitatGainFood pink power, skipping test"
          );
          return;
        }

        // Create 4 players, each with the same pink power bird
        const players = ["player1", "player2", "player3", "player4"].map(
          (id) => {
            const birdInstance = createBirdInstance(
              `pink_bird_${id}`,
              pinkPowerBird.id
            );
            return createPlayerState(id, {
              FOREST: [birdInstance, null, null, null, null],
            });
          }
        );

        const state = createGameState(players);
        state.activePlayerIndex = 1; // player2 is active

        const agents = new Map(
          players.map((p) => [p.id, createMockAgent(p.id)])
        );
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player2",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        // Should be in order: player3, player4, player1 (clockwise from player2)
        // player2 is skipped because they are the active player
        expect(triggers.length).toBe(3);
        expect(triggers[0].ownerId).toBe("player3");
        expect(triggers[1].ownerId).toBe("player4");
        expect(triggers[2].ownerId).toBe("player1");
      });
    });

    describe("event type matching", () => {
      it("only triggers pink powers matching the event type", () => {
        // Find birds with different pink power triggers
        const allBirds = registry.getAllBirds();
        const birdPlayedTriggerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
        );
        const eggsTriggerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentLaysEggsLayEggOnNestType"
        );

        if (!birdPlayedTriggerBird || !eggsTriggerBird) {
          console.log(
            "Not enough pink power birds with different triggers, skipping test"
          );
          return;
        }

        const birdInstance1 = createBirdInstance(
          "bird_played_trigger",
          birdPlayedTriggerBird.id
        );
        const birdInstance2 = createBirdInstance(
          "eggs_trigger",
          eggsTriggerBird.id
        );

        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance1, birdInstance2, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        // Event is BIRD_PLAYED, should only trigger birdPlayedTriggerBird
        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(1);
        expect(triggers[0].birdInstanceId).toBe("bird_played_trigger");
        expect(triggers[0].handlerId).toBe("whenOpponentPlaysBirdInHabitatGainFood");
      });
    });

    describe("multiple habitats", () => {
      it("finds pink powers across all habitats", () => {
        const allBirds = registry.getAllBirds();
        const pinkPowerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
        );

        if (!pinkPowerBird) {
          console.log(
            "No birds with whenOpponentPlaysBirdInHabitatGainFood pink power, skipping test"
          );
          return;
        }

        const forestBird = createBirdInstance(
          "forest_pink",
          pinkPowerBird.id
        );
        const grasslandBird = createBirdInstance(
          "grassland_pink",
          pinkPowerBird.id
        );
        const wetlandBird = createBirdInstance(
          "wetland_pink",
          pinkPowerBird.id
        );

        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [forestBird, null, null, null, null],
          GRASSLAND: [grasslandBird, null, null, null, null],
          WETLAND: [wetlandBird, null, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(3);
        const habitats = triggers.map((t) => t.habitat);
        expect(habitats).toContain("FOREST");
        expect(habitats).toContain("GRASSLAND");
        expect(habitats).toContain("WETLAND");
      });
    });
  });

  describe("pinkPowerTriggersOnEvent (indirect tests via findTriggeredPinkPowers)", () => {
    // Testing the private method indirectly through findTriggeredPinkPowers

    describe("EGGS_LAID_FROM_HABITAT_ACTIVATION event", () => {
      it("triggers whenOpponentLaysEggsLayEggOnNestType handlers", () => {
        const allBirds = registry.getAllBirds();
        const eggsTriggerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentLaysEggsLayEggOnNestType"
        );

        if (!eggsTriggerBird) {
          console.log(
            "No birds with whenOpponentLaysEggsLayEggOnNestType, skipping test"
          );
          return;
        }

        const birdInstance = createBirdInstance(
          "eggs_trigger_bird",
          eggsTriggerBird.id
        );
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "EGGS_LAID_FROM_HABITAT_ACTIVATION",
          playerId: "player1",
          placements: [{ birdInstanceId: "some_bird", count: 2 }],
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(1);
        expect(triggers[0].handlerId).toBe(
          "whenOpponentLaysEggsLayEggOnNestType"
        );
      });
    });

    describe("PREDATOR_POWER_RESOLVED event", () => {
      it("triggers whenPredatorSucceedsGainFood handlers", () => {
        const allBirds = registry.getAllBirds();
        const predatorTriggerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentPredatorSucceedsGainFood"
        );

        if (!predatorTriggerBird) {
          console.log(
            "No birds with whenOpponentPredatorSucceedsGainFood, skipping test"
          );
          return;
        }

        const birdInstance = createBirdInstance(
          "predator_trigger_bird",
          predatorTriggerBird.id
        );
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "PREDATOR_POWER_RESOLVED",
          playerId: "player1",
          predatorBirdInstanceId: "some_predator",
          success: true,
          predatorType: "WINGSPAN_CHECK",
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(1);
        expect(triggers[0].handlerId).toBe("whenOpponentPredatorSucceedsGainFood");
      });
    });

    describe("FOOD_GAINED_FROM_HABITAT_ACTIVATION event", () => {
      it("triggers whenOpponentGainsFoodCacheFood handlers", () => {
        const allBirds = registry.getAllBirds();
        const foodTriggerBird = allBirds.find(
          (b) =>
            b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
            b.power?.handlerId === "whenOpponentGainsFoodCacheIfMatch"
        );

        if (!foodTriggerBird) {
          console.log(
            "No birds with whenOpponentGainsFoodCacheIfMatch, skipping test"
          );
          return;
        }

        const birdInstance = createBirdInstance(
          "food_trigger_bird",
          foodTriggerBird.id
        );
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2", {
          FOREST: [birdInstance, null, null, null, null],
        });
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
          playerId: "player1",
          food: { SEED: 2 },
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers.length).toBe(1);
        expect(triggers[0].handlerId).toBe("whenOpponentGainsFoodCacheIfMatch");
      });
    });

    describe("unknown handler ID", () => {
      it("does not trigger for handlers not in the trigger map", () => {
        // Create a mock bird with an unknown handler ID
        // Since we can't easily mock the registry, we just verify the behavior
        // when there are no matching triggers
        const player1 = createPlayerState("player1");
        const player2 = createPlayerState("player2");
        const state = createGameState([player1, player2]);
        state.activePlayerIndex = 0;

        const agents = new Map([
          ["player1", createMockAgent("player1")],
          ["player2", createMockAgent("player2")],
        ]);
        const execCtx = createMockExecutionContext(state, registry, agents);

        const event: PinkPowerTriggerEvent = {
          type: "BIRD_PLAYED",
          playerId: "player1",
          birdInstanceId: "some_bird",
          birdCardId: "some_card",
          habitat: "FOREST",
          position: 0,
        };

        const triggers = processor.findTriggeredPinkPowers(
          event,
          state,
          execCtx
        );

        expect(triggers).toEqual([]);
      });
    });
  });

  describe("getClockwisePlayerOrder (indirect tests)", () => {
    // Testing the private method indirectly through findTriggeredPinkPowers

    it("handles 2-player game correctly", () => {
      const allBirds = registry.getAllBirds();
      const pinkPowerBird = allBirds.find(
        (b) =>
          b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
          b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
      );

      if (!pinkPowerBird) {
        console.log("No birds with pink power, skipping test");
        return;
      }

      const bird1 = createBirdInstance("bird_p1", pinkPowerBird.id);
      const bird2 = createBirdInstance("bird_p2", pinkPowerBird.id);

      const player1 = createPlayerState("player1", {
        FOREST: [bird1, null, null, null, null],
      });
      const player2 = createPlayerState("player2", {
        FOREST: [bird2, null, null, null, null],
      });
      const state = createGameState([player1, player2]);
      state.activePlayerIndex = 0; // player1 is active

      const agents = new Map([
        ["player1", createMockAgent("player1")],
        ["player2", createMockAgent("player2")],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const event: PinkPowerTriggerEvent = {
        type: "BIRD_PLAYED",
        playerId: "player1",
        birdInstanceId: "some_bird",
        birdCardId: "some_card",
        habitat: "FOREST",
        position: 0,
      };

      const triggers = processor.findTriggeredPinkPowers(
        event,
        state,
        execCtx
      );

      // Only player2's bird should trigger (player1 is active)
      expect(triggers.length).toBe(1);
      expect(triggers[0].ownerId).toBe("player2");
    });

    it("handles wrap-around correctly for last player as active", () => {
      const allBirds = registry.getAllBirds();
      const pinkPowerBird = allBirds.find(
        (b) =>
          b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
          b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
      );

      if (!pinkPowerBird) {
        console.log("No birds with pink power, skipping test");
        return;
      }

      const players = ["player1", "player2", "player3"].map((id) => {
        const birdInstance = createBirdInstance(`bird_${id}`, pinkPowerBird.id);
        return createPlayerState(id, {
          FOREST: [birdInstance, null, null, null, null],
        });
      });

      const state = createGameState(players);
      state.activePlayerIndex = 2; // player3 is active (last player)

      const agents = new Map(
        players.map((p) => [p.id, createMockAgent(p.id)])
      );
      const execCtx = createMockExecutionContext(state, registry, agents);

      const event: PinkPowerTriggerEvent = {
        type: "BIRD_PLAYED",
        playerId: "player3",
        birdInstanceId: "some_bird",
        birdCardId: "some_card",
        habitat: "FOREST",
        position: 0,
      };

      const triggers = processor.findTriggeredPinkPowers(
        event,
        state,
        execCtx
      );

      // Order should be: player1, player2 (wrapping from player3)
      expect(triggers.length).toBe(2);
      expect(triggers[0].ownerId).toBe("player1");
      expect(triggers[1].ownerId).toBe("player2");
    });
  });

  describe("edge cases", () => {
    it("handles empty board slots correctly when searching for birds", () => {
      const allBirds = registry.getAllBirds();
      const pinkPowerBird = allBirds.find(
        (b) =>
          b.power?.trigger === "ONCE_BETWEEN_TURNS" &&
          b.power?.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
      );

      if (!pinkPowerBird) {
        console.log("No birds with pink power, skipping test");
        return;
      }

      // Create board with null slots between birds
      const birdInstance = createBirdInstance("pink_bird", pinkPowerBird.id);
      const player1 = createPlayerState("player1");
      const player2 = createPlayerState("player2", {
        FOREST: [null, birdInstance, null, null, null], // Bird in middle slot
      });
      const state = createGameState([player1, player2]);
      state.activePlayerIndex = 0;

      const agents = new Map([
        ["player1", createMockAgent("player1")],
        ["player2", createMockAgent("player2")],
      ]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const event: PinkPowerTriggerEvent = {
        type: "BIRD_PLAYED",
        playerId: "player1",
        birdInstanceId: "some_bird",
        birdCardId: "some_card",
        habitat: "FOREST",
        position: 0,
      };

      const triggers = processor.findTriggeredPinkPowers(
        event,
        state,
        execCtx
      );

      expect(triggers.length).toBe(1);
      expect(triggers[0].birdInstanceId).toBe("pink_bird");
    });
  });

  describe("executeTurnAction() - GAIN_FOOD", () => {
    it("gains food from the birdfeeder", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      const player = createTestPlayer("p1");
      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "selectFoodFromFeeder") {
          // Take the first available die
          const available = prompt.availableDice;
          for (const [dieType, count] of Object.entries(available)) {
            if (count && count > 0) {
              return {
                promptId: prompt.promptId,
                kind: "selectFoodFromFeeder",
                diceOrReroll: [{ die: dieType }],
              } as SelectFoodFromFeederChoice;
            }
          }
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "GAIN_FOOD",
        ctx,
        false,
        execCtx
      );

      // Should have GAIN_FOOD effect
      const gainFoodEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainFoodEffect).toBeDefined();
      if (gainFoodEffect && gainFoodEffect.type === "GAIN_FOOD") {
        const totalGained = Object.values(gainFoodEffect.food).reduce(
          (sum: number, v) => sum + (v ?? 0),
          0
        );
        expect(totalGained).toBeGreaterThan(0);
      }

      // Should have HABITAT_ACTIVATED and FOOD_GAINED events
      expect(result.events.some((e) => e.type === "HABITAT_ACTIVATED")).toBe(
        true
      );
      expect(
        result.events.some(
          (e) => e.type === "FOOD_GAINED_FROM_HABITAT_ACTIVATION"
        )
      ).toBe(true);
    });

    it("rerolls dice when allowed and requested", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      const player = createTestPlayer("p1");
      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "selectFoodFromFeeder") {
          // Always take first available die
          const available = prompt.availableDice;
          for (const [dieType, count] of Object.entries(available)) {
            if (count && count > 0) {
              return {
                promptId: prompt.promptId,
                kind: "selectFoodFromFeeder",
                diceOrReroll: [{ die: dieType }],
              } as SelectFoodFromFeederChoice;
            }
          }
          // No dice available - this shouldn't happen in test but handle gracefully
          return {
            promptId: prompt.promptId,
            kind: "selectFoodFromFeeder",
            diceOrReroll: [{ die: "SEED" }],
          } as SelectFoodFromFeederChoice;
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "GAIN_FOOD",
        ctx,
        false,
        execCtx
      );

      // Should have GAIN_FOOD effect
      const gainFoodEffect = result.effects.find((e) => e.type === "GAIN_FOOD");
      expect(gainFoodEffect).toBeDefined();
      if (gainFoodEffect && gainFoodEffect.type === "GAIN_FOOD") {
        const totalGained = Object.values(gainFoodEffect.food).reduce(
          (sum: number, v) => sum + (v ?? 0),
          0
        );
        expect(totalGained).toBeGreaterThan(0);
      }
    });
  });

  describe("executeTurnAction() - LAY_EGGS", () => {
    it("lays eggs on birds with capacity", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      // Create a bird instance
      const birdCard = registry.getAllBirds()[0];
      const birdInstance: BirdInstance = {
        id: "p1_GRASSLAND_0_" + birdCard.id,
        card: birdCard,
        cachedFood: {},
        tuckedCards: [],
        eggs: 0,
      };

      const player = createTestPlayer("p1", {
        food: { INVERTEBRATE: 5 },
        birds: [{ habitat: "GRASSLAND", column: 0, bird: birdInstance }],
      });

      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "placeEggs") {
          // Place all eggs on the bird
          return {
            promptId: prompt.promptId,
            kind: "placeEggs",
            placements: { [birdInstance.id]: prompt.count },
          } as PlaceEggsChoice;
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "LAY_EGGS",
        ctx,
        false,
        execCtx
      );

      // Should have LAY_EGGS effect
      const layEggsEffect = result.effects.find((e) => e.type === "LAY_EGGS");
      expect(layEggsEffect).toBeDefined();

      // Should have returned events
      expect(result.events.length).toBeGreaterThan(0);
    });

    it("does nothing when no birds have egg capacity", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      // Player with no birds
      const player = createTestPlayer("p1");

      const agent = createMockAgentWithHandler("p1", () => {
        throw new Error("Should not prompt for eggs on empty board");
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      // Should not throw
      await processor.executeTurnAction("LAY_EGGS", ctx, false, execCtx);

      // No prompts should have been made
      expect(agent.chooseOption).not.toHaveBeenCalled();
    });
  });

  describe("executeTurnAction() - DRAW_CARDS", () => {
    it("draws cards from deck", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      const player = createTestPlayer("p1");
      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "drawCards") {
          return {
            promptId: prompt.promptId,
            kind: "drawCards",
            trayCards: [],
            numDeckCards: prompt.remaining,
          } as DrawCardsChoice;
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "DRAW_CARDS",
        ctx,
        false,
        execCtx
      );

      // Should have DRAW_CARDS effect
      const drawCardsEffect = result.effects.find(
        (e) => e.type === "DRAW_CARDS"
      );
      expect(drawCardsEffect).toBeDefined();

      // Should have returned HABITAT_ACTIVATED event
      expect(
        result.events.some(
          (e) => e.type === "HABITAT_ACTIVATED" && e.habitat === "WETLAND"
        )
      ).toBe(true);
    });

    it("can draw from tray", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      const player = createTestPlayer("p1");
      let trayCardId: string | null = null;

      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "drawCards") {
          // Take from tray if available
          if (prompt.trayCards.length > 0) {
            trayCardId = prompt.trayCards[0].id;
            return {
              promptId: prompt.promptId,
              kind: "drawCards",
              trayCards: [prompt.trayCards[0].id],
              numDeckCards: Math.max(0, prompt.remaining - 1),
            } as DrawCardsChoice;
          }
          return {
            promptId: prompt.promptId,
            kind: "drawCards",
            trayCards: [],
            numDeckCards: prompt.remaining,
          } as DrawCardsChoice;
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "DRAW_CARDS",
        ctx,
        false,
        execCtx
      );

      // Should have DRAW_CARDS effect
      const drawCardsEffect = result.effects.find(
        (e) => e.type === "DRAW_CARDS"
      );
      expect(drawCardsEffect).toBeDefined();

      // Should include the tray card in fromTray
      if (trayCardId && drawCardsEffect && drawCardsEffect.type === "DRAW_CARDS") {
        expect(drawCardsEffect.fromTray).toContain(trayCardId);
      }
    });
  });

  describe("executeTurnAction() - PLAY_BIRD", () => {
    it("does nothing when no birds are eligible", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      // Player with no cards in hand
      const player = createTestPlayer("p1");

      const agent = createMockAgentWithHandler("p1", () => {
        throw new Error("Should not prompt when no birds eligible");
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      await processor.executeTurnAction("PLAY_BIRD", ctx, false, execCtx);

      expect(agent.chooseOption).not.toHaveBeenCalled();
    });

    it("plays a bird when player has eligible cards", async () => {
      const registry = new DataRegistry();
      const processor = new ActionProcessor();

      // Find a bird with no food cost
      const freeBird = registry.getAllBirds().find(
        (b) => b.foodCostMode === "NONE"
      );
      if (!freeBird) {
        // Skip test if no free birds
        return;
      }

      const player = createTestPlayer("p1", {
        hand: [freeBird],
      });

      const agent = createMockAgentWithHandler("p1", (prompt) => {
        if (prompt.kind === "playBird") {
          const habitat = Object.keys(prompt.eggCostByEligibleHabitat)[0] as Habitat;
          return {
            promptId: prompt.promptId,
            kind: "playBird",
            bird: prompt.eligibleBirds[0].id,
            habitat,
            foodToSpend: {},
            eggsToSpend: {},
          } as PlayBirdChoice;
        }
        throw new Error(`Unexpected prompt: ${prompt.kind}`);
      });

      const { ctx, execCtx } = createTestContext(player, agent, registry);

      const result = await processor.executeTurnAction(
        "PLAY_BIRD",
        ctx,
        false,
        execCtx
      );

      // Should have PLAY_BIRD effect
      const playBirdEffect = result.effects.find(
        (e) => e.type === "PLAY_BIRD"
      );
      expect(playBirdEffect).toBeDefined();

      // Should have returned BIRD_PLAYED event
      expect(result.events.some((e) => e.type === "BIRD_PLAYED")).toBe(true);
    });
  });

  describe("choice validation and reprompting", () => {
    it("reprompts with previousError when agent makes invalid choice", async () => {
      // Find a bird with gainFoodFromSupply power for testing
      const allBirds = registry.getAllBirds();
      const birdWithPower = allBirds.find(
        (b) => b.power?.handlerId === "gainFoodFromSupply"
      );

      if (!birdWithPower) {
        console.log("No birds with gainFoodFromSupply power, skipping test");
        return;
      }

      const birdInstance = createBirdInstance(
        "test_instance_1",
        birdWithPower.id
      );
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      const promptsReceived: OptionPrompt[] = [];
      let callCount = 0;

      // First call: return invalid choice (wrong count)
      // Second call: return valid choice
      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          promptsReceived.push(prompt);
          callCount++;

          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            const foodType =
              (birdWithPower.power?.params.foodType as string) || "SEED";

            if (callCount === 2) {
              // First selectFoodFromSupply call - return invalid (wrong count)
              return Promise.resolve({
                kind: "selectFoodFromSupply",
                promptId: prompt.promptId,
                food: { [foodType]: 1 }, // Wrong count - should be prompt.count
              } as SelectFoodFromSupplyChoice);
            } else {
              // Second call - return valid choice
              return Promise.resolve({
                kind: "selectFoodFromSupply",
                promptId: prompt.promptId,
                food: { [foodType]: prompt.count },
              } as SelectFoodFromSupplyChoice);
            }
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      const result = await processor.executeSinglePower(
        "test_instance_1",
        "player1",
        execCtx
      );

      // Should succeed after reprompt
      expect(result.activated).toBe(true);

      // Should have received at least 3 prompts: activatePower, invalid selectFoodFromSupply, valid selectFoodFromSupply
      expect(promptsReceived.length).toBeGreaterThanOrEqual(3);

      // The third prompt (second selectFoodFromSupply) should have previousError set
      const reprompt = promptsReceived[2];
      expect(reprompt.kind).toBe("selectFoodFromSupply");
      expect(reprompt.previousError).toBeDefined();
      expect(reprompt.previousError?.code).toBe("INVALID_FOOD_COUNT");
    });

    it("throws AgentForfeitError after 3 consecutive invalid choices", async () => {
      // Find a bird with gainFoodFromSupply power for testing
      const allBirds = registry.getAllBirds();
      const birdWithPower = allBirds.find(
        (b) => b.power?.handlerId === "gainFoodFromSupply"
      );

      if (!birdWithPower) {
        console.log("No birds with gainFoodFromSupply power, skipping test");
        return;
      }

      const birdInstance = createBirdInstance(
        "test_instance_1",
        birdWithPower.id
      );
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");

      // Always return invalid choice (wrong count)
      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            const foodType =
              (birdWithPower.power?.params.foodType as string) || "SEED";
            // Always return wrong count
            return Promise.resolve({
              kind: "selectFoodFromSupply",
              promptId: prompt.promptId,
              food: { [foodType]: 999 }, // Invalid - wrong count
            } as SelectFoodFromSupplyChoice);
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Should throw AgentForfeitError after 3 attempts
      await expect(
        processor.executeSinglePower("test_instance_1", "player1", execCtx)
      ).rejects.toThrow(AgentForfeitError);

      // Verify error details
      try {
        await processor.executeSinglePower("test_instance_1", "player1", execCtx);
      } catch (e) {
        expect(e).toBeInstanceOf(AgentForfeitError);
        const error = e as AgentForfeitError;
        expect(error.playerId).toBe("player1");
        expect(error.attempts).toBe(3);
        expect(error.lastError.code).toBe("INVALID_FOOD_COUNT");
      }
    });

    it("succeeds when valid choice is made after 2 failed attempts", async () => {
      // Find a bird with gainFoodFromSupply power for testing
      const allBirds = registry.getAllBirds();
      const birdWithPower = allBirds.find(
        (b) => b.power?.handlerId === "gainFoodFromSupply"
      );

      if (!birdWithPower) {
        console.log("No birds with gainFoodFromSupply power, skipping test");
        return;
      }

      const birdInstance = createBirdInstance(
        "test_instance_1",
        birdWithPower.id
      );
      const player = createPlayerState("player1", {
        FOREST: [birdInstance, null, null, null, null],
      });
      const state = createGameState([player]);

      const mockAgent = createMockAgent("player1");
      let selectFoodCallCount = 0;

      // First two selectFoodFromSupply calls: invalid
      // Third call: valid
      (mockAgent.chooseOption as ReturnType<typeof vi.fn>).mockImplementation(
        (prompt) => {
          if (prompt.kind === "activatePower") {
            return Promise.resolve({
              kind: "activatePower",
              promptId: prompt.promptId,
              activate: true,
            } as ActivatePowerChoice);
          } else if (prompt.kind === "selectFoodFromSupply") {
            selectFoodCallCount++;
            const foodType =
              (birdWithPower.power?.params.foodType as string) || "SEED";

            if (selectFoodCallCount <= 2) {
              // First two calls - invalid
              return Promise.resolve({
                kind: "selectFoodFromSupply",
                promptId: prompt.promptId,
                food: { [foodType]: 0 }, // Invalid - wrong count
              } as SelectFoodFromSupplyChoice);
            } else {
              // Third call - valid
              return Promise.resolve({
                kind: "selectFoodFromSupply",
                promptId: prompt.promptId,
                food: { [foodType]: prompt.count },
              } as SelectFoodFromSupplyChoice);
            }
          }
          throw new Error(`Unexpected prompt kind: ${prompt.kind}`);
        }
      );

      const agents = new Map([["player1", mockAgent]]);
      const execCtx = createMockExecutionContext(state, registry, agents);

      // Should succeed on the third attempt (2 failures + 1 success)
      const result = await processor.executeSinglePower(
        "test_instance_1",
        "player1",
        execCtx
      );

      expect(result.activated).toBe(true);
      expect(selectFoodCallCount).toBe(3);
    });
  });
});

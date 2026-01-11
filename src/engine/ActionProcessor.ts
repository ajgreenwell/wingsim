/**
 * ActionProcessor - Unified processor for turn actions and bird powers.
 *
 * Key responsibilities:
 * 1. Maintain registries of power handlers and turn action handlers
 * 2. Execute individual power handlers (driving the generator)
 * 3. Execute turn actions (GAIN_FOOD, LAY_EGGS, DRAW_CARDS, PLAY_BIRD)
 * 4. Find triggered pink powers for a given event
 *
 * NOTE: ActionProcessor does NOT loop over brown powers. That loop is owned
 * by GameEngine.processBrownPowerChain() to ensure pink powers resolve
 * between each brown power activation.
 */

import type { Event, PinkPowerTriggerEvent } from "../types/events.js";
import type { Effect } from "../types/effects.js";
import type {
  BirdInstance,
  Habitat,
  PlayerId,
} from "../types/core.js";
import type { GameState } from "./GameEngine.js";
import type {
  ActionExecutionContext,
  PowerActivationResult,
  PowerContext,
  PowerHandlerRegistry,
  PowerYield,
  PowerReceive,
  TurnActionHandlerContext,
  TurnActionHandlerRegistry,
} from "../types/power.js";
import { isPromptRequest, isDeferredContinuation, isEventYield } from "../types/power.js";
import type { TurnActionKind } from "../types/prompts.js";
import {
  // Power handlers
  gainFoodFromSupply,
  gainFoodFromFeederWithCache,
  whenOpponentLaysEggsLayEggOnNestType,
  playersWithFewestInHabitatDrawCard,
  tuckAndDraw,
  discardEggToGainFood,
  rollDiceAndCacheIfMatch,
  drawAndDistributeCards,
  gainFoodFromFeeder,
  discardFoodToTuckFromDeck,
  eachPlayerGainsFoodFromFeeder,
  layEggOnBirdsWithNestType,
  drawBonusCardsAndKeep,
  layEggsOnBird,
  gainAllFoodTypeFromFeeder,
  allPlayersGainFoodFromSupply,
  lookAtCardAndTuckIfWingspanUnder,
  whenOpponentPlaysBirdInHabitatGainFood,
  moveToAnotherHabitatIfRightmost,
  drawCardsWithDelayedDiscard,
  // Turn action handlers
  gainFoodHandler,
  layEggsHandler,
  drawCardsHandler,
  playBirdHandler,
} from "./ActionHandlers.js";

/**
 * Simplified context for initiating a turn action.
 * Does NOT contain mutable objects - handlers use getState() for read-only access.
 */
export interface TurnActionContext {
  playerId: PlayerId;
  round: number;
}

/**
 * Result of executing a turn action.
 * Contains effects to apply and events to enqueue.
 */
export interface TurnActionResult {
  effects: Effect[];
  events: Event[];
}

// Re-export ActionExecutionContext for backwards compatibility
export type { ActionExecutionContext } from "../types/power.js";

/**
 * @deprecated Use ActionExecutionContext instead
 */
export type TurnActionExecutionContext = ActionExecutionContext;

export interface PinkPowerTrigger {
  birdInstanceId: string;
  ownerId: PlayerId;
  habitat: Habitat;
  handlerId: string;
}

export class ActionProcessor {
  private readonly handlers: PowerHandlerRegistry = new Map();
  private readonly turnActionHandlers: TurnActionHandlerRegistry = new Map();

  constructor() {
    // Register all power handlers
    this.handlers.set("gainFoodFromSupply", gainFoodFromSupply);
    this.handlers.set(
      "gainFoodFromFeederWithCache",
      gainFoodFromFeederWithCache
    );
    this.handlers.set(
      "whenOpponentLaysEggsLayEggOnNestType",
      whenOpponentLaysEggsLayEggOnNestType
    );
    this.handlers.set(
      "playersWithFewestInHabitatDrawCard",
      playersWithFewestInHabitatDrawCard
    );
    this.handlers.set("tuckAndDraw", tuckAndDraw);
    this.handlers.set("discardEggToGainFood", discardEggToGainFood);
    this.handlers.set("rollDiceAndCacheIfMatch", rollDiceAndCacheIfMatch);
    this.handlers.set("drawAndDistributeCards", drawAndDistributeCards);
    this.handlers.set("gainFoodFromFeeder", gainFoodFromFeeder);
    this.handlers.set("discardFoodToTuckFromDeck", discardFoodToTuckFromDeck);
    this.handlers.set(
      "eachPlayerGainsFoodFromFeeder",
      eachPlayerGainsFoodFromFeeder
    );
    this.handlers.set("layEggOnBirdsWithNestType", layEggOnBirdsWithNestType);
    this.handlers.set("drawBonusCardsAndKeep", drawBonusCardsAndKeep);
    this.handlers.set("layEggsOnBird", layEggsOnBird);
    this.handlers.set("gainAllFoodTypeFromFeeder", gainAllFoodTypeFromFeeder);
    this.handlers.set(
      "allPlayersGainFoodFromSupply",
      allPlayersGainFoodFromSupply
    );
    this.handlers.set(
      "lookAtCardAndTuckIfWingspanUnder",
      lookAtCardAndTuckIfWingspanUnder
    );
    this.handlers.set(
      "whenOpponentPlaysBirdInHabitatGainFood",
      whenOpponentPlaysBirdInHabitatGainFood
    );
    this.handlers.set(
      "moveToAnotherHabitatIfRightmost",
      moveToAnotherHabitatIfRightmost
    );
    this.handlers.set(
      "drawCardsWithDelayedDiscard",
      drawCardsWithDelayedDiscard
    );

    // Register turn action handlers
    this.turnActionHandlers.set("GAIN_FOOD", gainFoodHandler);
    this.turnActionHandlers.set("LAY_EGGS", layEggsHandler);
    this.turnActionHandlers.set("DRAW_CARDS", drawCardsHandler);
    this.turnActionHandlers.set("PLAY_BIRD", playBirdHandler);
  }

  /**
   * Execute a turn action.
   *
   * This is the main entry point for executing turn actions, analogous to
   * executeSinglePower(). It dispatches to the appropriate handler from the
   * registry, runs it to completion, and returns the collected effects and events.
   */
  async executeTurnAction(
    action: TurnActionKind,
    ctx: TurnActionContext,
    takeBonus: boolean,
    execCtx: ActionExecutionContext
  ): Promise<TurnActionResult> {
    const handler = this.turnActionHandlers.get(action);
    if (!handler) {
      throw new Error(`No handler registered for turn action: ${action}`);
    }

    const handlerCtx = this.buildTurnActionHandlerContext(ctx, execCtx);
    const gen = handler(handlerCtx, { takeBonus });
    return this.runGenerator(gen, ctx.playerId, execCtx);
  }

  /**
   * Build the handler context from turn action context and execution context.
   */
  private buildTurnActionHandlerContext(
    ctx: TurnActionContext,
    execCtx: ActionExecutionContext
  ): TurnActionHandlerContext {
    return {
      playerId: ctx.playerId,
      round: ctx.round,
      getState: () => execCtx.getState(),
      getRegistry: () => execCtx.getRegistry(),
      generatePromptId: () => execCtx.generatePromptId(),
      buildPlayerView: () => execCtx.buildPlayerView(ctx.playerId),
      buildPromptContext: () => execCtx.buildPromptContext(),
    };
  }

  /**
   * Execute a single power for a bird.
   *
   * Drives the generator, handling prompts and collecting effects.
   * Returns the result with all effects generated.
   */
  async executeSinglePower(
    birdInstanceId: string,
    ownerId: PlayerId,
    execCtx: ActionExecutionContext
  ): Promise<PowerActivationResult> {
    const state = execCtx.getState();

    // Find the bird instance
    const bird = this.findBirdInstance(state, birdInstanceId);
    if (!bird) {
      throw new Error(
        `Bird instance ${birdInstanceId} not found on any player's board`
      );
    }

    const birdCard = bird.card;
    const power = birdCard.power;
    if (!power) {
      return {
        birdInstanceId,
        handlerId: "none",
        activated: false,
        skipReason: "CONDITION_NOT_MET",
        effects: [],
        events: [],
      };
    }
    const handler = this.handlers.get(power.handlerId);
    if (!handler) {
      // No handler registered for this power yet
      console.error(`No handler registered for power ${power.handlerId}`);
      return {
        birdInstanceId,
        handlerId: power.handlerId,
        activated: false,
        skipReason: "CONDITION_NOT_MET",
        effects: [],
        events: [],
      };
    }

    // Build the power context
    const ctx: PowerContext = {
      ownerId,
      birdInstanceId: bird.id,
      birdCardId: bird.card.id,
      getHabitat: () => {
        // Look up bird's current habitat from live state (safe for continuations)
        const currentState = execCtx.getState();
        for (const player of currentState.players) {
          for (const h of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
            for (const b of player.board[h]) {
              if (b?.id === bird.id) {
                return h;
              }
            }
          }
        }
        throw new Error(`Bird ${bird.id} not found on any board`);
      },
      activePlayerId: state.players[state.activePlayerIndex].id,
      round: state.round,
      getState: () => execCtx.getState(),
      getRegistry: () => execCtx.getRegistry(),
      generatePromptId: () => execCtx.generatePromptId(),
      buildOwnerView: () => execCtx.buildPlayerView(ownerId),
      buildPlayerView: (playerId) => execCtx.buildPlayerView(playerId),
      buildPromptContext: () =>
        execCtx.buildPromptContext({
          type: power.trigger,
          sourceBirdId: bird.id,
          habitat: ctx.getHabitat(),
        }),
    };

    // Execute the generator
    const gen = handler(ctx, power.params);
    let result: { effects: Effect[]; events: Event[] };

    try {
      result = await this.runGenerator(gen, ownerId, execCtx);
    } catch (error) {
      console.error(`Error executing power handler ${power.handlerId}:`, error);
      return {
        birdInstanceId,
        handlerId: power.handlerId,
        activated: false,
        skipReason: "CONDITION_NOT_MET",
        effects: [],
        events: [],
      };
    }

    const activateEffect = result.effects.find(
      (e) => e.type === "ACTIVATE_POWER"
    );
    if (!activateEffect) {
      throw new Error(
        `No activate power effect found for power ${power.handlerId}`
      );
    }

    return {
      birdInstanceId,
      handlerId: power.handlerId,
      activated: activateEffect.activated,
      skipReason: activateEffect.skipReason,
      effects: result.effects,
      events: result.events,
    };
  }

  /**
   * Execute a deferred continuation at end of turn.
   * Uses the same generator-driving logic as power execution.
   */
  async executeContinuation(
    continuation: () => Generator<PowerYield, void, PowerReceive>,
    playerId: PlayerId,
    execCtx: ActionExecutionContext
  ): Promise<{ effects: Effect[]; events: Event[] }> {
    const gen = continuation();
    return this.runGenerator(gen, playerId, execCtx);
  }

  /**
   * Drives a power generator to completion, handling prompts, effects, events, and deferrals.
   * Shared by executeSinglePower and executeContinuation.
   *
   * Effects are applied immediately when yielded.
   * Events are collected and returned for processing after the generator completes.
   */
  private async runGenerator(
    gen: Generator<PowerYield, void, PowerReceive>,
    playerId: PlayerId,
    execCtx: ActionExecutionContext
  ): Promise<{ effects: Effect[]; events: Event[] }> {
    const effects: Effect[] = [];
    const events: Event[] = [];
    let iterResult = gen.next();

    while (!iterResult.done) {
      const yielded = iterResult.value;

      if (isPromptRequest(yielded)) {
        // Pause and get agent decision
        const promptPlayerId = yielded.prompt.playerId;
        const agent = execCtx.getAgent(promptPlayerId);
        const choice = await agent.chooseOption(yielded.prompt);
        iterResult = gen.next(choice);
      } else if (isDeferredContinuation(yielded)) {
        // Store continuation for end-of-turn execution
        execCtx.deferContinuation(playerId, yielded.continuation);
        iterResult = gen.next(undefined);
      } else if (isEventYield(yielded)) {
        // Collect event for later processing
        events.push(yielded.event);
        iterResult = gen.next(undefined);
      } else {
        // It's an Effect - apply immediately and collect
        const effect = yielded as Effect;
        execCtx.applyEffect(effect);
        effects.push(effect);
        iterResult = gen.next(effect);
      }
    }

    return { effects, events };
  }

  /**
   * Find all pink powers that trigger on a given event.
   * Returns triggers in clockwise order starting from player left of active.
   */
  findTriggeredPinkPowers(
    event: PinkPowerTriggerEvent,
    state: GameState,
    _execCtx: ActionExecutionContext
  ): PinkPowerTrigger[] {
    const triggers: PinkPowerTrigger[] = [];
    const activePlayerId = state.players[state.activePlayerIndex].id;

    // Get players in clockwise order starting left of active
    const orderedPlayers = this.getClockwisePlayerOrder(state, activePlayerId);

    orderedPlayers.forEach((player) => {
      if (player.id === activePlayerId) return; // Skip active player

      Object.entries(player.board).forEach(([habitat, birds]) => {
        birds.forEach((bird) => {
          if (!bird) return; // skip empty slots

          const power = bird.card.power;
          if (power?.trigger !== "ONCE_BETWEEN_TURNS") return;

          // Check if this pink power triggers on this event type
          if (this.pinkPowerTriggersOnEvent(power.handlerId, event)) {
            triggers.push({
              birdInstanceId: bird.id,
              ownerId: player.id,
              habitat: habitat as Habitat,
              handlerId: power.handlerId,
            });
          }
        });
      });
    });

    return triggers;
  }

  /**
   * Check if a pink power handler triggers on a specific event type.
   */
  private pinkPowerTriggersOnEvent(
    handlerId: string,
    event: PinkPowerTriggerEvent
  ): boolean {
    // Map of handler IDs to the event types they trigger on
    const triggerMap: Record<string, PinkPowerTriggerEvent["type"][]> = {
      // Egg-laying triggers (e.g., American Avocet, Bronzed Cowbird)
      whenOpponentLaysEggsLayEggOnNestType: [
        "EGGS_LAID_FROM_HABITAT_ACTIVATION",
      ],

      // Predator success triggers (e.g., Turkey Vulture, Black Vulture)
      whenOpponentPredatorSucceedsGainFood: ["PREDATOR_POWER_RESOLVED"],

      // Food gaining triggers (e.g., Loggerhead Shrike)
      whenOpponentGainsFoodCacheIfMatch: [
        "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
      ],

      // Bird played triggers (e.g., Belted Kingfisher, Eastern Kingbird)
      whenOpponentPlaysBirdInHabitatGainFood: ["BIRD_PLAYED"],
      whenOpponentPlaysBirdInHabitatTuckCard: ["BIRD_PLAYED"],
    };

    const triggers = triggerMap[handlerId];
    return triggers ? triggers.includes(event.type) : false;
  }

  /**
   * Get players in clockwise order starting from player left of active.
   */
  private getClockwisePlayerOrder(
    state: GameState,
    activePlayerId: PlayerId
  ): typeof state.players {
    const activeIndex = state.players.findIndex((p) => p.id === activePlayerId);
    const result = [];

    // Start from player after active, wrap around
    for (let i = 1; i < state.players.length; i++) {
      const idx = (activeIndex + i) % state.players.length;
      result.push(state.players[idx]);
    }

    return result;
  }

  /**
   * Find a bird instance in the game state.
   */
  private findBirdInstance(
    state: GameState,
    birdInstanceId: string
  ): BirdInstance {
    for (const player of state.players) {
      for (const birds of Object.values(player.board)) {
        for (const bird of birds) {
          if (bird?.id === birdInstanceId) {
            return bird;
          }
        }
      }
    }
    throw new Error(
      `Bird instance ${birdInstanceId} not found on any player's board`
    );
  }
}

/**
 * Power Resolution Types for Wingspan Simulator
 *
 * This file defines the types used by power handlers (generators)
 * and the PowerProcessor that executes them.
 */

import type { ActivatePowerEffect, Effect } from "./effects.js";
import type { Event, PinkPowerTriggerEvent } from "./events.js";
import type {
  OptionPrompt,
  OptionChoice,
  PlayerView,
  PromptContext,
  PromptId,
  TurnActionKind,
} from "./prompts.js";
import type {
  PlayerId,
  BirdInstanceId,
  BirdCardId,
  Habitat,
} from "./core.js";
import type { GameState } from "../engine/GameEngine.js";
import type { DataRegistry } from "../data/DataRegistry.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";

// ============================================================================
// Power Yield Types - What handlers can emit
// ============================================================================

/**
 * A power handler yields one of these types:
 * - Effect: Request a state change
 * - PromptRequest: Pause for agent input
 * - DeferredContinuation: Schedule work for end of turn
 * - EventYield: Emit a semantic event for processing after effects
 */
export type PowerYield = Effect | PromptRequest | DeferredContinuation | EventYield;

/**
 * Wrapper for yielding an event from a handler.
 * Events are collected by the runner and processed after the generator completes.
 */
export interface EventYield {
  type: "EVENT";
  event: Event;
}

/**
 * Type guard to distinguish EventYield from other yield types.
 */
export function isEventYield(y: PowerYield): y is EventYield {
  return (
    typeof y === "object" &&
    y !== null &&
    "type" in y &&
    y.type === "EVENT" &&
    "event" in y
  );
}

/**
 * Request to prompt an agent for a decision.
 * The generator pauses until the choice is provided via .next(choice).
 */
export interface PromptRequest {
  type: "PROMPT";
  prompt: OptionPrompt;
}

/**
 * Type guard to distinguish PromptRequest from Effect.
 */
export function isPromptRequest(y: PowerYield): y is PromptRequest {
  return (
    typeof y === "object" &&
    y !== null &&
    "type" in y &&
    y.type === "PROMPT" &&
    "prompt" in y
  );
}

/**
 * A continuation to be executed at end of turn.
 * The generator function will be invoked with the same ctx,
 * which reads live state via its getter methods.
 */
export interface DeferredContinuation {
  type: "DEFER_TO_END_OF_TURN";
  continuation: () => Generator<PowerYield, void, PowerReceive>;
}

/**
 * Type guard to distinguish DeferredContinuation from other yields.
 */
export function isDeferredContinuation(y: PowerYield): y is DeferredContinuation {
  return (
    typeof y === "object" &&
    y !== null &&
    "type" in y &&
    y.type === "DEFER_TO_END_OF_TURN"
  );
}

// ============================================================================
// Power Context - What handlers receive
// ============================================================================

/**
 * Context passed to power handlers.
 * Provides read-only access to current state and helper methods.
 */
export interface PowerContext {
  /** The player who owns the bird with this power */
  readonly ownerId: PlayerId;

  /** The bird instance triggering this power */
  readonly birdInstanceId: BirdInstanceId;

  /** The bird's card ID (for looking up static data) */
  readonly birdCardId: BirdCardId;

  /**
   * Get the bird's current habitat.
   * This is a method (not a property) to ensure it reads live state,
   * making it safe to use in deferred continuations.
   */
  getHabitat(): Habitat;

  /** The currently active player (may differ from ownerId for pink powers) */
  readonly activePlayerId: PlayerId;

  /** Current round (1-4) */
  readonly round: number;

  /** Access to game state at resolution time (read-only view) */
  getState(): Readonly<GameState>;

  /** Access to card registry for looking up definitions */
  getRegistry(): DataRegistry;

  /** Generate a unique prompt ID */
  generatePromptId(): string;

  /** Build a PlayerView for the power owner */
  buildOwnerView(): PlayerView;

  /** Build a PlayerView for any player (for multi-player powers) */
  buildPlayerView(playerId: PlayerId): PlayerView;

  /** Build a PromptContext for the current trigger */
  buildPromptContext(): PromptContext;

  /**
   * Get the event that triggered this pink power.
   * Returns undefined for brown/white powers (non-pink triggers).
   */
  getTriggeringEvent(): PinkPowerTriggerEvent | undefined;
}

// ============================================================================
// Power Handler - The generator function signature
// ============================================================================

/**
 * What a generator receives when resumed after yielding.
 * - After yielding a PromptRequest: receives the agent's OptionChoice
 * - After yielding an Effect: receives the same Effect with result fields populated
 * - After yielding an EventYield: receives undefined
 */
export type PowerReceive = Effect | OptionChoice | undefined;

/**
 * Alias for PowerYield - used by turn action handlers for clarity.
 * Both power handlers and turn action handlers use the same yield types.
 */
export type ActionYield = PowerYield;

/**
 * Alias for PowerReceive - used by turn action handlers for clarity.
 */
export type ActionReceive = PowerReceive;

/**
 * A power handler is a generator function that:
 * - Yields Effect objects to request state mutations
 * - Yields PromptRequest to pause for agent input
 * - Receives agent choices or populated effects via the iterator protocol
 *
 * Note: Handlers are synchronous generators. The async work (awaiting agent
 * decisions) is handled by the executor in PowerProcessor.
 *
 * When an Effect is yielded, it is applied immediately and the same Effect
 * object is passed back with any result fields populated (e.g., drawnCards).
 *
 * @param ctx - Context providing access to state and utilities
 * @param params - Handler-specific parameters from the bird's PowerSpec
 * @returns Generator yielding PowerYield, returning void, receiving Effect or OptionChoice
 */
export type PowerHandler = (
  ctx: PowerContext,
  params: Record<string, unknown>
) => Generator<PowerYield, void, PowerReceive>;

/**
 * Registry of all power handlers by their ID.
 * Maps PowerSpec.handlerId to the handler function.
 */
export type PowerHandlerRegistry = Map<string, PowerHandler>;

// ============================================================================
// Power Activation Result - What executeSinglePower returns
// ============================================================================

/**
 * Result of fully resolving a single power.
 * Contains all effects and events generated during execution.
 */
export interface PowerActivationResult {
  /** The bird that had this power */
  birdInstanceId: BirdInstanceId;

  /** The handler that was invoked */
  handlerId: string;

  /** Whether the power was actually activated */
  activated: boolean;

  /** If not activated, why */
  skipReason?: ActivatePowerEffect["skipReason"] | "NO_POWER";

  /** All effects generated by this power (in order) */
  effects: Effect[];

  /** All events generated by this power (in order) */
  events: Event[];
}

// ============================================================================
// Execution Context - What ActionProcessor needs from GameEngine
// ============================================================================

/**
 * Unified execution context for both turn actions and power handlers.
 * Allows ActionProcessor to remain decoupled from GameEngine implementation.
 */
export interface ActionExecutionContext {
  /** Get current game state (read-only) */
  getState(): Readonly<GameState>;

  /** Get the data registry */
  getRegistry(): DataRegistry;

  /** Generate a unique prompt ID */
  generatePromptId(): string;

  /** Get the agent for a specific player */
  getAgent(playerId: PlayerId): PlayerAgent;

  /** Build a PlayerView for a specific player */
  buildPlayerView(playerId: PlayerId): PlayerView;

  /**
   * Build a PromptContext for the current situation.
   * @param trigger - Optional trigger context for power handlers
   */
  buildPromptContext(trigger?: PromptContext["trigger"]): PromptContext;

  /**
   * Apply an effect immediately to game state.
   * Populates result fields on the effect (e.g., drawnCards for DrawCardsEffect).
   * This enables handlers to see the results of their effects for subsequent prompts.
   *
   * Returns a Promise to support effects that require async execution,
   * such as REPEAT_BROWN_POWER which triggers another power handler.
   */
  applyEffect(effect: Effect): Promise<void>;

  /**
   * Defer a continuation to be executed at end of turn.
   * The continuation will be invoked after the event queue drains.
   */
  deferContinuation(
    playerId: PlayerId,
    continuation: () => Generator<PowerYield, void, PowerReceive>
  ): void;

  /**
   * The triggering event for pink powers.
   * Only set when executing a pink power triggered by an event.
   */
  triggeringEvent?: PinkPowerTriggerEvent;
}

/**
 * @deprecated Use ActionExecutionContext instead. Kept for backwards compatibility.
 */
export type PowerExecutionContext = ActionExecutionContext;

// ============================================================================
// Turn Action Handler Types
// ============================================================================

/**
 * Context passed to turn action handlers.
 * Provides read-only access to state - no mutable objects like birdfeeder.
 */
export interface TurnActionHandlerContext {
  /** The player taking the turn action */
  readonly playerId: PlayerId;

  /** Current round (1-4) */
  readonly round: number;

  /** Access to game state at resolution time (read-only view) */
  getState(): Readonly<GameState>;

  /** Access to card registry for looking up definitions */
  getRegistry(): DataRegistry;

  /** Generate a unique prompt ID */
  generatePromptId(): PromptId;

  /** Build a PlayerView for the current player */
  buildPlayerView(): PlayerView;

  /** Build a PromptContext for prompts */
  buildPromptContext(): PromptContext;
}

/**
 * Parameters passed to turn action handlers.
 */
export interface TurnActionParams {
  /** Whether the player chose to pay for the bonus reward */
  takeBonus: boolean;
}

/**
 * A turn action handler is a generator function that:
 * - Yields Effect objects to request state mutations
 * - Yields PromptRequest to pause for agent input
 * - Yields EventYield to emit semantic events
 *
 * Similar to PowerHandler but for turn actions (GAIN_FOOD, LAY_EGGS, etc.)
 */
export type TurnActionHandler = (
  ctx: TurnActionHandlerContext,
  params: TurnActionParams
) => Generator<ActionYield, void, ActionReceive>;

/**
 * Registry mapping turn action kinds to their handlers.
 */
export type TurnActionHandlerRegistry = Map<TurnActionKind, TurnActionHandler>;

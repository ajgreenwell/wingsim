/**
 * GameObserver - Interface for observing game events and effects.
 *
 * Observers can subscribe to the GameEngine to receive notifications about:
 * - Events: Semantic game moments (bird played, round started, etc.)
 * - Effects: State mutations (food gained, eggs laid, cards drawn, etc.)
 *
 * This is useful for:
 * - Rendering/UI updates
 * - Logging and debugging
 * - Integration testing (collecting events/effects for assertions)
 * - AI agents that benefit from a narrative of what happened
 */

import type { Event } from "../types/events.js";
import type { Effect } from "../types/effects.js";

/**
 * Observer interface for receiving game state change notifications.
 * All methods are optional - implement only the ones you need.
 */
export interface GameObserver {
  /**
   * Called when an event is about to be processed.
   * Events are semantic moments like BIRD_PLAYED, ROUND_STARTED, etc.
   */
  onEventProcessing?(event: Event): void;

  /**
   * Called when an effect is about to be applied to the game state.
   * Effects are state mutations like GAIN_FOOD, LAY_EGGS, etc.
   */
  onEffectApplied?(effect: Effect): void;
}

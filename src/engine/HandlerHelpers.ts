/**
 * Shared helper functions for power handlers and turn action handlers.
 *
 * These helpers provide ergonomic generator utilities that can be used
 * with yield* to simplify handler code.
 */

import type { Event } from "../types/events.js";
import type { EventYield } from "../types/power.js";

/**
 * Helper to yield an event from a handler.
 *
 * Events are collected by the runner and processed after the generator completes.
 * Unlike effects (which are applied immediately), events are queued for later
 * processing to ensure proper ordering of power triggers.
 *
 * Usage:
 * ```typescript
 * yield* event({
 *   type: "PREDATOR_POWER_RESOLVED",
 *   playerId: ctx.ownerId,
 *   // ... other event fields
 * });
 * ```
 */
export function* event(evt: Event): Generator<EventYield, void, unknown> {
  yield { type: "EVENT", event: evt };
}

/**
 * Custom error types for the Wingspan game engine.
 */

import type { PlayerId } from "../types/core.js";
import type { ValidationError } from "../types/prompts.js";

/**
 * Thrown when an agent repeatedly makes invalid choices and exhausts retries.
 * After 3 failed attempts on the same prompt, the agent forfeits the game.
 */
export class AgentForfeitError extends Error {
  constructor(
    /** The player whose agent forfeited */
    public readonly playerId: PlayerId,
    /** The prompt ID that caused the forfeit */
    public readonly promptId: string,
    /** Number of failed attempts (always 3) */
    public readonly attempts: number,
    /** The validation error from the last failed attempt */
    public readonly lastError: ValidationError
  ) {
    super(
      `Agent "${playerId}" forfeited after ${attempts} invalid attempts on prompt "${promptId}": ${lastError.message}`
    );
    this.name = "AgentForfeitError";
  }
}

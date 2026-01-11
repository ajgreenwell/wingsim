import type { PlayerId } from "../types/core.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
} from "../types/prompts.js";

/**
 * Interface for player agents that can participate in a Wingspan game.
 * Agents receive prompts and return decisions.
 *
 * Per WingsimSpec Section 5, agents use 3 async methods:
 * - chooseStartingHand: Select initial birds/bonus cards from dealt hand
 * - chooseTurnAction: Choose one of 4 actions on each turn
 * - chooseOption: Handle all other decision prompts during gameplay
 */
export interface PlayerAgent {
  readonly playerId: PlayerId;

  /** Choose which birds/bonus card to keep from initial deal */
  chooseStartingHand(prompt: StartingHandPrompt): Promise<StartingHandChoice>;

  /** Choose which of the 4 actions to take on this turn */
  chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice>;

  /** Handle all other decision prompts (food selection, egg placement, card draw, play bird, etc.) */
  chooseOption(prompt: OptionPrompt): Promise<OptionChoice>;
}

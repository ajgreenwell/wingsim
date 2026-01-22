/**
 * ScriptedAgent - An agent that follows a predetermined script of choices.
 *
 * Used for deterministic integration testing where we need to control
 * exactly what choices an agent makes.
 */

import type { PlayerAgent } from "../../agents/PlayerAgent.js";
import type { PlayerId } from "../../types/core.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
  ActivatePowerChoice,
  SelectFoodFromFeederChoice,
  SelectFoodFromSupplyChoice,
  SelectFoodDestinationChoice,
  DiscardEggsChoice,
  PlaceEggsChoice,
  SelectCardsChoice,
  DrawCardsChoice,
  SelectBonusCardsChoice,
  SelectPlayerChoice,
  RepeatPowerChoice,
  PlayBirdChoice,
  DiscardFoodChoice,
  SelectHabitatChoice,
  PromptId,
} from "../../types/prompts.js";

/**
 * Scripted choices omit promptId since it's generated at runtime.
 * The ScriptedAgent will add the promptId when converting to real choices.
 */
export type ScriptedChoice =
  | Omit<StartingHandChoice, "promptId">
  | Omit<TurnActionChoice, "promptId">
  | Omit<ActivatePowerChoice, "promptId">
  | Omit<SelectFoodFromFeederChoice, "promptId">
  | Omit<SelectFoodFromSupplyChoice, "promptId">
  | Omit<SelectFoodDestinationChoice, "promptId">
  | Omit<DiscardEggsChoice, "promptId">
  | Omit<PlaceEggsChoice, "promptId">
  | Omit<SelectCardsChoice, "promptId">
  | Omit<DrawCardsChoice, "promptId">
  | Omit<SelectBonusCardsChoice, "promptId">
  | Omit<SelectPlayerChoice, "promptId">
  | Omit<RepeatPowerChoice, "promptId">
  | Omit<PlayBirdChoice, "promptId">
  | Omit<DiscardFoodChoice, "promptId">
  | Omit<SelectHabitatChoice, "promptId">;

/**
 * Configuration for a ScriptedAgent.
 * The script contains an ordered list of choices that will be returned
 * for prompts in the order they are received.
 *
 * Note: These choices come from flattening the scenario's turn blocks
 * for this player. The ScenarioBuilder handles this transformation.
 */
export interface ScriptedAgentConfig {
  playerId: PlayerId;
  script: ScriptedChoice[];
}

/**
 * Thrown when the script has no more choices but a prompt was received.
 */
export class ScriptExhaustedError extends Error {
  constructor(
    public readonly promptKind: string,
    public readonly promptId: string,
    public readonly choicesConsumed: number
  ) {
    super(
      `Script exhausted: received ${promptKind} prompt (${promptId}) ` +
        `but all ${choicesConsumed} scripted choices have been consumed`
    );
    this.name = "ScriptExhaustedError";
  }
}

/**
 * Thrown when the next scripted choice doesn't match the received prompt.
 */
export class ScriptMismatchError extends Error {
  constructor(
    public readonly expectedKind: string,
    public readonly receivedKind: string,
    public readonly promptId: string,
    public readonly scriptIndex: number
  ) {
    super(
      `Script mismatch at index ${scriptIndex}: expected ${expectedKind} ` +
        `but received ${receivedKind} prompt (${promptId})`
    );
    this.name = "ScriptMismatchError";
  }
}

/**
 * Creates a ScriptedAgent that follows a predetermined script.
 *
 * The agent consumes choices from the script in order. When a prompt is received:
 * 1. If script is empty, throws ScriptExhaustedError
 * 2. If next choice's kind doesn't match prompt kind, throws ScriptMismatchError
 * 3. Otherwise, returns the choice and advances the script
 */
export class ScriptedAgent implements PlayerAgent {
  readonly playerId: PlayerId;
  private readonly script: ScriptedChoice[];
  private scriptIndex: number = 0;

  constructor(config: ScriptedAgentConfig) {
    this.playerId = config.playerId;
    this.script = [...config.script]; // Copy to avoid mutation
  }

  async chooseStartingHand(prompt: StartingHandPrompt): Promise<StartingHandChoice> {
    const choice = this.consumeChoice(prompt.kind, prompt.promptId);
    return this.toRealChoice(choice, prompt.promptId) as StartingHandChoice;
  }

  async chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice> {
    const choice = this.consumeChoice(prompt.kind, prompt.promptId);
    return this.toRealChoice(choice, prompt.promptId) as TurnActionChoice;
  }

  async chooseOption(prompt: OptionPrompt): Promise<OptionChoice> {
    const choice = this.consumeChoice(prompt.kind, prompt.promptId);
    return this.toRealChoice(choice, prompt.promptId) as OptionChoice;
  }

  /**
   * Returns true if all scripted choices have been consumed.
   * Useful for post-scenario verification.
   */
  isScriptFullyConsumed(): boolean {
    return this.scriptIndex >= this.script.length;
  }

  /**
   * Returns the number of unconsumed choices remaining.
   */
  getRemainingChoiceCount(): number {
    return this.script.length - this.scriptIndex;
  }

  /**
   * Consume the next choice from the script, validating that it matches the prompt kind.
   */
  private consumeChoice(promptKind: string, promptId: PromptId): ScriptedChoice {
    if (this.scriptIndex >= this.script.length) {
      throw new ScriptExhaustedError(promptKind, promptId, this.scriptIndex);
    }

    const choice = this.script[this.scriptIndex];

    if (choice.kind !== promptKind) {
      throw new ScriptMismatchError(
        choice.kind,
        promptKind,
        promptId,
        this.scriptIndex
      );
    }

    this.scriptIndex++;
    return choice;
  }

  /**
   * Convert a scripted choice to a real choice by adding the promptId.
   */
  private toRealChoice(scripted: ScriptedChoice, promptId: PromptId): StartingHandChoice | TurnActionChoice | OptionChoice {
    return { ...scripted, promptId } as StartingHandChoice | TurnActionChoice | OptionChoice;
  }
}

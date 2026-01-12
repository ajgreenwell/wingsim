/**
 * Choice Validators for Wingspan Simulator
 *
 * Pure validation functions that check if an agent's choice is valid
 * before the generator is resumed. This prevents invalid choices from
 * corrupting game state and allows for reprompting with error context.
 */

import type { GameState } from "./GameState.js";
import type {
  OptionPrompt,
  OptionChoice,
  ValidationError,
  PlaceEggsPrompt,
  PlaceEggsChoice,
  DiscardEggsPrompt,
  DiscardEggsChoice,
  SelectCardsPrompt,
  SelectCardsChoice,
  DrawCardsPrompt,
  DrawCardsChoice,
  SelectFoodFromFeederPrompt,
  SelectFoodFromFeederChoice,
  SelectFoodFromSupplyPrompt,
  SelectFoodFromSupplyChoice,
  PlayBirdPrompt,
  PlayBirdChoice,
  ActivatePowerPrompt,
  ActivatePowerChoice,
  SelectBonusCardsPrompt,
  SelectBonusCardsChoice,
  SelectPlayerPrompt,
  SelectPlayerChoice,
  SelectHabitatPrompt,
  SelectHabitatChoice,
  DiscardFoodPrompt,
  DiscardFoodChoice,
  SelectFoodDestinationPrompt,
  SelectFoodDestinationChoice,
} from "../types/prompts.js";
import type { FoodType, DieFace } from "../types/core.js";

/**
 * Type for a choice validator function.
 * Returns null if valid, or a ValidationError if invalid.
 */
export type ChoiceValidator<K extends OptionChoice["kind"]> = (
  prompt: Extract<OptionPrompt, { kind: K }>,
  choice: Extract<OptionChoice, { kind: K }>,
  state: GameState
) => ValidationError | null;

/**
 * Validate placeEggs choice.
 */
export const validatePlaceEggsChoice: ChoiceValidator<"placeEggs"> = (
  prompt: PlaceEggsPrompt,
  choice: PlaceEggsChoice,
  _state: GameState
): ValidationError | null => {
  // Validate total eggs match expected count
  const totalEggs = Object.values(choice.placements).reduce(
    (sum: number, count) => sum + (count || 0),
    0
  );

  if (totalEggs !== prompt.count) {
    return {
      code: "INVALID_EGG_COUNT",
      message: `Expected to place ${prompt.count} egg(s), but you placed ${totalEggs}`,
    };
  }

  // Validate each placement doesn't exceed the bird's remaining capacity
  for (const [birdId, eggCount] of Object.entries(choice.placements)) {
    if (!eggCount || eggCount <= 0) continue;

    const capacity = prompt.remainingCapacitiesByEligibleBird[birdId];
    if (capacity === undefined) {
      return {
        code: "INVALID_BIRD",
        message: `Bird "${birdId}" is not eligible for egg placement`,
      };
    }
    if (eggCount > capacity) {
      return {
        code: "EXCEEDS_CAPACITY",
        message: `Bird "${birdId}" can only hold ${capacity} more egg(s), but you placed ${eggCount}`,
      };
    }
  }

  return null;
};

/**
 * Validate discardEggs choice.
 */
export const validateDiscardEggsChoice: ChoiceValidator<"discardEggs"> = (
  prompt: DiscardEggsPrompt,
  choice: DiscardEggsChoice,
  _state: GameState
): ValidationError | null => {
  // Validate total eggs match expected count
  const totalEggs = Object.values(choice.sources).reduce(
    (sum: number, count) => sum + (count || 0),
    0
  );

  if (totalEggs !== prompt.count) {
    return {
      code: "INVALID_EGG_COUNT",
      message: `Expected to discard ${prompt.count} egg(s), but you discarded ${totalEggs}`,
    };
  }

  // Validate each source doesn't exceed available eggs
  for (const [birdId, eggCount] of Object.entries(choice.sources)) {
    if (!eggCount || eggCount <= 0) continue;

    const available = prompt.eggsByEligibleBird[birdId];
    if (available === undefined) {
      return {
        code: "INVALID_BIRD",
        message: `Bird "${birdId}" is not eligible for egg removal`,
      };
    }
    if (eggCount > available) {
      return {
        code: "EXCEEDS_AVAILABLE",
        message: `Bird "${birdId}" only has ${available} egg(s), but you tried to discard ${eggCount}`,
      };
    }
  }

  return null;
};

/**
 * Validate selectCards choice.
 */
export const validateSelectCardsChoice: ChoiceValidator<"selectCards"> = (
  prompt: SelectCardsPrompt,
  choice: SelectCardsChoice,
  _state: GameState
): ValidationError | null => {
  // Validate count matches
  if (choice.cards.length !== prompt.count) {
    return {
      code: "INVALID_CARD_COUNT",
      message: `Expected to select ${prompt.count} card(s), but you selected ${choice.cards.length}`,
    };
  }

  // Validate all cards are in eligible set
  const eligibleIds = new Set(prompt.eligibleCards.map((c) => c.id));
  for (const cardId of choice.cards) {
    if (!eligibleIds.has(cardId)) {
      return {
        code: "INVALID_CARD",
        message: `Card "${cardId}" is not in the eligible set`,
      };
    }
  }

  // Check for duplicates
  const uniqueCards = new Set(choice.cards);
  if (uniqueCards.size !== choice.cards.length) {
    return {
      code: "DUPLICATE_CARD",
      message: "Cannot select the same card multiple times",
    };
  }

  return null;
};

/**
 * Validate drawCards choice.
 */
export const validateDrawCardsChoice: ChoiceValidator<"drawCards"> = (
  prompt: DrawCardsPrompt,
  choice: DrawCardsChoice,
  _state: GameState
): ValidationError | null => {
  const totalCards = choice.trayCards.length + choice.numDeckCards;

  // Validate total doesn't exceed remaining
  if (totalCards > prompt.remaining) {
    return {
      code: "TOO_MANY_CARDS",
      message: `Can only draw ${prompt.remaining} card(s), but you requested ${totalCards}`,
    };
  }

  // Validate at least one card is drawn (unless remaining is 0)
  if (totalCards === 0 && prompt.remaining > 0) {
    return {
      code: "NO_CARDS_DRAWN",
      message: "Must draw at least one card",
    };
  }

  // Validate tray cards are in tray
  const trayIds = new Set(prompt.trayCards.map((c) => c.id));
  for (const cardId of choice.trayCards) {
    if (!trayIds.has(cardId)) {
      return {
        code: "INVALID_TRAY_CARD",
        message: `Card "${cardId}" is not in the tray`,
      };
    }
  }

  // Check for duplicates in tray selection
  const uniqueTrayCards = new Set(choice.trayCards);
  if (uniqueTrayCards.size !== choice.trayCards.length) {
    return {
      code: "DUPLICATE_TRAY_CARD",
      message: "Cannot select the same tray card multiple times",
    };
  }

  return null;
};

/**
 * Validate selectFoodFromFeeder choice.
 */
export const validateSelectFoodFromFeederChoice: ChoiceValidator<"selectFoodFromFeeder"> = (
  prompt: SelectFoodFromFeederPrompt,
  choice: SelectFoodFromFeederChoice,
  _state: GameState
): ValidationError | null => {
  if (choice.diceOrReroll === "reroll") {
    // Validate reroll is allowed (all dice show same face)
    const diceTypes = Object.keys(prompt.availableDice) as DieFace[];
    if (diceTypes.length > 1) {
      return {
        code: "INVALID_REROLL",
        message: "Can only reroll when all dice in the birdfeeder show the same face",
      };
    }
    return null;
  }

  // Validate dice selections
  const selectedDice = choice.diceOrReroll;
  if (selectedDice.length === 0) {
    return {
      code: "NO_DICE_SELECTED",
      message: "Must select at least one die from the birdfeeder",
    };
  }

  // Count dice by type
  const selectedCounts: Partial<Record<DieFace, number>> = {};
  for (const selection of selectedDice) {
    selectedCounts[selection.die] = (selectedCounts[selection.die] || 0) + 1;
  }

  // Validate against available dice
  for (const [die, count] of Object.entries(selectedCounts)) {
    const available = prompt.availableDice[die as DieFace] || 0;
    if ((count || 0) > available) {
      return {
        code: "EXCEEDS_AVAILABLE_DICE",
        message: `Only ${available} "${die}" dice available, but you selected ${count}`,
      };
    }
  }

  // Validate SEED_INVERTEBRATE dice have asFoodType specified
  for (const selection of selectedDice) {
    if (selection.die === "SEED_INVERTEBRATE") {
      if (!selection.asFoodType || (selection.asFoodType !== "SEED" && selection.asFoodType !== "INVERTEBRATE")) {
        return {
          code: "INVALID_SEED_INVERTEBRATE_CHOICE",
          message: "Must specify SEED or INVERTEBRATE when taking a SEED_INVERTEBRATE die",
        };
      }
    }
  }

  return null;
};

/**
 * Validate selectFoodFromSupply choice.
 */
export const validateSelectFoodFromSupplyChoice: ChoiceValidator<"selectFoodFromSupply"> = (
  prompt: SelectFoodFromSupplyPrompt,
  choice: SelectFoodFromSupplyChoice,
  _state: GameState
): ValidationError | null => {
  // Validate total count matches
  const totalFood = Object.values(choice.food).reduce(
    (sum, count) => sum + (count || 0),
    0
  );

  if (totalFood !== prompt.count) {
    return {
      code: "INVALID_FOOD_COUNT",
      message: `Expected to select ${prompt.count} food, but you selected ${totalFood}`,
    };
  }

  // Validate all food types are in allowed set
  const allowedSet = new Set(prompt.allowedFoods);
  for (const [foodType, count] of Object.entries(choice.food)) {
    if (count && count > 0 && !allowedSet.has(foodType as FoodType)) {
      return {
        code: "INVALID_FOOD_TYPE",
        message: `Food type "${foodType}" is not allowed; allowed types: ${prompt.allowedFoods.join(", ")}`,
      };
    }
  }

  return null;
};

/**
 * Validate playBird choice.
 */
export const validatePlayBirdChoice: ChoiceValidator<"playBird"> = (
  prompt: PlayBirdPrompt,
  choice: PlayBirdChoice,
  _state: GameState
): ValidationError | null => {
  // Validate bird is in eligible set
  const eligibleBirdIds = new Set(prompt.eligibleBirds.map((b) => b.id));
  if (!eligibleBirdIds.has(choice.bird)) {
    return {
      code: "INVALID_BIRD",
      message: `Bird "${choice.bird}" is not eligible to play`,
    };
  }

  // Validate habitat is eligible for the chosen bird
  const birdCard = prompt.eligibleBirds.find((b) => b.id === choice.bird);
  if (!birdCard) {
    return {
      code: "INVALID_BIRD",
      message: `Bird "${choice.bird}" not found in eligible birds`,
    };
  }

  if (!birdCard.habitats.includes(choice.habitat)) {
    return {
      code: "INVALID_HABITAT",
      message: `Bird "${choice.bird}" cannot be placed in ${choice.habitat}; valid habitats: ${birdCard.habitats.join(", ")}`,
    };
  }

  // Validate habitat has space
  if (prompt.eggCostByEligibleHabitat[choice.habitat] === undefined) {
    return {
      code: "HABITAT_FULL",
      message: `Habitat ${choice.habitat} is full`,
    };
  }

  return null;
};

/**
 * Validate activatePower choice.
 */
export const validateActivatePowerChoice: ChoiceValidator<"activatePower"> = (
  _prompt: ActivatePowerPrompt,
  choice: ActivatePowerChoice,
  _state: GameState
): ValidationError | null => {
  // Just verify activate is a boolean
  if (typeof choice.activate !== "boolean") {
    return {
      code: "INVALID_ACTIVATE",
      message: "activate must be a boolean value",
    };
  }
  return null;
};

/**
 * Validate selectBonusCards choice.
 */
export const validateSelectBonusCardsChoice: ChoiceValidator<"selectBonusCards"> = (
  prompt: SelectBonusCardsPrompt,
  choice: SelectBonusCardsChoice,
  _state: GameState
): ValidationError | null => {
  // Validate count matches
  if (choice.cards.length !== prompt.count) {
    return {
      code: "INVALID_CARD_COUNT",
      message: `Expected to select ${prompt.count} bonus card(s), but you selected ${choice.cards.length}`,
    };
  }

  // Validate all cards are in eligible set
  const eligibleIds = new Set(prompt.eligibleCards.map((c) => c.id));
  for (const cardId of choice.cards) {
    if (!eligibleIds.has(cardId)) {
      return {
        code: "INVALID_CARD",
        message: `Bonus card "${cardId}" is not in the eligible set`,
      };
    }
  }

  return null;
};

/**
 * Validate selectPlayer choice.
 */
export const validateSelectPlayerChoice: ChoiceValidator<"selectPlayer"> = (
  prompt: SelectPlayerPrompt,
  choice: SelectPlayerChoice,
  _state: GameState
): ValidationError | null => {
  // Validate player is in eligible set
  if (!prompt.eligiblePlayers.includes(choice.player)) {
    return {
      code: "INVALID_PLAYER",
      message: `Player "${choice.player}" is not in the eligible set`,
    };
  }
  return null;
};

/**
 * Validate selectHabitat choice.
 */
export const validateSelectHabitatChoice: ChoiceValidator<"selectHabitat"> = (
  prompt: SelectHabitatPrompt,
  choice: SelectHabitatChoice,
  _state: GameState
): ValidationError | null => {
  // Validate habitat is in eligible set
  if (!prompt.eligibleHabitats.includes(choice.habitat)) {
    return {
      code: "INVALID_HABITAT",
      message: `Habitat "${choice.habitat}" is not eligible; valid habitats: ${prompt.eligibleHabitats.join(", ")}`,
    };
  }
  return null;
};

/**
 * Validate discardFood choice.
 */
export const validateDiscardFoodChoice: ChoiceValidator<"discardFood"> = (
  prompt: DiscardFoodPrompt,
  choice: DiscardFoodChoice,
  _state: GameState
): ValidationError | null => {
  // For now, just validate that food amounts are non-negative
  // The actual cost validation depends on whether WILD is in the cost
  for (const [foodType, count] of Object.entries(choice.food)) {
    if (count !== undefined && count < 0) {
      return {
        code: "NEGATIVE_FOOD",
        message: `Cannot discard negative amount of ${foodType}`,
      };
    }
  }

  // Calculate total food discarded
  const totalDiscarded = Object.values(choice.food).reduce(
    (sum, count) => sum + (count || 0),
    0
  );

  // Calculate total cost
  const totalCost = Object.values(prompt.foodCost).reduce(
    (sum, count) => sum + (count || 0),
    0
  );

  if (totalDiscarded !== totalCost) {
    return {
      code: "INVALID_FOOD_COUNT",
      message: `Expected to discard ${totalCost} food, but you discarded ${totalDiscarded}`,
    };
  }

  return null;
};

/**
 * Validate selectFoodDestination choice.
 */
export const validateSelectFoodDestinationChoice: ChoiceValidator<"selectFoodDestination"> = (
  prompt: SelectFoodDestinationPrompt,
  choice: SelectFoodDestinationChoice,
  _state: GameState
): ValidationError | null => {
  // Validate destination is in options
  if (!prompt.destinationOptions.includes(choice.destination)) {
    return {
      code: "INVALID_DESTINATION",
      message: `Destination "${choice.destination}" is not available; options: ${prompt.destinationOptions.join(", ")}`,
    };
  }
  return null;
};

/**
 * Registry of all validators by prompt kind.
 */
export const validators: Partial<
  Record<OptionChoice["kind"], ChoiceValidator<OptionChoice["kind"]>>
> = {
  placeEggs: validatePlaceEggsChoice as ChoiceValidator<OptionChoice["kind"]>,
  discardEggs: validateDiscardEggsChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectCards: validateSelectCardsChoice as ChoiceValidator<OptionChoice["kind"]>,
  drawCards: validateDrawCardsChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectFoodFromFeeder: validateSelectFoodFromFeederChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectFoodFromSupply: validateSelectFoodFromSupplyChoice as ChoiceValidator<OptionChoice["kind"]>,
  playBird: validatePlayBirdChoice as ChoiceValidator<OptionChoice["kind"]>,
  activatePower: validateActivatePowerChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectBonusCards: validateSelectBonusCardsChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectPlayer: validateSelectPlayerChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectHabitat: validateSelectHabitatChoice as ChoiceValidator<OptionChoice["kind"]>,
  discardFood: validateDiscardFoodChoice as ChoiceValidator<OptionChoice["kind"]>,
  selectFoodDestination: validateSelectFoodDestinationChoice as ChoiceValidator<OptionChoice["kind"]>,
};

/**
 * Validate a choice against its corresponding prompt.
 * Returns null if valid, or a ValidationError if invalid.
 */
export function validateChoice(
  prompt: OptionPrompt,
  choice: OptionChoice,
  state: GameState
): ValidationError | null {
  const validator = validators[prompt.kind as OptionChoice["kind"]];
  if (!validator) {
    // No validator registered - assume valid
    return null;
  }
  return validator(prompt as Extract<OptionPrompt, { kind: typeof prompt.kind }>, choice, state);
}

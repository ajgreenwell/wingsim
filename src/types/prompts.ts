/**
 * Decision Prompt Taxonomy for Wingspan Simulator
 *
 * This file defines all the prompt and choice types used by the GameEngine
 * and PowerProcessor to request decisions from PlayerAgents.
 */

import type {
  PlayerId,
  BirdCardId,
  BonusCardId,
  FoodType,
  Habitat,
  BirdInstanceId,
  FoodByType,
  EggsByBird,
  EggCostByHabitat,
} from "./core.js";
import { PinkPowerTriggerEvent } from "./events.js";

/**
 * PlayerView represents the game state as visible to a specific player.
 * It includes all public information plus the player's private information.
 *
 * Based on WingsimSpec.v2.md Section 5.
 */
export interface PlayerView {
  // The player's own state
  playerId: PlayerId;
  hand: BirdCardId[];
  bonusCards: BonusCardId[];
  food: Record<FoodType, number>;
  board: Record<Habitat, Array<BirdInstanceView | null>>;
  actionCubes: number;

  // Public game state
  round: number;
  turn: number;
  activePlayerId: PlayerId;
  birdfeeder: FoodType[];
  birdTray: BirdCardId[];
  deckSize: number;

  // Opponent boards (visible, but not their hands)
  opponents: Array<{
    playerId: PlayerId;
    board: Record<Habitat, Array<BirdInstanceView | null>>;
    food: Record<FoodType, number>;
    actionCubes: number;
    handSize: number;
  }>;
}

/**
 * A view of a bird instance on a player's board.
 * Includes the bird's current state (eggs, cached food, tucked cards).
 */
export interface BirdInstanceView {
  id: BirdInstanceId;
  cardId: BirdCardId;
  eggs: number;
  cachedFood: Record<FoodType, number>;
  tuckedCardCount: number;
}

/** Unique identifier for a prompt instance */
export type PromptId = string;

/**
 * Context information about what triggered this prompt.
 * Helps agents understand the game situation.
 */
export interface PromptContext {
  round: number;
  activePlayerId: PlayerId;
  trigger:
    | { type: "WHEN_ACTIVATED"; habitat: Habitat; sourceBirdId: BirdInstanceId }
    | { type: "WHEN_PLAYED"; sourceBirdId: BirdInstanceId }
    | {
        type: "ONCE_BETWEEN_TURNS";
        sourceBirdId: BirdInstanceId;
        event: PinkPowerTriggerEvent;
      };
}

/**
 * Base interface for all decision prompts.
 * All specific prompt types extend this.
 */
export interface DecisionPromptBase {
  promptId: PromptId;
  playerId: PlayerId;
  kind: string;
  view: PlayerView;
  context: PromptContext;
}

/**
 * Base interface for all decision choices.
 * All specific choice types extend this.
 */
export interface DecisionChoiceBase {
  promptId: PromptId;
  kind: string;
}

export interface StartingHandPrompt extends DecisionPromptBase {
  kind: "startingHand";
  eligibleBirds: Set<BirdCardId>;
  eligibleBonusCards: Set<BonusCardId>;
}

export interface StartingHandChoice extends DecisionChoiceBase {
  kind: "startingHand";
  birds: Set<BirdCardId>;
  bonusCard: BonusCardId;
  foodToDiscard: Set<FoodType>;
}

export type TurnActionKind =
  | "PLAY_BIRD"
  | "GAIN_FOOD"
  | "LAY_EGGS"
  | "DRAW_CARDS";
export type Resource = "FOOD" | "EGGS" | "CARDS";

export type RewardsByAction = Record<
  TurnActionKind,
  {
    reward: { type: Resource; count: number };
    bonus?: {
      cost: { type: Resource; count: number };
      reward: { type: Resource; count: number };
    };
  }
>;

export interface TurnActionPrompt extends DecisionPromptBase {
  kind: "turnAction";
  // bonuses will be left empty if not eligible for a given action
  // (i.e. because the left-most open column in that habitat doesn't have a bonus, or because the player doesn't have the resources available to take advantage of the bonus)
  rewardsByAction: RewardsByAction;
}

export interface TurnActionChoice extends DecisionChoiceBase {
  kind: "turnAction";
  // must match one of the keys of TurnActionPrompt.rewardsByAction
  action: TurnActionKind;
  // can only be true if a bonus was included for the chosen action in TurnActionPrompt.rewardsByAction
  takeBonus: boolean;
}

export interface ActivatePowerPrompt extends DecisionPromptBase {
  kind: "activatePower";
  birdInstanceId: BirdInstanceId;
  powerHandlerId: string;
}

export interface ActivatePowerChoice extends DecisionChoiceBase {
  kind: "activatePower";
  activate: boolean;
}

export interface SelectFoodFromFeederPrompt extends DecisionPromptBase {
  kind: "selectFoodFromFeeder";
  // Current feeder availability for each type of food
  availableFood: FoodByType;
}

export interface SelectFoodFromFeederChoice extends DecisionChoiceBase {
  kind: "selectFoodFromFeeder";
  // Choose food from birdfeeder or reroll the feeder instead
  // food counts chosen must match SelectFoodFromFeederPrompt.availableFood
  foodOrReroll: FoodByType | "reroll";
}

export interface SelectFoodFromSupplyPrompt extends DecisionPromptBase {
  kind: "selectFoodFromSupply";
  count: number;
  allowedFoods: FoodType[];
}

export interface SelectFoodFromSupplyChoice extends DecisionChoiceBase {
  kind: "selectFoodFromSupply";
  foods: FoodByType;
}

export type FoodDestination = "PLAYER_SUPPLY" | "CACHE_ON_SOURCE_BIRD";

export interface SelectFoodDestinationPrompt extends DecisionPromptBase {
  kind: "selectFoodDestination";
  sourceBirdId: BirdInstanceId;
  food: FoodType;
  destinationOptions: FoodDestination[];
}

export interface SelectFoodDestinationChoice extends DecisionChoiceBase {
  kind: "selectFoodDestination";
  destination: FoodDestination;
}

export interface DiscardEggsPrompt extends DecisionPromptBase {
  kind: "discardEggs";
  count: number;
  eggsByEligibleBird: EggsByBird;
}

export interface DiscardEggsChoice extends DecisionChoiceBase {
  kind: "discardEggs";
  // total eggs must match DiscardEggsPrompt.count
  // number of eggs per bird may not exceed counts from DiscardEggsPrompt.eggsByEligibleBird
  sources: EggsByBird;
}

export interface PlaceEggsPrompt extends DecisionPromptBase {
  kind: "placeEggs";
  count: number;
  // birds with full/no egg capacities will not be included
  remainingCapacitiesByEligibleBird: EggsByBird;
}

export interface PlaceEggsChoice extends DecisionChoiceBase {
  kind: "placeEggs";
  // total eggs must match PlaceEggsPrompt.count
  // placements per bird must not exceed PlaceEggsPrompt.remainingCapacitiesByEligibleBird for each bird
  placements: EggsByBird;
}

export type SelectCardsMode = "TUCK" | "DISCARD" | "KEEP";
export type SelectCardsSource = "HAND" | "REVEALED_SET";

export interface SelectCardsPrompt extends DecisionPromptBase {
  kind: "selectCards";
  mode: SelectCardsMode;
  source: SelectCardsSource;
  count: number;
  eligibleCards: BirdCardId[];
}

export interface SelectCardsChoice extends DecisionChoiceBase {
  kind: "selectCards";
  // length must match SelectCardsPrompt.count
  cards: BirdCardId[];
}

export interface DrawCardsPrompt extends DecisionPromptBase {
  kind: "drawCards";
  // players don't have to draw the total remaining number of cards in this choice -- they
  // may draw fewer cards (e.g. one from the deck first) and then draw subsequent cards
  // in follow-up prompts/choices (e.g. rest from the tray)
  remaining: number;
  // empty means trayCards aren't allowed to be drawn
  trayCards: BirdCardId[];
}

export interface DrawCardsChoice extends DecisionChoiceBase {
  kind: "drawCards";
  // empty means only draw from the deck
  // values must come from DrawCardsPrompt.trayCards
  trayCards: BirdCardId[];
  // cannot be 0 if trayCards is empty
  numDeckCards: number;
}

export interface SelectBonusCardsPrompt extends DecisionPromptBase {
  kind: "selectBonusCards";
  count: number;
  eligibleCards: BonusCardId[];
}

export interface SelectBonusCardsChoice extends DecisionChoiceBase {
  kind: "selectBonusCards";
  // length must match SelectBonusCardsPrompt.count
  // values must come from SelectBonusCardsPrompt.eligibleCards
  cards: BonusCardId[];
}

export interface SelectPlayerPrompt extends DecisionPromptBase {
  kind: "selectPlayer";
  eligiblePlayers: PlayerId[];
}

export interface SelectPlayerChoice extends DecisionChoiceBase {
  kind: "selectPlayer";
  // must be one of the SelectPlayerPrompt.eligiblePlayers
  player: PlayerId;
}

export interface RepeatPowerPrompt extends DecisionPromptBase {
  kind: "repeatPower";
  eligibleBirds: BirdInstanceId[];
}

export interface RepeatPowerChoice extends DecisionChoiceBase {
  kind: "repeatPower";
  bird: BirdInstanceId;
}

export interface PlayBirdPrompt extends DecisionPromptBase {
  kind: "playBird";
  eligibleBirds: BirdCardId[];
  // will only include eligible habitats
  // (e.g. if a habitat is full, it won't be included here)
  eggCostByEligibleHabitat: EggCostByHabitat;
}

export interface PlayBirdChoice extends DecisionChoiceBase {
  kind: "playBird";
  bird: BirdCardId;
  // must be one of the chosen bird's eligible habitats
  habitat: Habitat;
  // must match food cost for chosen bird
  foodToSpend: FoodByType;
  // must match egg cost for the chosen habitat from eggCostByEligibleHabitat in PlayBirdPrompt
  eggsToSpend: EggsByBird;
}

export interface DiscardFoodPrompt extends DecisionPromptBase {
  kind: "discardFood";
  foodCost: FoodByType;
  tuckedCardsReward: number;
}

export interface DiscardFoodChoice extends DecisionChoiceBase {
  kind: "discardFood";
  // must match DiscardFoodPrompt.foodCost
  food: FoodByType;
}

/**
 * These are typically triggered by bird powers or habitat activations.
 */
export type OptionPrompt =
  | ActivatePowerPrompt
  | SelectFoodFromFeederPrompt
  | SelectFoodFromSupplyPrompt
  | SelectFoodDestinationPrompt
  | DiscardEggsPrompt
  | PlaceEggsPrompt
  | SelectCardsPrompt
  | DrawCardsPrompt
  | SelectBonusCardsPrompt
  | SelectPlayerPrompt
  | RepeatPowerPrompt
  | PlayBirdPrompt
  | DiscardFoodPrompt;

export type OptionChoice =
  | ActivatePowerChoice
  | SelectFoodFromFeederChoice
  | SelectFoodFromSupplyChoice
  | SelectFoodDestinationChoice
  | DiscardEggsChoice
  | PlaceEggsChoice
  | SelectCardsChoice
  | DrawCardsChoice
  | SelectBonusCardsChoice
  | SelectPlayerChoice
  | RepeatPowerChoice
  | PlayBirdChoice
  | DiscardFoodChoice;

export type DecisionPrompt =
  | StartingHandPrompt
  | TurnActionPrompt
  | OptionPrompt;

export type DecisionChoice =
  | StartingHandChoice
  | TurnActionChoice
  | OptionChoice;

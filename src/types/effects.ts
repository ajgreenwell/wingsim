/**
 * Wingspan Simulator - Effect Taxonomy
 *
 * Effects represent the final, validated outcomes of game actions and power activations.
 * They trigger game state mutations via the GameEngine.
 */

import type {
  PlayerId,
  BirdInstanceId,
  BonusCardId,
  FoodType,
  Habitat,
  FoodByType,
  CardSource,
  FoodSource,
} from "./core.ts";

export type Effect =
  // Power Activation Effects
  | ActivatePowerEffect
  | RepeatBrownPowerEffect

  // Resource Gain Effects
  | GainFoodEffect
  | DrawCardsEffect
  | LayEggsEffect
  | GainBonusCardsEffect

  // Resource Spend Effects
  | DiscardFoodEffect
  | DiscardEggsEffect
  | DiscardCardsEffect

  // Card Manipulation Effects
  | TuckCardsEffect
  | RevealCardsEffect

  // Bird State Effects
  | CacheFoodEffect
  | PlayBirdEffect
  | MoveBirdEffect

  // Multi-Player Effects
  | AllPlayersGainFoodEffect
  | AllPlayersDrawCardsEffect
  | AllPlayersLayEggsEffect

  // Dice/RNG Effects
  | RollDiceEffect
  | RerollBirdfeederEffect
  | RefillBirdfeederEffect

  // Bird Tray Effects
  | RemoveCardsFromTrayEffect
  | RefillBirdTrayEffect;

interface EffectBase {
  effectId?: string;
  sourcePlayerId?: PlayerId;
  sourceBirdInstanceId?: BirdInstanceId;
  description?: string;
}

export interface ActivatePowerEffect extends EffectBase {
  type: "ACTIVATE_POWER";
  playerId: PlayerId;
  birdInstanceId: BirdInstanceId;
  handlerId: string;
  activated: boolean;
  skipReason?: "AGENT_DECLINED" | "CONDITION_NOT_MET" | "RESOURCE_UNAVAILABLE";
}

export interface RepeatBrownPowerEffect extends EffectBase {
  type: "REPEAT_BROWN_POWER";
  playerId: PlayerId;
  targetBirdInstanceId: BirdInstanceId;
  triggeringBirdInstanceId?: BirdInstanceId;
}

export interface GainFoodEffect extends EffectBase {
  type: "GAIN_FOOD";
  playerId: PlayerId;
  food: FoodByType;
  source: FoodSource;
}
export interface DrawCardsEffect extends EffectBase {
  type: "DRAW_CARDS";
  playerId: PlayerId;
  fromDeck: number;
  fromTray: BirdInstanceId[];
  drawnCards?: BirdInstanceId[];
}
export interface LayEggsEffect extends EffectBase {
  type: "LAY_EGGS";
  playerId: PlayerId;
  placements: Record<BirdInstanceId, number>;
}
export interface GainBonusCardsEffect extends EffectBase {
  type: "GAIN_BONUS_CARDS";
  playerId: PlayerId;
  keptCards: BonusCardId[];
  discardedCards: BonusCardId[];
}

export interface DiscardFoodEffect extends EffectBase {
  type: "DISCARD_FOOD";
  playerId: PlayerId;
  food: FoodByType;
}
export interface DiscardEggsEffect extends EffectBase {
  type: "DISCARD_EGGS";
  playerId: PlayerId;
  sources: Record<BirdInstanceId, number>;
}
export interface DiscardCardsEffect extends EffectBase {
  type: "DISCARD_CARDS";
  playerId: PlayerId;
  cards: BirdInstanceId[];
}

export interface TuckCardsEffect extends EffectBase {
  type: "TUCK_CARDS";
  playerId: PlayerId;
  targetBirdInstanceId: BirdInstanceId;
  fromHand: BirdInstanceId[];
  fromDeck: number;
  tuckedFromDeck?: BirdInstanceId[];
}
export interface RevealCardsEffect extends EffectBase {
  type: "REVEAL_CARDS";
  playerId: PlayerId;
  source: CardSource;
  revealedCards: BirdInstanceId[];
  disposition: "TUCKED" | "DISCARDED";
  tuckedUnderBirdInstanceId?: BirdInstanceId;
}

export interface CacheFoodEffect extends EffectBase {
  type: "CACHE_FOOD";
  playerId: PlayerId;
  birdInstanceId: BirdInstanceId;
  food: FoodByType;
  source: FoodSource;
}
export interface PlayBirdEffect extends EffectBase {
  type: "PLAY_BIRD";
  playerId: PlayerId;
  birdInstanceId: BirdInstanceId;
  habitat: Habitat;
  column: number;
  foodPaid: FoodByType;
  eggsPaid: Record<BirdInstanceId, number>;
}
export interface MoveBirdEffect extends EffectBase {
  type: "MOVE_BIRD";
  playerId: PlayerId;
  birdInstanceId: BirdInstanceId;
  fromHabitat: Habitat;
  toHabitat: Habitat;
}

export interface AllPlayersGainFoodEffect extends EffectBase {
  type: "ALL_PLAYERS_GAIN_FOOD";
  gains: Record<PlayerId, FoodByType>;
  source: FoodSource;
  selectionOrder?: PlayerId[];
}
export interface AllPlayersDrawCardsEffect extends EffectBase {
  type: "ALL_PLAYERS_DRAW_CARDS";
  draws: Record<PlayerId, number>;
  drawnCards?: Record<PlayerId, BirdInstanceId[]>;
}
export interface AllPlayersLayEggsEffect extends EffectBase {
  type: "ALL_PLAYERS_LAY_EGGS";
  placements: Record<PlayerId, Record<BirdInstanceId, number>>;
}

export interface RollDiceEffect extends EffectBase {
  type: "ROLL_DICE";
  playerId: PlayerId;
  rolledDice: FoodType[];
}
export interface RerollBirdfeederEffect extends EffectBase {
  type: "REROLL_BIRDFEEDER";
  playerId: PlayerId;
  previousDice: FoodType[];
  newDice: FoodType[];
}
export interface RefillBirdfeederEffect extends EffectBase {
  type: "REFILL_BIRDFEEDER";
  addedDice: FoodType[];
}

export interface RemoveCardsFromTrayEffect extends EffectBase {
  type: "REMOVE_CARDS_FROM_TRAY";
  cards: BirdInstanceId[];
}
export interface RefillBirdTrayEffect extends EffectBase {
  type: "REFILL_BIRD_TRAY";
  discardedCards: BirdInstanceId[];
  newCards: BirdInstanceId[];
}

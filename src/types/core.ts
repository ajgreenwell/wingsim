export type PlayerId = string;
export type BirdInstanceId = string;
export type BirdCardId = string;
export type BonusCardId = string;

export type FoodType =
  | "INVERTEBRATE"
  | "SEED"
  | "FISH"
  | "FRUIT"
  | "RODENT"
  | "WILD";
export type Habitat = "FOREST" | "GRASSLAND" | "WETLAND";
export type NestType =
  | "BOWL"
  | "CAVITY"
  | "PLATFORM"
  | "GROUND"
  | "WILD"
  | "NONE";
export type CardSource = "DECK" | "TRAY" | "HAND";
export type DieFace =
  | "INVERTEBRATE"
  | "SEED"
  | "FISH"
  | "FRUIT"
  | "RODENT"
  | "SEED_INVERTEBRATE";

export type FoodByType = Partial<Record<FoodType, number>>;

/** Maps die faces to counts (for representing dice in feeder) */
export type FoodByDice = Partial<Record<DieFace, number>>;

/** A single die selection from the birdfeeder */
export interface DieSelection {
  die: DieFace;
  /** Required when die is SEED_INVERTEBRATE - which food type to take */
  asFoodType?: "SEED" | "INVERTEBRATE";
}
export type EggsByBird = Partial<Record<BirdInstanceId, number>>;
export type EggCostByHabitat = Partial<Record<Habitat, number>>;

export type RoundGoalId = string;

export interface PowerSpec {
  handlerId: string;
  trigger: "WHEN_ACTIVATED" | "WHEN_PLAYED" | "ONCE_BETWEEN_TURNS";
  params: Record<string, unknown>;
  text: string;
}

export interface BirdCard {
  id: BirdCardId;
  name: string;
  scientificName: string;
  habitats: Habitat[];
  power: PowerSpec | null;
  victoryPoints: number;
  nestType: NestType;
  eggCapacity: number;
  foodCost: FoodByType;
  foodCostMode: "AND" | "OR" | "NONE";
  wingspanCentimeters: number;
  bonusCards: string[];
  flavorText: string;
  countries: string[];
  categorization: string | null;
}

export interface BonusCardScoring {
  minCount?: number;
  maxCount?: number | null;
  points: number;
}

export interface BonusCard {
  id: BonusCardId;
  name: string;
  condition: string;
  scoringType: "TIERED" | "PER_BIRD";
  scoring: BonusCardScoring[];
  explanatoryText: string | null;
  percentageOfEligibleBirds: number;
}

export interface RoundGoal {
  id: RoundGoalId;
  name: string;
  description: string;
}

/**
 * A bird instance on a player's board.
 * Tracks the bird's runtime state including cached food, tucked cards, and eggs.
 */
export interface BirdInstance {
  id: BirdInstanceId;
  card: BirdCard;
  cachedFood: FoodByType;
  tuckedCards: BirdCardId[];
  eggs: number;
}

// Re-export PlayerState from engine for backward compatibility
export { PlayerState, type PlayerStateInit } from '../engine/PlayerState.js';

/**
 * Bonus reward configuration for habitat columns.
 * Players can trade resources at specific columns.
 */
export interface HabitatBonusReward {
  tradeFrom: "FOOD" | "EGGS" | "CARDS";
  tradeFromAmount: number;
  tradeTo: "FOOD" | "EGGS" | "CARDS";
  tradeToAmount: number;
}

/**
 * Configuration for a single habitat row on the player board.
 */
export interface HabitatConfig {
  action: "GAIN_FOOD" | "LAY_EGGS" | "DRAW_CARDS";
  /** Reward by column (index = leftmost empty column, 0-5) */
  baseRewards: number[];
  /** Bonus trade options by column (null if no bonus at that column) */
  bonusRewards: Array<HabitatBonusReward | null>;
}

/**
 * Configuration for the player board, loaded from player_board.json.
 */
export interface PlayerBoardConfig {
  /** Egg cost by column (0-4) for playing birds */
  playBirdCosts: number[];
  forest: HabitatConfig;
  grassland: HabitatConfig;
  wetland: HabitatConfig;
}

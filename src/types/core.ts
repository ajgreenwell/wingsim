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
export type FoodSource = "BIRDFEEDER" | "SUPPLY" | "CACHE";
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
export type EggsByBird = Partial<Record<BirdInstanceId, number>>;
export type EggCostByHabitat = Partial<Record<Habitat, number>>;

export type RoundGoalId = string;

export interface PowerSpec {
  handlerId: string;
  trigger: "WHEN_ACTIVATED" | "WHEN_PLAYED" | "ONCE_BETWEEN_TURNS" | "GAME_END";
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

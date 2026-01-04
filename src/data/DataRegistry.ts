import birdsData from "./base_game/birds.json" with { type: "json" };
import bonusCardsData from "./base_game/bonus_cards.json" with { type: "json" };
import roundGoalsData from "./base_game/round_goals.json" with { type: "json" };
import type {
  BirdCard,
  BirdCardId,
  BonusCard,
  BonusCardId,
  RoundGoal,
  RoundGoalId,
} from "../types/core.js";

/**
 * DataRegistry loads and provides access to immutable game data from JSON files.
 *
 * All data is frozen upon loading to ensure immutability.
 * Consumers should reference data by ID rather than storing copies.
 */
export class DataRegistry {
  private readonly birdsById: ReadonlyMap<BirdCardId, Readonly<BirdCard>>;
  private readonly bonusCardsById: ReadonlyMap<
    BonusCardId,
    Readonly<BonusCard>
  >;
  private readonly roundGoalsById: ReadonlyMap<
    RoundGoalId,
    Readonly<RoundGoal>
  >;

  constructor() {
    this.birdsById = new Map(
      (birdsData as BirdCard[]).map((bird) => [bird.id, Object.freeze(bird)])
    );

    this.bonusCardsById = new Map(
      (bonusCardsData as BonusCard[]).map((card) => [
        card.id,
        Object.freeze(card),
      ])
    );

    this.roundGoalsById = new Map(
      (roundGoalsData as RoundGoal[]).map((goal) => [
        goal.id,
        Object.freeze(goal),
      ])
    );
  }

  getBirdById(id: BirdCardId): Readonly<BirdCard> | undefined {
    return this.birdsById.get(id);
  }

  getAllBirdIds(): BirdCardId[] {
    return Array.from(this.birdsById.keys());
  }

  getAllBirds(): ReadonlyArray<Readonly<BirdCard>> {
    return Array.from(this.birdsById.values());
  }

  getBonusCardById(id: BonusCardId): Readonly<BonusCard> | undefined {
    return this.bonusCardsById.get(id);
  }

  getAllBonusCardIds(): BonusCardId[] {
    return Array.from(this.bonusCardsById.keys());
  }

  getAllBonusCards(): ReadonlyArray<Readonly<BonusCard>> {
    return Array.from(this.bonusCardsById.values());
  }

  getRoundGoalById(id: RoundGoalId): Readonly<RoundGoal> | undefined {
    return this.roundGoalsById.get(id);
  }

  getAllRoundGoalIds(): RoundGoalId[] {
    return Array.from(this.roundGoalsById.keys());
  }

  getAllRoundGoals(): ReadonlyArray<Readonly<RoundGoal>> {
    return Array.from(this.roundGoalsById.values());
  }
}

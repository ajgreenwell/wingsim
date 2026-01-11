import birdsData from "./base_game/birds.json" with { type: "json" };
import bonusCardsData from "./base_game/bonus_cards.json" with { type: "json" };
import roundGoalsData from "./base_game/round_goals.json" with { type: "json" };
import playerBoardData from "./base_game/player_board.json" with { type: "json" };
import type {
  BirdCard,
  BirdCardId,
  BonusCard,
  BonusCardId,
  RoundGoal,
  RoundGoalId,
  PlayerBoardConfig,
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
  private readonly playerBoard: Readonly<PlayerBoardConfig>;

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

    this.playerBoard = Object.freeze(playerBoardData as PlayerBoardConfig);
  }

  getBirdById(id: BirdCardId): Readonly<BirdCard> {
    const bird = this.birdsById.get(id);
    if (!bird) {
      throw new Error(`Bird card ${id} not found in registry`);
    }
    return bird;
  }

  getAllBirdIds(): BirdCardId[] {
    return Array.from(this.birdsById.keys());
  }

  getAllBirds(): ReadonlyArray<Readonly<BirdCard>> {
    return Array.from(this.birdsById.values());
  }

  getBonusCardById(id: BonusCardId): Readonly<BonusCard> {
    const bonusCard = this.bonusCardsById.get(id);
    if (!bonusCard) {
      throw new Error(`Bonus card ${id} not found in registry`);
    }
    return bonusCard;
  }

  getAllBonusCardIds(): BonusCardId[] {
    return Array.from(this.bonusCardsById.keys());
  }

  getAllBonusCards(): ReadonlyArray<Readonly<BonusCard>> {
    return Array.from(this.bonusCardsById.values());
  }

  getRoundGoalById(id: RoundGoalId): Readonly<RoundGoal> {
    const roundGoal = this.roundGoalsById.get(id);
    if (!roundGoal) {
      throw new Error(`Round goal ${id} not found in registry`);
    }
    return roundGoal;
  }

  getAllRoundGoalIds(): RoundGoalId[] {
    return Array.from(this.roundGoalsById.keys());
  }

  getAllRoundGoals(): ReadonlyArray<Readonly<RoundGoal>> {
    return Array.from(this.roundGoalsById.values());
  }

  getPlayerBoard(): Readonly<PlayerBoardConfig> {
    return this.playerBoard;
  }
}

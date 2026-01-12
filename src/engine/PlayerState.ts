/**
 * PlayerState encapsulates a player's state in the game.
 *
 * This class provides methods for querying player resources, hand,
 * and determining eligibility for actions like playing birds.
 */

import type {
  BirdCard,
  BonusCard,
  FoodByType,
  FoodType,
  PlayerId,
} from "../types/core.js";
import { PlayerBoard } from "./PlayerBoard.js";

/**
 * Configuration for creating a PlayerState instance.
 */
export interface PlayerStateInit {
  hand: BirdCard[];
  bonusCards: BonusCard[];
  food: FoodByType;
  turnsRemaining: number;
  board: PlayerBoard;
}

export class PlayerState {
  readonly id: PlayerId;
  readonly board: PlayerBoard;
  hand: BirdCard[];
  bonusCards: BonusCard[];
  food: FoodByType;
  turnsRemaining: number;
  /** Whether this player has forfeited (due to repeated invalid choices) */
  forfeited: boolean;

  private constructor(id: PlayerId, init: PlayerStateInit) {
    this.id = id;
    this.board = init.board;
    this.hand = init.hand;
    this.bonusCards = init.bonusCards;
    this.food = init.food;
    this.turnsRemaining = init.turnsRemaining;
    this.forfeited = false;
  }

  /**
   * Create a new PlayerState with default empty values.
   */
  static create(
    id: PlayerId,
    hand: BirdCard[] = [],
    bonusCards: BonusCard[] = []
  ): PlayerState {
    return new PlayerState(id, {
      hand,
      bonusCards,
      food: {},
      turnsRemaining: 8,
      board: PlayerBoard.empty(),
    });
  }

  /**
   * Create a PlayerState with custom configuration.
   */
  static from(id: PlayerId, config: Partial<PlayerStateInit>): PlayerState {
    return new PlayerState(id, {
      hand: config.hand ?? [],
      bonusCards: config.bonusCards ?? [],
      food: config.food ?? {},
      turnsRemaining: config.turnsRemaining ?? 8,
      board: config.board ?? PlayerBoard.empty(),
    });
  }

  /**
   * Get birds from hand that the player can afford to play.
   * Checks food costs based on the card's foodCostMode.
   */
  getEligibleBirdsToPlay(): BirdCard[] {
    return this.hand.filter((card) => {
      // Check if player can afford the food cost
      if (card.foodCostMode === "NONE") {
        return true;
      }

      if (card.foodCostMode === "AND") {
        // Must have all food types
        for (const [foodType, required] of Object.entries(card.foodCost)) {
          if (required && required > 0) {
            const available = this.food[foodType as FoodType] ?? 0;
            if (available < required) {
              return false;
            }
          }
        }
        return true;
      }

      if (card.foodCostMode === "OR") {
        // Must have at least one of the required food types
        const totalRequired = Object.values(card.foodCost).reduce(
          (sum, v) => sum + (v ?? 0),
          0
        );
        if (totalRequired === 0) return true;

        let totalAvailable = 0;
        for (const [foodType, required] of Object.entries(card.foodCost)) {
          if (required && required > 0) {
            totalAvailable += this.food[foodType as FoodType] ?? 0;
          }
        }
        return totalAvailable >= 1;
      }

      return false;
    });
  }

  /**
   * Get the total amount of food the player has (all types combined).
   */
  getTotalFood(): number {
    return Object.values(this.food).reduce((sum, v) => sum + (v ?? 0), 0);
  }

  /**
   * Check if the player has at least the specified amount of a food type.
   * @param type The food type to check
   * @param count The minimum amount required (default 1)
   */
  hasFood(type: FoodType, count: number = 1): boolean {
    return (this.food[type] ?? 0) >= count;
  }
}

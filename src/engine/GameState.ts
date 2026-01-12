/**
 * GameState - The complete game state for a Wingspan match.
 *
 * This class encapsulates the authoritative state owned by the GameEngine
 * and provides centralized query methods for player lookup, cross-player
 * queries, and game state queries.
 */

import type {
  BirdInstance,
  BirdInstanceId,
  BonusCard,
  PlayerId,
  RoundGoalId,
} from "../types/core.js";
import type { PowerYield, PowerReceive } from "../types/power.js";
import type { Birdfeeder } from "./Birdfeeder.js";
import type { BirdCardSupply } from "./BirdCardSupply.js";
import type { DiscardableDeck } from "./DiscardableDeck.js";
import { PlayerState } from "./PlayerState.js";

/**
 * Entry in the end-of-turn continuation queue.
 */
export interface DeferredContinuationEntry {
  playerId: PlayerId;
  continuation: () => Generator<PowerYield, void, PowerReceive>;
}

/**
 * Configuration for initializing a GameState instance.
 */
export interface GameStateInit {
  players: PlayerState[];
  activePlayerIndex: number;
  birdfeeder: Birdfeeder;
  birdCardSupply: BirdCardSupply;
  bonusCardDeck: DiscardableDeck<BonusCard>;
  roundGoals: RoundGoalId[];
  round: number;
  turn: number;
  endOfTurnContinuations?: DeferredContinuationEntry[];
}

/**
 * The complete game state for a Wingspan match.
 * This is the authoritative state owned by the GameEngine.
 */
export class GameState {
  players: PlayerState[];
  activePlayerIndex: number;
  birdfeeder: Birdfeeder;
  birdCardSupply: BirdCardSupply;
  bonusCardDeck: DiscardableDeck<BonusCard>;
  roundGoals: RoundGoalId[];
  round: number;
  turn: number;

  /**
   * Deferred continuations to execute at end of current turn.
   * Cleared after resolution.
   */
  endOfTurnContinuations: DeferredContinuationEntry[];

  constructor(init: GameStateInit) {
    this.players = init.players;
    this.activePlayerIndex = init.activePlayerIndex;
    this.birdfeeder = init.birdfeeder;
    this.birdCardSupply = init.birdCardSupply;
    this.bonusCardDeck = init.bonusCardDeck;
    this.roundGoals = init.roundGoals;
    this.round = init.round;
    this.turn = init.turn;
    this.endOfTurnContinuations = init.endOfTurnContinuations ?? [];
  }

  /**
   * Find a player by ID.
   * @throws Error if player not found
   */
  findPlayer(playerId: PlayerId): PlayerState {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error(`Player not found: ${playerId}`);
    }
    return player;
  }

  /**
   * Get the currently active player.
   */
  getActivePlayer(): PlayerState {
    return this.players[this.activePlayerIndex];
  }

  /**
   * Get players in clockwise order starting from player left of the given player.
   * The given player is NOT included in the result.
   */
  getClockwisePlayerOrder(fromPlayerId: PlayerId): PlayerState[] {
    const activeIndex = this.players.findIndex((p) => p.id === fromPlayerId);
    if (activeIndex === -1) {
      throw new Error(`Player not found: ${fromPlayerId}`);
    }

    const result: PlayerState[] = [];

    // Start from player after the given player, wrap around
    for (let i = 1; i < this.players.length; i++) {
      const idx = (activeIndex + i) % this.players.length;
      result.push(this.players[idx]);
    }

    return result;
  }

  /**
   * Find a bird instance across all players' boards.
   * @returns The bird instance, or null if not found
   */
  findBirdInstance(birdInstanceId: BirdInstanceId): BirdInstance | null {
    for (const player of this.players) {
      const bird = player.board.findBirdInstance(birdInstanceId);
      if (bird) {
        return bird;
      }
    }
    return null;
  }

  /**
   * Find the owner of a bird instance.
   * @returns The player who owns the bird, or null if not found
   */
  findBirdOwner(birdInstanceId: BirdInstanceId): PlayerState | null {
    for (const player of this.players) {
      const bird = player.board.findBirdInstance(birdInstanceId);
      if (bird) {
        return player;
      }
    }
    return null;
  }

  /**
   * Check if any player still has turns remaining in the current round.
   */
  anyPlayerHasTurns(): boolean {
    return this.players.some((p) => p.turnsRemaining > 0);
  }
}

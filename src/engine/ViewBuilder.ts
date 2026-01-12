import type { GameState } from "./GameEngine.js";
import type { PlayerView } from "../types/prompts.js";
import type { PlayerId, FoodType, DieFace } from "../types/core.js";

const FOOD_TYPES: FoodType[] = ["INVERTEBRATE", "SEED", "FISH", "FRUIT", "RODENT", "WILD"];

/**
 * Builds a PlayerView from GameState for a specific player.
 * Enforces hidden information - players cannot see other players' hands.
 */
export function buildPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    throw new Error(`Player ${playerId} not found in game state`);
  }

  const player = state.players[playerIndex];

  // Player's board uses BirdInstance directly
  const playerBoard = player.board.toRecord();

  // Build complete food record
  const food: Record<FoodType, number> = {
    INVERTEBRATE: 0,
    SEED: 0,
    FISH: 0,
    FRUIT: 0,
    RODENT: 0,
    WILD: 0,
  };
  for (const foodType of FOOD_TYPES) {
    food[foodType] = player.food[foodType] ?? 0;
  }

  // Build opponent views (visible info only - not their hands)
  const opponents = state.players
    .filter(p => p.id !== playerId)
    .map(opponent => {
      const opponentFood: Record<FoodType, number> = {
        INVERTEBRATE: 0,
        SEED: 0,
        FISH: 0,
        FRUIT: 0,
        RODENT: 0,
        WILD: 0,
      };
      for (const foodType of FOOD_TYPES) {
        opponentFood[foodType] = opponent.food[foodType] ?? 0;
      }

      return {
        playerId: opponent.id,
        board: opponent.board.toRecord(),
        food: opponentFood,
        actionCubes: opponent.turnsRemaining,
        handSize: opponent.hand.length,
      };
    });

  // Get birdfeeder dice as DieFace array (preserving SEED_INVERTEBRATE)
  const birdfeederDice: DieFace[] = [...state.birdfeeder.getDiceInFeeder()];

  // Get bird tray cards
  const birdTray = state.birdCardSupply.getTray()
    .filter((card): card is NonNullable<typeof card> => card !== null);

  return {
    playerId,
    hand: player.hand,
    bonusCards: player.bonusCards,
    food,
    board: playerBoard,
    actionCubes: player.turnsRemaining,
    round: state.round,
    turn: state.turn,
    activePlayerId: state.players[state.activePlayerIndex].id,
    birdfeeder: birdfeederDice,
    birdTray,
    deckSize: state.birdCardSupply.getDeckSize(),
    opponents,
  };
}

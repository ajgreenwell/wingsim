import type { GameState } from "./GameEngine.js";
import type { PlayerView } from "../types/prompts.js";
import type { PlayerId, BirdInstance, Habitat, FoodType } from "../types/core.js";

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
  const playerBoard: Record<Habitat, Array<BirdInstance | null>> = {
    FOREST: [...player.board.FOREST],
    GRASSLAND: [...player.board.GRASSLAND],
    WETLAND: [...player.board.WETLAND],
  };

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
        board: {
          FOREST: [...opponent.board.FOREST],
          GRASSLAND: [...opponent.board.GRASSLAND],
          WETLAND: [...opponent.board.WETLAND],
        },
        food: opponentFood,
        actionCubes: opponent.turnsRemaining,
        handSize: opponent.hand.length,
      };
    });

  // Get birdfeeder dice as FoodType array (convert DieFace to FoodType)
  const birdfeederDice = state.birdfeeder.getDiceInFeeder();
  const birdfeederFood: FoodType[] = birdfeederDice.map(die => {
    // SEED_INVERTEBRATE becomes SEED for display (player must choose)
    if (die === "SEED_INVERTEBRATE") return "SEED";
    return die as FoodType;
  });

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
    birdfeeder: birdfeederFood,
    birdTray,
    deckSize: state.birdCardSupply.getDeckSize(),
    opponents,
  };
}

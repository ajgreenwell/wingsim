# playGame() Implementation Plan

## Overview
Implement the `playGame()` method in GameEngine that handles:
1. Starting hand selection (simultaneous)
2. Game loop (4 rounds, turns until all players exhausted)
3. Four basic actions (PlayBird, GainFood, LayEggs, DrawCards)
4. Event emission to PowerProcessor (stubbed)

## Files to Create/Modify

### 1. `src/agents/PlayerAgent.ts` - Extend Interface
Per WingsimSpec Section 5, use 3 async methods:

```typescript
import type { PlayerId } from "../types/core.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
} from "../types/prompts.js";

export interface PlayerAgent {
  readonly playerId: PlayerId;

  /** Choose which birds/bonus card to keep from initial deal */
  chooseStartingHand(prompt: StartingHandPrompt): Promise<StartingHandChoice>;

  /** Choose which of the 4 actions to take on this turn */
  chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice>;

  /** Handle all other decision prompts (food selection, egg placement, card draw, play bird, etc.) */
  chooseOption(prompt: OptionPrompt): Promise<OptionChoice>;
}
```

### 2. `src/engine/PowerProcessor.ts` - New File (Stub)
Create stub PowerProcessor:

```typescript
import type { Event } from "../types/events.js";
import type { Effect } from "../types/effects.js";
import type { GameState } from "./GameEngine.js";

export class PowerProcessor {
  processEvent(_event: Event, _state: GameState): Effect[] {
    // TODO: Implement power resolution
    return [];
  }
}
```

### 3. `src/engine/ViewBuilder.ts` - New File
Build PlayerView from GameState:

```typescript
export function buildPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  // Player's own state
  // Public game info
  // Opponent info (board, food, turnsRemaining, handSize - NOT hand contents)
}
```

### 4. `src/types/core.ts` - Add PlayerBoard Type
Add type for player_board.json data:

```typescript
export interface HabitatConfig {
  action: "GAIN_FOOD" | "LAY_EGGS" | "DRAW_CARDS";
  baseRewards: number[];  // Reward by column (0-5, index = leftmost empty column)
  bonusRewards: Array<{
    tradeFrom: "FOOD" | "EGGS" | "CARDS";
    tradeFromAmount: number;
    tradeTo: "FOOD" | "EGGS" | "CARDS";
    tradeToAmount: number;
  } | null>;
}

export interface PlayerBoardConfig {
  playBirdCosts: number[];  // Egg cost by column (0-4)
  forest: HabitatConfig;
  grassland: HabitatConfig;
  wetland: HabitatConfig;
}
```

### 5. `src/data/DataRegistry.ts` - Add PlayerBoard Loading
Add loading of player_board.json:

```typescript
import playerBoardData from "./base_game/player_board.json" with { type: "json" };
import type { PlayerBoardConfig } from "../types/core.js";

// In constructor:
this.playerBoard = Object.freeze(playerBoardData as PlayerBoardConfig);

// Add getter:
getPlayerBoard(): Readonly<PlayerBoardConfig> {
  return this.playerBoard;
}
```

### 6. `src/engine/GameEngine.ts` - Add playGame() Method

**Constants:**
```typescript
const TURNS_BY_ROUND = [8, 7, 6, 5];
const TOTAL_ROUNDS = 4;
```

**Rewards from registry** (not hardcoded):
```typescript
// Get from this.registry.getPlayerBoard()
const board = this.registry.getPlayerBoard();
const forestReward = board.forest.baseRewards[leftmostEmptyColumn];
const eggCost = board.playBirdCosts[leftmostEmptyColumn];
```

**GameResult interface:**
```typescript
export interface GameResult {
  winnerId: PlayerId;
  scores: Record<PlayerId, number>;
  roundsPlayed: number;
  totalTurns: number;
}
```

**Method structure:**

```typescript
async playGame(): Promise<GameResult> {
  // 1. Starting hand selection (simultaneous)
  await this.handleStartingHandSelection();

  // 2. Emit GameStartedEvent
  this.emitEvent({ type: "GAME_STARTED", playerIds: [...], seed: this.rng.seed });

  // 3. Run 4 rounds
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    await this.runRound(round);
  }

  // 4. Calculate final scores
  const scores = this.calculateFinalScores();
  const winnerId = this.determineWinner(scores);

  // 5. Emit GameEndedEvent
  this.emitEvent({ type: "GAME_ENDED", finalScores: scores, winnerId });

  return { winnerId, scores, roundsPlayed: TOTAL_ROUNDS, totalTurns: this.gameState.turn };
}
```

**Helper methods:**

1. **`handleStartingHandSelection()`**
   - Build StartingHandPrompt for each player (view, eligible birds/bonus cards)
   - Await `Promise.all(agents.map(a => a.chooseStartingHand(prompt)))`
   - For each choice:
     - Keep selected birds in hand, discard rest to supply
     - Keep 1 bonus card, discard other
     - Discard food equal to birds kept

2. **`runRound(round: number)`**
   - Update `gameState.round = round`
   - Set `turnsRemaining = TURNS_BY_ROUND[round - 1]` for all players
   - Emit RoundStartedEvent
   - While any player has turnsRemaining > 0:
     - Find next player with turns (round-robin from activePlayerIndex)
     - `await runTurn(playerIndex)`
   - Emit RoundEndedEvent

3. **`runTurn(playerIndex: number)`**
   - Set `activePlayerIndex = playerIndex`
   - Emit TurnStartedEvent
   - Build TurnActionPrompt with rewardsByAction
   - Await `agent.chooseTurnAction(prompt)`
   - Execute chosen action:
     - PLAY_BIRD → `executePlayBird()`
     - GAIN_FOOD → `executeGainFood()`
     - LAY_EGGS → `executeLayEggs()`
     - DRAW_CARDS → `executeDrawCards()`
   - Decrement player's `turnsRemaining`
   - Increment `gameState.turn`
   - Emit TurnEndedEvent

4. **`executeGainFood(player, takeBonus)`**
   - Get leftmost empty forest column → lookup reward from `registry.getPlayerBoard().forest.baseRewards`
   - Build `SelectFoodFromFeederPrompt` with available food
   - Call `agent.chooseOption(prompt)` → returns `SelectFoodFromFeederChoice`
   - Take food from birdfeeder, add to player's supply
   - Emit HabitatActivatedEvent (birdInstanceIds = birds with brown powers, right-to-left)
   - (PowerProcessor call stubbed - returns no effects)

5. **`executeLayEggs(player, takeBonus)`**
   - Get leftmost empty grassland column → lookup reward from `registry.getPlayerBoard().grassland.baseRewards`
   - Find birds with remaining egg capacity
   - If any birds, build `PlaceEggsPrompt` with capacities
   - Call `agent.chooseOption(prompt)` → returns `PlaceEggsChoice`
   - Add eggs to birds
   - Emit HabitatActivatedEvent

6. **`executeDrawCards(player, takeBonus)`**
   - Get leftmost empty wetland column → lookup reward from `registry.getPlayerBoard().wetland.baseRewards`
   - Build `DrawCardsPrompt` with tray cards and remaining count
   - Call `agent.chooseOption(prompt)` → returns `DrawCardsChoice`
   - Draw cards from tray/deck, add to hand, refill tray
   - Emit HabitatActivatedEvent

7. **`executePlayBird(player)`**
   - Build `PlayBirdPrompt` with:
     - eligibleBirds: cards in hand player can afford
     - eggCostByEligibleHabitat: from `registry.getPlayerBoard().playBirdCosts[column]`
   - Call `agent.chooseOption(prompt)` → returns `PlayBirdChoice`
   - Deduct food cost from player
   - Discard eggs from birds as payment
   - Create BirdInstance with unique ID (e.g., `{playerId}_{habitat}_{column}_{cardId}`)
   - Place in leftmost empty slot of chosen habitat
   - Remove card from hand
   - Emit BirdPlayedEvent

8. **`emitEvent(event: Event)`**
   - Call `powerProcessor.processEvent(event, state)` (returns [] for now)
   - (Future: notify observers, apply returned effects)

9. **`calculateFinalScores()`**
   - For each player, sum:
     - Bird VP (from cards on board)
     - Bonus card VP (simplified - just count qualifying birds)
     - Eggs on birds
     - Cached food on birds
     - Tucked cards under birds
   - Return Record<PlayerId, number>

10. **`getLeftmostEmptyColumn(habitat)`**
    - Return index of first null slot (0-4), or 5 if full

## Implementation Order
1. Add `PlayerBoardConfig` types to `src/types/core.ts`
2. Update `src/data/DataRegistry.ts` to load player_board.json
3. Update `src/agents/PlayerAgent.ts` with 3 async methods
4. Create `src/engine/PowerProcessor.ts` (stub)
5. Create `src/engine/ViewBuilder.ts`
6. Add playGame() and helper methods to GameEngine
7. Add tests with mock agents
8. Run tests to verify

## Mock Agent for Testing
Create a simple mock agent that makes deterministic choices:
```typescript
function createMockAgent(playerId: string): PlayerAgent {
  return {
    playerId,
    async chooseStartingHand(prompt) {
      // Keep all birds, first bonus card, discard food equal to birds kept
      return {
        promptId: prompt.promptId,
        kind: "startingHand",
        birds: prompt.eligibleBirds,
        bonusCard: [...prompt.eligibleBonusCards][0],
        foodToDiscard: new Set(["INVERTEBRATE", "SEED", "FISH", "FRUIT", "RODENT"]),
      };
    },
    async chooseTurnAction(prompt) {
      // Always take GAIN_FOOD action
      return { promptId: prompt.promptId, kind: "turnAction", action: "GAIN_FOOD", takeBonus: false };
    },
    async chooseOption(prompt) {
      // Handle based on prompt.kind - return first/simplest valid choice
      switch (prompt.kind) {
        case "selectFoodFromFeeder":
          return { promptId: prompt.promptId, kind: "selectFoodFromFeeder", foodOrReroll: { SEED: 1 } };
        case "placeEggs":
          return { promptId: prompt.promptId, kind: "placeEggs", placements: {} };
        case "drawCards":
          return { promptId: prompt.promptId, kind: "drawCards", trayCards: [], numDeckCards: prompt.remaining };
        case "playBird":
          // Return first valid choice
          // ...
        default:
          throw new Error(`Unhandled prompt kind: ${prompt.kind}`);
      }
    },
  };
}
```

## Key Design Notes
- **3 agent methods** per spec: `chooseStartingHand`, `chooseTurnAction`, `chooseOption`
- **All async** (Promise-based) to support LLM agents
- **Simultaneous starting hands** via Promise.all()
- **Rewards from data**: Use `registry.getPlayerBoard()` for all reward/cost lookups
- **playGame() returns GameResult** with winner and scores
- **PowerProcessor stubbed** - processEvent() returns empty array
- **Events emitted** but not yet observed (observer pattern comes later)
- **Scoring simplified** (no round goal scoring yet)

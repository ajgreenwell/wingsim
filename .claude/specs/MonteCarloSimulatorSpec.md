# Monte Carlo Simulator Design Spec

## Overview

This document specifies the design for a Monte Carlo simulation system for Wingsim that:
1. Runs full game simulations with configurable agents
2. Tracks handler coverage across all power and turn action handlers
3. Provides a CLI interface (`yarn sim`) with flexible configuration
4. Supports future extensibility for LLM-backed agents

---

## Architecture

```
src/
  agents/
    PlayerAgent.ts          # Existing interface (unchanged)
    AgentRegistry.ts        # NEW: Agent type registry
    SmartRandomAgent.ts     # NEW: Constraint-aware random agent
  sim/
    Simulator.ts            # NEW: Simulation orchestrator
    HandlerCoverageTracker.ts  # NEW: Coverage tracking
    cli.ts                  # NEW: CLI entry point for `yarn sim`
```

---

## Component Specifications

### 1. SmartRandomAgent

**File**: `src/agents/SmartRandomAgent.ts`

A constraint-aware agent that makes valid random choices for all prompt types. Unlike a naive random agent, it reads prompt constraints and ensures all choices satisfy validation rules.

#### Interface

```typescript
import { PlayerAgent } from "./PlayerAgent.js";
import { Rng } from "../util/Rng.js";

export class SmartRandomAgent implements PlayerAgent {
  readonly playerId: PlayerId;
  private readonly rng: Rng;

  constructor(playerId: PlayerId, seed: number);

  // PlayerAgent interface methods
  chooseStartingHand(prompt: StartingHandPrompt): Promise<StartingHandChoice>;
  chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice>;
  chooseOption(prompt: OptionPrompt): Promise<OptionChoice>;
}
```

#### Design Decisions

1. **Separate seeded RNG**: Each SmartRandomAgent gets its own `Rng` instance with a dedicated seed, independent of the game's RNG. This allows reproducible agent behavior while keeping game randomness separate.

2. **Constraint-aware choices**: For each prompt kind, the agent must:
   - Read all constraints from the prompt (capacities, eligible options, counts)
   - Generate choices that satisfy all constraints
   - Never return choices that would fail validation

3. **Prompt handling strategy** (by kind):

| Prompt Kind | Strategy |
|-------------|----------|
| `startingHand` | Randomly keep 0-5 birds, pick 1 bonus card, discard food matching bird count, prioritizing food that isn't needed to play kept birds |
| `turnAction` | Pick random action from valid actions -- may need to update the prompt to only surface valid actions (namely, don't allow users to play a bird if they can't play any birds in their hand) |
| `activatePower` | Always activate |
| `selectFoodFromFeeder` | Pick food needed for birds in hand if posible, random priority |
| `selectFoodFromSupply` | Pick food needed for birds in hand if posible, random priority |
| `selectFoodDestination` | Random from `destinationOptions` |
| `discardEggs` | Discard `count` randomly across eligible birds respecting available eggs |
| `placeEggs` | Distribute `count` randomly across eligible birds respecting remaining capacities |
| `selectCards` | Pick `count` random cards from `eligibleCards` |
| `drawCards` | Random mix of tray and deck cards up to `remaining` |
| `selectBonusCards` | Pick `count` randomly from `eligibleCards` |
| `selectPlayer` | Random from `eligiblePlayers` |
| `repeatPower` | Random from `eligibleBirds` |
| `playBird` | Random bird from `eligibleBirds`, valid habitat, valid payment |
| `discardFood` | Match `foodCost` exactly using player's available food |
| `selectHabitat` | Random from `eligibleHabitats` |

---

### 2. HandlerCoverageTracker

**File**: `src/sim/HandlerCoverageTracker.ts`

Tracks which handlers have been invoked during simulation runs. Provides aggregate coverage across all games.

#### Interface

```typescript
export type HandlerType = "power" | "turnAction";

export interface HandlerInvocation {
  handlerId: string;
  type: HandlerType;
  count: number;
}

export class HandlerCoverageTracker {
  constructor();

  // Called by instrumented ActionProcessor
  recordInvocation(handlerId: string, type: HandlerType): void;

  // Query methods
  getCoverage(): HandlerInvocation[];
  getUncoveredHandlers(): string[];
  getCoveragePercentage(): number;

  // Reset for new simulation batch
  reset(): void;

  // Generate CLI report
  generateReport(): string;
}
```

#### Integration with ActionProcessor

The tracker needs to be notified when handlers execute. Two approaches:

**Option A: Callback injection** (Recommended)
- ActionProcessor constructor accepts an optional `onHandlerInvoked` callback
- Simulator passes the tracker's `recordInvocation` method
- Minimal changes to ActionProcessor

```typescript
// In ActionProcessor constructor
constructor(options?: {
  onHandlerInvoked?: (handlerId: string, type: HandlerType) => void;
}) {
  this.onHandlerInvoked = options?.onHandlerInvoked;
  // ... existing registration
}

// In executeSinglePower, after handler executes successfully
if (this.onHandlerInvoked) {
  this.onHandlerInvoked(power.handlerId, "power");
}
```

#### Handler Inventory (42 total)

**Power Handlers (38)**:
- `gainFoodFromSupply`, `cacheFoodFromSupply`, `gainFoodFromFeederWithCache`
- `whenOpponentLaysEggsLayEggOnNestType`, `playersWithFewestInHabitatDrawCard`
- `playersWithFewestInHabitatGainFood`, `tuckAndDraw`, `discardEggToGainFood`
- `discardEggToDrawCards`, `rollDiceAndCacheIfMatch`, `drawAndDistributeCards`
- `gainFoodFromFeeder`, `discardFoodToTuckFromDeck`, `eachPlayerGainsFoodFromFeeder`
- `layEggOnBirdsWithNestType`, `drawBonusCardsAndKeep`, `layEggsOnBird`
- `gainAllFoodTypeFromFeeder`, `allPlayersGainFoodFromSupply`
- `lookAtCardAndTuckIfWingspanUnder`, `whenOpponentPlaysBirdInHabitatGainFood`
- `whenOpponentPlaysBirdInHabitatTuckCard`, `whenOpponentPredatorSucceedsGainFood`
- `whenOpponentGainsFoodCacheIfMatch`, `moveToAnotherHabitatIfRightmost`
- `drawCardsWithDelayedDiscard`, `tuckFromHandAndLay`, `tuckAndGainFood`
- `tuckAndGainFoodOfChoice`, `drawFaceUpCardsFromTray`, `drawCards`
- `allPlayersDrawCardsFromDeck`, `allPlayersLayEggOnNestType`
- `playAdditionalBirdInHabitat`, `tradeFoodType`, `repeatBrownPowerInHabitat`
- `repeatPredatorPowerInHabitat`, `gainFoodFromFeederIfAvailable`

**Turn Action Handlers (4)**:
- `gainFoodHandler`, `layEggsHandler`, `drawCardsHandler`, `playBirdHandler`

---

### 3. AgentRegistry

**File**: `src/agents/AgentRegistry.ts`

Maps agent type names (used in CLI) to factory functions that create agent instances.

#### Interface

```typescript
export type AgentFactory = (playerId: PlayerId, seed: number) => PlayerAgent;

export interface AgentRegistration {
  name: string;
  description: string;
  factory: AgentFactory;
}

class AgentRegistryImpl {
  private readonly agents: Map<string, AgentRegistration>;

  register(name: string, description: string, factory: AgentFactory): void;
  create(name: string, playerId: PlayerId, seed: number): PlayerAgent;
  list(): AgentRegistration[];
  has(name: string): boolean;
}

export const AgentRegistry: AgentRegistryImpl;
```

#### Built-in Registrations

```typescript
// Register on module load
AgentRegistry.register(
  "SmartRandomAgent",
  "Constraint-aware random agent with seeded RNG",
  (playerId, seed) => new SmartRandomAgent(playerId, seed)
);

// Future: LLM agents
// AgentRegistry.register(
//   "LLMAgent",
//   "LLM-backed agent using Claude API",
//   (playerId, seed) => new LLMAgent(playerId, seed, apiKey)
// );
```

---

### 4. Simulator

**File**: `src/sim/Simulator.ts`

Orchestrates multiple game simulations, manages seeds, and aggregates results.

#### Interface

```typescript
export interface SimulatorConfig {
  numGames: number;
  numPlayers: number;
  agentTypes: string[];           // Length must equal numPlayers
  seeds?: number[];               // Optional: explicit seeds for each game
  baseSeed?: number;              // Used to generate seeds if not explicit
  trackCoverage: boolean;
}

export interface GameSimulationResult {
  seed: number;
  result: GameResult;
  durationMs: number;
}

export interface SimulationSummary {
  games: GameSimulationResult[];
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
  seeds: number[];                // All seeds used (for replay)
  coverage?: {
    covered: number;
    total: number;
    percentage: number;
    uncoveredHandlers: string[];
  };
}

export class Simulator {
  constructor(config: SimulatorConfig);

  async run(): Promise<SimulationSummary>;
}
```

#### Seed Management

1. **Explicit seeds provided**: Use `config.seeds` directly, one per game
2. **Base seed provided**: Use `baseSeed` to generate derived seeds for each game:
   ```typescript
   const seedRng = new Rng(baseSeed);
   const gameSeeds = Array(numGames).fill(0).map(() => seedRng.int(0, 2**32));
   ```
3. **Neither provided**: Use `Date.now()` as base seed

#### Agent Seeding

Each agent gets a deterministic seed derived from game seed + player index:
```typescript
const agentSeed = gameSeed ^ (playerIndex * 0x9e3779b9);
```

---

### 5. CLI Entry Point

**File**: `src/sim/cli.ts`

Implements the `yarn sim` command with all required options.

#### Command Specification

```
yarn sim [options]

Options:
  -n, --num-games <n>     Number of games to simulate (default: 10)
  -p, --players <n>       Number of players per game (default: 2)
  -s, --seed <seed>       Base seed for reproducibility (generates per-game seeds)
  --seeds <seeds...>      Explicit seeds for each game (comma-separated)
  --coverage              Generate handler coverage report
  -p1, --player1 <type>   Agent type for player 1 (default: SmartRandomAgent)
  -p2, --player2 <type>   Agent type for player 2 (default: SmartRandomAgent)
  -p3, --player3 <type>   Agent type for player 3
  -p4, --player4 <type>   Agent type for player 4
  -p5, --player5 <type>   Agent type for player 5
  --list-agents           List available agent types
  -h, --help              Show help
```

#### Example Usage

```bash
# Run 10 games with 2 SmartRandomAgents
yarn sim

# Run 50 games with 3 players, track coverage
yarn sim -n 50 -p 3 --coverage

# Run with specific base seed for reproducibility
yarn sim -n 20 -s 12345

# Run with explicit seeds (for replaying specific games)
yarn sim --seeds 12345,67890,11111

# Mix agent types
yarn sim -p 2 -p1 SmartRandomAgent -p2 LLMAgent

# List available agents
yarn sim --list-agents
```

#### Output Format (Human-readable)

```
Wingspan Simulator v0.1.0
========================

Configuration:
  Games: 10
  Players: 2
  Agents: SmartRandomAgent, SmartRandomAgent
  Base seed: 1705123456789

Running simulations...
  Game 1/10 [seed: 2847593847] Player1 wins (42-38) in 127ms
  Game 2/10 [seed: 9827364521] Player2 wins (51-47) in 143ms
  ...

Summary
-------
  Total time: 1.34s
  Successful: 10/10
  Win distribution: Player1: 6, Player2: 4

Seeds used (for replay):
  2847593847, 9827364521, 1029384756, ...

Handler Coverage Report
-----------------------
  Coverage: 38/42 (90.5%)

  Uncovered handlers:
    - whenOpponentPredatorSucceedsGainFood
    - repeatPredatorPowerInHabitat
    - playAdditionalBirdInHabitat
    - moveToAnotherHabitatIfRightmost
```

---

## Package.json Updates

```json
{
  "scripts": {
    "sim": "node dist/sim/cli.js"
  }
}
```

---

## File Dependency Graph

```
src/sim/cli.ts
  ├── src/sim/Simulator.ts
  │     ├── src/engine/GameEngine.ts
  │     ├── src/agents/AgentRegistry.ts
  │     ├── src/sim/HandlerCoverageTracker.ts
  │     └── src/data/DataRegistry.ts
  └── src/agents/AgentRegistry.ts
        └── src/agents/SmartRandomAgent.ts
              ├── src/agents/PlayerAgent.ts
              ├── src/util/Rng.ts
              └── src/types/prompts.ts
```

---

## Extensibility Points

### Adding New Agent Types

1. Create class implementing `PlayerAgent` in `src/agents/`
2. Register in `AgentRegistry.ts`:
   ```typescript
   AgentRegistry.register("MyAgent", "Description", (playerId, seed) =>
     new MyAgent(playerId, seed)
   );
   ```
3. Agent is immediately available via CLI: `yarn sim -p1 MyAgent`

### LLM Agent Considerations

Future LLM agents will need:
- API key configuration (env var or config file)
- Rate limiting / retry logic
- Cost tracking
- Different seeding (LLMs are inherently non-deterministic)

The registry pattern accommodates this by allowing factory functions to accept additional configuration via closure or environment.

---

## Verification Checklist

After implementation, verify:

1. [ ] `yarn sim` runs 10 games successfully with default settings
2. [ ] `yarn sim -n 5 -p 3` runs 5 games with 3 players
3. [ ] `yarn sim -s 12345` produces same results on repeated runs
4. [ ] `yarn sim --seeds 111,222,333` runs exactly 3 games with those seeds
5. [ ] `yarn sim --coverage` prints coverage report
6. [ ] `yarn sim --list-agents` shows available agent types
7. [ ] All 4 turn action handlers reach 100% coverage in 10-game run
8. [ ] No validation errors from SmartRandomAgent choices
9. [ ] Seeds are printed in output for replay capability

---

## Implementation Notes

### SmartRandomAgent Complexity

The `playBird` prompt handler is the most complex, requiring:
1. Filter birds by affordable food cost (player's supply)
2. Filter birds by available habitat space
3. Select random bird
4. Select random valid habitat for that bird
5. Generate food payment (handling WILD costs)
6. Generate egg payment from birds with eggs

Consider implementing helper functions:
- `canAffordBird(bird: BirdCard, playerFood: FoodByType): boolean`
- `generateFoodPayment(cost: FoodByType, available: FoodByType): FoodByType`
- `generateEggPayment(count: number, birdsWithEggs: EggsByBird): EggsByBird`

### Coverage Tracker Initialization

The tracker must be passed to ActionProcessor at construction time. Since GameEngine creates ActionProcessor, update:

```typescript
// GameEngine constructor
constructor(config: GameEngineConfig) {
  // ...
  this.actionProcessor = new ActionProcessor({
    onHandlerInvoked: config.onHandlerInvoked,
  });
}
```

This allows Simulator to inject the tracker callback.

# Monte Carlo Simulator Implementation Plan

This document breaks down [MonteCarloSimulatorSpec.md](MonteCarloSimulatorSpec.md) into distinct, self-contained implementation tasks suitable for kanban-style tracking.

---

## Tasks

### [x] 1. AgentRegistry

**File**: `src/agents/AgentRegistry.ts`

**Scope**:
- Create `AgentRegistration` interface with `name`, `description`, `factory` fields
- Create `AgentFactory` type: `(playerId: PlayerId, seed: number) => PlayerAgent`
- Implement `AgentRegistryImpl` class with:
  - `register(name, description, factory)` method
  - `create(name, playerId, seed)` method
  - `list()` method returning all registrations
  - `has(name)` method for validation
- Export singleton `AgentRegistry` instance
- Do NOT register any agents yet (SmartRandomAgent doesn't exist)

**Dependencies**: None

**Deliverables**:
- `src/agents/AgentRegistry.ts`
- Unit tests for registry CRUD operations

---

### [x] 2. Prompt Eligibility Filtering

**Files**: `src/engine/GameEngine.ts`, `src/types/prompts.ts`

**Scope**:
Update prompt generation so agents only see eligible options, eliminating the need for agents to validate affordability or action eligibility themselves.

- **TurnActionPrompt changes**:
  - Add `eligibleActions: TurnActionKind[]` field to `TurnActionPrompt`
  - Filter out ineligible actions before prompting:
    - `PLAY_BIRD`: Only include if player has at least one bird in hand they can afford (food + eggs for at least one valid habitat)
    - `GAIN_FOOD`: Always eligible (can always take food action even if feeder empty - triggers reroll)
    - `LAY_EGGS`: Only include if player has at least one bird on their board
    - `DRAW_CARDS`: Always eligible
  - `rewardsByAction` should only contain entries for `eligibleActions`

- **PlayBirdPrompt changes**:
  - Ensure `eligibleBirds` is pre-filtered to only include birds the player can actually afford (has sufficient food in supply, and has eggs available if habitat requires egg cost)
  - Document this invariant clearly

- **Validation**:
  - Add unit tests verifying prompts only contain valid options
  - Ensure edge cases are covered (empty hand, no birds on board, etc.)

**Dependencies**: None

**Deliverables**:
- Updated `src/types/prompts.ts` with `eligibleActions` field
- Updated prompt generation in `src/engine/GameEngine.ts`
- Unit tests for eligibility filtering

---

### [x] 3. SmartRandomAgent - Core Structure & Simple Prompts

**File**: `src/agents/SmartRandomAgent.ts`

**Scope**:
- Create `SmartRandomAgent` class implementing `PlayerAgent` interface
- Constructor accepts `playerId` and `seed`, creates private `Rng` instance
- Implement the following prompt handlers (simpler ones):
  - `activatePower` - Always return `{ activate: true }`
  - `selectFoodDestination` - Random from `destinationOptions`
  - `selectPlayer` - Random from `eligiblePlayers`
  - `selectHabitat` - Random from `eligibleHabitats`
  - `repeatPower` - Random from `eligibleBirds`
  - `selectBonusCards` - Random `count` cards from `eligibleCards`
  - `selectCards` - Random `count` cards from `eligibleCards`
- Register `SmartRandomAgent` in `AgentRegistry`

**Dependencies**: Task 1 (AgentRegistry)

**Deliverables**:
- `src/agents/SmartRandomAgent.ts` (partial)
- Unit tests for implemented prompt handlers

---

### [x] 4. SmartRandomAgent - Food & Egg Prompts

**File**: `src/agents/SmartRandomAgent.ts` (continued)

**Scope**:
- Implement food-related prompt handlers:
  - `selectFoodFromFeeder` - Select dice, handle SEED_INVERTEBRATE correctly, or reroll if all same
  - `selectFoodFromSupply` - Pick `count` food from `allowedFoods`, prefer food needed for birds in hand
  - `discardFood` - Match `foodCost` exactly using available food
- Implement egg-related prompt handlers:
  - `discardEggs` - Distribute `count` discards across eligible birds
  - `placeEggs` - Distribute `count` placements respecting `remainingCapacitiesByEligibleBird`

**Dependencies**: Task 3

**Deliverables**:
- Updated `src/agents/SmartRandomAgent.ts`
- Unit tests for food/egg prompt handlers

---

### [x] 5. SmartRandomAgent - Card & Turn Action Prompts

**File**: `src/agents/SmartRandomAgent.ts` (continued)

**Scope**:
- Implement card-related prompt handlers:
  - `drawCards` - Random mix of tray and deck cards up to `remaining`
- Implement `turnAction` prompt handler:
  - Pick random action from `eligibleActions` (pre-filtered by Task 2)
  - Randomly decide `takeBonus` if bonus is available for chosen action
  - No affordability checking needed - prompt only contains valid options

**Dependencies**: Tasks 2, 4 (Prompt Eligibility Filtering, previous SmartRandomAgent task)

**Deliverables**:
- Updated `src/agents/SmartRandomAgent.ts`
- Unit tests for card/turn action handlers

---

### [x] 6. SmartRandomAgent - Complex Prompts (playBird, startingHand)

**File**: `src/agents/SmartRandomAgent.ts` (continued)

**Scope**:
- Implement `playBird` prompt handler:
  - Select random bird from `eligibleBirds` (pre-filtered to affordable birds by Task 2)
  - Select random valid habitat from bird's allowed habitats (filtered by `eggCostByEligibleHabitat`)
  - Generate food payment satisfying bird's food cost (handle WILD costs)
  - Generate egg payment from birds with eggs matching habitat's egg cost
  - Helper functions: `generateFoodPayment()`, `generateEggPayment()`
  - No affordability checking needed - `eligibleBirds` only contains playable birds
- Implement `startingHand` prompt handler:
  - Randomly keep 0-5 birds from `eligibleBirds`
  - Pick 1 bonus card from `eligibleBonusCards`
  - Discard food matching kept bird count, prioritizing food not needed by kept birds

**Dependencies**: Task 5

**Deliverables**:
- Complete `src/agents/SmartRandomAgent.ts`
- Comprehensive unit tests including edge cases

---

### [x] 7. HandlerCoverageTracker

**File**: `src/sim/HandlerCoverageTracker.ts`

**Scope**:
- Create `HandlerType` type: `"power" | "turnAction"`
- Create `HandlerInvocation` interface with `handlerId`, `type`, `count`
- Implement `HandlerCoverageTracker` class:
  - Internal maps for tracking invocation counts
  - `recordInvocation(handlerId, type)` - Increment count
  - `getCoverage()` - Return all invocations
  - `getUncoveredHandlers()` - Return handler IDs with zero invocations
  - `getCoveragePercentage()` - Percentage of handlers with at least one invocation
  - `reset()` - Clear all counts
  - `generateReport()` - Format human-readable coverage report
- Maintain static list of all known handlers (38 power + 4 turn action = 42 total)

**Dependencies**: None

**Deliverables**:
- `src/sim/HandlerCoverageTracker.ts`
- Unit tests for tracking and reporting

---

### [ ] 8. ActionProcessor/GameEngine Coverage Integration

**Files**: `src/engine/ActionProcessor.ts`, `src/engine/GameEngine.ts`

**Scope**:
- Modify `ActionProcessor` constructor to accept optional `onHandlerInvoked` callback:
  ```typescript
  constructor(options?: {
    onHandlerInvoked?: (handlerId: string, type: HandlerType) => void;
  })
  ```
- Call the callback after successful handler execution in:
  - `executeSinglePower()` - with type `"power"`
  - `executeTurnAction()` - with type `"turnAction"`
- Modify `GameEngine` constructor to accept optional `onHandlerInvoked` callback
- Pass callback through to `ActionProcessor` during construction
- Ensure existing tests still pass (callback is optional)

**Dependencies**: Task 7 (for `HandlerType` import)

**Deliverables**:
- Updated `src/engine/ActionProcessor.ts`
- Updated `src/engine/GameEngine.ts`
- Integration test verifying callback invocation

---

### [ ] 9. Simulator

**File**: `src/sim/Simulator.ts`

**Scope**:
- Create `SimulatorConfig` interface with all configuration options
- Create `GameSimulationResult` and `SimulationSummary` interfaces
- Implement `Simulator` class:
  - Constructor validates config (numPlayers matches agentTypes length, etc.)
  - Seed management:
    - Use explicit `seeds` if provided
    - Otherwise derive from `baseSeed` using Rng
    - Default to `Date.now()` if neither provided
  - Agent seeding: `gameSeed ^ (playerIndex * 0x9e3779b9)`
  - `run()` method:
    - Create agents via `AgentRegistry`
    - Create `GameEngine` with coverage callback if enabled
    - Run each game, collect results
    - Aggregate coverage data across all games
    - Return `SimulationSummary`

**Dependencies**: Tasks 1, 6, 7, 8 (AgentRegistry, SmartRandomAgent, Coverage, Integration)

**Deliverables**:
- `src/sim/Simulator.ts`
- Integration tests with mock games

---

### [ ] 10. CLI Entry Point

**Files**: `src/sim/cli.ts`, `package.json`

**Scope**:
- Implement CLI using a library like `commander` or manual argv parsing:
  - `-n, --num-games <n>` (default: 10)
  - `-p, --players <n>` (default: 2)
  - `-s, --seed <seed>` (base seed)
  - `--seeds <seeds...>` (explicit seeds, comma-separated)
  - `--coverage` (enable coverage report)
  - `-p1` through `-p5` for per-player agent types
  - `--list-agents` (list available agents)
  - `-h, --help`
- Validate inputs (player count 2-5, agent types exist, etc.)
- Format output:
  - Configuration summary
  - Per-game results with seed and outcome
  - Final summary (timing, wins, seeds for replay)
  - Coverage report if enabled
- Update `package.json`:
  ```json
  { "scripts": { "sim": "node dist/sim/cli.js" } }
  ```

**Dependencies**: Task 9 (Simulator)

**Deliverables**:
- `src/sim/cli.ts`
- Updated `package.json`
- Manual testing of CLI commands

---

### [ ] 11. Verification & Polish

**Scope**:
Run through the spec's verification checklist and fix any issues:

1. [ ] `yarn sim` runs 10 games successfully with default settings
2. [ ] `yarn sim -n 5 -p 3` runs 5 games with 3 players
3. [ ] `yarn sim -s 12345` produces same results on repeated runs
4. [ ] `yarn sim --seeds 111,222,333` runs exactly 3 games with those seeds
5. [ ] `yarn sim --coverage` prints coverage report
6. [ ] `yarn sim --list-agents` shows available agent types
7. [ ] All 4 turn action handlers reach 100% coverage in 10-game run
8. [ ] No validation errors from SmartRandomAgent choices
9. [ ] Seeds are printed in output for replay capability

Additional polish:
- Add error handling for edge cases
- Ensure clean error messages for invalid inputs
- Test with various player counts (2-5)
- Verify determinism with seed replay

**Dependencies**: All previous tasks

**Deliverables**:
- All verification items passing
- Any bug fixes discovered during verification

---

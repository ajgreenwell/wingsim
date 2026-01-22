# Scenario Test Learnings

## Task 1: ScriptedAgent Implementation

### PowerSpec Structure
The `PowerSpec` type in `src/types/core.ts` has the following fields:
- `handlerId: string`
- `trigger: "WHEN_ACTIVATED" | "WHEN_PLAYED" | "ONCE_BETWEEN_TURNS"`
- `params: Record<string, unknown>`
- `text: string`

Note: There is NO `color` field in PowerSpec - the color (brown/pink/white) is implicit in the trigger type.

### ScriptedChoice Implementation
- ScriptedChoice is a union of all choice types with `promptId` omitted
- The `kind` field is used to match choices to prompts - the agent validates that the next scripted choice's `kind` matches the received prompt's `kind`
- The agent copies the script array in the constructor to prevent external mutation

### Test Helper Patterns
When creating test prompts for ActivatePowerPrompt, you need:
- `promptId`, `playerId`, `kind: "activatePower"`, `view`, `context`
- `birdInstanceId`: The runtime instance ID of the bird with the power
- `power`: A valid PowerSpec object with the fields listed above

### Directory Structure
The `__integration__` directory was created with subdirectories for scenario categories:
- `src/engine/__integration__/scenarios/brownPowers/`
- `src/engine/__integration__/scenarios/pinkPowers/`
- `src/engine/__integration__/scenarios/turnActions/`

## Task 2: ScenarioBuilder Implementation

### Duck-Typed Factory Functions vs Inheritance
The `BirdCardSupply`, `DiscardableDeck`, and `Birdfeeder` classes all shuffle/roll on construction and don't expose methods to set internal state directly. Rather than modifying these core classes or using complex inheritance, the ScenarioBuilder uses **duck-typed factory functions** that create objects matching the interface but with preset state:
- `createPresetBirdCardSupply()` - creates a BirdCardSupply-compatible object with a preset deck order and tray
- `createPresetDiscardableDeck()` - creates a DiscardableDeck-compatible object with a preset deck order
- `createPresetBirdfeeder()` - creates a Birdfeeder-compatible object with preset dice

This approach keeps the core engine classes clean while providing full control for testing.

### BuiltScenario Returns GameState, Not GameEngine
The spec originally mentioned `GameEngine.fromState()`, but the implementation returns `BuiltScenario` containing `gameState` (not engine) because:
1. The ScenarioRunner will need to create the GameEngine with the agents
2. This separation makes the builder more focused and testable
3. The ScenarioRunner can wire up the GameState with agents into the engine

### Bird Instance ID Convention
Bird instance IDs follow the format `{playerId}_{cardId}`, e.g., `alice_barn_owl`. This is created by the ScenarioBuilder when placing birds on the board.

### Turn Block Grouping
The `turns` array in ScenarioConfig is grouped by player to create per-player choice queues. Choices are appended in the order they appear in the `turns` array, preserving execution order even when a player has multiple turn blocks (e.g., for pink power responses during another player's turn).

### Card Removal Strategy
The builder collects ALL cards that appear in:
- Player hands
- Player boards (bird placements)
- Tucked cards on birds
- Bird tray configuration
- Deck top cards
- Bonus cards held by players
- Bonus deck top cards

These are removed from the main decks to ensure no duplicates and deterministic state.

## Task 3: ScenarioRunner Implementation

### GameObserver Interface
Created `src/engine/GameObserver.ts` with a simple interface:
- `onEventProcessing?(event: Event): void` - called when an event is about to be processed
- `onEffectApplied?(effect: Effect): void` - called when an effect is about to be applied

Both methods are optional since observers may only care about one type.

### GameEngine.fromState() Factory
The `GameEngine.fromState()` static factory method creates an engine from a pre-built `GameState`. This uses `Object.create()` to bypass the constructor (which calls `setupGame()`) and then manually initializes all private fields via a `Record<string, unknown>` cast.

### GameEngine.runSingleTurn()
The `runSingleTurn()` method runs a single turn for the current active player and then advances `activePlayerIndex` to the next player (round-robin). This differs from the internal `runTurn()` which doesn't advance the player index.

### Birdfeeder Dice Selection Limitation
The `buildLimitedAvailableDice()` function in `ActionHandlers.ts` limits which dice are **offered** to the player based on array position, not just how many can be taken. For column 0 (empty FOREST), only 1 die is offered - the first die in the birdfeeder array. This affects scenario design: scripted choices must select from the offered dice, not from all dice in the feeder.

### ScenarioRunner Architecture
The `runScenario()` function:
1. Creates a `DataRegistry` and `ScenarioBuilder`
2. Builds the scenario to get `gameState` and `agents`
3. Creates a `GameEngine` via `GameEngine.fromState()`
4. Registers a `ScenarioObserver` to collect events/effects
5. Runs the specified number of turns via `runSingleTurn()`
6. Executes assertion callbacks with full `ScenarioContext`
7. Optionally verifies all agent scripts were consumed

### Validation Reprompt Behavior
When the ActionProcessor's choice validation fails (e.g., selecting a die not in `availableDice`), it reprompts with the same prompt ID. The `ScriptedAgent` consumes a choice on each call to `chooseOption()`, so invalid choices in the script will exhaust it quickly. Ensure scripted choices only select from the dice/options that will actually be offered.

# Monte Carlo Simulator Learnings

## AgentRegistry Implementation (Task 1)

- Added `clear()` method (not in spec) to support test isolation. The singleton pattern means tests would otherwise pollute each other's state.
- Added `listNames()` convenience method for validation error messages.
- Agent names are case-sensitive. This is intentional to avoid CLI ambiguity.
- The test file uses a `MockAgent` class that implements `PlayerAgent` with stub methods. Future tasks implementing `SmartRandomAgent` can reference this pattern.

## Prompt Eligibility Filtering Implementation (Task 2)

### Key Implementation Details

- **TurnActionPrompt.eligibleActions**: Added as required field. GameEngine now calculates eligible actions before prompting.
- **rewardsByAction filtering**: Only includes entries for eligible actions, avoiding null checks in agents.

### PlayerState Methods

- **getEligibleBirdsToPlay()**: Kept unchanged for backward compatibility - only checks food affordability.
- **getFullyEligibleBirdsToPlay(boardConfig)**: New method that checks food, egg cost, AND habitat availability.
- **canPlayAnyBird(boardConfig)**: Convenience method for action eligibility checking.
- **canAffordBirdFood(card)**: Private helper extracted for reuse.

### Wingspan Rule Alignment

Corrected `player_board.json` to use standard Wingspan egg costs:
- Old: `[1, 1, 2, 2, 3]` (column 0 cost 1 egg)
- New: `[0, 0, 1, 1, 2]` (columns 0-1 free, matching real game)

This required updating several tests and the ScenarioTestLearnings.md.

### playBirdHandler Update

Changed `playBirdHandler` to use `getFullyEligibleBirdsToPlay(boardConfig)` instead of `getEligibleBirdsToPlay()` to ensure the PlayBirdPrompt only contains truly playable birds.

### SmartRandomAgent Implications

With eligibility pre-filtering, the SmartRandomAgent can now:
- Simply pick any action from `eligibleActions` (no validation needed)
- Pick any bird from PlayBirdPrompt.eligibleBirds (guaranteed affordable)

## SmartRandomAgent Core Structure (Task 3)

### Module Self-Registration Pattern

- SmartRandomAgent self-registers in `AgentRegistry` at module load time via a `register()` call at the bottom of the file.
- Testing this side effect is tricky: clearing the registry in `beforeEach` and re-importing doesn't work because ES module side effects only run once.
- Solution: Don't clear the registry before testing registration - let the initial import's side effect be tested directly.

### Implementation Notes

- All prompt handlers are stubbed out in Task 3, with full implementations planned for Tasks 4-6.
- Even stubbed handlers produce valid choices that satisfy prompt constraints.
- The `chooseOption()` method uses a switch on `prompt.kind` to dispatch to appropriate handlers - this pattern is clearer than a handler registry for a single agent.
- `Rng.pickMany()` is the workhorse method - it shuffles and takes the first N items, ensuring no duplicates when selecting from finite sets.

## SmartRandomAgent Food & Egg Prompts (Task 4)

### DiscardFood WILD Cost Handling

- `DiscardFoodPrompt.foodCost` can include `WILD` (e.g., `{ WILD: 1 }`) when any food type is acceptable (used in habitat bonus trades).
- The agent must resolve WILD to actual food types from the player's supply - returning `{ WILD: 1 }` in the choice is invalid.
- Implementation: First satisfy specific food costs, then pick randomly from remaining supply for WILD costs.

### Rng.pickManyWithReplacement()

- Used for `selectFoodFromSupply` because the supply is unlimited (unlike the feeder which has finite dice).
- Allows selecting the same food type multiple times.

### selectFoodFromFeeder Reroll Logic

- When all dice show the same face, the agent randomly decides whether to reroll or take.
- Empty feeder always returns "reroll".
- SEED_INVERTEBRATE dice require `asFoodType` to be specified.

## SmartRandomAgent Card & Turn Action Prompts (Task 5)

### drawCards Handler

- Agent randomly decides how many to draw from tray vs deck (0 to min(remaining, traySize)).
- Uses `Rng.pickMany()` to select specific tray cards without duplicates.
- Falls back to deck-only when tray is empty.

### turnAction Handler

- Simply picks from `eligibleActions` (pre-filtered by Task 2 work).
- Bonus decision is random (50/50) when a bonus is available for the chosen action.
- No affordability checking needed - the prompt guarantees all options are valid.

## SmartRandomAgent Complex Prompts (Task 6)

### playBird Handler

- **Helper Functions**: Implemented `generateFoodPayment()` and `generateEggPayment()` as private methods for cleaner code organization.
- **OR Mode Critical Bug Fix**: Must filter food options to only those the player can actually afford. The prompt's `eligibleBirds` are pre-filtered for overall affordability, but for OR mode, the agent might randomly pick an option the player can't specifically afford.
- **WILD Cost Resolution**: For AND mode with WILD costs (e.g., `{ SEED: 1, WILD: 1 }`), first pay specific costs, then pick randomly from remaining player supply to satisfy WILD.
- **Egg Payment**: Shuffle birds with eggs and distribute cost across them to avoid bias.

### startingHand Handler

- **Bird Count Clamping**: Must clamp `numBirdsToKeep` to `Math.min(eligibleBirds.length, 5)` since the prompt might have fewer than 5 eligible birds.
- **Food Prioritization**: Calculates which food types are needed by kept birds, then prefers discarding unneeded food. This is a "smarter" random that makes the agent more competitive.
- **Set<FoodType> Constraint**: The `foodToDiscard` field is a `Set<FoodType>` (unique food types only), which works because Wingspan starting hand gives 1 of each food type (5 unique).

### Integration Testing

- Full game integration tests verify SmartRandomAgent can complete games without errors.
- Determinism tests confirm same seed produces identical results.
- Tests for 2-player, 3-player configurations all pass.

## HandlerCoverageTracker Implementation (Task 7)

### Reusing Existing Handler ID Lists

- The codebase already had a complete list of handler IDs in `src/engine/__integration__/coverage.ts` (for test coverage scanning).
- HandlerCoverageTracker imports and reuses `POWER_HANDLER_IDS`, `TURN_ACTION_HANDLER_IDS`, and `ALL_HANDLER_IDS` from that file to avoid duplication.
- This ensures the runtime coverage tracker stays in sync with the test coverage scanner.

### Design Decisions

- **HANDLER_TYPE_MAP**: A static map built from the handler ID arrays to quickly look up whether a handler is "power" or "turnAction" type. Used for validation and report generation.
- **Unknown Handler Tracking**: The tracker accepts invocations for unknown handler IDs (future-proofing) but they don't affect coverage percentage calculations since they're not in `ALL_HANDLER_IDS`.
- **Initialization**: All known handlers start with count 0 in the constructor, so `getCoverage()` always returns entries for all 42 handlers even if not invoked.

### Report Format

- The `generateReport()` method includes a progress bar, uncovered handler list (with type annotations), and top 10 most-invoked handlers.
- Type annotations ("power" or "turnAction") help identify which category of handlers needs more coverage.

## ActionProcessor/GameEngine Coverage Integration (Task 8)

### Implementation Approach

- **ActionProcessorOptions Interface**: Created a dedicated options interface to accept the callback, making the API clean and extensible for future options.
- **Handler ID Mapping for Turn Actions**: Turn action handlers required a static mapping from `TurnActionKind` (e.g., `"GAIN_FOOD"`) to handler IDs (e.g., `"gainFoodHandler"`) because the handler registry uses `TurnActionKind` as keys, not handler ID strings.
- **Power Handler Tracking**: Power handlers only trigger the callback when `activateEffect.activated` is true, avoiding false positives from skipped powers (e.g., when a player declines an optional power).

### Integration Points

- **GameEngine constructor**: Passes `onHandlerInvoked` callback from config to `ActionProcessor` constructor.
- **GameEngine.fromState**: Also supports the callback for integration testing scenarios.
- **HandlerType Import**: ActionProcessor imports `HandlerType` from `HandlerCoverageTracker` to ensure type consistency.

### Testing Notes

- Integration tests verify both turn action and power handler callbacks fire during actual gameplay.
- Backwards compatibility test confirms engine works without callback (optional parameter).

## Simulator Implementation (Task 9)

### Module Design

- **SmartRandomAgent Side-Effect Import**: The Simulator imports SmartRandomAgent using `import "../agents/SmartRandomAgent.js"` to ensure the agent self-registers in the AgentRegistry before any simulation runs. This is a side-effect import pattern.
- **DataRegistry Instance**: Each Simulator creates its own DataRegistry instance. This is stateless and immutable, so there's no issue with multiple Simulators.

### Seed Management

- **Three-Tier Priority**: Explicit seeds > baseSeed > Date.now(). This provides maximum flexibility for reproducibility while having sensible defaults.
- **Seed Generation from baseSeed**: Uses the Rng's shuffle method to progress the RNG state and generate varied seeds. A simple approach that produces sufficiently random seeds for each game.
- **Agent Seed Derivation**: Uses `gameSeed ^ (playerIndex * 0x9e3779b9)` where `0x9e3779b9` is the golden ratio constant (used in hash functions). This ensures different players get different seeds while maintaining determinism.

### Configuration Validation

- Validates numGames >= 1, numPlayers in 2-5 range, agentTypes length matches numPlayers.
- Validates all agent types are registered before running (fail-fast).
- Validates explicit seeds length matches numGames if provided.

### Error Handling

- Catches errors from individual games and continues with remaining games.
- Logs errors to console but doesn't abort the entire simulation batch.
- Returns both successCount and errorCount in summary for visibility.

### Coverage Integration

- Creates HandlerCoverageTracker if trackCoverage is enabled.
- Passes `recordInvocation` callback to each GameEngine.
- Tracker accumulates coverage across all games in the batch.
- Provides `getCoverageTracker()` accessor for detailed report generation (used by CLI).

### Testing Approach

- 17 unit/integration tests covering configuration validation, game execution, seed management, and coverage tracking.
- Tests verify 2-5 player games all work correctly.
- Replay capability verified by running same seed twice and comparing results.
- All tests pass in ~50ms (games are fast with SmartRandomAgent).

## CLI Entry Point Implementation (Task 10)

### Explicit Seeds Behavior

- When `--seeds` is provided, the number of games is automatically inferred from the number of seeds (ignores `--num-games`).
- This follows the spec example: `yarn sim --seeds 111,222,333` runs exactly 3 games.
- The seeds are validated during parsing, not in the Simulator (fail-fast for better UX).

### SmartRandomAgent Side-Effect Import

- The CLI imports SmartRandomAgent to ensure it's registered in AgentRegistry before any agent validation or simulation runs.
- This is the same pattern used by Simulator.ts itself.

### Output Format Decisions

- Per-game scores are displayed in descending order (winner's score first) separated by dashes (e.g., `42-38` or `25-17-9-5-4` for 5 players).
- Win distribution in summary is sorted alphabetically by player ID for consistent output across runs.
- Coverage report uses the HandlerCoverageTracker's `generateReport()` method directly - no need to duplicate the formatting logic.

### CLI Option Patterns

- Used Commander.js (already a project dependency) for argument parsing.
- Per-player agent options (`--player1` through `--player5`) default to `SmartRandomAgent` if not specified.
- Invalid inputs (bad player count, unknown agent types, invalid seeds) produce clear error messages and exit with code 1.

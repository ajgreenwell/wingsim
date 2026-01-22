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

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

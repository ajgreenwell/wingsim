# Monte Carlo Simulator Learnings

## AgentRegistry Implementation (Task 1)

- Added `clear()` method (not in spec) to support test isolation. The singleton pattern means tests would otherwise pollute each other's state.
- Added `listNames()` convenience method for validation error messages.
- Agent names are case-sensitive. This is intentional to avoid CLI ambiguity.
- The test file uses a `MockAgent` class that implements `PlayerAgent` with stub methods. Future tasks implementing `SmartRandomAgent` can reference this pattern.

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

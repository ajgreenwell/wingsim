# Execution Loop Architecture: Generator-Based Power Resolution

## Summary

Redesign the core execution loop using **async generators** for power handlers. This enables the coroutine-like behavior needed when powers must pause for agent input, then resume with the choice to generate effects.

---

## Why Generators? (The Core Problem)

### The Challenge

A power handler often needs to:
1. Check some condition
2. **Ask the agent a question** (e.g., "Do you want to activate this power?")
3. **Wait for the answer**
4. Based on the answer, do something (generate effects)

With a normal function, you'd write:
```typescript
function handlePower(ctx): Effect[] {
  // Step 1: Ask agent
  const choice = agent.chooseOption(prompt);  // This returns a Promise!

  // Step 2: Can't continue until we have the answer
  if (choice.activate) {
    return [gainFoodEffect];
  }
}
```

The problem: `agent.chooseOption()` is **async** (it might wait for user input, network, etc.). Normal functions can't pause mid-execution and resume later.

### Solution 1: Nested Callbacks (Ugly)

```typescript
function handlePower(ctx, onComplete: (effects: Effect[]) => void): void {
  agent.chooseOption(prompt).then(choice => {
    if (choice.activate) {
      onComplete([gainFoodEffect]);
    } else {
      onComplete([]);
    }
  });
}
```

This works but gets deeply nested when a power requires multiple prompts. Hard to read and maintain.

### Solution 2: Return Continuation Objects (Complex)

```typescript
function handlePower(ctx): PowerStep {
  return {
    type: "NEEDS_INPUT",
    prompt: activatePrompt,
    continue: (choice) => {
      if (choice.activate) {
        return { type: "DONE", effects: [gainFoodEffect] };
      }
      return { type: "DONE", effects: [] };
    }
  };
}
```

Explicit but verbose. Each pause point requires a nested `continue` function.

### Solution 3: Async Generators (Natural)

Generators are functions that can **pause** (yield a value) and **resume** (receive a value back):

```typescript
async function* handlePower(ctx) {
  // Yield a prompt and pause. When resumed, `choice` contains the agent's answer.
  const choice = yield { type: "PROMPT", prompt: activatePrompt };

  // Now we have the answer, continue normally
  if (choice.activate) {
    yield { type: "GAIN_FOOD", playerId: ctx.ownerId, food: { SEED: 1 } };
  }
}
```

**How the executor drives it**:
```typescript
const gen = handlePower(ctx);

// Step 1: Start the generator, it runs until first yield
let result = await gen.next();        // result.value = { type: "PROMPT", ... }

// Step 2: Get agent's choice
const choice = await agent.chooseOption(result.value.prompt);

// Step 3: Resume generator with the choice
result = await gen.next(choice);      // result.value = { type: "GAIN_FOOD", ... }

// Step 4: Continue until done
result = await gen.next();            // result.done = true
```

### Why Generators Are Perfect Here

1. **Linear code flow**: Write the handler as if it's synchronous, even though it pauses
2. **Multiple pauses**: A power requiring 3 prompts is just 3 `yield` statements, not 3 levels of nesting
3. **Type-safe**: TypeScript knows what types are yielded and received
4. **Testable**: Drive the generator step-by-step with mock choices
5. **Composable**: Generators can delegate to other generators with `yield*`

### Example: Power with Multiple Choices

```typescript
async function* tuckCardThenDraw(ctx) {
  // First prompt: "Do you want to activate?"
  const activateChoice = yield { type: "PROMPT", prompt: activatePrompt };
  if (!activateChoice.activate) {
    yield { type: "ACTIVATE_POWER", activated: false, skipReason: "AGENT_DECLINED" };
    return;  // Exit early
  }

  // Second prompt: "Which card to tuck?"
  const tuckChoice = yield { type: "PROMPT", prompt: selectCardPrompt };
  yield { type: "TUCK_CARDS", cards: [tuckChoice.card] };

  // Third prompt: "Draw from deck or tray?"
  const drawChoice = yield { type: "PROMPT", prompt: drawCardPrompt };
  yield { type: "DRAW_CARDS", fromDeck: drawChoice.fromDeck, fromTray: drawChoice.fromTray };
}
```

Without generators, this would require 3 levels of nested callbacks or continuation objects. With generators, it reads top-to-bottom like normal code.

---

## The Executor: Who Drives the Generator?

### Ownership

**`PowerProcessor.executeSinglePower()`** owns the executor loop. It:
1. Creates the generator from the handler function
2. Loops: calls `gen.next()` repeatedly until done
3. When a `PromptRequest` is yielded, awaits the agent's choice and resumes with it
4. When an `Effect` is yielded, collects it
5. Returns all collected effects when the generator completes

### When Are Effects Applied?

**Design Choice**: Effects are **collected during execution** and **applied after the generator completes**.

This means:
- The generator runs to completion, yielding prompts and effects
- PowerProcessor returns a list of all effects
- GameEngine applies them all in order

### Step-by-Step: tuckCardThenDraw Example

```
PowerProcessor.executeSinglePower(bird)
  |
  +-- gen = tuckCardThenDraw(ctx)
  |
  +-- result = gen.next()                         -> yields PROMPT(activatePrompt)
  |    +-- agent.chooseOption(activatePrompt)     -> returns { activate: true }
  |
  +-- result = gen.next({ activate: true })       -> yields PROMPT(selectCardPrompt)
  |    +-- agent.chooseOption(selectCardPrompt)   -> returns { card: "robin" }
  |
  +-- result = gen.next({ card: "robin" })        -> yields TUCK_CARDS effect
  |    +-- effects.push(TUCK_CARDS)               -> COLLECTED, not applied yet!
  |
  +-- result = gen.next()                         -> yields PROMPT(drawCardPrompt)
  |    +-- agent.chooseOption(drawCardPrompt)     -> returns { fromDeck: 1 }
  |
  +-- result = gen.next({ fromDeck: 1 })          -> yields DRAW_CARDS effect
  |    +-- effects.push(DRAW_CARDS)               -> COLLECTED, not applied yet!
  |
  +-- result = gen.next()                         -> done: true
       +-- return { effects: [TUCK_CARDS, DRAW_CARDS] }

GameEngine receives effects, applies them in order:
  1. applyEffect(TUCK_CARDS)
  2. applyEffect(DRAW_CARDS)
```

### Why Collect Then Apply (Not Apply Immediately)?

**Option A: Apply Immediately** - Each effect applied as soon as yielded
- Pro: Agent prompts would see updated state (e.g., card removed from hand)
- Con: PowerProcessor needs access to GameEngine.applyEffect() (tight coupling)

**Option B: Collect Then Apply** - Effects batched and applied after generator completes
- Pro: PowerProcessor is decoupled from GameEngine
- Pro: Easier to test handlers in isolation
- Con: Intermediate prompts see pre-effect state

**Recommendation: Collect Then Apply** for simplicity. Most powers don't have prompts that depend on intermediate state. For the rare cases that do, the handler can update `ctx.getState()` to return a mutable reference that reflects changes as effects are collected.

### Alternative: Immediate Application (If Needed)

If we find powers that need intermediate state, GameEngine could own the executor:

```typescript
// GameEngine.executePowerWithImmediateApplication(bird)
const gen = handler(ctx, params);
let result = await gen.next();

while (!result.done) {
  if (isPromptRequest(result.value)) {
    const choice = await agent.chooseOption(result.value.prompt);
    result = await gen.next(choice);
  } else {
    this.applyEffect(result.value);  // <- Apply immediately
    result = await gen.next();
  }
}
```

For now, **start with Collect Then Apply** (simpler). Refactor to immediate application only if we find powers that require it.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State access | Resolution-time (current) | Handlers see state after prior effects applied |
| Declined powers | Emit `ActivatePowerEffect` with `activated=false` | Complete audit trail |
| Pink power timing | Immediately inline | Must resolve before next brown power |
| Mutation pathway | All through `applyEffect()` | Single source of truth |

---

## Architecture Overview

```
TurnActionChoice
    |
    v
GameEngine.processTurnAction()
    |
    v
+----------------------------------------------------------+
| 1. TurnActionProcessor.execute() -> Effects + Events     |
| 2. Apply base effects                                    |
| 3. Enqueue initial events                                |
| 4. processEventQueue() until empty                       |
+----------------------------------------------------------+
    |
    v
GameEngine.processEventQueue()
    |
    v
+----------------------------------------------------------+
| While queue not empty:                                   |
|   event = dequeue()                                      |
|   if (event.type === "HABITAT_ACTIVATED"):               |
|     -> GameEngine.processBrownPowerChain(event) --------+|
|   else:                                                  ||
|     -> PowerProcessor.processEvent() -> effects         ||
|     -> Apply effects, derive events, enqueue            ||
+----------------------------------------------------------+|
                                                           |
+----------------------------------------------------------+
|
v
GameEngine.processBrownPowerChain(event)
+----------------------------------------------------------+
| FOR EACH bird in event.birdInstanceIds (right-to-left):  |
|   1. PowerProcessor.executeSinglePower(bird)             |
|   2. Apply effects from this one bird's power            |
|   3. Derive events from effects (e.g., predator->pink)   |
|   4. Enqueue derived events                              |
|   5. processEventQueue() <- RECURSIVE, handles pink      |
|   6. Continue to next bird only when queue empty         |
+----------------------------------------------------------+
```

**Key Insight**: GameEngine owns the brown power loop, not PowerProcessor. This ensures derived events (and their pink power triggers) resolve **between** brown powers, not after all of them.

---

## New Types to Add

### `src/types/power.ts`

```typescript
/** What a power handler can yield */
export type PowerYield = Effect | PromptRequest;

export interface PromptRequest {
  type: "PROMPT";
  prompt: OptionPrompt;
}

/** Context passed to handlers - read-only state access */
export interface PowerContext {
  readonly ownerId: PlayerId;
  readonly birdInstanceId: BirdInstanceId;
  readonly birdCardId: string;
  readonly habitat: Habitat;
  readonly activePlayerId: PlayerId;
  readonly round: number;

  getState(): Readonly<GameState>;
  getRegistry(): DataRegistry;
  generatePromptId(): string;
  buildOwnerView(): PlayerView;
  buildPromptContext(): PromptContext;
}

/** Handler signature */
export type PowerHandler = (
  ctx: PowerContext,
  params: Record<string, unknown>
) => AsyncGenerator<PowerYield, void, OptionChoice | undefined>;
```

---

## Implementation Steps (Incremental)

### Phase 1: Core Types & Infrastructure

1. **Create `src/types/power.ts`**
   - Define `PowerYield`, `PromptRequest`, `PowerContext`, `PowerHandler` types
   - Add `isPromptRequest()` type guard
   - Define `PowerActivationResult` interface

2. **Add event queue to `GameEngine`**
   - Private `eventQueue: Event[]` array
   - `enqueueEvent(event)` method
   - `processEventQueue()` async method (processes until empty)

3. **Implement `applyEffect()` in `GameEngine`**
   - Single switch statement handling all effect types
   - Notify observers on each application
   - Start with core effects: GAIN_FOOD, LAY_EGGS, DRAW_CARDS, ACTIVATE_POWER

### Phase 2: PowerProcessor Redesign

4. **Implement `PowerProcessor.executeSinglePower()`**
   - Takes one bird + context, returns effects for that single power
   - Drives the generator: `gen.next()` in loop
   - On `PromptRequest`: await agent choice, `gen.next(choice)`
   - On `Effect`: collect it
   - Return `PowerActivationResult` with all effects

5. **Implement `PowerProcessor.findTriggeredPinkPowers()`**
   - Given an event (e.g., `PredatorPowerResolvedEvent`), find all pink powers on OTHER players' boards that trigger
   - Return list of birds + handlers in clockwise order
   - GameEngine calls this, then calls `executeSinglePower()` for each

6. **Create handler registry**
   - `Map<string, PowerHandler>` for handler lookup
   - `registerAllHandlers()` method (initially empty)

**Note**: PowerProcessor does NOT loop over brown powers. That loop lives in `GameEngine.processBrownPowerChain()` so the engine can interleave pink power resolution between each brown power.

### Phase 3: TurnActionProcessor Refactor

7. **Change return type to `{ effects: Effect[], events: Event[] }`**
   - Remove direct state mutations
   - Return effects for GameEngine to apply
   - Return events to trigger power processing

8. **Update GameEngine.runTurn()**
   - Call TurnActionProcessor.execute()
   - Apply returned effects
   - Enqueue returned events
   - Call processEventQueue()

### Phase 4: First Handler (Validation)

9. **Implement one simple brown power handler**
   - `gainFoodFromSupply` - simple, no conditions
   - Validates the generator execution flow end-to-end
   - Add corresponding test

### Future Phases (Not in initial scope)

10. **Event derivation for pink triggers** - implement when adding predator handlers
11. **Pink power handlers** - implement when ready for multi-player interactions
12. **Complex handlers** - predators, repeat powers, etc.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/power.ts` | **New file** - PowerYield, PowerContext, PowerHandler types |
| `src/engine/GameEngine.ts` | Add event queue, processEventQueue(), applyEffect() |
| `src/engine/PowerProcessor.ts` | Full rewrite with generator execution |
| `src/engine/TurnActionProcessor.ts` | Return Effects/Events instead of mutating |
| `src/types/effects.ts` | Minor: add metadata field to RevealCardsEffect |

---

## Example: Brown Power Flow with Inline Pink Resolution

```
Player A activates FOREST habitat (has Predator in slot 4, other bird in slot 3)
Player B has Turkey Vulture (pink: triggers on predator success)
    |
    v
TurnActionProcessor.executeGainFood()
  -> effects: [GainFoodEffect]
  -> events: [HabitatActivatedEvent{birds:[slot4, slot3]}, FoodGainedEvent]
    |
    v
GameEngine applies GainFoodEffect, enqueues events
    |
    v
processEventQueue() dequeues HabitatActivatedEvent
    |
    v
GameEngine.processBrownPowerChain(event)  <- Engine controls this loop
    |
    +--- Bird slot 4 (Predator):
    |      PowerProcessor.executeSinglePower(predator)
    |        -> yields ActivatePowerEffect, RevealCardsEffect (success)
    |      GameEngine applies effects
    |      GameEngine derives PredatorPowerResolvedEvent{success:true}
    |      GameEngine enqueues it
    |      GameEngine.processEventQueue()  <- RECURSIVE CALL
    |        |
    |        +--- Dequeues PredatorPowerResolvedEvent
    |               PowerProcessor.findTriggeredPinkPowers() -> [TurkeyVulture]
    |               PowerProcessor.executeSinglePower(turkeyVulture)
    |                 -> yields GainFoodEffect (Player B takes food)
    |               GameEngine applies effect
    |               Queue empty, return from recursive call
    |
    |      <- Queue empty, continue to next bird
    |
    +--- Bird slot 3:
           PowerProcessor.executeSinglePower(bird3)
             -> This bird sees birdfeeder WITHOUT the food Turkey Vulture took
           ...
```

**Key**: The recursive `processEventQueue()` call handles pink powers BEFORE the loop continues to the next brown power.

---

## Testing Strategy

**Unit tests for handlers:**
```typescript
it("should emit GAIN_FOOD when activated", async () => {
  const gen = gainFoodFromSupply(mockCtx, { foodType: "SEED", count: 1 });
  const results = await driveGenerator(gen, [
    { kind: "activatePower", activate: true }
  ]);
  expect(results.effects).toContainEqual({ type: "GAIN_FOOD", ... });
});
```

**Integration tests for event ordering:**
```typescript
it("should resolve pink powers before next brown power", async () => {
  // Player A: predator + another brown bird
  // Player B: Turkey Vulture (pink)
  // Verify Turkey Vulture effect appears before next brown power
});
```

---

## Benefits

- **Maintainable**: Each handler is a self-contained generator function
- **Testable**: Drive generators with mock choices in isolation
- **Extensible**: Adding powers = adding handler functions + registry entry
- **Traceable**: Effect log is complete history; observers see all events
- **Correct**: Synchronous queue processing ensures pink power timing

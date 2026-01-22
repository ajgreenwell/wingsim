# Wingspan Simulator Specification

> Goal: A headless, CLI-runnable Node.js simulator with a deterministic rules engine, pluggable player agents (including LLM-backed agents), hidden information (hands), and support for running many games in parallel. Initial target: 2 players, but the design should scale to 3–5 players.

---

## 1) Non-negotiable requirements

### Information visibility

- Each player agent can see:

  - Their own board + hand + bonus card
  - Bird tray (3 face-up cards)
  - Birdfeeder state (dice)
  - Opponent(s)’ boards

- Each player agent cannot see:
  - Opponent(s)’ hands (and any other private selections)

**Design decision:** The engine never hands agents the raw `GameState`. Instead, it constructs a per-player `PlayerView` via a view builder.

### Parallel simulation

- Must support running many games concurrently with isolated state and independent agents.

**Design decision:** No shared mutable singletons. Each match has its own engine + state + RNG + agent instances (or per-match agent factory). Data definitions can be shared _only if immutable_.

### Full base-game dataset

- Load full base-game dataset at startup from JSON (birds, bonus cards, goal tiles, etc.).

**Design decision:** A `DataRegistry` loads immutable definitions from JSON. Runtime state references definitions by IDs.

---

## 2) High-level architecture

### Separation of concerns

1. **Authoritative engine:** owns state, applies base-game rules, and is the only component that mutates `GameState`.

1. **Reaction processor:** consumes internal events, resolves bird powers into typed effects, and prompts agents when choices are required.

1. **Agents (pluggable):** propose decisions; never mutate state directly.

1. **Data registry (immutable):** card/goal/bonus definitions.

1. **RNG (deterministic):** seeded per match for reproducibility.

1. **View builder:** constructs per-player views to enforce information hiding.

### Key components

- `GameEngine`

  - Owns the authoritative `GameState`
  - Implements base-game rules (action validation + application)
  - Maintains a FIFO internal event queue
  - Delegates power resolution to `PowerProcessor`
  - Exposes `applyEffects(...)` as the **only** mutation pathway for power outcomes
  - Calls agent interfaces when decisions are needed

- `PowerProcessor`

  - Receives internal events (e.g., `BirdPlayed`, `HabitatActivated`)
  - Scans relevant birds (brown chain, pink triggers) and resolves eligible powers
  - Looks up and runs handlers by `powerHandlerId` via an internal `handlersById` registry
  - Returns typed `Effect`s (does not mutate `GameState` directly)

- `ViewBuilder`

  - `buildPlayerView(gameState, playerId) -> PlayerView`
  - Enforces hidden information by construction

- `DataRegistry`

  - Loads JSON datasets into in-memory, immutable objects

- `Rng`

  - Seeded PRNG wrapper used _for all randomness_

- `MatchOrchestrator` (match lifecycle + parallel execution)
  - Creates per-match `GameEngine` + per-match agent instances + per-match `Rng(seed)`
  - Runs a complete match to completion (setup → 4 rounds → scoring)
  - Owns _only_ lifecycle concerns: setup/teardown, seed selection, and running many matches concurrently
  - Does **not** implement rules and does **not** mediate individual decisions; `GameEngine` calls agents directly

---

## 3) Core state model

- `GameState` is a single, serializable object.

- `PlayerState` is a sub-object within `GameState`.

- `BirdInstance` represents a bird on a player’s board, with its own state (cached food, tucked cards, eggs).

```typescript
// From src/types/core.ts
interface GameState {
  players: PlayerState[];
  activePlayerIndex: number;
  birdfeeder: Birdfeeder;
  birdCardSupply: BirdCardSupply;
  bonusCardSupply: BonusCardSupply;
  roundGoals: RoundGoalId[];
  round: number;
  turn: number;
  // ... and other global state
}

interface PlayerState {
  id: PlayerId;
  board: Record<Habitat, Array<BirdInstance | null>>;
  birdCards: BirdCardId[];
  bonusCards: BonusCardId[];
  food: Record<FoodType, number>;
  actionCubes: number;
  // ... and other player-specific state
}

interface BirdInstance {
  id: BirdInstanceId;
  cardId: BirdCardId;
  cachedFood: FoodByType;
  tuckedCards: BirdCardId[];
  eggs: number;
}
```

---

## 4) IDs and why we distinguish them

- `BirdCardId` (e.g., `"barn_owl"`): a static ID from the JSON data registry, identifying a bird species.

- `BirdInstanceId` (e.g., `"alice_barn_owl"`): a runtime ID for a specific bird played on a board. This is necessary because multiple players can play the same bird species.

---

## 5) Agent API and information hiding

- Agents make decisions based on a restricted `PlayerView`.

- The `GameEngine` is responsible for calling the agent’s methods.

```typescript
// From src/agents/PlayerAgent.ts
interface PlayerAgent {
  chooseStartingHand(): Promise<StartingHandDecision>;
  chooseAction(view: PlayerView, options: Action[]): Promise<Action>;
  chooseOption(
    view: PlayerView,
    prompt: DecisionPrompt
  ): Promise<DecisionChoice>;
}

interface PlayerView {
  // All public game state + this agent's private state
  // Does NOT contain opponent hands, deck order, etc.
}
```

---

## 6) Turn structure and multi-player readiness (2–5 players)

- The `GameEngine` manages the turn order, advancing `activePlayerIndex`.

- The number of action cubes per player per round is fixed (8, 7, 6, 5).

- The engine decrements the active player’s action cubes after each turn.

---

## 7) Event-driven powers system (maintainability hot spot)

**Design decision:** Bird powers are not hardcoded into the engine. Instead, the engine emits semantic events, and a `PowerProcessor` resolves powers that react to those events.

- The engine runs turns as: **action → base rule effects → internal events → power resolution → typed effects → more events**.

- `GameEngine` owns a FIFO **event queue**.

- `GameEngine` pops events and calls `PowerProcessor.resolve(event, ctx)`.

- `PowerProcessor` returns typed `Effect`s.

- `GameEngine.applyEffects(...)` applies effects deterministically.

### Synchronous Event Processing

To ensure game state consistency, especially with shared resources like the birdfeeder, the event queue is processed **synchronously**. An action and all of its resulting reactions (including pink powers) must fully resolve before the next action or game phase begins.

**Example: The Turkey Vulture Pink Power**

1. **Action**: Player A activates their Forest habitat, which contains a Barn Owl (a predator).

1. **Power Activation**: The Barn Owl's brown power activates. It succeeds.

1. **Effect & Event**: The engine applies a `RevealCardsEffect` and then generates a `PredatorPowerResolvedEvent` (with `success: true`). This event is added to the queue.

1. **Event Processing**: The engine immediately processes the queue. It dequeues `PredatorPowerResolvedEvent`.

1. **Pink Power Trigger**: The `PowerProcessor` sees this event and finds that Player B's Turkey Vulture triggers on it ("When another player's predator succeeds...").

1. **Agent Prompt**: The engine prompts Player B's agent, who chooses to activate the power and take a `[fish]` from the birdfeeder.

1. **New Effect**: The `PowerProcessor` returns a `GainFoodEffect` for Player B.

1. **State Mutation**: The engine applies the `GainFoodEffect`, removing the `[fish]` from the birdfeeder and adding it to Player B's supply.

1. **Queue Empty**: The event queue is now empty. The engine's synchronous processing of the Barn Owl's activation is complete.

1. **Next Action**: The engine proceeds to activate the next bird in Player A's Forest row. That bird's power now sees the birdfeeder _without_ the `[fish]` that Player B took.

This synchronous flow is critical for maintaining a consistent and deterministic game state.

---

## 8) Bird power modeling strategy (JSON + handler registry)

**Design decision:** JSON stores a **PowerSpec**, while code stores the **handler implementation**.

- Each bird’s power is represented as a structured `PowerSpec` in the JSON data:

  - `trigger`: `WHEN_PLAYED | WHEN_ACTIVATED | ONCE_BETWEEN_TURNS`
  - `powerHandlerId`: string key for the code implementation
  - `params`: JSON object (handler-specific)

- At runtime, the `PowerProcessor` contains a `powerHandlersById` map that links the `powerHandlerId` to a function.

- Handlers **do not mutate state directly**; they return typed `Effect`s.

---

## 9) Effect Taxonomy

Effects are the single source of truth for all game state mutations. They are generated by the `PowerProcessor` or by the `GameEngine` for base actions. The `GameEngine.applyEffects(...)` method is the only pathway through which `GameState` can be changed.

- **Source of Truth**: The log of applied effects represents the complete, replayable history of a game.

- **Granularity**: Effects are mechanical and granular (e.g., `GainFoodEffect`, `DiscardCardsEffect`).

Refer to `src/types/effects.ts` for the complete and authoritative taxonomy of all `Effect` types.

---

## 10) Event Taxonomy

Events are semantic notifications emitted by the `GameEngine` after effects are applied. They are used to trigger bird powers and to provide high-level information to observers.

- **Derived from Effects**: Events are generated based on the outcome of one or more applied effects.

- **Purpose-Driven**: Events are only created for three reasons: lifecycle moments, player actions that trigger powers, and effects that trigger pink powers.

- **No Chaining**: Effects resulting from pink power activations do **not** generate their own events. This prevents complex, cascading reactions.

### Event Categories

1. **Lifecycle Events**: `GameStartedEvent`, `RoundStartedEvent`, `TurnStartedEvent`, etc.

1. **Action Events**: `HabitatActivatedEvent` (triggers brown powers), `BirdPlayedEvent` (triggers white and pink powers).

1. **Pink Power Trigger Events**: `FoodGainedFromHabitatActivationEvent`, `EggsLaidFromHabitatActivationEvent`, `PredatorPowerResolvedEvent`.

Refer to `src/types/events.ts` for the complete and authoritative taxonomy of all `Event` types.

---

## 11) Observability and Rendering (GameObserver Pattern)

**Design decision:** Use the **Observer pattern** to provide external systems (renderers, loggers) with visibility into the engine's execution while maintaining encapsulation.

### The `GameObserver` Interface

The `GameEngine` allows observers to register themselves and receive notifications at key points in the execution loop.

```typescript
// From src/engine/GameObserver.ts
interface GameObserver {
  // Lifecycle
  onGameStarted?(event: GameStartedEvent): void;
  onRoundStarted?(event: RoundStartedEvent): void;
  // ... and other lifecycle hooks

  // Action & Event Processing
  onActionStart?(action: Action, playerId: PlayerId): void;
  onEventProcessing?(event: Event): void;
  onEffectApplied?(effect: Effect): void;

  // Agent Interaction
  onAgentPromptIssued?(playerId: PlayerId, prompt: DecisionPrompt): void;
}
```

### The Merged Observer/Controller Pattern (Recommended)

For most UI implementations, the class responsible for rendering and I/O (`Controller`) should directly implement the `GameObserver` interface. This avoids unnecessary abstraction and consolidates all UI-related logic into a single class.

### PlayerAgents as Observers

To provide richer context for AI decision-making, a `PlayerAgent` may **optionally** implement the `GameObserver` interface. This allows an agent (e.g., an LLM agent) to listen to the stream of events and build a narrative of what has happened between its turns, rather than relying solely on state diffing.

```typescript
// An LLM agent can be both an agent and an observer
class LLMPlayerAgent implements PlayerAgent, GameObserver {
  private eventLog: Event[] = [];

  // GameObserver implementation
  onEventProcessing(event: Event): void {
    this.eventLog.push(event);
  }

  // PlayerAgent implementation
  async chooseAction(view: PlayerView, options: Action[]): Promise<Action> {
    const narrative = this.buildNarrativeFromEvents(this.eventLog);
    // ... use narrative to inform LLM prompt
    this.eventLog = []; // Clear log for next turn
    // ... return decision
  }
}
```

---

## 12) Determinism & reproducibility

**Design decision:** The simulation must be deterministic given the initial seed, the dataset version, and the agent’s returned choices. This is achieved through:

- No randomness outside the engine’s `Rng` instance.

- No wall-clock dependence.

- A complete log of applied effects and agent choices for perfect replays.

---

## 13) CLI and repo structure (conceptual)

- `src/`
  - `main.ts` — entry point, parses args, runs matches
    - `engine/`
      - `GameEngine.ts` — rules + event queue orchestration + `applyEffects(...)`
      - `PowerProcessor.ts` — resolves powers from events
      - `ViewBuilder.ts`
      - `GameObserver.ts`
    - `agents/`
      - `PlayerAgent.ts` (interface)
      - `RandomAgent.ts`
      - `LLMAgent.ts`
    - `data/`
      - `DataRegistry.ts`
      - `base_game/` (bird, bonus, goal definitions)
    - `types/`
      - `core.ts`
      - `effects.ts`
      - `events.ts`
      - `prompts.ts`
    - `util/`
      - `Rng.ts`

---

## 14) Decision prompt taxonomy (base game)

When the `PowerProcessor` or `GameEngine` requires a player decision, it creates a typed `DecisionPrompt` object and passes it to the active agent.

Refer to `src/types/prompts.ts` for the complete taxonomy.

---

## 15) Agent Error Handling and Timeouts

To ensure the simulation is robust against non-responsive or misbehaving agents, a centralized error handling and retry mechanism is required. This is handled by the **AgentProxy pattern**.

### The `AgentProxy` Pattern

**Design decision:** At the start of a match, the `GameEngine` will wrap each raw `PlayerAgent` instance in an `AgentProxy`. This proxy is transparent to the rest of the system and is responsible for all interaction with the agent.

- **Centralized Logic**: The `AgentProxy` contains all logic for timeouts, retries, and choice validation.
- **Transparent Wrapper**: The `GameEngine` and `PowerProcessor` interact with the `AgentProxy` as if it were the original `PlayerAgent`, with no knowledge of the underlying retry mechanism.

### Retry and Timeout Logic

1.  **Three-Strike Rule**: When prompting an agent for a decision, the `AgentProxy` will attempt to get a valid response up to **three times**.
2.  **Failure Conditions**: A failure is defined as any of the following:
    - The agent's response does not arrive within a configurable timeout (e.g., 30 seconds).
    - The agent's code throws an unhandled exception.
    - The agent returns a choice that is not among the valid options provided in the prompt.
3.  **Forfeit**: If an agent fails all three attempts, the `AgentProxy` will notify the `GameEngine` that the player has forfeited the match.

### Forfeit Handling

1.  **Player State**: When a player forfeits, the `GameEngine` will mark their `PlayerState` as `forfeited: true`.
2.  **Game Continuation**: The game will continue under the following conditions:
    - If **two or more** other players remain active in the game, the match proceeds. The forfeited player is skipped in the turn order.
    - If only **one** other player remains, the match immediately ends, and the remaining player is declared the winner.
      the winner.

---

## 16) RNG and Seeding for Determinism

To ensure that every game is deterministic and reproducible, all sources of randomness are controlled by a single, seeded pseudo-random number generator (PRNG).

### The `Rng` Utility

- **Single Source of Truth**: A single `Rng` instance is created for each match and is the only source of randomness used by the `GameEngine`.
- **Seeded**: The `Rng` is initialized with a single integer seed at the start of a match.
- **No External Randomness**: The codebase must not use `Math.random()` or any other non-deterministic source.

### Seeding Strategy

1.  **Seed Generation**: The `MatchOrchestrator` is responsible for providing a seed for each match. If a seed is provided by the user (e.g., via CLI), it is used. Otherwise, a seed is auto-generated.
2.  **Seed Logging**: The seed for every match must be logged so that the game can be reproduced later.
3.  **Seed Scope**: Each match has its own `Rng` instance. An `Rng` instance is never shared across matches.

### Usage in the `GameEngine`

The `GameEngine` receives the `Rng` instance during construction and uses it for all random operations, including:

- Shuffling the bird and bonus card decks at the start of the game.
- Selecting the initial round goals.
- Rolling the dice for the birdfeeder.
- Drawing cards from the deck during gameplay.

### Reproducibility Guarantee

Given the same:

1.  **Seed**
2.  **Dataset Version** (e.g., base game v1.0)
3.  **Sequence of Agent Decisions**

The simulation is guaranteed to produce the exact same outcome every time. This is critical for debugging, testing, and replaying interesting matches.

# Wingspan Simulator: Implementation Plan

This document outlines a step-by-step plan to implement the Wingspan simulator based on the provided specification (`WingsimSpec.md`). The project is broken down into logical, testable phases and tasks. Each task includes a detailed prompt that can be provided to a coding agent.

## Core Principles

- **Incremental Development**: Each task builds on the previous one, creating a functional and testable piece of the system.
- **Test-Driven**: Each feature should be accompanied by unit and integration tests.
- **Spec-Driven**: All implementation must adhere strictly to `WingsimSpec.md`.

---

## Phase 1: Core Data Structures and Utilities

**Objective**: Establish the foundational data structures and utilities that the rest of the application will depend on. This phase is not runnable but is critical for type safety and data access.

### Task 1.1: Implement Data Registry

**Goal**: Create a utility to load and access the immutable game data.

**Prompt**:

> Create a `DataRegistry` class in `src/data/DataRegistry.ts`. This class should:
>
> 1.  Load all JSON files from `src/data/base_game/` in its constructor.
> 2.  Provide public getter methods to access game data (e.g., `getBirdById(id: BirdCardId)`, `getAllBonusCardIds()`).
> 3.  Ensure all data is treated as immutable (e.g., by using `Object.freeze`).

### Task 1.2: Implement RNG Utility

**Goal**: Create the seeded random number generator.

**Prompt**:

> Create an `Rng` class in `src/util/Rng.ts` as specified in Section 16 of `WingsimSpec.md`.
>
> 1.  It must be initialized with a number seed.
> 2.  It must provide `next()`, `nextInt(min, max)`, `shuffle(array)`, and `choice(array)` methods.
> 3.  Do not use `Math.random()`. Implement a simple PRNG like Mulberry32 or use the `seedrandom` library.
> 4.  Write unit tests to confirm that given the same seed, the `Rng` instance produces the same sequence of numbers and shuffles an array into the same order.

---

## Phase 2: Game Engine and Basic Actions

**Objective**: Create a minimal, runnable `GameEngine` that can set up a game and execute the four basic player actions without any bird powers.

### Task 2.1: Game Engine Skeleton and Setup

**Goal**: Implement the `GameEngine` class and the game setup logic.

**Prompt**:

> Create a `GameEngine` class in `src/engine/GameEngine.ts`. It should:
>
> 1.  Accept a configuration object in its constructor containing `agents`, `seed`, and a `DataRegistry` instance.
> 2.  Initialize its own `Rng` instance from the seed.
> 3.  Have a `setupGame()` method that creates the initial `GameState` by:
>     - Shuffling the bird and bonus decks using the `Rng` instance.
>     - Selecting 4 random round goals.
>     - Dealing initial birds and food to each player.
> 4.  Write integration tests to verify that two engines with the same seed produce the exact same initial `GameState`.

### Task 2.2: Implement Basic Actions

**Goal**: Implement the four basic player actions (`PlayBird`, `GainFood`, `LayEggs`, `DrawCards`) without any bird power activations.

**Prompt**:

> In the `GameEngine` class, implement the logic for the four basic player actions. For each action:
>
> 1.  Create a method that validates the action (e.g., `canPlayBird(action, playerId)`).
> 2.  Create a method that applies the action's effects to the `GameState` (e.g., `applyPlayBird(action)`).
> 3.  For now, ignore all bird powers. Focus only on the base effect of the action (e.g., gaining 1 food from the forest, laying 2 eggs in the grassland).
> 4.  Write unit tests for each action to verify that the game state is mutated correctly.

---

## Phase 3: The Power System

**Objective**: Implement the core architecture for handling bird powers, including the `PowerProcessor` and the effect/event loop.

### Task 3.1: Power Processor and Brown Powers

**Goal**: Implement the `PowerProcessor` and the logic for activating a simple brown power chain.

**Prompt**:

> 1.  Create a `PowerProcessor` class in `src/engine/PowerProcessor.ts`. It should have a `handlersById` map to store power implementations.
> 2.  Implement a simple handler for a basic brown power (e.g., "Gain 1 [seed]").
> 3.  In `GameEngine`, update the `GainFood` action to:
>     - Create a `HabitatActivatedEvent`.
>     - Pass this event to the `PowerProcessor`.
>     - Receive `Effect`s back from the processor.
>     - Apply these effects to the `GameState`.
> 4.  Write an integration test where activating the Forest triggers a simple brown power and correctly modifies the game state.

### Task 3.2: "When Played" White Powers

**Goal**: Implement the logic for activating "when played" white powers.

**Prompt**:

> 1.  Implement a handler for a simple white power (e.g., "When played, gain 1 [fish] from the birdfeeder").
> 2.  In `GameEngine`, update the `PlayBird` action to:
>     - Generate a `BirdPlayedEvent` _after_ the `PlayBirdEffect` has been applied.
>     - Pass this event to the `PowerProcessor`.
>     - Apply any resulting effects.
> 3.  Write an integration test to verify that playing a bird with a white power correctly triggers its effect.

---

## Phase 4: Full Game Loop and Player Interaction

**Objective**: Implement the full round and turn structure, the observer pattern for rendering, and the agent error handling.

### Task 4.1: Round and Turn Structure

**Goal**: Implement the logic for managing rounds, turns, and action cubes.

**Prompt**:

> In the `GameEngine`, implement the main game loop:
>
> 1.  A `runGame()` method that orchestrates the 4 rounds.
> 2.  A `runRound()` method that continues until all players have used their action cubes for that round.
> 3.  A `runTurn()` method that prompts the active player for an action, applies it, and advances the turn order.
> 4.  Implement end-of-round cleanup (resetting action cubes, etc.).

### Task 4.2: GameObserver and AgentProxy

**Goal**: Implement the `GameObserver` interface and the `AgentProxy` for error handling.

**Prompt**:

> 1.  Create the `GameObserver` interface in `src/engine/GameObserver.ts` as defined in the spec.
> 2.  In `GameEngine`, add the `addObserver()` method and insert the notification calls (`onEffectApplied`, `onEventProcessing`, etc.) at the appropriate points in the execution loop.
> 3.  Create the `AgentProxy` class in `src/agents/AgentProxy.ts` as defined in the spec, implementing the 3-strike retry and forfeit logic.
> 4.  Update `GameEngine` to wrap all agents in an `AgentProxy` during construction.

---

## Phase 5: Advanced Powers and Scoring

**Objective**: Implement the remaining complex bird powers and the full scoring logic.

### Task 5.1: Pink Power Triggers

**Goal**: Implement the synchronous event handling for pink powers.

**Prompt**:

> In `GameEngine`, implement the synchronous event queue as described in Section 7 of the spec.
>
> 1.  After an action's base effects are applied, the engine must generate the appropriate pink power trigger events (e.g., `FoodGainedFromHabitatActivationEvent`).
> 2.  The engine must immediately process the event queue until it is empty before proceeding.
> 3.  Implement the Turkey Vulture example as an integration test to verify that a pink power correctly resolves before the next brown power in a habitat row is activated.

### Task 5.2: Implement All Power Handlers

**Goal**: Implement the code for all remaining bird power handlers from the base game.

**Prompt**:

> In `PowerProcessor`, create and register a handler for every unique `powerHandlerId` found in `birds.json`. Use the `rules/base_game/` directory for clarification on power mechanics. Ensure each handler returns the correct `Effect`s and generates the correct `DecisionPrompt`s when choices are needed.

### Task 53: Scoring

**Goal**: Implement end-of-round and end-of-game scoring.

**Prompt**:

> In `GameEngine`:
>
> 1.  Implement end-of-round scoring based on the round goal tiles.
> 2.  Implement final scoring at the end of the game, which includes points from birds, bonus cards, eggs, cached food, tucked cards, and end-of-round goals.
> 3.  Write integration tests to verify scoring against known game states.

---

## Phase 6: Finalization and CLI

**Objective**: Create the final executable and a simple CLI for playing a game.

### Task 6.1: Match Orchestrator

**Goal**: Implement the `MatchOrchestrator` to run full games.

**Prompt**:

> Create a `MatchOrchestrator` class in `src/MatchOrchestrator.ts`. It should:
>
> 1.  Have a `runMatch(config)` method that creates a `GameEngine` and agent instances.
> 2.  Run the game to completion and return a summary of the results, including the winner, final scores, and the seed used.

### Task 6.2: Simple CLI Renderer

**Goal**: Create a simple command-line interface to watch a game unfold.

**Prompt**:

> Create a `CLIController` class in `src/cli/CLIController.ts` that:
>
> 1.  Implements the `GameObserver` interface.
> 2.  Prints a human-readable log of events and effects to the console.
> 3.  Implements methods for prompting a human player for input via the terminal.
> 4.  Create a `main.ts` file that parses command-line arguments (for seeds and agent types), sets up a match with the `CLIController`, and runs it.

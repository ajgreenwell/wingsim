# Scenario-Based Integration Test Specification

## Overview

This specification defines a deterministic, scenario-based integration testing system for the Wingspan simulator. The system enables targeted testing of specific power handlers and turn action handlers through crafted game scenarios with scripted agent choices.

**Goals:**
1. Provide 100% coverage of all 42 handlers (38 power + 4 turn action)
2. Enable deterministic, reproducible test scenarios
3. Make scenario authoring ergonomic and self-documenting
4. Support both simple single-handler tests and complex multi-handler interaction tests

---

## Architecture

```
src/
  engine/
    __integration__/
      ScenarioRunner.ts         # Orchestrates scenario execution
      ScenarioBuilder.ts        # Constructs GameState from scenario config
      ScriptedAgent.ts          # Agent that follows predetermined choice scripts
      scenarios/
        brownPowers/            # Scenarios for WHEN_ACTIVATED handlers
          gainFoodHandlers.test.ts
          layEggHandlers.test.ts
          drawCardHandlers.test.ts
          tuckHandlers.test.ts
          ...
        pinkPowers/             # Scenarios for ONCE_BETWEEN_TURNS handlers
          eggTriggers.test.ts
          birdPlayedTriggers.test.ts
          predatorTriggers.test.ts
          foodGainTriggers.test.ts
        turnActions/            # Scenarios for turn action handlers
          gainFood.test.ts
          layEggs.test.ts
          drawCards.test.ts
          playBird.test.ts
        index.ts                # Exports all scenarios for coverage tracking
```

---

## Component Specifications

### 1. ScriptedAgent

**File:** `src/engine/__integration__/ScriptedAgent.ts`

An agent that returns predetermined choices from a script. Fails fast when the script is exhausted or when a prompt doesn't match the expected kind.

The agent receives its choices from the scenario's `turns` field, where choices are organized into turn blocks. The `ScenarioBuilder` flattens turn blocks for each player into a single choice queue that the agent consumes in order.

#### Interface

```typescript
import type { PlayerAgent } from "../../agents/PlayerAgent.js";
import type { PlayerId } from "../../types/core.js";

/**
 * Configuration for a ScriptedAgent.
 * The script contains an ordered list of choices that will be returned
 * for prompts in the order they are received.
 *
 * Note: These choices come from flattening the scenario's turn blocks
 * for this player. The ScenarioBuilder handles this transformation.
 */
export interface ScriptedAgentConfig {
  playerId: PlayerId;
  script: ScriptedChoice[];
}

/**
 * Creates a ScriptedAgent that follows a predetermined script.
 *
 * The agent consumes choices from the script in order. When a prompt is received:
 * 1. If script is empty, throws ScriptExhaustedError
 * 2. If next choice's kind doesn't match prompt kind, throws ScriptMismatchError
 * 3. Otherwise, returns the choice and advances the script
 */
export class ScriptedAgent implements PlayerAgent {
  readonly playerId: PlayerId;
  private readonly script: ScriptedChoice[];
  private scriptIndex: number = 0;

  constructor(config: ScriptedAgentConfig);

  async chooseStartingHand(prompt: StartingHandPrompt): Promise<StartingHandChoice>;
  async chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice>;
  async chooseOption(prompt: OptionPrompt): Promise<OptionChoice>;

  /**
   * Returns true if all scripted choices have been consumed.
   * Useful for post-scenario verification.
   */
  isScriptFullyConsumed(): boolean;

  /**
   * Returns the number of unconsumed choices remaining.
   */
  getRemainingChoiceCount(): number;
}
```

#### ScriptedChoice Type

Scripted choices are derived from the existing choice types in `prompts.ts`, with `promptId` omitted since it's not known at script authoring time:

```typescript
import type {
  StartingHandChoice,
  TurnActionChoice,
  ActivatePowerChoice,
  SelectFoodFromFeederChoice,
  SelectFoodFromSupplyChoice,
  SelectFoodDestinationChoice,
  DiscardEggsChoice,
  PlaceEggsChoice,
  SelectCardsChoice,
  DrawCardsChoice,
  SelectBonusCardsChoice,
  SelectPlayerChoice,
  RepeatPowerChoice,
  PlayBirdChoice,
  DiscardFoodChoice,
  SelectHabitatChoice,
} from "../../types/prompts.js";

/**
 * Scripted choices omit promptId since it's generated at runtime.
 * The ScriptedAgent will add the promptId when converting to real choices.
 */
export type ScriptedChoice =
  | Omit<StartingHandChoice, "promptId">
  | Omit<TurnActionChoice, "promptId">
  | Omit<ActivatePowerChoice, "promptId">
  | Omit<SelectFoodFromFeederChoice, "promptId">
  | Omit<SelectFoodFromSupplyChoice, "promptId">
  | Omit<SelectFoodDestinationChoice, "promptId">
  | Omit<DiscardEggsChoice, "promptId">
  | Omit<PlaceEggsChoice, "promptId">
  | Omit<SelectCardsChoice, "promptId">
  | Omit<DrawCardsChoice, "promptId">
  | Omit<SelectBonusCardsChoice, "promptId">
  | Omit<SelectPlayerChoice, "promptId">
  | Omit<RepeatPowerChoice, "promptId">
  | Omit<PlayBirdChoice, "promptId">
  | Omit<DiscardFoodChoice, "promptId">
  | Omit<SelectHabitatChoice, "promptId">;
```

The `ScriptedAgent` adds the `promptId` when returning choices:

```typescript
private toRealChoice(scripted: ScriptedChoice, promptId: PromptId): DecisionChoice {
  return { ...scripted, promptId } as DecisionChoice;
}
```

#### Error Types

```typescript
/**
 * Thrown when the script has no more choices but a prompt was received.
 */
export class ScriptExhaustedError extends Error {
  constructor(
    public readonly promptKind: string,
    public readonly promptId: string,
    public readonly choicesConsumed: number
  ) {
    super(
      `Script exhausted: received ${promptKind} prompt (${promptId}) ` +
      `but all ${choicesConsumed} scripted choices have been consumed`
    );
  }
}

/**
 * Thrown when the next scripted choice doesn't match the received prompt.
 */
export class ScriptMismatchError extends Error {
  constructor(
    public readonly expectedKind: string,
    public readonly receivedKind: string,
    public readonly promptId: string,
    public readonly scriptIndex: number
  ) {
    super(
      `Script mismatch at index ${scriptIndex}: expected ${expectedKind} ` +
      `but received ${receivedKind} prompt (${promptId})`
    );
  }
}
```

---

### 2. ScenarioBuilder

**File:** `src/engine/__integration__/ScenarioBuilder.ts`

Constructs a fully configured GameEngine from a declarative scenario configuration. Handles:
- Creating player states with specified hands/boards
- Removing dealt cards from the bird/bonus decks
- Setting up the birdfeeder with specific dice
- Configuring the bird tray

#### Interface

```typescript
import type { GameEngine } from "../../engine/GameEngine.js";
import type { ScriptedAgent } from "./ScriptedAgent.js";

/**
 * Configuration for a single player in a scenario.
 * Note: Player scripts are defined separately in the `turns` field of ScenarioConfig
 * to make the game flow and turn order explicit.
 */
export interface ScenarioPlayerConfig {
  /** Player ID (used throughout scenario) */
  id: PlayerId;

  /** Bird cards in player's hand at scenario start */
  hand: BirdCardId[];

  /** Bonus cards held by player */
  bonusCards: BonusCardId[];

  /** Player's food supply */
  food: FoodByType;

  /**
   * Birds already on the player's board.
   * Each entry specifies bird card ID and optional initial state.
   */
  board: ScenarioBoardConfig;
}

/**
 * Board configuration for a player.
 * Birds are placed left-to-right in each habitat.
 */
export interface ScenarioBoardConfig {
  FOREST: ScenarioBirdPlacement[];
  GRASSLAND: ScenarioBirdPlacement[];
  WETLAND: ScenarioBirdPlacement[];
}

/**
 * A bird placement on the board.
 */
export interface ScenarioBirdPlacement {
  /** The bird card ID */
  cardId: BirdCardId;
  /** Initial eggs on this bird (default: 0) */
  eggs?: number;
  /** Initial cached food (default: empty) */
  cachedFood?: FoodByType;
  /** Initial tucked cards (default: empty) */
  tuckedCards?: BirdCardId[];
}

/**
 * A turn block in the scenario script.
 * Each block represents a sequence of choices made by a single player.
 *
 * Turn blocks are processed in order. When the engine prompts a player,
 * the runner finds the next unprocessed turn block for that player and
 * consumes choices from it.
 *
 * This design makes the game flow explicit and readable:
 * - You can see exactly when control switches between players
 * - Pink power responses during another player's turn get their own block
 * - The order of blocks matches the actual execution order
 */
export interface ScenarioTurn {
  /** Which player this turn block belongs to */
  player: PlayerId;

  /**
   * Optional label for documentation/debugging.
   * Examples: "Turn 1", "Pink power response", "Between-turn trigger"
   */
  label?: string;

  /** The choices this player will make during this block */
  choices: ScriptedChoice[];
}

/**
 * Full scenario configuration.
 */
export interface ScenarioConfig {
  /** Human-readable scenario name (used in test output) */
  name: string;

  /** Optional description explaining what the scenario tests */
  description?: string;

  /**
   * Handler IDs this scenario is designed to test.
   * Used for coverage tracking and documentation.
   */
  targetHandlers: string[];

  /** Player configurations (2-5 players) */
  players: ScenarioPlayerConfig[];

  /**
   * The sequence of turn blocks that define the scenario script.
   * Each block specifies a player and the choices they will make.
   *
   * Blocks are consumed in order as the game executes. When a player
   * is prompted, the runner uses choices from their next unprocessed block.
   *
   * This makes the game flow explicit and readable, especially for
   * scenarios involving pink powers that trigger during other players' turns.
   */
  turns: ScenarioTurn[];

  /**
   * Initial birdfeeder dice configuration.
   * Array of 5 DieFace values (or fewer if some dice are "taken").
   */
  birdfeeder: DieFace[];

  /**
   * Initial bird tray configuration (3 cards, or null for empty slot).
   * If not specified, tray is filled normally from deck.
   */
  birdTray?: (BirdCardId | null)[];

  /**
   * Specific cards to place at top of deck in order.
   * First card in array is drawn first.
   * Useful for scenarios that draw from deck.
   */
  deckTopCards?: BirdCardId[];

  /**
   * Specific bonus cards to place at top of bonus deck.
   */
  bonusDeckTopCards?: BonusCardId[];

  /**
   * Game round to start at (default: 1).
   * Useful for testing round-specific behavior.
   */
  startRound?: number;

  /**
   * Starting turn number (default: 1).
   */
  startTurn?: number;

  /**
   * Index of the starting active player (default: 0).
   */
  startingPlayerIndex?: number;

  /**
   * Number of turns to run (default: 1).
   * Set higher for multi-turn scenarios.
   */
  turnsToRun?: number;

  /**
   * Seed for any remaining randomness (e.g., shuffled portions of deck).
   * Default: 12345 (deterministic).
   */
  seed?: number;
}

/**
 * Result of building a scenario, ready for execution.
 */
export interface BuiltScenario {
  /** The configured GameEngine */
  engine: GameEngine;

  /** ScriptedAgents for each player, in order */
  agents: ScriptedAgent[];

  /** The original configuration (for reference) */
  config: ScenarioConfig;
}

/**
 * Builds a GameEngine and agents from a scenario configuration.
 */
export class ScenarioBuilder {
  constructor(registry: DataRegistry);

  /**
   * Build a scenario into a runnable GameEngine + agents.
   *
   * Processing:
   * 1. Groups turn blocks by player to create per-player choice queues
   * 2. Creates ScriptedAgents that consume choices from their queues
   * 3. Creates PlayerState objects with specified hands/boards/food
   * 4. Removes all dealt cards from the bird deck
   * 5. Removes all dealt bonus cards from the bonus deck
   * 6. Optionally stacks top of decks with specified cards
   * 7. Sets up birdfeeder with specified dice
   * 8. Creates GameEngine with prepared state
   */
  build(config: ScenarioConfig): BuiltScenario;
}
```

#### Turn Block Processing

The `turns` field is processed as follows:

1. **Grouping by player:** Turn blocks are grouped by player ID to create per-player choice queues
2. **Order preservation:** Choices within each player's queue maintain the order they appear in `turns`
3. **Agent creation:** Each player gets a `ScriptedAgent` with their flattened choice queue

```typescript
// Pseudocode for turn block processing
function groupTurnsByPlayer(turns: ScenarioTurn[]): Map<PlayerId, ScriptedChoice[]> {
  const choicesByPlayer = new Map<PlayerId, ScriptedChoice[]>();

  for (const turn of turns) {
    const existing = choicesByPlayer.get(turn.player) ?? [];
    choicesByPlayer.set(turn.player, [...existing, ...turn.choices]);
  }

  return choicesByPlayer;
}
```

**Example:** Given this `turns` configuration:

```typescript
turns: [
  { player: "bob", choices: [A, B] },      // Bob's turn
  { player: "alice", choices: [C, D] },    // Alice's pink power
  { player: "alice", choices: [E, F] },    // Alice's turn
]
```

The resulting agent scripts are:
- **bob:** `[A, B]`
- **alice:** `[C, D, E, F]`

When the engine prompts Alice for the first time (pink power), she gets `C`. Her next prompt gets `D`, then `E`, then `F`.

#### Card Removal Logic

The builder removes all cards dealt to players from the main decks:

```typescript
// Pseudocode for card removal
const allDealtBirdCards = new Set<BirdCardId>();

for (const player of config.players) {
  // Cards in hand
  for (const cardId of player.hand) {
    allDealtBirdCards.add(cardId);
  }
  // Cards on board
  for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"]) {
    for (const placement of player.board[habitat]) {
      allDealtBirdCards.add(placement.cardId);
    }
  }
}

// Cards in tray
if (config.birdTray) {
  for (const cardId of config.birdTray) {
    if (cardId) allDealtBirdCards.add(cardId);
  }
}

// Cards stacked on deck
if (config.deckTopCards) {
  for (const cardId of config.deckTopCards) {
    allDealtBirdCards.add(cardId);
  }
}

// Filter deck to exclude dealt cards
const remainingDeck = allBirds.filter(b => !allDealtBirdCards.has(b.id));
```

---

### 3. ScenarioRunner

**File:** `src/engine/__integration__/ScenarioRunner.ts`

Executes scenarios and provides hooks for assertions.

#### Interface

```typescript
import type { GameEngine, GameResult } from "../../engine/GameEngine.js";
import type { Event } from "../../types/events.js";
import type { Effect } from "../../types/effects.js";

/**
 * Context passed to assertion callbacks.
 * Provides access to all relevant scenario execution data.
 */
export interface ScenarioContext {
  /** The game engine (for state inspection) */
  engine: GameEngine;

  /** The final game result (if game completed) */
  result?: GameResult;

  /** All events emitted during scenario execution */
  events: Event[];

  /** All effects applied during scenario execution */
  effects: Effect[];

  /** The ScriptedAgents (for checking script consumption) */
  agents: ScriptedAgent[];

  /** The original scenario config */
  config: ScenarioConfig;
}

/**
 * Assertion function signature.
 * Throw an error to fail the test, or return void to pass.
 */
export type ScenarioAssertion = (ctx: ScenarioContext) => void | Promise<void>;

/**
 * Options for running a scenario.
 */
export interface RunScenarioOptions {
  /**
   * If true, run the full game to completion.
   * If false (default), run only turnsToRun turns.
   */
  runFullGame?: boolean;

  /**
   * Assertion functions to run after scenario execution.
   * Each function receives the full ScenarioContext.
   */
  assertions?: ScenarioAssertion[];

  /**
   * If true, verify all agent scripts were fully consumed.
   * Default: true (warns on unconsumed choices).
   */
  verifyScriptConsumed?: boolean;
}

/**
 * Runs a scenario and executes assertions.
 *
 * @param config - The scenario configuration
 * @param options - Execution options including assertions
 * @returns The scenario context after execution
 */
export async function runScenario(
  config: ScenarioConfig,
  options?: RunScenarioOptions
): Promise<ScenarioContext>;
```

#### Effect/Event Collection via GameObserver

The runner collects effects and events by implementing the `GameObserver` interface from `WingsimSpec.md`. This provides a clean, decoupled way to observe all state mutations and semantic events during scenario execution.

```typescript
import type { GameObserver } from "../../engine/GameObserver.js";
import type { Event } from "../../types/events.js";
import type { Effect } from "../../types/effects.js";

/**
 * A GameObserver implementation that collects all events and effects
 * during scenario execution for later assertion.
 */
class ScenarioObserver implements GameObserver {
  readonly events: Event[] = [];
  readonly effects: Effect[] = [];

  onEventProcessing(event: Event): void {
    this.events.push(event);
  }

  onEffectApplied(effect: Effect): void {
    this.effects.push(effect);
  }
}

// ScenarioRunner implementation detail
async function runScenario(config: ScenarioConfig, options: RunScenarioOptions = {}) {
  const builder = new ScenarioBuilder(new DataRegistry());
  const { engine, agents, config: builtConfig } = builder.build(config);

  // Create observer to collect events and effects during execution
  const observer = new ScenarioObserver();
  engine.addObserver(observer);

  // Run the specified number of turns
  if (options.runFullGame) {
    const result = await engine.playGame();
  } else {
    // Run limited turns
    for (let i = 0; i < (config.turnsToRun ?? 1); i++) {
      await engine.runSingleTurn();
    }
  }

  const ctx: ScenarioContext = {
    engine,
    events: observer.events,
    effects: observer.effects,
    agents,
    config: builtConfig,
  };

  // Run assertions
  for (const assertion of options.assertions ?? []) {
    await assertion(ctx);
  }

  // Verify script consumption
  if (options.verifyScriptConsumed !== false) {
    for (const agent of agents) {
      if (!agent.isScriptFullyConsumed()) {
        console.warn(
          `Warning: Agent ${agent.playerId} has ${agent.getRemainingChoiceCount()} unconsumed choices`
        );
      }
    }
  }

  return ctx;
}
```

---

### 4. Assertion Helpers

**File:** `src/engine/__integration__/assertions.ts`

Provides reusable assertion factory functions for common checks.

```typescript
import type { ScenarioAssertion, ScenarioContext } from "./ScenarioRunner.js";
import type { PlayerId, BirdInstanceId, FoodByType, Habitat } from "../../types/core.js";

/**
 * Assert that a specific handler was invoked during the scenario.
 */
export function handlerWasInvoked(handlerId: string): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const activations = ctx.effects.filter(
      e => e.type === "ACTIVATE_POWER" && e.handlerId === handlerId && e.activated
    );
    if (activations.length === 0) {
      throw new Error(`Expected handler "${handlerId}" to be invoked, but it was not`);
    }
  };
}

/**
 * Assert that a handler was invoked a specific number of times.
 */
export function handlerInvokedTimes(handlerId: string, times: number): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const activations = ctx.effects.filter(
      e => e.type === "ACTIVATE_POWER" && e.handlerId === handlerId && e.activated
    );
    if (activations.length !== times) {
      throw new Error(
        `Expected handler "${handlerId}" to be invoked ${times} time(s), ` +
        `but was invoked ${activations.length} time(s)`
      );
    }
  };
}

/**
 * Assert that a player has specific food in their supply.
 */
export function playerHasFood(playerId: PlayerId, food: FoodByType): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    for (const [foodType, expectedCount] of Object.entries(food)) {
      const actualCount = player.food[foodType as keyof typeof player.food] ?? 0;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected ${playerId} to have ${expectedCount} ${foodType}, but has ${actualCount}`
        );
      }
    }
  };
}

/**
 * Assert that a bird has specific cached food.
 */
export function birdHasCachedFood(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  food: FoodByType
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    for (const [foodType, expectedCount] of Object.entries(food)) {
      const actualCount = bird.cachedFood[foodType as keyof typeof bird.cachedFood] ?? 0;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected bird ${birdInstanceId} to have ${expectedCount} cached ${foodType}, ` +
          `but has ${actualCount}`
        );
      }
    }
  };
}

/**
 * Assert that a bird has specific number of eggs.
 */
export function birdHasEggs(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  eggs: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    if (bird.eggs !== eggs) {
      throw new Error(
        `Expected bird ${birdInstanceId} to have ${eggs} egg(s), but has ${bird.eggs}`
      );
    }
  };
}

/**
 * Assert that a bird has specific tucked cards.
 */
export function birdHasTuckedCards(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    if (bird.tuckedCards.length !== count) {
      throw new Error(
        `Expected bird ${birdInstanceId} to have ${count} tucked card(s), ` +
        `but has ${bird.tuckedCards.length}`
      );
    }
  };
}

/**
 * Assert that a player has specific hand size.
 */
export function playerHandSize(playerId: PlayerId, size: number): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    if (player.hand.length !== size) {
      throw new Error(
        `Expected ${playerId} to have ${size} card(s) in hand, but has ${player.hand.length}`
      );
    }
  };
}

/**
 * Assert that a bird is in a specific habitat.
 */
export function birdIsInHabitat(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  habitat: Habitat
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualHabitat = player.board.getBirdHabitat(birdInstanceId);
    if (actualHabitat !== habitat) {
      throw new Error(
        `Expected bird ${birdInstanceId} to be in ${habitat}, but is in ${actualHabitat ?? "no habitat"}`
      );
    }
  };
}

/**
 * Assert that a specific event was emitted.
 */
export function eventWasEmitted(
  eventType: Event["type"],
  predicate?: (event: Event) => boolean
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const matches = ctx.events.filter(e => e.type === eventType);
    if (matches.length === 0) {
      throw new Error(`Expected event of type "${eventType}" to be emitted, but it was not`);
    }
    if (predicate && !matches.some(predicate)) {
      throw new Error(`Event of type "${eventType}" was emitted but didn't match predicate`);
    }
  };
}

/**
 * Assert the number of birds in a player's habitat.
 */
export function habitatBirdCount(
  playerId: PlayerId,
  habitat: Habitat,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualCount = player.board.countBirdsInHabitat(habitat);
    if (actualCount !== count) {
      throw new Error(
        `Expected ${playerId} to have ${count} bird(s) in ${habitat}, but has ${actualCount}`
      );
    }
  };
}

/**
 * Combine multiple assertions.
 */
export function all(...assertions: ScenarioAssertion[]): ScenarioAssertion {
  return async (ctx: ScenarioContext) => {
    for (const assertion of assertions) {
      await assertion(ctx);
    }
  };
}
```

---

## Example Scenarios

### Example 1: Brown Power - gainFoodFromFeederWithCache (Acorn Woodpecker)

Tests that the Acorn Woodpecker can gain a seed from the feeder and choose to cache it.

```typescript
// src/engine/__integration__/scenarios/brownPowers/gainFoodHandlers.test.ts

import { describe, it, expect } from "vitest";
import { runScenario } from "../ScenarioRunner.js";
import type { ScenarioConfig } from "../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  birdHasCachedFood,
  playerHasFood,
} from "../assertions.js";

describe("gainFoodFromFeederWithCache handler", () => {
  /**
   * Tests that Acorn Woodpecker can:
   * 1. Gain a seed from the birdfeeder
   * 2. Choose to cache it on itself
   *
   * This tests the full flow of the gainFoodFromFeederWithCache handler
   * including the destination choice prompt.
   */
  it("caches seed on Acorn Woodpecker when agent chooses cache destination", async () => {
    const scenario: ScenarioConfig = {
      name: "Acorn Woodpecker caches seed",
      description: "Player activates forest with Acorn Woodpecker, gains seed, caches it",
      targetHandlers: ["gainFoodFromFeederWithCache"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "acorn_woodpecker", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice's turn 1",
          choices: [
            // Turn action: activate forest (GAIN_FOOD)
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Select food from feeder (base action reward)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Acorn Woodpecker power: choose to activate
            { kind: "activatePower", activate: true },
            // Acorn Woodpecker power: choose cache destination
            { kind: "selectFoodDestination", destination: "CACHE_ON_SOURCE_BIRD" },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify handler was invoked
        handlerWasInvoked("gainFoodFromFeederWithCache"),

        // Verify seed was cached on Acorn Woodpecker
        birdHasCachedFood("alice", "alice_acorn_woodpecker", { SEED: 1 }),

        // Verify player got food from base action (1 die) but not the cached one
        playerHasFood("alice", { SEED: 1 }), // From base GAIN_FOOD action
      ],
    });
  });

  /**
   * Tests that player can choose to take the seed to their supply instead of caching.
   */
  it("gains seed to supply when agent chooses supply destination", async () => {
    const scenario: ScenarioConfig = {
      name: "Acorn Woodpecker gains to supply",
      description: "Player chooses to gain seed to supply instead of caching",
      targetHandlers: ["gainFoodFromFeederWithCache"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "acorn_woodpecker", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice's turn 1",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
            { kind: "selectFoodDestination", destination: "PLAYER_SUPPLY" },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeederWithCache"),

        // Seed from power went to supply, not cached
        birdHasCachedFood("alice", "alice_acorn_woodpecker", {}),

        // Player got both seeds: 1 from base action + 1 from power
        playerHasFood("alice", { SEED: 2 }),
      ],
    });
  });
});
```

### Example 2: Pink Power - whenOpponentPlaysBirdInHabitatGainFood (Belted Kingfisher)

Tests that the Belted Kingfisher's pink power triggers when an opponent plays a bird in wetland.

```typescript
// src/engine/__integration__/scenarios/pinkPowers/birdPlayedTriggers.test.ts

import { describe, it, expect } from "vitest";
import { runScenario } from "../ScenarioRunner.js";
import type { ScenarioConfig } from "../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  playerHasFood,
  eventWasEmitted,
} from "../assertions.js";

describe("whenOpponentPlaysBirdInHabitatGainFood handler", () => {
  /**
   * Tests that Belted Kingfisher's pink power triggers when opponent plays
   * a bird in the wetland habitat.
   *
   * Flow:
   * 1. Alice has Belted Kingfisher in her wetland
   * 2. Bob plays a bird in his wetland
   * 3. Alice's Belted Kingfisher triggers
   * 4. Alice gains 1 fish from supply
   */
  it("triggers when opponent plays bird in wetland", async () => {
    const scenario: ScenarioConfig = {
      name: "Belted Kingfisher triggers on opponent wetland bird",
      description: "Bob plays bird in wetland, Alice's Belted Kingfisher gains fish",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatGainFood", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 }, // Starts with no fish
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          // Bob has a cheap wetland bird to play
          hand: ["american_coot"],
          bonusCards: [],
          food: { INVERTEBRATE: 1, SEED: 1 }, // Enough to pay for American Coot
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        // Bob's turn: plays a wetland bird
        {
          player: "bob",
          label: "Bob's turn 1 - play bird",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "american_coot",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 1, SEED: 1 },
              eggsToSpend: {},
            },
          ],
        },
        // Alice's pink power triggers during Bob's turn
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { FISH: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify both handlers were invoked
        handlerWasInvoked("playBirdHandler"),
        handlerWasInvoked("whenOpponentPlaysBirdInHabitatGainFood"),

        // Verify Alice gained fish from the pink power
        playerHasFood("alice", { FISH: 1 }),

        // Verify BIRD_PLAYED event was emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" && e.playerId === "bob" && e.habitat === "WETLAND"
        ),
      ],
    });
  });

  /**
   * Tests that Belted Kingfisher does NOT trigger when opponent plays
   * a bird in a non-wetland habitat.
   */
  it("does not trigger when opponent plays bird in non-wetland habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Belted Kingfisher ignores forest bird",
      description: "Bob plays bird in forest, Alice's Belted Kingfisher does not trigger",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: ["downy_woodpecker"], // Forest bird
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        // Bob plays a forest bird - Alice's pink power should NOT trigger
        {
          player: "bob",
          label: "Bob's turn 1 - play forest bird",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "downy_woodpecker",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        // No turn block for Alice - her pink power doesn't trigger for forest birds
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("playBirdHandler"),

        // Alice should NOT have gained any fish
        playerHasFood("alice", { FISH: 0 }),

        // Verify handler was NOT invoked
        (ctx) => {
          const activations = ctx.effects.filter(
            e => e.type === "ACTIVATE_POWER" &&
                 e.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
          );
          if (activations.length > 0) {
            throw new Error("Belted Kingfisher should not have triggered for forest bird");
          }
        },
      ],
    });
  });
});
```

---

## Handler Coverage Matrix

The following table maps each handler to its trigger type and suggested scenario approach:

### Power Handlers (38)

| Handler ID | Trigger | Scenario Complexity | Notes |
|------------|---------|---------------------|-------|
| `gainFoodFromSupply` | WHEN_ACTIVATED | Low | Simple food gain |
| `cacheFoodFromSupply` | WHEN_ACTIVATED | Low | Food to cache |
| `gainFoodFromFeederWithCache` | WHEN_ACTIVATED | Medium | Needs feeder setup + destination choice |
| `whenOpponentLaysEggsLayEggOnNestType` | ONCE_BETWEEN_TURNS | Medium | Multi-player, requires lay eggs action |
| `playersWithFewestInHabitatDrawCard` | WHEN_ACTIVATED | Medium | Multi-player comparison |
| `playersWithFewestInHabitatGainFood` | WHEN_ACTIVATED | Medium | Multi-player comparison |
| `tuckAndDraw` | WHEN_ACTIVATED | Low | Requires hand cards |
| `discardEggToGainFood` | WHEN_ACTIVATED | Low | Requires eggs on birds |
| `discardEggToDrawCards` | WHEN_ACTIVATED | Low | Requires eggs on birds |
| `rollDiceAndCacheIfMatch` | WHEN_ACTIVATED | Medium | Predator power, dice roll |
| `drawAndDistributeCards` | WHEN_ACTIVATED | High | Multi-player card distribution |
| `gainFoodFromFeeder` | WHEN_ACTIVATED | Low | Simple feeder gain |
| `discardFoodToTuckFromDeck` | WHEN_ACTIVATED | Low | Requires food |
| `eachPlayerGainsFoodFromFeeder` | WHEN_ACTIVATED | Medium | Multi-player |
| `layEggOnBirdsWithNestType` | WHEN_ACTIVATED | Low | Requires matching nest birds |
| `drawBonusCardsAndKeep` | WHEN_ACTIVATED | Medium | Bonus deck setup |
| `layEggsOnBird` | WHEN_ACTIVATED | Low | Simple egg lay |
| `gainAllFoodTypeFromFeeder` | WHEN_ACTIVATED | Low | Needs multiple dice types |
| `allPlayersGainFoodFromSupply` | WHEN_ACTIVATED | Medium | Multi-player |
| `lookAtCardAndTuckIfWingspanUnder` | WHEN_ACTIVATED | Medium | Predator power |
| `whenOpponentPlaysBirdInHabitatGainFood` | ONCE_BETWEEN_TURNS | Medium | Multi-player, BIRD_PLAYED |
| `whenOpponentPlaysBirdInHabitatTuckCard` | ONCE_BETWEEN_TURNS | Medium | Multi-player, BIRD_PLAYED |
| `whenOpponentPredatorSucceedsGainFood` | ONCE_BETWEEN_TURNS | High | Requires predator success |
| `whenOpponentGainsFoodCacheIfMatch` | ONCE_BETWEEN_TURNS | High | Requires food gain trigger |
| `moveToAnotherHabitatIfRightmost` | WHEN_ACTIVATED | Medium | Habitat positioning |
| `drawCardsWithDelayedDiscard` | WHEN_ACTIVATED | Medium | End-of-turn continuation |
| `tuckFromHandAndLay` | WHEN_ACTIVATED | Low | Requires hand + nest |
| `tuckAndGainFood` | WHEN_ACTIVATED | Low | Requires hand |
| `tuckAndGainFoodOfChoice` | WHEN_ACTIVATED | Low | Requires hand |
| `drawFaceUpCardsFromTray` | WHEN_ACTIVATED | Low | Tray setup |
| `drawCards` | WHEN_ACTIVATED | Low | Simple draw |
| `allPlayersDrawCardsFromDeck` | WHEN_ACTIVATED | Medium | Multi-player |
| `allPlayersLayEggOnNestType` | WHEN_ACTIVATED | Medium | Multi-player + nest matching |
| `playAdditionalBirdInHabitat` | WHEN_PLAYED | High | Recursive bird play |
| `tradeFoodType` | WHEN_ACTIVATED | Low | Food exchange |
| `repeatBrownPowerInHabitat` | WHEN_ACTIVATED | High | Power chaining |
| `repeatPredatorPowerInHabitat` | WHEN_ACTIVATED | High | Power chaining + predator |
| `gainFoodFromFeederIfAvailable` | WHEN_ACTIVATED | Low | Conditional feeder gain |

### Turn Action Handlers (4)

| Handler ID | Scenario Complexity | Notes |
|------------|---------------------|-------|
| `gainFoodHandler` | Low | Base action + optional bonus |
| `layEggsHandler` | Low | Requires birds with egg capacity |
| `drawCardsHandler` | Low | Base action + optional bonus |
| `playBirdHandler` | Medium | Food/egg payment, habitat selection |


/**
 * ScenarioRunner - Executes scenarios and provides hooks for assertions.
 *
 * The ScenarioRunner:
 * 1. Builds a GameEngine from a ScenarioConfig using ScenarioBuilder
 * 2. Registers a ScenarioObserver to collect events and effects
 * 3. Runs the specified number of turns
 * 4. Executes assertion functions
 * 5. Verifies script consumption
 */

import { DataRegistry } from "../../data/DataRegistry.js";
import { GameEngine, type GameResult } from "../GameEngine.js";
import type { GameObserver } from "../GameObserver.js";
import type { Event } from "../../types/events.js";
import type { Effect } from "../../types/effects.js";
import { ScenarioBuilder, type ScenarioConfig } from "./ScenarioBuilder.js";
import type { ScriptedAgent } from "./ScriptedAgent.js";

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

/**
 * Runs a scenario and executes assertions.
 *
 * @param config - The scenario configuration
 * @param options - Execution options including assertions
 * @returns The scenario context after execution
 */
export async function runScenario(
  config: ScenarioConfig,
  options: RunScenarioOptions = {}
): Promise<ScenarioContext> {
  // Build the scenario
  const registry = new DataRegistry();
  const builder = new ScenarioBuilder(registry);
  const { gameState, agents, config: builtConfig } = builder.build(config);

  // Create engine from the pre-built game state
  const engine = GameEngine.fromState({
    agents,
    seed: config.seed ?? 12345,
    registry,
    gameState,
  });

  // Create observer to collect events and effects during execution
  const observer = new ScenarioObserver();
  engine.addObserver(observer);

  // Run the specified number of turns or full game
  let result: GameResult | undefined;

  if (options.runFullGame) {
    result = await engine.playGame();
  } else {
    // Run limited turns
    const turnsToRun = config.turnsToRun ?? 1;
    for (let i = 0; i < turnsToRun; i++) {
      await engine.runSingleTurn();
    }
  }

  const ctx: ScenarioContext = {
    engine,
    result,
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

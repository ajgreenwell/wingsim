/**
 * Simulator - Orchestrates multiple game simulations for Monte Carlo analysis.
 *
 * The Simulator runs complete games with configurable agents, tracks handler
 * coverage, and aggregates results across all games. It manages seed generation
 * for reproducibility and provides detailed statistics about game outcomes.
 */

import { GameEngine, type GameResult } from "../engine/GameEngine.js";
import { DataRegistry } from "../data/DataRegistry.js";
import { AgentRegistry } from "../agents/AgentRegistry.js";
import { HandlerCoverageTracker } from "./HandlerCoverageTracker.js";
import { Rng } from "../util/Rng.js";
import type { PlayerId } from "../types/core.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";

// Ensure SmartRandomAgent is registered (side effect import)
import "../agents/SmartRandomAgent.js";

/**
 * Configuration for the Simulator.
 */
export interface SimulatorConfig {
  /** Number of games to simulate */
  numGames: number;
  /** Number of players per game (2-5) */
  numPlayers: number;
  /** Agent type names for each player. Length must equal numPlayers. */
  agentTypes: string[];
  /** Optional: explicit seeds for each game. Length must equal numGames if provided. */
  seeds?: number[];
  /** Optional: base seed used to generate seeds if explicit seeds not provided */
  baseSeed?: number;
  /** Whether to track handler coverage */
  trackCoverage: boolean;
}

/**
 * Result of a single game simulation.
 */
export interface GameSimulationResult {
  /** The seed used for this game */
  seed: number;
  /** The game result including winner and scores */
  result: GameResult;
  /** Duration of the game in milliseconds */
  durationMs: number;
}

/**
 * Summary of all game simulations.
 */
export interface SimulationSummary {
  /** Results from all games */
  games: GameSimulationResult[];
  /** Total duration of all simulations in milliseconds */
  totalDurationMs: number;
  /** Number of games that completed successfully */
  successCount: number;
  /** Number of games that resulted in errors */
  errorCount: number;
  /** All seeds used (for replay) */
  seeds: number[];
  /** Coverage statistics (if trackCoverage was enabled) */
  coverage?: {
    covered: number;
    total: number;
    percentage: number;
    uncoveredHandlers: string[];
  };
}

/**
 * Magic constant for deriving agent seeds from game seed.
 * Used to create unique but deterministic seeds for each player.
 */
const AGENT_SEED_MULTIPLIER = 0x9e3779b9;

/**
 * Simulator orchestrates multiple game simulations with configurable agents.
 */
export class Simulator {
  private readonly config: SimulatorConfig;
  private readonly registry: DataRegistry;
  private readonly coverageTracker: HandlerCoverageTracker | null;

  constructor(config: SimulatorConfig) {
    this.validateConfig(config);
    this.config = config;
    this.registry = new DataRegistry();
    this.coverageTracker = config.trackCoverage
      ? new HandlerCoverageTracker()
      : null;
  }

  /**
   * Validate the simulator configuration.
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: SimulatorConfig): void {
    if (config.numGames < 1) {
      throw new Error("numGames must be at least 1");
    }

    if (config.numPlayers < 2 || config.numPlayers > 5) {
      throw new Error("numPlayers must be between 2 and 5");
    }

    if (config.agentTypes.length !== config.numPlayers) {
      throw new Error(
        `agentTypes length (${config.agentTypes.length}) must equal numPlayers (${config.numPlayers})`
      );
    }

    // Validate all agent types are registered
    for (const agentType of config.agentTypes) {
      if (!AgentRegistry.has(agentType)) {
        throw new Error(
          `Agent type "${agentType}" not found. Available: ${AgentRegistry.listNames().join(", ")}`
        );
      }
    }

    // Validate explicit seeds length if provided
    if (config.seeds && config.seeds.length !== config.numGames) {
      throw new Error(
        `seeds length (${config.seeds.length}) must equal numGames (${config.numGames})`
      );
    }
  }

  /**
   * Generate seeds for all games.
   *
   * Priority:
   * 1. Use explicit seeds if provided
   * 2. Derive from baseSeed if provided
   * 3. Use Date.now() as base seed
   */
  private generateGameSeeds(): number[] {
    // Use explicit seeds if provided
    if (this.config.seeds) {
      return [...this.config.seeds];
    }

    // Determine base seed
    const baseSeed = this.config.baseSeed ?? Date.now();

    // Generate derived seeds for each game
    const seedRng = new Rng(baseSeed);
    const seeds: number[] = [];
    for (let i = 0; i < this.config.numGames; i++) {
      // Generate seeds in [0, 2^32) range using multiple random values
      const seed = (seedRng as unknown as { seed: number }).seed;
      // Use the rng's internal state progression by calling shuffle
      const dummy = seedRng.shuffle([1, 2, 3, 4, 5]);
      // XOR the values to get a new seed
      const newSeed =
        dummy.reduce((acc, v, i) => acc ^ (v << (i * 6)), seed) >>> 0;
      seeds.push(newSeed);
    }

    return seeds;
  }

  /**
   * Generate a deterministic seed for a player's agent.
   * Each player gets a unique seed derived from the game seed.
   */
  private generateAgentSeed(gameSeed: number, playerIndex: number): number {
    return (gameSeed ^ (playerIndex * AGENT_SEED_MULTIPLIER)) >>> 0;
  }

  /**
   * Create agents for a game.
   */
  private createAgents(gameSeed: number): PlayerAgent[] {
    return this.config.agentTypes.map((agentType, index) => {
      const playerId = `player${index + 1}` as PlayerId;
      const agentSeed = this.generateAgentSeed(gameSeed, index);
      return AgentRegistry.create(agentType, playerId, agentSeed);
    });
  }

  /**
   * Run a single game simulation.
   */
  private async runSingleGame(seed: number): Promise<GameSimulationResult> {
    const startTime = Date.now();

    const agents = this.createAgents(seed);

    const engine = new GameEngine({
      agents,
      seed,
      registry: this.registry,
      onHandlerInvoked: this.coverageTracker
        ? (handlerId, type) =>
            this.coverageTracker!.recordInvocation(handlerId, type)
        : undefined,
    });

    const result = await engine.playGame();
    const durationMs = Date.now() - startTime;

    return {
      seed,
      result,
      durationMs,
    };
  }

  /**
   * Run all game simulations and return aggregated results.
   */
  async run(): Promise<SimulationSummary> {
    const totalStartTime = Date.now();
    const seeds = this.generateGameSeeds();
    const games: GameSimulationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < this.config.numGames; i++) {
      const seed = seeds[i];
      try {
        const result = await this.runSingleGame(seed);
        games.push(result);
        successCount++;
      } catch (error) {
        // Log error but continue with other games
        console.error(`Game ${i + 1} (seed: ${seed}) failed:`, error);
        errorCount++;
      }
    }

    const totalDurationMs = Date.now() - totalStartTime;

    const summary: SimulationSummary = {
      games,
      totalDurationMs,
      successCount,
      errorCount,
      seeds,
    };

    // Add coverage data if tracking was enabled
    if (this.coverageTracker) {
      summary.coverage = {
        covered: this.coverageTracker.getCoveredCount(),
        total: this.coverageTracker.getTotalCount(),
        percentage: this.coverageTracker.getCoveragePercentage(),
        uncoveredHandlers: this.coverageTracker.getUncoveredHandlers(),
      };
    }

    return summary;
  }

  /**
   * Get the coverage tracker (for generating detailed reports).
   * Returns null if coverage tracking is disabled.
   */
  getCoverageTracker(): HandlerCoverageTracker | null {
    return this.coverageTracker;
  }
}

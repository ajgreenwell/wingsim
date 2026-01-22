import type { PlayerId } from "../types/core.js";
import type { PlayerAgent } from "./PlayerAgent.js";

/**
 * Factory function type for creating PlayerAgent instances.
 * Each factory receives the player ID and a seed for reproducible behavior.
 */
export type AgentFactory = (playerId: PlayerId, seed: number) => PlayerAgent;

/**
 * Registration record for an agent type.
 */
export interface AgentRegistration {
  name: string;
  description: string;
  factory: AgentFactory;
}

/**
 * Registry for agent types that can participate in simulations.
 * Maps agent type names (used in CLI) to factory functions that create agent instances.
 */
class AgentRegistryImpl {
  private readonly agents: Map<string, AgentRegistration> = new Map();

  /**
   * Register a new agent type.
   * @throws Error if an agent with the same name is already registered
   */
  register(name: string, description: string, factory: AgentFactory): void {
    if (this.agents.has(name)) {
      throw new Error(`Agent "${name}" is already registered`);
    }
    this.agents.set(name, { name, description, factory });
  }

  /**
   * Create an agent instance by type name.
   * @throws Error if the agent type is not registered
   */
  create(name: string, playerId: PlayerId, seed: number): PlayerAgent {
    const registration = this.agents.get(name);
    if (!registration) {
      throw new Error(
        `Agent "${name}" not found. Available agents: ${this.listNames().join(", ")}`
      );
    }
    return registration.factory(playerId, seed);
  }

  /**
   * List all registered agent types.
   */
  list(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  /**
   * List all registered agent names.
   */
  listNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if an agent type is registered.
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Clear all registrations (useful for testing).
   */
  clear(): void {
    this.agents.clear();
  }
}

/**
 * Singleton instance of the agent registry.
 */
export const AgentRegistry = new AgentRegistryImpl();

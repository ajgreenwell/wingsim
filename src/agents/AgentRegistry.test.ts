import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "./AgentRegistry.js";
import type { PlayerAgent } from "./PlayerAgent.js";
import type { PlayerId } from "../types/core.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
} from "../types/prompts.js";

// Test agent factories returning mock implementations
class MockAgent implements PlayerAgent {
  constructor(
    public readonly playerId: PlayerId,
    public readonly seed: number
  ) {}
  chooseStartingHand(_prompt: StartingHandPrompt): Promise<StartingHandChoice> {
    throw new Error("Not implemented");
  }
  chooseTurnAction(_prompt: TurnActionPrompt): Promise<TurnActionChoice> {
    throw new Error("Not implemented");
  }
  chooseOption(_prompt: OptionPrompt): Promise<OptionChoice> {
    throw new Error("Not implemented");
  }
}

describe("AgentRegistry", () => {
  // Reset registry state before each test to prevent cross-test pollution
  beforeEach(() => {
    AgentRegistry.clear();
  });

  describe("register()", () => {
    // Verifies basic agent registration stores the correct data
    it("registers an agent successfully", () => {
      AgentRegistry.register(
        "TestAgent",
        "A test agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      expect(AgentRegistry.has("TestAgent")).toBe(true);
    });

    // Prevents accidentally overwriting existing agents, which could cause unexpected behavior
    it("throws when registering duplicate agent name", () => {
      AgentRegistry.register(
        "TestAgent",
        "First registration",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      expect(() =>
        AgentRegistry.register(
          "TestAgent",
          "Duplicate",
          (playerId, seed) => new MockAgent(playerId, seed)
        )
      ).toThrow('Agent "TestAgent" is already registered');
    });

    // Agent names are case-sensitive to avoid ambiguity in CLI usage
    it("allows registering agents with different casing", () => {
      AgentRegistry.register(
        "TestAgent",
        "Uppercase T",
        (playerId, seed) => new MockAgent(playerId, seed)
      );
      AgentRegistry.register(
        "testagent",
        "Lowercase",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      expect(AgentRegistry.has("TestAgent")).toBe(true);
      expect(AgentRegistry.has("testagent")).toBe(true);
    });
  });

  describe("create()", () => {
    // Verifies factory is invoked with correct arguments and returns a valid agent
    it("creates an agent using the registered factory", () => {
      AgentRegistry.register(
        "TestAgent",
        "A test agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      const agent = AgentRegistry.create("TestAgent", "player1", 12345);

      expect(agent).toBeInstanceOf(MockAgent);
      expect(agent.playerId).toBe("player1");
      expect((agent as MockAgent).seed).toBe(12345);
    });

    // Clear error message helps users identify typos in agent names
    it("throws with helpful message when agent not found", () => {
      AgentRegistry.register(
        "ExistingAgent",
        "An existing agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      expect(() => AgentRegistry.create("NonExistent", "player1", 123)).toThrow(
        'Agent "NonExistent" not found. Available agents: ExistingAgent'
      );
    });

    // Ensures error message lists all available agents when none are registered
    it("throws with empty available list when no agents registered", () => {
      expect(() => AgentRegistry.create("TestAgent", "player1", 123)).toThrow(
        'Agent "TestAgent" not found. Available agents: '
      );
    });
  });

  describe("list()", () => {
    // Returns registration data needed for CLI --list-agents output
    it("returns all registered agents", () => {
      AgentRegistry.register(
        "Agent1",
        "First agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );
      AgentRegistry.register(
        "Agent2",
        "Second agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      const agents = AgentRegistry.list();

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.name).sort()).toEqual(["Agent1", "Agent2"]);
      expect(agents.find((a) => a.name === "Agent1")?.description).toBe(
        "First agent"
      );
    });

    // Empty registry should return empty array, not throw
    it("returns empty array when no agents registered", () => {
      expect(AgentRegistry.list()).toEqual([]);
    });
  });

  describe("listNames()", () => {
    // Convenient method for validation and error messages
    it("returns all registered agent names", () => {
      AgentRegistry.register(
        "Agent1",
        "First agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );
      AgentRegistry.register(
        "Agent2",
        "Second agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      const names = AgentRegistry.listNames();

      expect(names.sort()).toEqual(["Agent1", "Agent2"]);
    });
  });

  describe("has()", () => {
    // Used by CLI to validate user-provided agent names before simulation
    it("returns true for registered agents", () => {
      AgentRegistry.register(
        "TestAgent",
        "A test agent",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      expect(AgentRegistry.has("TestAgent")).toBe(true);
    });

    it("returns false for unregistered agents", () => {
      expect(AgentRegistry.has("NonExistent")).toBe(false);
    });
  });

  describe("clear()", () => {
    // Primarily for testing - ensures isolated test state
    it("removes all registered agents", () => {
      AgentRegistry.register(
        "Agent1",
        "First",
        (playerId, seed) => new MockAgent(playerId, seed)
      );
      AgentRegistry.register(
        "Agent2",
        "Second",
        (playerId, seed) => new MockAgent(playerId, seed)
      );

      AgentRegistry.clear();

      expect(AgentRegistry.list()).toEqual([]);
      expect(AgentRegistry.has("Agent1")).toBe(false);
      expect(AgentRegistry.has("Agent2")).toBe(false);
    });
  });
});

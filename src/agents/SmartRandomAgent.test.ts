import { describe, it, expect } from "vitest";
import { SmartRandomAgent } from "./SmartRandomAgent.js";
import { AgentRegistry } from "./AgentRegistry.js";
import type {
  ActivatePowerPrompt,
  SelectFoodDestinationPrompt,
  SelectPlayerPrompt,
  SelectHabitatPrompt,
  RepeatPowerPrompt,
  SelectBonusCardsPrompt,
  SelectCardsPrompt,
  PlayerView,
  PromptContext,
} from "../types/prompts.js";
import type { BirdCard, BonusCard, PowerSpec } from "../types/core.js";

// Helper to create a minimal PlayerView for testing
function createMinimalPlayerView(playerId: string): PlayerView {
  return {
    playerId,
    hand: [],
    bonusCards: [],
    food: {},
    board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
    actionCubes: 8,
    round: 1,
    turn: 1,
    activePlayerId: playerId,
    birdfeeder: [],
    birdTray: [],
    deckSize: 50,
    opponents: [],
  };
}

// Helper to create a minimal PromptContext for testing
function createMinimalContext(playerId: string): PromptContext {
  return {
    round: 1,
    activePlayerId: playerId,
    trigger: {
      type: "WHEN_ACTIVATED",
      habitat: "FOREST",
      sourceBirdId: "test_bird",
    },
  };
}

// Helper to create a minimal PowerSpec for testing
function createMinimalPowerSpec(): PowerSpec {
  return {
    handlerId: "testHandler",
    trigger: "WHEN_ACTIVATED",
    params: {},
    text: "Test power",
  };
}

// Helper to create a minimal BirdCard for testing
function createMinimalBirdCard(id: string): BirdCard {
  return {
    id,
    name: `Test Bird ${id}`,
    scientificName: "Testus birdus",
    habitats: ["FOREST"],
    power: null,
    victoryPoints: 1,
    nestType: "BOWL",
    eggCapacity: 2,
    foodCost: {},
    foodCostMode: "NONE",
    wingspanCentimeters: 20,
    bonusCards: [],
    flavorText: "",
    countries: [],
    categorization: null,
  };
}

// Helper to create a minimal BonusCard for testing
function createMinimalBonusCard(id: string): BonusCard {
  return {
    id,
    name: `Test Bonus ${id}`,
    condition: "Test condition",
    scoringType: "PER_BIRD",
    scoring: [{ points: 1 }],
    explanatoryText: null,
    percentageOfEligibleBirds: 50,
  };
}

describe("SmartRandomAgent", () => {
  // Ensures basic instantiation works and playerId is accessible
  it("creates an agent with playerId and seed", () => {
    const agent = new SmartRandomAgent("player1", 12345);
    expect(agent.playerId).toBe("player1");
  });

  // Verifies deterministic behavior with same seed
  it("produces deterministic results with the same seed", async () => {
    const agent1 = new SmartRandomAgent("player1", 42);
    const agent2 = new SmartRandomAgent("player1", 42);

    const prompt: SelectHabitatPrompt = {
      promptId: "test-1",
      playerId: "player1",
      kind: "selectHabitat",
      view: createMinimalPlayerView("player1"),
      context: createMinimalContext("player1"),
      eligibleHabitats: ["FOREST", "GRASSLAND", "WETLAND"],
    };

    const choice1 = await agent1.chooseOption(prompt);
    const choice2 = await agent2.chooseOption(prompt);

    expect(choice1).toEqual(choice2);
  });

  // Verifies different seeds produce different results
  it("produces different results with different seeds", async () => {
    const agents = Array.from(
      { length: 10 },
      (_, i) => new SmartRandomAgent("player1", i)
    );

    const prompt: SelectHabitatPrompt = {
      promptId: "test-1",
      playerId: "player1",
      kind: "selectHabitat",
      view: createMinimalPlayerView("player1"),
      context: createMinimalContext("player1"),
      eligibleHabitats: ["FOREST", "GRASSLAND", "WETLAND"],
    };

    const choices = await Promise.all(
      agents.map((agent) => agent.chooseOption(prompt))
    );
    const habitats = choices.map(
      (c) => (c as { habitat: string }).habitat
    );
    const uniqueHabitats = new Set(habitats);

    // With 10 different seeds across 3 options, we should see at least 2 different choices
    expect(uniqueHabitats.size).toBeGreaterThanOrEqual(2);
  });

  describe("activatePower", () => {
    // Verifies that powers are always activated (spec requirement)
    it("always returns activate: true", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: ActivatePowerPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "activatePower",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        birdInstanceId: "test_bird",
        power: createMinimalPowerSpec(),
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("activatePower");
      expect((choice as { activate: boolean }).activate).toBe(true);
    });
  });

  describe("selectFoodDestination", () => {
    // Verifies random selection from destination options
    it("returns a valid destination from options", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: SelectFoodDestinationPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodDestination",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        sourceBirdId: "test_bird",
        food: "SEED",
        destinationOptions: ["PLAYER_SUPPLY", "CACHE_ON_SOURCE_BIRD"],
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectFoodDestination");
      expect(prompt.destinationOptions).toContain(
        (choice as { destination: string }).destination
      );
    });

    // Verifies single option is selected when only one choice
    it("selects the only option when one destination available", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: SelectFoodDestinationPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodDestination",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        sourceBirdId: "test_bird",
        food: "SEED",
        destinationOptions: ["PLAYER_SUPPLY"],
      };

      const choice = await agent.chooseOption(prompt);

      expect((choice as { destination: string }).destination).toBe(
        "PLAYER_SUPPLY"
      );
    });
  });

  describe("selectPlayer", () => {
    // Verifies random selection from eligible players
    it("returns a valid player from eligible players", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: SelectPlayerPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectPlayer",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligiblePlayers: ["player2", "player3", "player4"],
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectPlayer");
      expect(prompt.eligiblePlayers).toContain(
        (choice as { player: string }).player
      );
    });
  });

  describe("selectHabitat", () => {
    // Verifies random selection from eligible habitats
    it("returns a valid habitat from eligible habitats", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: SelectHabitatPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectHabitat",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleHabitats: ["FOREST", "WETLAND"],
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectHabitat");
      expect(prompt.eligibleHabitats).toContain(
        (choice as { habitat: string }).habitat
      );
    });
  });

  describe("repeatPower", () => {
    // Verifies random selection from eligible birds for power repeat
    it("returns a valid bird from eligible birds", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: RepeatPowerPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "repeatPower",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleBirds: ["bird_1", "bird_2", "bird_3"],
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("repeatPower");
      expect(prompt.eligibleBirds).toContain(
        (choice as { bird: string }).bird
      );
    });
  });

  describe("selectBonusCards", () => {
    // Verifies correct number of cards selected from eligible options
    it("returns correct count of cards from eligible cards", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const eligibleCards = [
        createMinimalBonusCard("bonus_1"),
        createMinimalBonusCard("bonus_2"),
        createMinimalBonusCard("bonus_3"),
      ];

      const prompt: SelectBonusCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectBonusCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 2,
        eligibleCards,
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectBonusCards");
      const cards = (choice as { cards: string[] }).cards;
      expect(cards).toHaveLength(2);
      expect(cards.every((id) => eligibleCards.some((c) => c.id === id))).toBe(
        true
      );
    });

    // Verifies no duplicate cards when selecting multiple
    it("does not select duplicate cards", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const eligibleCards = [
        createMinimalBonusCard("bonus_1"),
        createMinimalBonusCard("bonus_2"),
        createMinimalBonusCard("bonus_3"),
      ];

      const prompt: SelectBonusCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectBonusCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 3,
        eligibleCards,
      };

      const choice = await agent.chooseOption(prompt);
      const cards = (choice as { cards: string[] }).cards;
      const uniqueCards = new Set(cards);

      expect(uniqueCards.size).toBe(cards.length);
    });
  });

  describe("selectCards", () => {
    // Verifies correct number of bird cards selected
    it("returns correct count of cards from eligible cards", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const eligibleCards = [
        createMinimalBirdCard("bird_1"),
        createMinimalBirdCard("bird_2"),
        createMinimalBirdCard("bird_3"),
        createMinimalBirdCard("bird_4"),
      ];

      const prompt: SelectCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        mode: "TUCK",
        source: "HAND",
        count: 2,
        eligibleCards,
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectCards");
      const cards = (choice as { cards: string[] }).cards;
      expect(cards).toHaveLength(2);
      expect(cards.every((id) => eligibleCards.some((c) => c.id === id))).toBe(
        true
      );
    });
  });
});

describe("SmartRandomAgent AgentRegistry registration", () => {
  // These tests verify the module self-registers on load.
  // We don't clear the registry here since we need to test the side effect.

  // Verifies the agent self-registers on module load
  it("is registered in the AgentRegistry after module import", () => {
    // The import at the top of this file triggers registration
    expect(AgentRegistry.has("SmartRandomAgent")).toBe(true);

    const registrations = AgentRegistry.list();
    const registration = registrations.find(
      (r) => r.name === "SmartRandomAgent"
    );
    expect(registration).toBeDefined();
    expect(registration?.description).toBe(
      "Constraint-aware random agent with seeded RNG"
    );
  });

  // Verifies the factory creates working agents
  it("creates a working agent through the registry", () => {
    const agent = AgentRegistry.create("SmartRandomAgent", "player1", 12345);

    expect(agent.playerId).toBe("player1");
    expect(agent).toBeInstanceOf(SmartRandomAgent);
  });
});

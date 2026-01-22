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
  SelectFoodFromFeederPrompt,
  SelectFoodFromSupplyPrompt,
  DiscardEggsPrompt,
  PlaceEggsPrompt,
  DiscardFoodPrompt,
  DrawCardsPrompt,
  TurnActionPrompt,
  PlayerView,
  PromptContext,
} from "../types/prompts.js";
import type { BirdCard, BonusCard, PowerSpec, FoodByDice, FoodType } from "../types/core.js";

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

  describe("selectFoodFromFeeder", () => {
    // Verifies agent selects valid dice from available options
    it("selects dice from available options", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const availableDice: FoodByDice = {
        SEED: 2,
        INVERTEBRATE: 1,
        FISH: 1,
      };

      const prompt: SelectFoodFromFeederPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromFeeder",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        availableDice,
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectFoodFromFeeder");
      const result = choice as { diceOrReroll: unknown };
      // Should not be a reroll since dice are varied
      if (result.diceOrReroll !== "reroll") {
        const diceSelections = result.diceOrReroll as Array<{ die: string }>;
        expect(diceSelections.length).toBe(1);
        expect(["SEED", "INVERTEBRATE", "FISH"]).toContain(diceSelections[0].die);
      }
    });

    // Verifies handling of SEED_INVERTEBRATE dice requiring asFoodType
    it("handles SEED_INVERTEBRATE dice with asFoodType", async () => {
      const availableDice: FoodByDice = {
        SEED_INVERTEBRATE: 3,
        FISH: 1,
      };

      const prompt: SelectFoodFromFeederPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromFeeder",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        availableDice,
      };

      // Run multiple times to check SEED_INVERTEBRATE handling
      for (let seed = 0; seed < 20; seed++) {
        const testAgent = new SmartRandomAgent("player1", seed);
        const testChoice = await testAgent.chooseOption(prompt);
        const result = testChoice as { diceOrReroll: unknown };

        if (result.diceOrReroll !== "reroll") {
          const selections = result.diceOrReroll as Array<{
            die: string;
            asFoodType?: string;
          }>;
          for (const sel of selections) {
            if (sel.die === "SEED_INVERTEBRATE") {
              expect(["SEED", "INVERTEBRATE"]).toContain(sel.asFoodType);
            }
          }
        }
      }
    });

    // Verifies reroll is returned when feeder is empty
    it("returns reroll when feeder is empty", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: SelectFoodFromFeederPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromFeeder",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        availableDice: {},
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { diceOrReroll: unknown };

      expect(result.diceOrReroll).toBe("reroll");
    });

    // Verifies agent may choose reroll when all dice show same face
    it("may reroll when all dice show same face", async () => {
      const availableDice: FoodByDice = { SEED: 5 };

      const prompt: SelectFoodFromFeederPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromFeeder",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        availableDice,
      };

      // With many seeds, we expect some rerolls and some takes
      const results = {
        rerolls: 0,
        takes: 0,
      };

      for (let seed = 0; seed < 50; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseOption(prompt);
        const result = choice as { diceOrReroll: unknown };

        if (result.diceOrReroll === "reroll") {
          results.rerolls++;
        } else {
          results.takes++;
        }
      }

      // Should see both behaviors across seeds
      expect(results.rerolls).toBeGreaterThan(0);
      expect(results.takes).toBeGreaterThan(0);
    });
  });

  describe("selectFoodFromSupply", () => {
    // Verifies agent selects correct count from allowed foods
    it("selects correct count from allowed foods", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const allowedFoods: FoodType[] = ["SEED", "INVERTEBRATE", "FISH"];

      const prompt: SelectFoodFromSupplyPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromSupply",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 3,
        allowedFoods,
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("selectFoodFromSupply");
      const result = choice as { food: Record<string, number> };

      const totalFood = Object.values(result.food).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalFood).toBe(3);

      // All selected food should be from allowed foods
      for (const foodType of Object.keys(result.food)) {
        expect(allowedFoods).toContain(foodType);
      }
    });

    // Verifies agent can select same food type multiple times (with replacement)
    it("can select same food type multiple times", async () => {
      const agent = new SmartRandomAgent("player1", 42);

      const prompt: SelectFoodFromSupplyPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "selectFoodFromSupply",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 5,
        allowedFoods: ["SEED", "INVERTEBRATE"],
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { food: Record<string, number> };

      const totalFood = Object.values(result.food).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalFood).toBe(5);
    });
  });

  describe("discardEggs", () => {
    // Verifies agent distributes egg discards across eligible birds correctly
    it("distributes discards respecting available eggs", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: DiscardEggsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "discardEggs",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 3,
        eggsByEligibleBird: {
          bird_1: 2,
          bird_2: 3,
          bird_3: 1,
        },
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("discardEggs");
      const result = choice as { sources: Record<string, number> };

      // Total discarded should match count
      const totalDiscarded = Object.values(result.sources).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalDiscarded).toBe(3);

      // Each bird's discards should not exceed available eggs
      for (const [birdId, count] of Object.entries(result.sources)) {
        const available = prompt.eggsByEligibleBird[birdId] || 0;
        expect(count).toBeLessThanOrEqual(available);
      }
    });

    // Verifies all eggs are discarded when count equals total available
    it("handles discarding all available eggs", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: DiscardEggsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "discardEggs",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 5,
        eggsByEligibleBird: {
          bird_1: 2,
          bird_2: 3,
        },
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { sources: Record<string, number> };

      const totalDiscarded = Object.values(result.sources).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalDiscarded).toBe(5);
    });
  });

  describe("placeEggs", () => {
    // Verifies agent distributes egg placements respecting capacities
    it("distributes placements respecting remaining capacities", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: PlaceEggsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "placeEggs",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 4,
        remainingCapacitiesByEligibleBird: {
          bird_1: 2,
          bird_2: 3,
          bird_3: 1,
        },
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("placeEggs");
      const result = choice as { placements: Record<string, number> };

      // Total placed should match count
      const totalPlaced = Object.values(result.placements).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalPlaced).toBe(4);

      // Each bird's placements should not exceed remaining capacity
      for (const [birdId, count] of Object.entries(result.placements)) {
        const capacity = prompt.remainingCapacitiesByEligibleBird[birdId] || 0;
        expect(count).toBeLessThanOrEqual(capacity);
      }
    });

    // Verifies placement when capacity is limited
    it("fills to capacity when needed", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: PlaceEggsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "placeEggs",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        count: 6,
        remainingCapacitiesByEligibleBird: {
          bird_1: 3,
          bird_2: 3,
        },
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { placements: Record<string, number> };

      const totalPlaced = Object.values(result.placements).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalPlaced).toBe(6);
    });
  });

  describe("discardFood", () => {
    // Verifies agent returns exact food cost for specific types
    it("returns correct food for specific costs", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const view = createMinimalPlayerView("player1");
      view.food = { SEED: 3, INVERTEBRATE: 2, FISH: 1 };

      const prompt: DiscardFoodPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "discardFood",
        view,
        context: createMinimalContext("player1"),
        foodCost: { SEED: 2 },
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("discardFood");
      const result = choice as { food: Record<string, number> };

      expect(result.food.SEED).toBe(2);
    });

    // Verifies agent handles WILD costs by selecting from available food
    it("handles WILD cost by selecting from available food", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const view = createMinimalPlayerView("player1");
      view.food = { SEED: 2, INVERTEBRATE: 1, FISH: 1 };

      const prompt: DiscardFoodPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "discardFood",
        view,
        context: createMinimalContext("player1"),
        foodCost: { WILD: 2 },
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { food: Record<string, number> };

      // Should not include WILD in the response - actual food types only
      expect(result.food.WILD).toBeUndefined();

      // Total food discarded should match the WILD cost
      const totalDiscarded = Object.values(result.food).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalDiscarded).toBe(2);

      // All discarded food should be from player's supply
      for (const [foodType, count] of Object.entries(result.food)) {
        const available = view.food[foodType as FoodType] || 0;
        expect(count).toBeLessThanOrEqual(available);
      }
    });

    // Verifies agent handles mixed specific + WILD costs
    it("handles mixed specific and WILD costs", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const view = createMinimalPlayerView("player1");
      view.food = { SEED: 2, INVERTEBRATE: 2, FISH: 1 };

      const prompt: DiscardFoodPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "discardFood",
        view,
        context: createMinimalContext("player1"),
        foodCost: { SEED: 1, WILD: 1 },
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { food: Record<string, number> };

      // Should include exactly 1 SEED (the specific cost)
      expect(result.food.SEED).toBeGreaterThanOrEqual(1);

      // Total should be 2 (1 SEED + 1 WILD satisfied by any food)
      const totalDiscarded = Object.values(result.food).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
      expect(totalDiscarded).toBe(2);
    });
  });

  describe("drawCards", () => {
    // Verifies agent draws random mix of tray and deck cards
    it("returns valid mix of tray cards and deck cards up to remaining", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const trayCards = [
        createMinimalBirdCard("tray_bird_1"),
        createMinimalBirdCard("tray_bird_2"),
        createMinimalBirdCard("tray_bird_3"),
      ];

      const prompt: DrawCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "drawCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        remaining: 2,
        trayCards,
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.kind).toBe("drawCards");
      const result = choice as { trayCards: string[]; numDeckCards: number };

      // Total cards should equal remaining
      expect(result.trayCards.length + result.numDeckCards).toBe(2);

      // Tray cards should be from the prompt's tray
      for (const cardId of result.trayCards) {
        expect(trayCards.some((c) => c.id === cardId)).toBe(true);
      }
    });

    // Verifies agent draws only from deck when tray is empty
    it("draws only from deck when tray is empty", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: DrawCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "drawCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        remaining: 3,
        trayCards: [],
      };

      const choice = await agent.chooseOption(prompt);
      const result = choice as { trayCards: string[]; numDeckCards: number };

      expect(result.trayCards).toEqual([]);
      expect(result.numDeckCards).toBe(3);
    });

    // Verifies agent may draw all from tray, all from deck, or mix
    it("produces varied distributions across seeds", async () => {
      const trayCards = [
        createMinimalBirdCard("tray_1"),
        createMinimalBirdCard("tray_2"),
        createMinimalBirdCard("tray_3"),
      ];

      const prompt: DrawCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "drawCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        remaining: 2,
        trayCards,
      };

      const distributions = new Set<string>();

      for (let seed = 0; seed < 30; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseOption(prompt);
        const result = choice as { trayCards: string[]; numDeckCards: number };
        distributions.add(`tray:${result.trayCards.length},deck:${result.numDeckCards}`);
      }

      // With 30 seeds, we should see at least 2 different distributions
      expect(distributions.size).toBeGreaterThanOrEqual(2);
    });

    // Verifies tray cards are unique (no duplicates when drawing multiple)
    it("does not select duplicate tray cards", async () => {
      const trayCards = [
        createMinimalBirdCard("tray_1"),
        createMinimalBirdCard("tray_2"),
        createMinimalBirdCard("tray_3"),
      ];

      const prompt: DrawCardsPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "drawCards",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        remaining: 3,
        trayCards,
      };

      for (let seed = 0; seed < 20; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseOption(prompt);
        const result = choice as { trayCards: string[]; numDeckCards: number };
        const uniqueCards = new Set(result.trayCards);
        expect(uniqueCards.size).toBe(result.trayCards.length);
      }
    });
  });

  describe("turnAction (chooseTurnAction)", () => {
    // Verifies agent picks a valid action from eligible actions
    it("returns a valid action from eligible actions", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: TurnActionPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "turnAction",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleActions: ["GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          PLAY_BIRD: { reward: { type: "FOOD", count: 0 } },
        },
      };

      const choice = await agent.chooseTurnAction(prompt);

      expect(choice.kind).toBe("turnAction");
      expect(prompt.eligibleActions).toContain(choice.action);
    });

    // Verifies agent selects from limited eligible actions correctly
    it("only selects from eligible actions when limited", async () => {
      const prompt: TurnActionPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "turnAction",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleActions: ["GAIN_FOOD", "DRAW_CARDS"], // LAY_EGGS and PLAY_BIRD excluded
        rewardsByAction: {
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          PLAY_BIRD: { reward: { type: "FOOD", count: 0 } },
        },
      };

      // Run with multiple seeds to ensure we never pick ineligible actions
      for (let seed = 0; seed < 30; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseTurnAction(prompt);
        expect(["GAIN_FOOD", "DRAW_CARDS"]).toContain(choice.action);
        expect(choice.action).not.toBe("LAY_EGGS");
        expect(choice.action).not.toBe("PLAY_BIRD");
      }
    });

    // Verifies takeBonus is false when no bonus is available
    it("returns takeBonus false when no bonus available", async () => {
      const agent = new SmartRandomAgent("player1", 12345);

      const prompt: TurnActionPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "turnAction",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleActions: ["GAIN_FOOD"],
        rewardsByAction: {
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } }, // No bonus
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          PLAY_BIRD: { reward: { type: "FOOD", count: 0 } },
        },
      };

      const choice = await agent.chooseTurnAction(prompt);

      expect(choice.action).toBe("GAIN_FOOD");
      expect(choice.takeBonus).toBe(false);
    });

    // Verifies takeBonus can be true or false when bonus is available
    it("randomly decides takeBonus when bonus is available", async () => {
      const prompt: TurnActionPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "turnAction",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleActions: ["GAIN_FOOD"],
        rewardsByAction: {
          GAIN_FOOD: {
            reward: { type: "FOOD", count: 2 },
            bonus: {
              cost: { type: "CARDS", count: 1 },
              reward: { type: "FOOD", count: 1 },
            },
          },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          PLAY_BIRD: { reward: { type: "FOOD", count: 0 } },
        },
      };

      const results = { true: 0, false: 0 };

      for (let seed = 0; seed < 50; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseTurnAction(prompt);
        results[choice.takeBonus ? "true" : "false"]++;
      }

      // Should see both true and false across seeds
      expect(results.true).toBeGreaterThan(0);
      expect(results.false).toBeGreaterThan(0);
    });

    // Verifies all eligible actions can be selected with varying seeds
    it("selects varied actions across seeds", async () => {
      const prompt: TurnActionPrompt = {
        promptId: "test-1",
        playerId: "player1",
        kind: "turnAction",
        view: createMinimalPlayerView("player1"),
        context: createMinimalContext("player1"),
        eligibleActions: ["GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS", "PLAY_BIRD"],
        rewardsByAction: {
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          PLAY_BIRD: { reward: { type: "FOOD", count: 0 } },
        },
      };

      const selectedActions = new Set<string>();

      for (let seed = 0; seed < 50; seed++) {
        const agent = new SmartRandomAgent("player1", seed);
        const choice = await agent.chooseTurnAction(prompt);
        selectedActions.add(choice.action);
      }

      // With 50 seeds and 4 options, we should see at least 3 different actions
      expect(selectedActions.size).toBeGreaterThanOrEqual(3);
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

/**
 * Scenario tests for the gainFoodHandler turn action.
 *
 * Tests cover:
 * - Basic food gain from birdfeeder (single die)
 * - Food gain with SEED_INVERTEBRATE die selection
 * - Birdfeeder reroll when all dice show same face
 * - Food gain with habitat bonus (trade cards for food)
 * - Brown power chain triggers after gain food action
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  playerHasFood,
  playerHasTotalFood,
  playerHandSize,
  eventWasEmitted,
  handlerWasInvoked,
  custom,
} from "../../assertions.js";

describe("gainFoodHandler", () => {
  /**
   * Tests basic food gain from the birdfeeder.
   * With 0 birds in FOREST, player gets 1 food (base reward for column 0).
   * The first die in the birdfeeder array is the only one offered.
   */
  it("gains single food from birdfeeder with empty forest", async () => {
    const scenario: ScenarioConfig = {
      name: "Basic food gain",
      description: "Player gains 1 food from birdfeeder with empty forest",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice gains food",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // With empty FOREST (column 0), only 1 die is offered - the first in array
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have gained 1 SEED
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),

        // Verify HABITAT_ACTIVATED event was emitted for FOREST
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" && e.habitat === "FOREST" && e.playerId === "alice"
        ),
      ],
    });
  });

  /**
   * Tests food gain with 2 birds in FOREST.
   * With 2 birds, leftmost empty column is 2, which gives base reward of 2 food.
   * Uses hooded_warbler which has no power (power: null) to avoid triggering brown powers.
   */
  it("gains multiple food with birds in forest", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple food gain",
      description: "Player gains 2 food from birdfeeder with 2 birds in forest",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Use hooded_warbler and prothonotary_warbler - FOREST birds with no power
            FOREST: [
              { cardId: "hooded_warbler", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
            ],
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
          label: "Alice gains food",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // First food selection - first die offered is SEED
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Second food selection - after SEED is taken, INVERTEBRATE is first
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have gained 1 SEED and 1 INVERTEBRATE
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests SEED_INVERTEBRATE die selection as SEED.
   * The SEED_INVERTEBRATE die requires asFoodType to specify which food is gained.
   */
  it("handles SEED_INVERTEBRATE die selected as SEED", async () => {
    const scenario: ScenarioConfig = {
      name: "SEED_INVERTEBRATE as SEED",
      description: "Player selects SEED_INVERTEBRATE die and chooses SEED",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice selects SEED_INVERTEBRATE as SEED",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Select SEED_INVERTEBRATE die, choosing SEED as the food type
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED_INVERTEBRATE", asFoodType: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED_INVERTEBRATE", "FISH", "FRUIT", "RODENT", "SEED"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have gained 1 SEED from the SEED_INVERTEBRATE die
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 0 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests SEED_INVERTEBRATE die selection as INVERTEBRATE.
   */
  it("handles SEED_INVERTEBRATE die selected as INVERTEBRATE", async () => {
    const scenario: ScenarioConfig = {
      name: "SEED_INVERTEBRATE as INVERTEBRATE",
      description: "Player selects SEED_INVERTEBRATE die and chooses INVERTEBRATE",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice selects SEED_INVERTEBRATE as INVERTEBRATE",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Select SEED_INVERTEBRATE die, choosing INVERTEBRATE as the food type
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED_INVERTEBRATE", asFoodType: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED_INVERTEBRATE", "FISH", "FRUIT", "RODENT", "SEED"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have gained 1 INVERTEBRATE from the SEED_INVERTEBRATE die
        playerHasFood("alice", { SEED: 0, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests birdfeeder reroll when all dice show the same face.
   * The player can choose to reroll instead of taking a die.
   */
  it("allows reroll when all dice show same face", async () => {
    const scenario: ScenarioConfig = {
      name: "Birdfeeder reroll",
      description: "Player rerolls birdfeeder when all dice show SEED",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice rerolls then gains food",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // First choice: reroll (all dice show SEED)
            { kind: "selectFoodFromFeeder", diceOrReroll: "reroll" },
            // After reroll with seed 12345, birdfeeder becomes [FISH, RODENT, RODENT, RODENT, SEED_INVERTEBRATE]
            // The first die offered is FISH
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] },
          ],
        },
      ],

      // All dice show SEED - enables reroll
      birdfeeder: ["SEED", "SEED", "SEED", "SEED", "SEED"],
      seed: 12345,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify REROLL_BIRDFEEDER effect was applied
        custom("REROLL_BIRDFEEDER effect was applied", (ctx) => {
          const rerollEffects = ctx.effects.filter(
            (e) => e.type === "REROLL_BIRDFEEDER"
          );
          if (rerollEffects.length === 0) {
            throw new Error("Expected REROLL_BIRDFEEDER effect to be applied");
          }
        }),

        // Alice should have gained FISH from the rerolled feeder
        playerHasFood("alice", { FISH: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests habitat bonus: trade 1 card from hand to gain 1 extra food.
   * The bonus is only available at certain columns: 1, 3, 5 (see player_board.json).
   * With 1 bird in FOREST, the leftmost empty column is 1, which has a bonus slot.
   * Uses hooded_warbler which has no power to avoid brown power triggers.
   */
  it("applies habitat bonus: trade card for extra food", async () => {
    const scenario: ScenarioConfig = {
      name: "Habitat bonus food gain",
      description: "Player trades 1 card to gain 1 extra food",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: ["barn_swallow"], // 1 card to trade for bonus
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Need 1 bird to be at column 1 where bonus is available
            FOREST: [{ cardId: "hooded_warbler", eggs: 0 }],
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
          label: "Alice uses habitat bonus",
          choices: [
            // Request bonus with takeBonus: true
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: true },
            // Select card to discard for bonus
            { kind: "selectCards", cards: ["barn_swallow"] },
            // With 1 bird, column 1 has base reward 1 + bonus 1 = 2 food
            // First food selection (base reward)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Second food selection (bonus reward)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have gained 2 food (1 base + 1 bonus)
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),

        // Alice's hand should be empty (discarded for bonus)
        playerHandSize("alice", 0),

        // Verify DISCARD_CARDS effect was emitted
        (ctx) => {
          const discardEffects = ctx.effects.filter(
            (e) => e.type === "DISCARD_CARDS" && e.playerId === "alice"
          );
          if (discardEffects.length === 0) {
            throw new Error("Expected DISCARD_CARDS effect for bonus trade");
          }
        },
      ],
    });
  });

  /**
   * Tests that brown power chain triggers after gain food action.
   * Uses blue_gray_gnatcatcher which has gainFoodFromSupply (INVERTEBRATE, 1).
   */
  it("triggers brown power chain after food gain", async () => {
    const scenario: ScenarioConfig = {
      name: "Brown power chain",
      description: "Brown powers trigger after GAIN_FOOD habitat activation",
      targetHandlers: ["gainFoodHandler", "gainFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "blue_gray_gnatcatcher", eggs: 0 }],
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
          label: "Alice gains food, triggering brown power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // With 1 bird in FOREST (column 1), still get 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Blue-gray Gnatcatcher power: choose to activate
            { kind: "activatePower", activate: true },
            // Select food from supply (power gives INVERTEBRATE)
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify brown power handler was invoked
        handlerWasInvoked("gainFoodFromSupply"),

        // Alice should have SEED from feeder + INVERTEBRATE from power
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests declining optional brown power after food gain.
   */
  it("allows declining brown power after food gain", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline brown power",
      description: "Player declines optional brown power after food gain",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "blue_gray_gnatcatcher", eggs: 0 }],
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
          label: "Alice declines brown power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Decline the brown power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should only have SEED from feeder, not INVERTEBRATE from power
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 0 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that an empty birdfeeder doesn't crash and player gains no food.
   * This is an edge case where birdfeeder was emptied somehow.
   */
  it("handles empty birdfeeder gracefully", async () => {
    const scenario: ScenarioConfig = {
      name: "Empty birdfeeder",
      description: "Player attempts to gain food from empty birdfeeder",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice tries to gain food from empty feeder",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // No food selection needed - feeder is empty
          ],
        },
      ],

      // Empty birdfeeder
      birdfeeder: [],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have no food (empty feeder)
        playerHasTotalFood("alice", 0),

        // HABITAT_ACTIVATED should still fire
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" && e.habitat === "FOREST"
        ),
      ],
    });
  });
});

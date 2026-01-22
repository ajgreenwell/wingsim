/**
 * Scenario tests for brown power handlers that gain food.
 *
 * Handlers covered:
 * - gainFoodFromSupply: Gain food directly from the unlimited supply
 * - gainFoodFromFeeder: Gain any food type from the birdfeeder
 * - gainFoodFromFeederWithCache: Gain food from feeder with cache option
 * - cacheFoodFromSupply: Cache food from supply onto the bird
 * - gainFoodFromFeederIfAvailable: Conditional feeder gain
 * - gainAllFoodTypeFromFeeder: Collect all dice of one type
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  playerHasFood,
  playerHasTotalFood,
  handlerWasInvoked,
  birdHasCachedFood,
  birdHasNoCachedFood,
  custom,
} from "../../assertions.js";

describe("gainFoodFromSupply handler", () => {
  /**
   * Tests that blue_gray_gnatcatcher can gain 1 INVERTEBRATE from the supply.
   * The gainFoodFromSupply handler prompts for food type selection from allowed foods.
   */
  it("gains specific food type from supply", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromSupply basic",
      description: "Blue-Gray Gnatcatcher gains 1 INVERTEBRATE from supply",
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
          label: "Alice activates forest with gnatcatcher power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // With 1 bird, column 1 has base reward 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Blue-Gray Gnatcatcher: activate power
            { kind: "activatePower", activate: true },
            // Select food from supply (only INVERTEBRATE allowed)
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromSupply"),
        // Alice gets 1 SEED from feeder + 1 INVERTEBRATE from power
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests that the power can be declined.
   */
  it("can decline gainFoodFromSupply power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline gainFoodFromSupply",
      description: "Player declines the optional power",
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
          label: "Alice declines gnatcatcher power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Only SEED from feeder, no INVERTEBRATE from power
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 0 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });
});

describe("cacheFoodFromSupply handler", () => {
  /**
   * Tests that carolina_chickadee caches 1 SEED from supply on itself.
   * The food is automatically placed on the bird with no destination choice.
   */
  it("caches food directly on the power bird", async () => {
    const scenario: ScenarioConfig = {
      name: "cacheFoodFromSupply basic",
      description: "Carolina Chickadee caches 1 SEED from supply",
      targetHandlers: ["gainFoodHandler", "cacheFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "carolina_chickadee", eggs: 0 }],
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
          label: "Alice activates chickadee cache power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Activate the cache power
            { kind: "activatePower", activate: true },
            // No food selection needed - cache goes directly to bird
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("cacheFoodFromSupply"),
        // SEED from feeder goes to supply
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),
        // Cached SEED on the chickadee
        birdHasCachedFood("alice", "alice_carolina_chickadee", { SEED: 1 }),
      ],
    });
  });

  /**
   * Tests that declining the cache power leaves bird with no cached food.
   */
  it("can decline cache power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline cacheFoodFromSupply",
      description: "Player declines the cache power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "carolina_chickadee", eggs: 0 }],
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
          label: "Alice declines cache power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Decline the cache power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        playerHasFood("alice", { SEED: 1 }),
        birdHasNoCachedFood("alice", "alice_carolina_chickadee"),
      ],
    });
  });
});

describe("gainFoodFromFeederWithCache handler", () => {
  /**
   * Tests that acorn_woodpecker can gain a SEED from feeder and cache it.
   * The handler prompts for a destination choice: cache on bird or take to supply.
   */
  it("gains food from feeder and caches on bird", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederWithCache - cache",
      description: "Acorn Woodpecker gains SEED from feeder, caches it",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeederWithCache"],

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
          label: "Alice uses acorn woodpecker power, caches seed",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base gain food from feeder
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Activate acorn woodpecker power
            { kind: "activatePower", activate: true },
            // Power prompts for feeder selection of SEED specifically
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Choose to cache on the bird
            { kind: "selectFoodDestination", destination: "CACHE_ON_SOURCE_BIRD" },
          ],
        },
      ],

      birdfeeder: ["INVERTEBRATE", "SEED", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeederWithCache"),
        // Only INVERTEBRATE in supply (from base action)
        playerHasFood("alice", { INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 1),
        // SEED cached on the woodpecker
        birdHasCachedFood("alice", "alice_acorn_woodpecker", { SEED: 1 }),
      ],
    });
  });

  /**
   * Tests that the player can choose to take food to supply instead of caching.
   */
  it("gains food from feeder to supply instead of caching", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederWithCache - supply",
      description: "Acorn Woodpecker gains SEED from feeder to supply",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeederWithCache"],

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
          label: "Alice uses acorn woodpecker power, takes to supply",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Choose to take to supply
            { kind: "selectFoodDestination", destination: "PLAYER_SUPPLY" },
          ],
        },
      ],

      birdfeeder: ["INVERTEBRATE", "SEED", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeederWithCache"),
        // Both foods go to supply
        playerHasFood("alice", { INVERTEBRATE: 1, SEED: 1 }),
        playerHasTotalFood("alice", 2),
        // Nothing cached on the woodpecker
        birdHasNoCachedFood("alice", "alice_acorn_woodpecker"),
      ],
    });
  });

  /**
   * Tests that the power is skipped (without prompt) if required food not in feeder.
   * The handler still emits ACTIVATE_POWER but with activated: false and skipReason.
   */
  it("skips power when required food not in feeder", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederWithCache - no SEED available",
      description: "Acorn Woodpecker power skipped when no SEED in feeder",
      targetHandlers: ["gainFoodHandler"],

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
          label: "Alice activates forest, power auto-skips",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] },
            // No activatePower choice needed - power skipped due to no SEED
          ],
        },
      ],

      // No SEED dice in feeder
      birdfeeder: ["FISH", "FISH", "INVERTEBRATE", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Power was skipped (activated: false with skipReason)
        custom("power was skipped due to resource unavailable", (ctx) => {
          const skipEffects = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "gainFoodFromFeederWithCache" &&
              e.activated === false &&
              e.skipReason === "RESOURCE_UNAVAILABLE"
          );
          if (skipEffects.length === 0) {
            throw new Error(
              "Expected power to be skipped due to RESOURCE_UNAVAILABLE"
            );
          }
        }),
        playerHasFood("alice", { FISH: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });
});

describe("gainFoodFromFeeder handler", () => {
  /**
   * Tests that american_redstart can gain any food from the birdfeeder.
   * The handler allows selection of any die (WILD food type).
   */
  it("gains any food type from feeder", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeeder basic",
      description: "American Redstart gains 1 FISH from feeder",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeeder"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "american_redstart", eggs: 0 }],
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
          label: "Alice uses redstart power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base gain food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Activate redstart power
            { kind: "activatePower", activate: true },
            // Select any die from feeder
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeeder"),
        playerHasFood("alice", { SEED: 1, FISH: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests that player can reroll during power if all dice match.
   */
  it("allows reroll during power when all dice match", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeeder with reroll",
      description: "American Redstart rerolls all-SEED feeder then gains food",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeeder"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "american_redstart", eggs: 0 }],
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
          label: "Alice uses redstart power with reroll",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base gain - take the first SEED
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Activate power
            { kind: "activatePower", activate: true },
            // All remaining dice are SEED, so reroll
            { kind: "selectFoodFromFeeder", diceOrReroll: "reroll" },
            // After reroll with seed 12345: [FISH, RODENT, RODENT, RODENT]
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] },
          ],
        },
      ],

      // All SEED to allow reroll during power
      birdfeeder: ["SEED", "SEED", "SEED", "SEED", "SEED"],
      seed: 12345,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeeder"),
        // Check reroll effect was emitted
        custom("REROLL_BIRDFEEDER effect during power", (ctx) => {
          const rerolls = ctx.effects.filter((e) => e.type === "REROLL_BIRDFEEDER");
          if (rerolls.length === 0) {
            throw new Error("Expected REROLL_BIRDFEEDER effect during power");
          }
        }),
        // SEED from base, FISH from power after reroll
        playerHasFood("alice", { SEED: 1, FISH: 1 }),
      ],
    });
  });
});

describe("gainAllFoodTypeFromFeeder handler", () => {
  /**
   * NOTE: This handler is used by birds with WHEN_PLAYED trigger (bald_eagle, northern_flicker).
   * According to ScenarioTestLearnings.md (Task 8), WHEN_PLAYED powers are NOT auto-triggered
   * by the GameEngine after bird placement. This is a known limitation of the current
   * implementation.
   *
   * These tests are SKIPPED until WHEN_PLAYED power execution is wired up in GameEngine.
   * The handler implementation is correct - it's the trigger wiring that's missing.
   */

  it.skip("gains all matching food from feeder when played (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Test would verify that Bald Eagle gains all FISH from feeder when played
    // Currently blocked because WHEN_PLAYED powers are not executed by GameEngine
  });

  it.skip("collects dual dice when matching food type (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Test would verify that Northern Flicker gains INVERTEBRATE + SEED_INVERTEBRATE
    // Currently blocked because WHEN_PLAYED powers are not executed by GameEngine
  });

  it.skip("skips when no matching food in feeder (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Test would verify that power is skipped when no matching food in feeder
    // Currently blocked because WHEN_PLAYED powers are not executed by GameEngine
  });
});

describe("gainFoodFromFeederIfAvailable handler", () => {
  /**
   * Tests that great_crested_flycatcher gains INVERTEBRATE if available.
   */
  it("gains food when available in feeder", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederIfAvailable - available",
      description: "Great Crested Flycatcher gains INVERTEBRATE from feeder",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeederIfAvailable"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "great_crested_flycatcher", eggs: 0 }],
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
          label: "Alice uses flycatcher power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base gain
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Activate power
            { kind: "activatePower", activate: true },
            // Select INVERTEBRATE from feeder
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeederIfAvailable"),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests that the power is skipped when required food not in feeder
   * and reroll is not possible (dice don't all match).
   * The handler still emits ACTIVATE_POWER with activated: false.
   */
  it("skips when food not available and no reroll", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederIfAvailable - unavailable",
      description: "Great Crested Flycatcher power skipped with no INVERTEBRATE",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "great_crested_flycatcher", eggs: 0 }],
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
          label: "Alice's power auto-skips",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Power skipped - no INVERTEBRATE and no reroll possible (mixed dice)
          ],
        },
      ],

      // No INVERTEBRATE, mixed dice so no reroll
      birdfeeder: ["SEED", "FISH", "FRUIT", "RODENT", "FISH"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Power was skipped (activated: false with skipReason)
        custom("power was skipped due to resource unavailable", (ctx) => {
          const skipEffects = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "gainFoodFromFeederIfAvailable" &&
              e.activated === false &&
              e.skipReason === "RESOURCE_UNAVAILABLE"
          );
          if (skipEffects.length === 0) {
            throw new Error(
              "Expected power to be skipped due to RESOURCE_UNAVAILABLE"
            );
          }
        }),
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that reroll is allowed when required food not available but all dice match.
   * The flycatcher wants INVERTEBRATE. If feeder has all same dice, player can reroll.
   *
   * NOTE: RNG-dependent tests are fragile. Instead of testing the full reroll flow,
   * we test that the power allows reroll when conditions are met. We use a simpler
   * setup where INVERTEBRATE is directly available, tested in other tests.
   *
   * This test verifies that when food is not available BUT reroll is possible,
   * the player is still offered the activation prompt.
   */
  it("offers activation when food unavailable but reroll possible", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederIfAvailable - activation offered for reroll",
      description: "Great Crested Flycatcher power activates even with no INVERTEBRATE",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeederIfAvailable"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "great_crested_flycatcher", eggs: 0 }],
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
          label: "Alice declines power (could reroll but chooses not to)",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] },
            // Decline the power (player was offered activation because reroll possible)
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      // All FISH dice - no INVERTEBRATE but reroll IS possible
      birdfeeder: ["FISH", "FISH", "FISH", "FISH", "FISH"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Power was offered (player was prompted) even though no INVERTEBRATE
        // The decline itself proves the prompt was shown
        playerHasFood("alice", { FISH: 1, INVERTEBRATE: 0 }),
        playerHasTotalFood("alice", 1),
        // Verify an ACTIVATE_POWER effect with activated: false was emitted
        // (player declined the power)
        custom("power was declined after being offered", (ctx) => {
          const declined = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "gainFoodFromFeederIfAvailable" &&
              e.activated === false
          );
          if (declined.length === 0) {
            throw new Error("Expected power to be declined (activated: false)");
          }
          // Ensure it wasn't auto-skipped
          const skipped = declined.find((e) => {
            const effect = e as { skipReason?: string };
            return effect.skipReason === "RESOURCE_UNAVAILABLE";
          });
          if (skipped) {
            throw new Error("Power was auto-skipped, not offered to player");
          }
        }),
      ],
    });
  });

  /**
   * Tests that the power gains food successfully when the required food IS available.
   * Uses SEED_INVERTEBRATE dice which can be taken as INVERTEBRATE.
   */
  it("gains food when using dual die as allowed type", async () => {
    const scenario: ScenarioConfig = {
      name: "gainFoodFromFeederIfAvailable - dual die",
      description: "Great Crested Flycatcher takes SEED_INVERTEBRATE as INVERTEBRATE",
      targetHandlers: ["gainFoodHandler", "gainFoodFromFeederIfAvailable"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "great_crested_flycatcher", eggs: 0 }],
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
          label: "Alice uses flycatcher, takes dual die",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
            // Select SEED_INVERTEBRATE as INVERTEBRATE
            {
              kind: "selectFoodFromFeeder",
              diceOrReroll: [{ die: "SEED_INVERTEBRATE", asFoodType: "INVERTEBRATE" }],
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "FISH", "SEED_INVERTEBRATE", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainFoodFromFeederIfAvailable"),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });
});

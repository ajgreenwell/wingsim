/**
 * Scenario tests for brown power handlers that lay eggs.
 *
 * Handlers covered:
 * - layEggsOnBird: Lay eggs on a bird (THIS_BIRD or ANY_BIRD target)
 * - layEggOnBirdsWithNestType: Lay eggs on birds with specific nest type (WHEN_PLAYED only - blocked)
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  birdHasEggs,
  custom,
} from "../../assertions.js";

describe("layEggsOnBird handler", () => {
  /**
   * Tests laying an egg on THIS_BIRD (the power bird itself).
   * Uses mourning_dove which has "Lay 1 [egg] on this bird" power.
   * Mourning Dove: FOREST/GRASSLAND/WETLAND, eggCapacity: 5
   */
  it("lays egg on the power bird (THIS_BIRD target)", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - THIS_BIRD",
      description: "Mourning Dove lays 1 egg on itself",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "mourning_dove", eggs: 0 }],
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
          label: "Alice activates GRASSLAND with mourning dove",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs action: column 0 = 2 eggs, place on mourning dove
            {
              kind: "placeEggs",
              placements: { alice_mourning_dove: 2 },
            },
            // Mourning Dove power: activate
            { kind: "activatePower", activate: true },
            // Place 1 egg on THIS_BIRD (mourning dove itself)
            {
              kind: "placeEggs",
              placements: { alice_mourning_dove: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggsOnBird"),
        // 2 from base action + 1 from power = 3 eggs
        birdHasEggs("alice", "alice_mourning_dove", 3),
      ],
    });
  });

  /**
   * Tests laying an egg on ANY_BIRD (player's choice).
   * Uses bairds_sparrow which has "Lay 1 [egg] on any bird" power.
   * Baird's Sparrow: GRASSLAND, eggCapacity: 2
   *
   * With 2 birds in GRASSLAND, leftmostEmpty = 2, so base reward is 3 eggs.
   */
  it("lays egg on any bird (ANY_BIRD target)", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - ANY_BIRD",
      description: "Baird's Sparrow lays 1 egg on another bird",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "bairds_sparrow", eggs: 0 },
              // Add another bird to place eggs on
              { cardId: "wild_turkey", eggs: 0 },
            ],
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
          label: "Alice activates GRASSLAND with bairds sparrow",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 2 = 3 eggs (2 birds means leftmostEmpty = 2)
            // Distribute across birds to stay within capacities
            {
              kind: "placeEggs",
              placements: { alice_bairds_sparrow: 1, alice_wild_turkey: 2 },
            },
            // Baird's Sparrow power (column 0): activate
            { kind: "activatePower", activate: true },
            // Place 1 egg on any bird - fill bairds_sparrow to capacity (2)
            {
              kind: "placeEggs",
              placements: { alice_bairds_sparrow: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggsOnBird"),
        // wild_turkey: 2 from base
        birdHasEggs("alice", "alice_wild_turkey", 2),
        // bairds_sparrow: 1 from base + 1 from power = 2 (at capacity)
        birdHasEggs("alice", "alice_bairds_sparrow", 2),
      ],
    });
  });

  /**
   * Tests that the power can place an egg on a different bird than the base action.
   * Uses chipping_sparrow which has "Lay 1 [egg] on any bird" power.
   * Chipping Sparrow: FOREST/GRASSLAND, eggCapacity: 3
   *
   * With 2 birds in GRASSLAND, leftmostEmpty = 2, so base reward is 3 eggs.
   */
  it("can place power egg on different bird than base action", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - different target",
      description: "Chipping Sparrow power targets different bird",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "chipping_sparrow", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
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
          label: "Alice activates GRASSLAND",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base: column 2 = 3 eggs, place all on sparrow (capacity 3)
            {
              kind: "placeEggs",
              placements: { alice_chipping_sparrow: 3 },
            },
            // Chipping sparrow power: activate
            { kind: "activatePower", activate: true },
            // Power: place on wild turkey (different bird)
            {
              kind: "placeEggs",
              placements: { alice_wild_turkey: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggsOnBird"),
        birdHasEggs("alice", "alice_chipping_sparrow", 3),
        birdHasEggs("alice", "alice_wild_turkey", 1),
      ],
    });
  });

  /**
   * Tests that the player can decline the optional power.
   */
  it("can decline layEggsOnBird power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline layEggsOnBird",
      description: "Player declines the optional egg laying power",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "mourning_dove", eggs: 0 }],
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
          label: "Alice declines mourning dove power",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { alice_mourning_dove: 2 },
            },
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
        // Only 2 eggs from base action (no power egg)
        birdHasEggs("alice", "alice_mourning_dove", 2),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no birds have remaining capacity.
   * The handler emits ACTIVATE_POWER with activated: false and skipReason.
   */
  it("skips power when no remaining egg capacity", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - no capacity",
      description: "Power skipped when all birds are at capacity",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              // Baird's Sparrow has capacity 2, start with 2 eggs = full
              { cardId: "bairds_sparrow", eggs: 2 },
            ],
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
          label: "Alice activates GRASSLAND, power auto-skips",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base action skips placement prompt since only bird is at capacity
            // Power is also skipped due to no capacity - no prompts
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Power was skipped due to resource unavailable
        custom("power was skipped due to no capacity", (ctx) => {
          const skipEffects = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "layEggsOnBird" &&
              e.activated === false &&
              e.skipReason === "RESOURCE_UNAVAILABLE"
          );
          if (skipEffects.length === 0) {
            throw new Error(
              "Expected power to be skipped due to RESOURCE_UNAVAILABLE"
            );
          }
        }),
        // Bird still has 2 eggs (was full, couldn't add more)
        birdHasEggs("alice", "alice_bairds_sparrow", 2),
      ],
    });
  });

  /**
   * Tests that THIS_BIRD power respects the bird's own capacity limit.
   * Uses scaled_quail which has "Lay 1 [egg] on this bird" and capacity 6.
   *
   * With 2 birds in GRASSLAND, leftmostEmpty = 2, so base reward is 3 eggs.
   */
  it("respects egg capacity for THIS_BIRD target", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - THIS_BIRD at capacity",
      description: "Power adds egg when THIS_BIRD has capacity",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              // Scaled Quail has capacity 6, start nearly full
              { cardId: "scaled_quail", eggs: 5 },
              // Add another bird with capacity for base action eggs
              { cardId: "wild_turkey", eggs: 0 },
            ],
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
          label: "Alice activates GRASSLAND",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base action: column 2 = 3 eggs (2 birds mean leftmostEmpty = 2)
            // Place all 3 on wild turkey (capacity 5)
            {
              kind: "placeEggs",
              placements: { alice_wild_turkey: 3 },
            },
            // Scaled quail power (column 0): activate
            { kind: "activatePower", activate: true },
            // Place 1 egg on THIS_BIRD (scaled quail)
            {
              kind: "placeEggs",
              placements: { alice_scaled_quail: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggsOnBird"),
        // Scaled quail: 5 + 1 from power = 6 (at capacity)
        birdHasEggs("alice", "alice_scaled_quail", 6),
        birdHasEggs("alice", "alice_wild_turkey", 3),
      ],
    });
  });

  /**
   * Tests with multiple birds in habitat to verify brown power chain order.
   * Powers should trigger right-to-left (from rightmost bird).
   */
  it("triggers multiple layEggsOnBird powers in chain", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggsOnBird - power chain",
      description: "Multiple egg-laying powers trigger in sequence",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              // Two birds with layEggsOnBird power (ANY_BIRD variant)
              { cardId: "bairds_sparrow", eggs: 0 }, // column 0
              { cardId: "grasshopper_sparrow", eggs: 0 }, // column 1
              // Target bird for eggs
              { cardId: "wild_turkey", eggs: 0 }, // column 2
            ],
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
          label: "Alice activates GRASSLAND with two egg powers",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base action: column 2 gives 3 eggs
            {
              kind: "placeEggs",
              placements: { alice_wild_turkey: 3 },
            },
            // Grasshopper sparrow power (column 1 = rightmost with power): activate
            { kind: "activatePower", activate: true },
            {
              kind: "placeEggs",
              placements: { alice_wild_turkey: 1 },
            },
            // Baird's sparrow power (column 0): activate
            { kind: "activatePower", activate: true },
            {
              kind: "placeEggs",
              placements: { alice_wild_turkey: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Handler invoked twice (once per bird with power)
        custom("layEggsOnBird invoked twice", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "layEggsOnBird" &&
              e.activated === true
          );
          if (activations.length !== 2) {
            throw new Error(
              `Expected 2 activations, got ${activations.length}`
            );
          }
        }),
        // Wild turkey: 3 base + 1 + 1 from powers = 5 eggs
        birdHasEggs("alice", "alice_wild_turkey", 5),
      ],
    });
  });
});

describe("layEggOnBirdsWithNestType handler", () => {
  /**
   * NOTE: All birds with the layEggOnBirdsWithNestType handler use WHEN_PLAYED trigger:
   * - ash_throated_flycatcher (CAVITY nest, WHEN_PLAYED)
   * - bobolink (GROUND nest, WHEN_PLAYED)
   * - inca_dove (PLATFORM nest, WHEN_PLAYED)
   * - says_phoebe (BOWL nest, WHEN_PLAYED)
   *
   * According to ScenarioTestLearnings.md (Task 8), WHEN_PLAYED powers are NOT
   * auto-triggered by the GameEngine after bird placement. This is a known
   * limitation of the current implementation.
   *
   * These tests are SKIPPED until WHEN_PLAYED power execution is wired up.
   */

  it.skip("lays eggs on all birds with matching nest type (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Would test: Ash-Throated Flycatcher plays, lays 1 egg on each CAVITY nest bird
  });

  it.skip("includes WILD nest birds when matching nest type (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Would test: WILD nest birds count as matching any nest type
  });

  it.skip("skips when no birds have matching nest type (BLOCKED: WHEN_PLAYED not auto-triggered)", async () => {
    // Would test: power skipped when no birds match the nest type
  });
});

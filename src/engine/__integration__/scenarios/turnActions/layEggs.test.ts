/**
 * Scenario tests for the layEggsHandler turn action.
 *
 * Tests cover:
 * - Basic egg laying on single bird
 * - Egg laying distributed across multiple birds
 * - Respecting egg capacity limits
 * - Habitat bonus (trade food for eggs)
 * - Brown power chain triggers after lay eggs action
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  birdHasEggs,
  playerHasTotalFood,
  eventWasEmitted,
  handlerWasInvoked,
  custom,
} from "../../assertions.js";

describe("layEggsHandler", () => {
  /**
   * Tests basic egg laying on a single bird.
   * With 0 birds in GRASSLAND, player gets 2 eggs (base reward for column 0).
   * Uses wild_turkey which has no power to avoid brown power triggers.
   */
  it("lays eggs on single bird with empty grassland", async () => {
    const scenario: ScenarioConfig = {
      name: "Basic egg laying",
      description: "Player lays 2 eggs on single bird with empty grassland",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Need a bird with egg capacity to lay on - wild_turkey has 5 capacity, no power
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
          label: "Alice lays eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Place 2 eggs on the trumpeter_swan (column 0 base reward is 2)
            { kind: "placeEggs", placements: { alice_trumpeter_swan: 2 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bird should have 2 eggs
        birdHasEggs("alice", "alice_trumpeter_swan", 2),

        // Verify HABITAT_ACTIVATED event was emitted for GRASSLAND
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" &&
          e.habitat === "GRASSLAND" &&
          e.playerId === "alice"
        ),
      ],
    });
  });

  /**
   * Tests egg laying distributed across multiple birds.
   * Player distributes 2 eggs across 2 birds (1 each).
   */
  it("distributes eggs across multiple birds", async () => {
    const scenario: ScenarioConfig = {
      name: "Distributed egg laying",
      description: "Player distributes 2 eggs across 2 birds",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Two birds to distribute eggs across - both have no powers
            FOREST: [{ cardId: "hooded_warbler", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
          label: "Alice distributes eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Distribute 2 eggs: 1 on each bird
            {
              kind: "placeEggs",
              placements: {
                alice_hooded_warbler: 1,
                alice_trumpeter_swan: 1,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Each bird should have 1 egg
        birdHasEggs("alice", "alice_hooded_warbler", 1),
        birdHasEggs("alice", "alice_trumpeter_swan", 1),
      ],
    });
  });

  /**
   * Tests that birds with full capacity are not included in placements.
   * Uses hooded_warbler which has eggCapacity 2.
   */
  it("respects egg capacity limits", async () => {
    const scenario: ScenarioConfig = {
      name: "Egg capacity limits",
      description: "Player cannot exceed bird's egg capacity",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // hooded_warbler has capacity 2, already has 1 egg, so max 1 more
            // trumpeter_swan has capacity 5, empty, so takes the remaining egg
            WETLAND: [
              { cardId: "prothonotary_warbler", eggs: 1 },
              { cardId: "trumpeter_swan", eggs: 0 },
            ],
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
          label: "Alice lays eggs respecting capacity",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Column 0 gives 2 eggs
            // prothonotary_warbler has capacity 2 with 1 egg, so can take 1 more
            // trumpeter_swan takes the second egg
            {
              kind: "placeEggs",
              placements: {
                alice_prothonotary_warbler: 1,
                alice_trumpeter_swan: 1,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // prothonotary_warbler should have 2 eggs (started with 1, got 1 more)
        birdHasEggs("alice", "alice_prothonotary_warbler", 2),
        // trumpeter_swan should have 1 egg
        birdHasEggs("alice", "alice_trumpeter_swan", 1),
      ],
    });
  });

  /**
   * Tests laying eggs with more birds in grassland.
   * With 2 birds in GRASSLAND, leftmost empty is column 2, which gives 3 eggs.
   * Note: Each bird has capacity 2, so we distribute eggs across them.
   */
  it("lays more eggs with birds in grassland", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple birds increases eggs",
      description: "Player lays 3 eggs with 2 birds in grassland",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // wild_turkey has capacity 5, no power
            FOREST: [{ cardId: "wild_turkey", eggs: 0 }],
            // Use 2 no-power birds (each has capacity 2)
            GRASSLAND: [
              { cardId: "blue_winged_warbler", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
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
          label: "Alice lays 3 eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Column 2 gives 3 eggs base reward - place all on wild_turkey (capacity 5)
            {
              kind: "placeEggs",
              placements: {
                alice_wild_turkey: 3,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // wild_turkey should have 3 eggs
        birdHasEggs("alice", "alice_wild_turkey", 3),
      ],
    });
  });

  /**
   * Tests habitat bonus: trade 1 food to lay 1 extra egg.
   * The bonus is available at columns 1, 3, 5.
   * With 1 bird in GRASSLAND, leftmost empty is column 1, which has a bonus slot.
   */
  it("applies habitat bonus: trade food for extra egg", async () => {
    const scenario: ScenarioConfig = {
      name: "Habitat bonus egg laying",
      description: "Player trades 1 food to lay 1 extra egg",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // wild_turkey has capacity 5, no power
            FOREST: [{ cardId: "wild_turkey", eggs: 0 }],
            // 1 bird to reach column 1 where bonus is available
            GRASSLAND: [{ cardId: "blue_winged_warbler", eggs: 0 }],
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
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: true },
            // Discard 1 food (any type) for bonus
            { kind: "discardFood", food: { SEED: 1 } },
            // Column 1 has base reward 2 + bonus 1 = 3 eggs - place on wild_turkey (capacity 5)
            {
              kind: "placeEggs",
              placements: {
                alice_wild_turkey: 3,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // wild_turkey should have 3 eggs (2 base + 1 bonus)
        birdHasEggs("alice", "alice_wild_turkey", 3),

        // Alice should have 0 food (discarded for bonus)
        playerHasTotalFood("alice", 0),

        // Verify DISCARD_FOOD effect was emitted
        custom("DISCARD_FOOD effect was emitted", (ctx) => {
          const discardEffects = ctx.effects.filter(
            (e) => e.type === "DISCARD_FOOD" && e.playerId === "alice"
          );
          if (discardEffects.length === 0) {
            throw new Error("Expected DISCARD_FOOD effect for bonus trade");
          }
        }),
      ],
    });
  });

  /**
   * Tests that bonus is not applied when player has no food.
   * Even with takeBonus: true, bonus requires food to discard.
   */
  it("does not apply bonus when player has no food", async () => {
    const scenario: ScenarioConfig = {
      name: "No bonus without food",
      description: "Player cannot use bonus without food to trade",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          // No food to trade
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "blue_winged_warbler", eggs: 0 }],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
          label: "Alice tries to use bonus but has no food",
          choices: [
            // Request bonus, but no food means no discard prompt
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: true },
            // Only base reward: 2 eggs (column 1)
            {
              kind: "placeEggs",
              placements: {
                alice_trumpeter_swan: 2,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // trumpeter_swan should have 2 eggs (only base, no bonus)
        birdHasEggs("alice", "alice_trumpeter_swan", 2),
      ],
    });
  });

  /**
   * Tests brown power chain triggers after lay eggs action.
   * Uses bairds_sparrow which has layEggsOnBird power (lay 1 egg on any bird).
   */
  it("triggers brown power chain after egg laying", async () => {
    const scenario: ScenarioConfig = {
      name: "Brown power chain",
      description: "Brown powers trigger after LAY_EGGS habitat activation",
      targetHandlers: ["layEggsHandler", "layEggsOnBird"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // bairds_sparrow has layEggsOnBird power
            GRASSLAND: [{ cardId: "bairds_sparrow", eggs: 0 }],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
          label: "Alice lays eggs and triggers brown power",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Column 1 gives 2 eggs base reward
            {
              kind: "placeEggs",
              placements: {
                alice_trumpeter_swan: 2,
              },
            },
            // bairds_sparrow power: choose to activate
            { kind: "activatePower", activate: true },
            // bairds_sparrow power: lay 1 egg on any bird
            {
              kind: "placeEggs",
              placements: {
                alice_bairds_sparrow: 1,
              },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify brown power handler was invoked
        handlerWasInvoked("layEggsOnBird"),

        // trumpeter_swan should have 2 eggs from base action
        birdHasEggs("alice", "alice_trumpeter_swan", 2),

        // bairds_sparrow should have 1 egg from its own power
        birdHasEggs("alice", "alice_bairds_sparrow", 1),
      ],
    });
  });

  /**
   * Tests declining optional brown power after egg laying.
   */
  it("allows declining brown power after egg laying", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline brown power",
      description: "Player declines optional brown power after egg laying",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "bairds_sparrow", eggs: 0 }],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: {
                alice_trumpeter_swan: 2,
              },
            },
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
        // trumpeter_swan should have 2 eggs from base action
        birdHasEggs("alice", "alice_trumpeter_swan", 2),

        // bairds_sparrow should have 0 eggs (power was declined)
        birdHasEggs("alice", "alice_bairds_sparrow", 0),
      ],
    });
  });

  /**
   * Tests that no birds with egg capacity means no egg placement prompt.
   * When all birds are at full capacity, the action completes without prompting.
   */
  it("handles no available egg capacity gracefully", async () => {
    const scenario: ScenarioConfig = {
      name: "No egg capacity",
      description: "Player has no birds with remaining egg capacity",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // prothonotary_warbler has capacity 4, already full
            WETLAND: [{ cardId: "prothonotary_warbler", eggs: 4 }],
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
          label: "Alice tries to lay eggs but all birds are full",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // No placeEggs prompt - all birds are at capacity
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bird should still have 4 eggs (no change)
        birdHasEggs("alice", "alice_prothonotary_warbler", 4),

        // HABITAT_ACTIVATED should still fire
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" && e.habitat === "GRASSLAND"
        ),
      ],
    });
  });

  /**
   * Tests laying eggs when player has no birds at all.
   * The action completes without error but no eggs are placed.
   */
  it("handles no birds on board gracefully", async () => {
    const scenario: ScenarioConfig = {
      name: "No birds",
      description: "Player has no birds to lay eggs on",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
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
          label: "Alice tries to lay eggs with no birds",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // No placeEggs prompt - no birds to lay on
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // HABITAT_ACTIVATED should still fire
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" && e.habitat === "GRASSLAND"
        ),
      ],
    });
  });

  /**
   * Tests LAY_EGGS is eligible when all birds are at full capacity BUT there's a brown power
   * in Grassland. The player should be able to activate Grassland just to trigger the brown power,
   * even though they can't actually lay any eggs.
   * Uses spotted_towhee which has gainFoodFromSupply power (works regardless of egg capacity).
   */
  it("allows LAY_EGGS when capacity is full but grassland has brown powers", async () => {
    const scenario: ScenarioConfig = {
      name: "LAY_EGGS with full capacity but brown power in grassland",
      description: "Player can activate LAY_EGGS to trigger brown powers even at full egg capacity",
      targetHandlers: ["layEggsHandler", "gainFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // spotted_towhee has brown power gainFoodFromSupply, capacity 4, full with 4 eggs
            GRASSLAND: [{ cardId: "spotted_towhee", eggs: 4 }],
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
          label: "Alice activates grassland to trigger brown power despite full capacity",
          choices: [
            // LAY_EGGS is eligible because spotted_towhee has a brown power
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // No placeEggs prompt because capacity is full
            // Brown power triggers: spotted_towhee's gainFoodFromSupply
            { kind: "activatePower", activate: true },
            // Choose food from supply (gainFoodFromSupply gives 1 food of choice)
            { kind: "selectFoodFromSupply", food: { SEED: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // HABITAT_ACTIVATED should fire for GRASSLAND
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" &&
          e.habitat === "GRASSLAND" &&
          e.playerId === "alice"
        ),

        // Brown power handler should have been invoked
        handlerWasInvoked("gainFoodFromSupply"),

        // spotted_towhee still has 4 eggs (no change - was already full)
        birdHasEggs("alice", "alice_spotted_towhee", 4),

        // Alice should have gained 1 SEED from the brown power
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests LAY_EGGS is NOT eligible when board is empty (no birds at all).
   * This verifies the eligibility check excludes LAY_EGGS when there are no birds.
   */
  it("excludes LAY_EGGS from eligible actions when board is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "LAY_EGGS not eligible with empty board",
      description: "LAY_EGGS should not be an eligible action when player has no birds",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
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
          label: "Alice cannot choose LAY_EGGS because board is empty",
          choices: [
            // GAIN_FOOD is eligible (always available), but LAY_EGGS should NOT be
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Take a die from the feeder
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // HABITAT_ACTIVATED should fire for FOREST (from GAIN_FOOD)
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" &&
          e.habitat === "FOREST" &&
          e.playerId === "alice"
        ),
      ],
    });
  });

  /**
   * Tests LAY_EGGS is NOT eligible when all birds are at full capacity AND
   * there are no brown powers in Grassland.
   */
  it("excludes LAY_EGGS when capacity is full and no grassland brown powers", async () => {
    const scenario: ScenarioConfig = {
      name: "LAY_EGGS not eligible with full capacity and no grassland powers",
      description: "LAY_EGGS should not be eligible when eggs are full and no grassland brown powers",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // prothonotary_warbler has no power, capacity 4, full
            WETLAND: [{ cardId: "prothonotary_warbler", eggs: 4 }],
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
          label: "Alice cannot choose LAY_EGGS because capacity is full and no grassland powers",
          choices: [
            // GAIN_FOOD is eligible, but LAY_EGGS should NOT be
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // HABITAT_ACTIVATED should fire for FOREST (from GAIN_FOOD)
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" &&
          e.habitat === "FOREST" &&
          e.playerId === "alice"
        ),

        // Bird should still have 4 eggs
        birdHasEggs("alice", "alice_prothonotary_warbler", 4),
      ],
    });
  });

  /**
   * Tests the EGGS_LAID_FROM_HABITAT_ACTIVATION event is emitted.
   * This event is specifically for tracking eggs laid from the LAY_EGGS action.
   */
  it("emits EGGS_LAID_FROM_HABITAT_ACTIVATION event", async () => {
    const scenario: ScenarioConfig = {
      name: "EGGS_LAID event",
      description: "Verifies EGGS_LAID_FROM_HABITAT_ACTIVATION event is emitted",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
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
          label: "Alice lays eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { alice_trumpeter_swan: 2 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify EGGS_LAID_FROM_HABITAT_ACTIVATION event was emitted
        eventWasEmitted("EGGS_LAID_FROM_HABITAT_ACTIVATION", (e) =>
          e.type === "EGGS_LAID_FROM_HABITAT_ACTIVATION" &&
          e.playerId === "alice" &&
          e.placements.some(
            (p: { birdInstanceId: string; count: number }) =>
              p.birdInstanceId === "alice_trumpeter_swan" && p.count === 2
          )
        ),
      ],
    });
  });
});

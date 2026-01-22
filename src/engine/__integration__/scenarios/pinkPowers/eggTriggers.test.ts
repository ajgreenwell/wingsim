/**
 * Scenario tests for pink powers triggered by EGGS_LAID_FROM_HABITAT_ACTIVATION events.
 *
 * Tests cover:
 * - whenOpponentLaysEggsLayEggOnNestType: Lay eggs on matching nest type when opponent lays eggs
 * - Nest type matching requirement
 * - Pink power does NOT trigger for self-laid eggs
 * - Pink power skips when no eligible birds with matching nest type
 * - Player can decline activation
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasSkipped,
  birdHasEggs,
  eventWasEmitted,
  custom,
} from "../../assertions.js";

describe("Pink Power: whenOpponentLaysEggsLayEggOnNestType", () => {
  /**
   * Tests that American Avocet's pink power triggers when an opponent
   * takes the "lay eggs" action, allowing the owner to lay 1 egg on
   * a bird with a GROUND nest.
   *
   * Flow:
   * 1. Alice has American Avocet and another GROUND nest bird (american_woodcock)
   * 2. Bob takes the LAY_EGGS action
   * 3. Alice's American Avocet triggers (EGGS_LAID_FROM_HABITAT_ACTIVATION event)
   * 4. Alice chooses to activate and places 1 egg on her american_woodcock
   */
  it("triggers when opponent takes lay eggs action (GROUND nest)", async () => {
    const scenario: ScenarioConfig = {
      name: "American Avocet triggers on opponent egg laying",
      description: "Bob lays eggs, Alice's American Avocet lays egg on GROUND nest bird",
      targetHandlers: ["whenOpponentLaysEggsLayEggOnNestType", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              // American Avocet - pink power that triggers on opponent egg laying
              { cardId: "american_avocet", eggs: 0 },
              // american_woodcock has GROUND nest (same as American Avocet), no power
              { cardId: "american_woodcock", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            // Bob needs a bird to lay eggs on
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
          },
        },
      ],

      turns: [
        // Bob's turn: takes the LAY_EGGS action
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // With empty GRASSLAND (column 0), Bob gets 2 eggs base reward
            {
              kind: "placeEggs",
              placements: { bob_trumpeter_swan: 2 },
            },
          ],
        },
        // Alice's pink power triggers during Bob's turn
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            // Alice places 1 egg on another GROUND nest bird (not the power bird)
            {
              kind: "placeEggs",
              placements: { alice_american_woodcock: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Pink power was invoked
        handlerWasInvoked("whenOpponentLaysEggsLayEggOnNestType"),

        // Bob laid his eggs
        birdHasEggs("bob", "bob_trumpeter_swan", 2),

        // Alice's pink power placed 1 egg on her GROUND nest bird
        birdHasEggs("alice", "alice_american_woodcock", 1),

        // The American Avocet itself should have no eggs (power lays on OTHER birds)
        birdHasEggs("alice", "alice_american_avocet", 0),

        // Verify EGGS_LAID_FROM_HABITAT_ACTIVATION event was emitted for Bob
        eventWasEmitted("EGGS_LAID_FROM_HABITAT_ACTIVATION", (e) =>
          e.type === "EGGS_LAID_FROM_HABITAT_ACTIVATION" &&
          e.playerId === "bob"
        ),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the owner takes
   * the lay eggs action (pink powers only trigger for opponents).
   */
  it("does NOT trigger when owner takes lay eggs action", async () => {
    const scenario: ScenarioConfig = {
      name: "American Avocet ignores own egg laying",
      description: "Alice lays eggs, her own American Avocet does not trigger",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              { cardId: "american_avocet", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        // Alice takes the LAY_EGGS action - her own pink power should NOT trigger
        {
          player: "alice",
          label: "Alice's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Alice lays 2 eggs on her bird (base reward for empty GRASSLAND)
            {
              kind: "placeEggs",
              placements: { alice_american_avocet: 2 },
            },
          ],
        },
        // No pink power response needed - Alice's own power doesn't trigger
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 0, // Alice goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice laid her eggs on the American Avocet (it has capacity 2)
        birdHasEggs("alice", "alice_american_avocet", 2),

        // The american_woodcock should have no eggs from pink power
        birdHasEggs("alice", "alice_american_woodcock", 0),

        // Verify pink power was NOT invoked
        custom("pink power was not invoked for owner's egg laying", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentLaysEggsLayEggOnNestType"
          );
          if (activations.length > 0) {
            throw new Error(
              "American Avocet should not trigger when owner lays eggs"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the pink power is skipped when the player has no birds
   * with the matching nest type (other than the power bird itself).
   *
   * Note: American Avocet requires GROUND nest birds. We use hooded_warbler
   * (BOWL nest) and blue_winged_warbler (BOWL nest) which don't match.
   */
  it("skips when no eligible birds with matching nest type", async () => {
    const scenario: ScenarioConfig = {
      name: "American Avocet skips with no eligible birds",
      description: "Alice has no other GROUND nest birds, power is skipped",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            // hooded_warbler has BOWL nest (not GROUND)
            FOREST: [{ cardId: "hooded_warbler", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [
              // Only the American Avocet - no other GROUND nest birds
              { cardId: "american_avocet", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Bob uses hooded_warbler (no power, BOWL nest) for egg laying
            WETLAND: [{ cardId: "blue_winged_warbler", eggs: 0 }],
          },
        },
      ],

      turns: [
        // Bob takes the LAY_EGGS action
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { bob_blue_winged_warbler: 2 },
            },
          ],
        },
        // No choices needed from Alice - power skipped due to no eligible GROUND nest birds
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob laid his eggs
        birdHasEggs("bob", "bob_blue_winged_warbler", 2),

        // Neither of Alice's birds should have eggs (power was skipped)
        birdHasEggs("alice", "alice_american_avocet", 0),
        birdHasEggs("alice", "alice_hooded_warbler", 0),

        // Verify power was skipped due to resource unavailable
        handlerWasSkipped("whenOpponentLaysEggsLayEggOnNestType"),
      ],
    });
  });

  /**
   * Tests that the player can decline the pink power activation.
   */
  it("allows player to decline activation", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline American Avocet activation",
      description: "Alice declines to activate American Avocet when Bob lays eggs",
      targetHandlers: ["whenOpponentLaysEggsLayEggOnNestType", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              { cardId: "american_avocet", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { bob_trumpeter_swan: 2 },
            },
          ],
        },
        {
          player: "alice",
          label: "Alice declines pink power",
          choices: [
            { kind: "activatePower", activate: false }, // Decline
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob laid his eggs
        birdHasEggs("bob", "bob_trumpeter_swan", 2),

        // Alice declined, so no eggs on her birds from pink power
        birdHasEggs("alice", "alice_american_avocet", 0),
        birdHasEggs("alice", "alice_american_woodcock", 0),

        // Verify the handler ran but was declined
        custom("pink power was declined", (ctx) => {
          const activation = ctx.effects.find(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentLaysEggsLayEggOnNestType" &&
              e.activated === false
          );
          if (!activation) {
            throw new Error("Expected ACTIVATE_POWER effect with activated: false");
          }
        }),
      ],
    });
  });

  /**
   * Tests that the pink power skips when all eligible birds are at capacity.
   * The American Avocet finds another GROUND nest bird but it's already full.
   */
  it("skips when all eligible birds are at capacity", async () => {
    const scenario: ScenarioConfig = {
      name: "American Avocet skips when eligible bird at capacity",
      description: "Alice's only other GROUND nest bird is at capacity",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              { cardId: "american_avocet", eggs: 0 },
              // american_woodcock has capacity 2, already at max
              { cardId: "american_woodcock", eggs: 2 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { bob_trumpeter_swan: 2 },
            },
          ],
        },
        // No choices needed from Alice - power skipped
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob laid his eggs
        birdHasEggs("bob", "bob_trumpeter_swan", 2),

        // Alice's birds unchanged
        birdHasEggs("alice", "alice_american_avocet", 0),
        birdHasEggs("alice", "alice_american_woodcock", 2), // Still at capacity

        // Verify power was skipped
        handlerWasSkipped("whenOpponentLaysEggsLayEggOnNestType"),
      ],
    });
  });

  /**
   * Tests that multiple players' pink powers can trigger on the same event.
   * Both Alice and Carol have American Avocet; Bob lays eggs.
   */
  it("triggers for multiple players with same pink power", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple American Avocets trigger",
      description: "Bob lays eggs, both Alice and Carol's American Avocets trigger",
      targetHandlers: ["whenOpponentLaysEggsLayEggOnNestType", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              { cardId: "american_avocet", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
          },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            // Carol also has american_woodcock for GROUND nest target
            GRASSLAND: [{ cardId: "american_woodcock", eggs: 0 }],
            WETLAND: [{ cardId: "american_avocet", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { bob_trumpeter_swan: 2 },
            },
          ],
        },
        // Pink powers trigger in clockwise order from active player
        // Bob is player index 1, so clockwise: Carol (index 2), Alice (index 0)
        {
          player: "carol",
          label: "Carol's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            {
              kind: "placeEggs",
              placements: { carol_american_woodcock: 1 },
            },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            {
              kind: "placeEggs",
              placements: { alice_american_woodcock: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob laid his eggs
        birdHasEggs("bob", "bob_trumpeter_swan", 2),

        // Both Alice and Carol's pink powers placed eggs
        birdHasEggs("alice", "alice_american_woodcock", 1),
        birdHasEggs("carol", "carol_american_woodcock", 1),

        // Handler should have been invoked twice
        custom("handler invoked twice", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentLaysEggsLayEggOnNestType" &&
              e.activated === true
          );
          if (activations.length !== 2) {
            throw new Error(
              `Expected 2 activations, found ${activations.length}`
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests Barrow's Goldeneye which requires CAVITY nest type.
   * This verifies that different nest types work correctly.
   */
  it("works with different nest types (CAVITY - Barrow's Goldeneye)", async () => {
    const scenario: ScenarioConfig = {
      name: "Barrow's Goldeneye triggers for CAVITY nest",
      description: "Bob lays eggs, Alice's Barrow's Goldeneye lays egg on CAVITY bird",
      targetHandlers: ["whenOpponentLaysEggsLayEggOnNestType", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            // hooded_warbler has BOWL nest, not CAVITY
            FOREST: [{ cardId: "hooded_warbler", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [
              // Barrow's Goldeneye - pink power requiring CAVITY nest
              { cardId: "barrows_goldeneye", eggs: 0 },
              // prothonotary_warbler has CAVITY nest
              { cardId: "prothonotary_warbler", eggs: 0 },
            ],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - lay eggs",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: { bob_trumpeter_swan: 2 },
            },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            // Alice places 1 egg on her CAVITY nest bird
            {
              kind: "placeEggs",
              placements: { alice_prothonotary_warbler: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Pink power was invoked
        handlerWasInvoked("whenOpponentLaysEggsLayEggOnNestType"),

        // Bob laid his eggs
        birdHasEggs("bob", "bob_trumpeter_swan", 2),

        // Alice's CAVITY nest bird got the egg
        birdHasEggs("alice", "alice_prothonotary_warbler", 1),

        // BOWL nest bird did NOT get an egg (wrong nest type)
        birdHasEggs("alice", "alice_hooded_warbler", 0),

        // Power bird itself has no eggs
        birdHasEggs("alice", "alice_barrows_goldeneye", 0),
      ],
    });
  });
});

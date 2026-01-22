/**
 * Scenario tests for pink powers triggered by PREDATOR_POWER_RESOLVED events.
 *
 * Tests cover:
 * - whenOpponentPredatorSucceedsGainFood: Gain food from birdfeeder when opponent's predator succeeds
 * - Pink power does NOT trigger when predator fails
 * - Pink power does NOT trigger for self predator
 * - Player can decline activation
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  birdHasTuckedCards,
  playerHasTotalFood,
  eventWasEmitted,
  custom,
} from "../../assertions.js";
import type { PredatorPowerResolvedEvent } from "../../../../types/events.js";

describe("Pink Power: whenOpponentPredatorSucceedsGainFood", () => {
  /**
   * Tests that Turkey Vulture's pink power triggers when an opponent's
   * predator power succeeds, gaining food from the birdfeeder.
   *
   * Flow:
   * 1. Alice has Turkey Vulture (pink power) in FOREST
   * 2. Bob has Golden Eagle (predator) in GRASSLAND
   * 3. Bob activates GRASSLAND (LAY_EGGS action)
   * 4. Bob's Golden Eagle reveals a small bird (american_goldfinch, 23cm < 100cm threshold)
   * 5. Golden Eagle succeeds (tucks the card)
   * 6. Alice's Turkey Vulture triggers (PREDATOR_POWER_RESOLVED with success: true)
   * 7. Alice gains food from the birdfeeder
   *
   * Note: We control the predator outcome by stacking deckTopCards with a bird
   * that has wingspan < 100cm (Golden Eagle's threshold).
   */
  it("triggers when opponent predator succeeds (wingspan check)", async () => {
    const scenario: ScenarioConfig = {
      name: "Turkey Vulture triggers on opponent predator success",
      description: "Bob's Golden Eagle catches prey, Alice's Turkey Vulture gains food",
      targetHandlers: [
        "whenOpponentPredatorSucceedsGainFood",
        "lookAtCardAndTuckIfWingspanUnder",
        "layEggsHandler",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Turkey Vulture in FOREST - pink power triggers on opponent predator success
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // Golden Eagle in GRASSLAND - wingspan check predator (100cm threshold)
            // wild_turkey added to absorb extra eggs (Golden Eagle capacity is only 1)
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
      ],

      turns: [
        // Bob's turn: activates GRASSLAND with Golden Eagle
        {
          player: "bob",
          label: "Bob's turn - activate GRASSLAND with Golden Eagle",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // With 2 birds in GRASSLAND, column 2 gives 3 eggs base reward
            // Golden Eagle capacity 1, wild_turkey capacity 5
            { kind: "placeEggs", placements: { bob_golden_eagle: 1, bob_wild_turkey: 2 } },
            // Activate Golden Eagle predator power
            { kind: "activatePower", activate: true },
            // Predator succeeds automatically (american_goldfinch has 23cm < 100cm)
          ],
        },
        // Alice's pink power triggers during Bob's turn
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            // Select food from birdfeeder (first die is SEED)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      // Birdfeeder setup - Alice will gain from here
      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Bird tray must be set explicitly to avoid consuming deckTopCards
      birdTray: [],
      // Stack the deck with a small bird that will be caught
      deckTopCards: ["american_goldfinch"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Golden Eagle predator was invoked
        handlerWasInvoked("lookAtCardAndTuckIfWingspanUnder"),

        // Pink power was invoked
        handlerWasInvoked("whenOpponentPredatorSucceedsGainFood"),

        // Golden Eagle tucked the caught prey
        birdHasTuckedCards("bob", "bob_golden_eagle", 1),

        // Alice gained 1 food from the birdfeeder
        playerHasTotalFood("alice", 1),

        // PREDATOR_POWER_RESOLVED event was emitted with success: true
        eventWasEmitted(
          "PREDATOR_POWER_RESOLVED",
          (e: PredatorPowerResolvedEvent) =>
            e.predatorType === "WINGSPAN_CHECK" &&
            e.success === true &&
            e.predatorBirdInstanceId === "bob_golden_eagle"
        ),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the opponent's predator fails.
   * Golden Eagle fails to catch prey because the top card has wingspan >= 100cm.
   */
  it("does NOT trigger when opponent predator fails", async () => {
    const scenario: ScenarioConfig = {
      name: "Turkey Vulture ignores failed predator",
      description: "Bob's Golden Eagle fails, Alice's Turkey Vulture does not trigger",
      targetHandlers: ["lookAtCardAndTuckIfWingspanUnder", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - activate predator that fails",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { bob_golden_eagle: 1, bob_wild_turkey: 2 } },
            { kind: "activatePower", activate: true },
            // Predator fails automatically (trumpeter_swan has 203cm > 100cm)
          ],
        },
        // No turn block for Alice - pink power doesn't trigger on failure
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: [],
      // Stack the deck with a large bird that will escape
      deckTopCards: ["trumpeter_swan"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Golden Eagle predator was invoked (but failed)
        handlerWasInvoked("lookAtCardAndTuckIfWingspanUnder"),

        // Golden Eagle did NOT tuck (prey escaped)
        birdHasTuckedCards("bob", "bob_golden_eagle", 0),

        // Alice gained no food (pink power didn't trigger)
        playerHasTotalFood("alice", 0),

        // PREDATOR_POWER_RESOLVED event was emitted with success: false
        eventWasEmitted(
          "PREDATOR_POWER_RESOLVED",
          (e: PredatorPowerResolvedEvent) =>
            e.predatorType === "WINGSPAN_CHECK" &&
            e.success === false &&
            e.predatorBirdInstanceId === "bob_golden_eagle"
        ),

        // Pink power was silently skipped (predator failed)
        custom("pink power silently skipped on predator failure", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPredatorSucceedsGainFood" &&
              e.activated === true
          );
          if (activations.length > 0) {
            throw new Error(
              "Turkey Vulture should not have activated when predator failed"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger for the player's own predator.
   * Alice has both the predator and the pink power - pink powers only trigger
   * for opponents' actions.
   */
  it("does NOT trigger for own predator success", async () => {
    const scenario: ScenarioConfig = {
      name: "Turkey Vulture ignores own predator",
      description: "Alice's own predator succeeds, her Turkey Vulture does not trigger",
      targetHandlers: ["lookAtCardAndTuckIfWingspanUnder", "layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Alice has both the pink power bird and the predator
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
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
        {
          player: "alice",
          label: "Alice's turn - own predator succeeds",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { alice_golden_eagle: 1, alice_wild_turkey: 2 } },
            { kind: "activatePower", activate: true },
            // Predator succeeds (american_goldfinch has 23cm < 100cm)
          ],
        },
        // No pink power response - Alice's own predator doesn't trigger her pink power
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: [],
      deckTopCards: ["american_goldfinch"],
      startingPlayerIndex: 0, // Alice goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice's predator was invoked and succeeded
        handlerWasInvoked("lookAtCardAndTuckIfWingspanUnder"),
        birdHasTuckedCards("alice", "alice_golden_eagle", 1),

        // PREDATOR_POWER_RESOLVED event was emitted
        eventWasEmitted(
          "PREDATOR_POWER_RESOLVED",
          (e: PredatorPowerResolvedEvent) =>
            e.predatorType === "WINGSPAN_CHECK" && e.success === true
        ),

        // Alice gained no food from pink power (own predator)
        playerHasTotalFood("alice", 0),

        // Pink power was NOT invoked at all (not even silently skipped)
        custom("pink power was not invoked for own predator", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPredatorSucceedsGainFood"
          );
          if (activations.length > 0) {
            throw new Error(
              "Turkey Vulture should not trigger for own predator success"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the player can decline the pink power activation.
   */
  it("allows player to decline activation", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline Turkey Vulture activation",
      description: "Alice declines to activate Turkey Vulture when Bob's predator succeeds",
      targetHandlers: [
        "whenOpponentPredatorSucceedsGainFood",
        "lookAtCardAndTuckIfWingspanUnder",
        "layEggsHandler",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - predator succeeds",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { bob_golden_eagle: 1, bob_wild_turkey: 2 } },
            { kind: "activatePower", activate: true },
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

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: [],
      deckTopCards: ["american_goldfinch"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob's predator succeeded
        birdHasTuckedCards("bob", "bob_golden_eagle", 1),

        // Alice declined, so no food gained
        playerHasTotalFood("alice", 0),

        // Verify the handler ran but was declined
        custom("pink power was declined", (ctx) => {
          const activation = ctx.effects.find(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPredatorSucceedsGainFood" &&
              e.activated === false
          );
          if (!activation) {
            throw new Error(
              "Expected ACTIVATE_POWER effect with activated: false"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that multiple players' pink powers can trigger on the same event.
   * Both Alice and Carol have Turkey Vulture; Bob's predator succeeds.
   */
  it("triggers for multiple players with same pink power", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple Turkey Vultures trigger",
      description: "Bob's predator succeeds, both Alice and Carol's Turkey Vultures trigger",
      targetHandlers: [
        "whenOpponentPredatorSucceedsGainFood",
        "lookAtCardAndTuckIfWingspanUnder",
        "layEggsHandler",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Carol also has Turkey Vulture
            FOREST: [{ cardId: "turkey_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - predator succeeds",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { bob_golden_eagle: 1, bob_wild_turkey: 2 } },
            { kind: "activatePower", activate: true },
          ],
        },
        // Pink powers trigger in clockwise order from active player
        // Bob is player index 1, so clockwise: Carol (index 2), Alice (index 0)
        {
          player: "carol",
          label: "Carol's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            // SEED die was taken by Carol, next available is INVERTEBRATE
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: [],
      deckTopCards: ["american_goldfinch"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bob's predator succeeded
        birdHasTuckedCards("bob", "bob_golden_eagle", 1),

        // Both Alice and Carol gained food
        playerHasTotalFood("alice", 1),
        playerHasTotalFood("carol", 1),

        // Handler should have been invoked twice
        custom("handler invoked twice", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPredatorSucceedsGainFood" &&
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
   * Tests that the pink power works with different pink power birds.
   * Black Vulture (FOREST) also has the same pink power.
   */
  it("works with Black Vulture (FOREST pink power bird)", async () => {
    const scenario: ScenarioConfig = {
      name: "Black Vulture triggers on opponent predator success",
      description: "Bob's predator succeeds, Alice's Black Vulture gains food",
      targetHandlers: [
        "whenOpponentPredatorSucceedsGainFood",
        "lookAtCardAndTuckIfWingspanUnder",
        "layEggsHandler",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Black Vulture in FOREST - same pink power as Turkey Vulture
            FOREST: [{ cardId: "black_vulture", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "golden_eagle", eggs: 0 },
              { cardId: "wild_turkey", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - predator succeeds",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { bob_golden_eagle: 1, bob_wild_turkey: 2 } },
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: [],
      deckTopCards: ["american_goldfinch"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("lookAtCardAndTuckIfWingspanUnder"),
        handlerWasInvoked("whenOpponentPredatorSucceedsGainFood"),
        birdHasTuckedCards("bob", "bob_golden_eagle", 1),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that Black-Billed Magpie (GRASSLAND) triggers on opponent predator success.
   * Verifies the pink power works from different habitats.
   */
  it("works with Black-Billed Magpie (GRASSLAND pink power bird)", async () => {
    const scenario: ScenarioConfig = {
      name: "Black-Billed Magpie triggers on opponent predator success",
      description: "Bob's predator succeeds, Alice's Black-Billed Magpie gains food",
      targetHandlers: [
        "whenOpponentPredatorSucceedsGainFood",
        "lookAtCardAndTuckIfWingspanUnder",
        "layEggsHandler",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // Black-Billed Magpie in GRASSLAND
            GRASSLAND: [{ cardId: "black_billed_magpie", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            // Golden Eagle in WETLAND (it can be placed in WETLAND too)
            GRASSLAND: [],
            WETLAND: [{ cardId: "golden_eagle", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - activate WETLAND with predator",
          choices: [
            // Bob takes DRAW_CARDS action to activate WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // With empty WETLAND column 0, base reward is 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Activate Golden Eagle predator power
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Set up tray and deck for Bob's draw
      birdTray: ["hooded_warbler", "prothonotary_warbler", "blue_winged_warbler"],
      // Stack deck for Bob's draw first, then for predator power
      deckTopCards: ["wild_turkey", "american_goldfinch"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("lookAtCardAndTuckIfWingspanUnder"),
        handlerWasInvoked("whenOpponentPredatorSucceedsGainFood"),
        birdHasTuckedCards("bob", "bob_golden_eagle", 1),
        playerHasTotalFood("alice", 1),
      ],
    });
  });
});

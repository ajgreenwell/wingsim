/**
 * Scenario tests for brown power handlers that repeat other powers.
 *
 * Handlers covered:
 * - repeatBrownPowerInHabitat: Gray Catbird, Northern Mockingbird (WHEN_ACTIVATED)
 * - repeatPredatorPowerInHabitat: Hooded Merganser (WHEN_ACTIVATED)
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerInvokedTimes,
  handlerWasNotInvoked,
  handlerWasSkipped,
  playerHasFood,
  playerHasTotalFood,
  playerHandSize,
  birdHasTuckedCards,
  custom,
} from "../../assertions.js";
import type { ScenarioContext } from "../../ScenarioRunner.js";
import type { Event } from "../../../../types/events.js";

describe("repeatBrownPowerInHabitat handler", () => {
  /**
   * Tests that Gray Catbird's power can repeat another bird's brown power
   * in the same habitat.
   * Gray Catbird: all habitats, WHEN_ACTIVATED, "Repeat a brown power on
   * another bird in this habitat."
   *
   * In this test, Alice activates FOREST with Gray Catbird and Blue-Gray
   * Gnatcatcher. She chooses to repeat the Gnatcatcher's gainFoodFromSupply
   * power, gaining an extra INVERTEBRATE.
   *
   * With 2 birds in FOREST: leftmostEmpty = 2 → baseRewards[2] = 2 food
   * Powers execute right-to-left: column 1 (Catbird) first, then column 0 (Gnatcatcher)
   */
  it("repeats another bird's brown power in same habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatBrownPowerInHabitat - basic",
      description:
        "Gray Catbird repeats Blue-Gray Gnatcatcher's gainFoodFromSupply",
      targetHandlers: [
        "gainFoodHandler",
        "repeatBrownPowerInHabitat",
        "gainFoodFromSupply",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Column 0: Blue-Gray Gnatcatcher: gainFoodFromSupply (INVERTEBRATE)
              { cardId: "blue_gray_gnatcatcher", eggs: 0 },
              // Column 1: Gray Catbird: repeatBrownPowerInHabitat
              { cardId: "gray_catbird", eggs: 0 },
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
          label: "Alice activates FOREST with Gray Catbird",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: leftmostEmpty=2 → 2 food (2 prompts)
            // Must select first available die in feeder after each selection
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // After taking SEED, first available die is INVERTEBRATE
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Gray Catbird (column 1, rightmost) activates first
            { kind: "activatePower", activate: true },
            // Choose which bird's power to repeat (only option is Gnatcatcher)
            { kind: "repeatPower", bird: "alice_blue_gray_gnatcatcher" },
            // Execute the repeated power - gainFoodFromSupply activation prompt
            { kind: "activatePower", activate: true },
            // Choose food from supply (INVERTEBRATE)
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
            // Blue-Gray Gnatcatcher (column 0) activates second
            { kind: "activatePower", activate: true },
            // Choose food from supply (INVERTEBRATE)
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatBrownPowerInHabitat"),
        // gainFoodFromSupply was invoked twice: once by repeat, once by original
        handlerInvokedTimes("gainFoodFromSupply", 2),
        // Alice got 2 from base action (SEED, INVERTEBRATE) + 2 INVERTEBRATE from powers
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 3 }),
        playerHasTotalFood("alice", 4),
      ],
    });
  });

  /**
   * Tests that the power can be declined.
   */
  it("can decline the repeat power", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatBrownPowerInHabitat - decline",
      description: "Alice declines Gray Catbird power",
      targetHandlers: ["gainFoodHandler", "gainFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              { cardId: "blue_gray_gnatcatcher", eggs: 0 },
              { cardId: "gray_catbird", eggs: 0 },
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
          label: "Alice declines Gray Catbird power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 2 birds → 2 food selections (must select first available die each time)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Gray Catbird: decline
            { kind: "activatePower", activate: false },
            // Blue-Gray Gnatcatcher still activates
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("repeatBrownPowerInHabitat"),
        // gainFoodFromSupply only invoked once (original)
        handlerInvokedTimes("gainFoodFromSupply", 1),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 2 }),
      ],
    });
  });

  /**
   * Tests that the power is skipped when there are no other birds with
   * brown powers in the same habitat.
   * With only Gray Catbird (no other birds with brown powers), the power skips.
   */
  it("skips when no eligible birds to repeat", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatBrownPowerInHabitat - skip no eligible",
      description: "Gray Catbird alone in habitat, power skipped",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Gray Catbird alone in FOREST - no other brown powers to repeat
            FOREST: [{ cardId: "gray_catbird", eggs: 0 }],
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
          label: "Alice activates FOREST - Gray Catbird is skipped",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 1 bird → 1 food selection
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Gray Catbird power is auto-skipped (no eligible birds)
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("repeatBrownPowerInHabitat"),
        handlerWasNotInvoked("repeatBrownPowerInHabitat"),
        // Only base food gained
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that Northern Mockingbird also works with the same handler.
   */
  it("works with Northern Mockingbird", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatBrownPowerInHabitat - Northern Mockingbird",
      description: "Northern Mockingbird repeats Blue-Gray Gnatcatcher",
      targetHandlers: [
        "gainFoodHandler",
        "repeatBrownPowerInHabitat",
        "gainFoodFromSupply",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              { cardId: "blue_gray_gnatcatcher", eggs: 0 },
              { cardId: "northern_mockingbird", eggs: 0 },
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
          label: "Alice activates FOREST with Northern Mockingbird",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 2 birds → 2 food selections (must select first available die each time)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Northern Mockingbird (rightmost) activates first
            { kind: "activatePower", activate: true },
            { kind: "repeatPower", bird: "alice_blue_gray_gnatcatcher" },
            // Execute the repeated gainFoodFromSupply
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
            // Blue-Gray Gnatcatcher (column 0) activates
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatBrownPowerInHabitat"),
        handlerInvokedTimes("gainFoodFromSupply", 2),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 3 }),
      ],
    });
  });

  /**
   * Tests that the repeat power only sees other brown powers (WHEN_ACTIVATED),
   * not white (WHEN_PLAYED) or pink (ONCE_BETWEEN_TURNS) powers.
   * The only eligible bird should be blue_gray_gnatcatcher.
   * hooded_warbler has no power at all.
   */
  it("only repeats brown powers, not pink or white powers", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatBrownPowerInHabitat - only brown",
      description:
        "Gray Catbird only sees brown powers, not pink/white powers",
      targetHandlers: [
        "gainFoodHandler",
        "repeatBrownPowerInHabitat",
        "gainFoodFromSupply",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Blue-Gray Gnatcatcher: brown power (WHEN_ACTIVATED)
              { cardId: "blue_gray_gnatcatcher", eggs: 0 },
              // Hooded Warbler: no power at all
              { cardId: "hooded_warbler", eggs: 0 },
              // Gray Catbird: repeat brown power
              { cardId: "gray_catbird", eggs: 0 },
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
          label: "Alice activates FOREST - only Gnatcatcher is eligible",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 3 birds → leftmostEmpty=3 → baseRewards[3] = 2 food
            // Must select first available die each time
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Gray Catbird (rightmost, column 2) activates
            { kind: "activatePower", activate: true },
            // Only option is Gnatcatcher (hooded_warbler has no power)
            { kind: "repeatPower", bird: "alice_blue_gray_gnatcatcher" },
            // Execute the repeated power
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
            // Hooded Warbler (column 1): no power - skipped
            // Blue-Gray Gnatcatcher (column 0) activates
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatBrownPowerInHabitat"),
        handlerInvokedTimes("gainFoodFromSupply", 2),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 3 }),
      ],
    });
  });
});

describe("repeatPredatorPowerInHabitat handler", () => {
  /**
   * Tests that Hooded Merganser's power can repeat another bird's predator power
   * in the same habitat.
   * Hooded Merganser: WETLAND, WHEN_ACTIVATED, "Repeat 1 [predator] power in
   * this habitat."
   *
   * Uses Anhinga with rollDiceAndCacheIfMatch (FISH) as the target predator.
   * Since dice rolls are RNG-dependent, we just verify the power was invoked.
   *
   * With 2 birds in WETLAND: leftmostEmpty = 2 → baseRewards[2] = 2 cards
   */
  it("repeats another bird's predator power - dice roll predator", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatPredatorPowerInHabitat - dice roll",
      description: "Hooded Merganser repeats Anhinga's dice roll predator",
      targetHandlers: [
        "drawCardsHandler",
        "repeatPredatorPowerInHabitat",
        "rollDiceAndCacheIfMatch",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              // Column 0: Anhinga: rollDiceAndCacheIfMatch (FISH)
              { cardId: "anhinga", eggs: 0 },
              // Column 1: Hooded Merganser: repeatPredatorPowerInHabitat
              { cardId: "hooded_merganser", eggs: 0 },
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
          label: "Alice activates WETLAND with Hooded Merganser",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw: leftmostEmpty=2 → 2 cards (single prompt selecting 2)
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Hooded Merganser (column 1, rightmost) activates first
            { kind: "activatePower", activate: true },
            // Choose to repeat Anhinga's predator power
            { kind: "repeatPower", bird: "alice_anhinga" },
            // Execute the repeated predator power
            { kind: "activatePower", activate: true },
            // Anhinga (column 0) activates
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      // Keep 4 dice in feeder so 1 die can be rolled
      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler", "prothonotary_warbler", "wild_turkey"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatPredatorPowerInHabitat"),
        // rollDiceAndCacheIfMatch was invoked twice
        handlerInvokedTimes("rollDiceAndCacheIfMatch", 2),
        // PREDATOR_POWER_RESOLVED event should be emitted twice
        custom("Two DICE_ROLL predator events", (ctx: ScenarioContext) => {
          const predatorEvents = ctx.events.filter(
            (e: Event) =>
              e.type === "PREDATOR_POWER_RESOLVED" &&
              e.predatorType === "DICE_ROLL"
          );
          if (predatorEvents.length !== 2) {
            throw new Error(
              `Expected 2 DICE_ROLL predator events, got ${predatorEvents.length}`
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that Hooded Merganser can repeat a wingspan check predator.
   * Uses Golden Eagle (WETLAND, 100cm threshold) as the target.
   *
   * Note: Golden Eagle has capacity 1 egg, so we use DRAW_CARDS action
   * which doesn't depend on egg capacity.
   */
  it("repeats wingspan check predator", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatPredatorPowerInHabitat - wingspan check",
      description: "Hooded Merganser repeats Golden Eagle's wingspan check",
      targetHandlers: [
        "drawCardsHandler",
        "repeatPredatorPowerInHabitat",
        "lookAtCardAndTuckIfWingspanUnder",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              // Column 0: Golden Eagle: lookAtCardAndTuckIfWingspanUnder (100cm)
              { cardId: "golden_eagle", eggs: 0 },
              // Column 1: Hooded Merganser: repeatPredatorPowerInHabitat
              { cardId: "hooded_merganser", eggs: 0 },
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
          label: "Alice activates WETLAND with Hooded Merganser",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // 2 birds → 2 cards
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Hooded Merganser (column 1) activates first
            { kind: "activatePower", activate: true },
            // Choose to repeat Golden Eagle's predator power
            { kind: "repeatPower", bird: "alice_golden_eagle" },
            // Execute the repeated predator power
            { kind: "activatePower", activate: true },
            // Golden Eagle (column 0) activates
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      // Stack deck with small birds (wingspan < 100cm) so wingspan check succeeds
      // american_goldfinch: 23cm, chipping_sparrow: 20cm (both < 100cm)
      deckTopCards: [
        "hooded_warbler", // For base draw
        "prothonotary_warbler", // For base draw
        "american_goldfinch", // 23cm - for repeated power
        "chipping_sparrow", // 20cm - for Golden Eagle power
      ],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatPredatorPowerInHabitat"),
        // lookAtCardAndTuckIfWingspanUnder was invoked twice
        handlerInvokedTimes("lookAtCardAndTuckIfWingspanUnder", 2),
        // PREDATOR_POWER_RESOLVED events with WINGSPAN_CHECK type
        custom(
          "Two WINGSPAN_CHECK predator events",
          (ctx: ScenarioContext) => {
            const predatorEvents = ctx.events.filter(
              (e: Event) =>
                e.type === "PREDATOR_POWER_RESOLVED" &&
                e.predatorType === "WINGSPAN_CHECK"
            );
            if (predatorEvents.length !== 2) {
              throw new Error(
                `Expected 2 WINGSPAN_CHECK predator events, got ${predatorEvents.length}`
              );
            }
          }
        ),
        // Both small birds should be tucked (wingspan < 100cm)
        birdHasTuckedCards("alice", "alice_golden_eagle", 2),
      ],
    });
  });

  /**
   * Tests that the power can be declined.
   */
  it("can decline the repeat predator power", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatPredatorPowerInHabitat - decline",
      description: "Alice declines Hooded Merganser power",
      targetHandlers: ["drawCardsHandler", "rollDiceAndCacheIfMatch"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              { cardId: "anhinga", eggs: 0 },
              { cardId: "hooded_merganser", eggs: 0 },
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
          label: "Alice declines Hooded Merganser power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // 2 birds → 2 cards
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Hooded Merganser: decline
            { kind: "activatePower", activate: false },
            // Anhinga still activates
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler", "prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("repeatPredatorPowerInHabitat"),
        // rollDiceAndCacheIfMatch only invoked once (original Anhinga)
        handlerInvokedTimes("rollDiceAndCacheIfMatch", 1),
      ],
    });
  });

  /**
   * Tests that the power is skipped when there are no predator birds
   * in the same habitat.
   * trumpeter_swan has no power at all.
   */
  it("skips when no predator birds to repeat", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatPredatorPowerInHabitat - skip no eligible",
      description:
        "Hooded Merganser alone with non-predator birds, power skipped",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              // Trumpeter Swan: no power
              { cardId: "trumpeter_swan", eggs: 0 },
              // Hooded Merganser: repeatPredatorPowerInHabitat
              { cardId: "hooded_merganser", eggs: 0 },
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
          label: "Alice activates WETLAND - Hooded Merganser skipped",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // 2 birds → 2 cards
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Hooded Merganser power is auto-skipped (no predators)
            // Trumpeter Swan has no power
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler", "prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("repeatPredatorPowerInHabitat"),
        handlerWasNotInvoked("repeatPredatorPowerInHabitat"),
        // Only base draw
        playerHandSize("alice", 2),
      ],
    });
  });

  /**
   * Tests choosing from multiple predator birds when available.
   */
  it("allows choosing from multiple predator birds", async () => {
    const scenario: ScenarioConfig = {
      name: "repeatPredatorPowerInHabitat - multiple predators",
      description: "Hooded Merganser chooses between Anhinga and Golden Eagle",
      targetHandlers: [
        "drawCardsHandler",
        "repeatPredatorPowerInHabitat",
        "rollDiceAndCacheIfMatch",
        "lookAtCardAndTuckIfWingspanUnder",
      ],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [
              // Column 0: Anhinga: dice roll predator
              { cardId: "anhinga", eggs: 0 },
              // Column 1: Golden Eagle: wingspan check predator
              { cardId: "golden_eagle", eggs: 0 },
              // Column 2: Hooded Merganser: repeat predator
              { cardId: "hooded_merganser", eggs: 0 },
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
          label: "Alice activates WETLAND and repeats Anhinga",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // 3 birds → leftmostEmpty=3 → baseRewards[3] = 2 cards
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Hooded Merganser (column 2, rightmost) activates
            { kind: "activatePower", activate: true },
            // Choose to repeat Anhinga's dice roll predator
            { kind: "repeatPower", bird: "alice_anhinga" },
            // Execute the repeated predator
            { kind: "activatePower", activate: true },
            // Golden Eagle (column 1) activates
            { kind: "activatePower", activate: true },
            // Anhinga (column 0) activates
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      // Stack small bird for Golden Eagle's wingspan check
      deckTopCards: [
        "hooded_warbler", // base draw
        "prothonotary_warbler", // base draw
        "american_goldfinch", // 23cm for Golden Eagle
      ],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("repeatPredatorPowerInHabitat"),
        // rollDiceAndCacheIfMatch invoked twice: once by repeat, once by Anhinga
        handlerInvokedTimes("rollDiceAndCacheIfMatch", 2),
        // lookAtCardAndTuckIfWingspanUnder invoked once by Golden Eagle
        handlerInvokedTimes("lookAtCardAndTuckIfWingspanUnder", 1),
      ],
    });
  });
});

/**
 * Scenario tests for brown power handlers that involve discarding resources
 * (eggs or food) to gain rewards.
 *
 * Handlers covered:
 * - discardEggToGainFood: Discard egg from OTHER birds to gain food from supply (WHEN_ACTIVATED)
 * - discardEggToDrawCards: Discard egg from ANY bird to draw cards (WHEN_ACTIVATED)
 * - tradeFoodType: Discard food to gain different food type (WHEN_ACTIVATED)
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasNotInvoked,
  handlerWasSkipped,
  playerHandSize,
  playerHasFood,
  playerHasTotalFood,
  birdHasEggs,
} from "../../assertions.js";

describe("discardEggToGainFood handler", () => {
  /**
   * Tests that American Crow can discard 1 egg from another bird to gain 1 WILD food.
   * American Crow: all habitats, WHEN_ACTIVATED, "Discard 1 [egg] from any of your
   * other birds to gain 1 [wild] from the supply."
   *
   * Key constraint: Eggs must come from OTHER birds, not the American Crow itself.
   */
  it("discards egg from other bird to gain 1 food of choice", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToGainFood - basic",
      description: "American Crow discards 1 egg to gain 1 food",
      targetHandlers: ["gainFoodHandler", "discardEggToGainFood"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // American Crow in FOREST (where GAIN_FOOD action happens)
            FOREST: [
              { cardId: "american_crow", eggs: 0 },
              // Wild Turkey to hold eggs to discard (no power)
              { cardId: "wild_turkey", eggs: 2 },
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
          label: "Alice activates FOREST with American Crow",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 2 (2 birds) = 2 dice to take
            // With 2 birds, we get 2 dice offered
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // Wild Turkey (column 1) has no power, so no prompt for it
            // American Crow (column 0) power: activate
            { kind: "activatePower", activate: true },
            // Discard 1 egg from Wild Turkey (the only bird with eggs)
            { kind: "discardEggs", sources: { alice_wild_turkey: 1 } },
            // Choose FISH from supply (WILD lets us pick any type)
            { kind: "selectFoodFromSupply", food: { FISH: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("discardEggToGainFood"),
        // Wild Turkey had 2 eggs, discarded 1, now has 1
        birdHasEggs("alice", "alice_wild_turkey", 1),
        // Gained: 2 from base action (SEED, INVERTEBRATE) + 1 from power (FISH)
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1, FISH: 1 }),
        playerHasTotalFood("alice", 3),
      ],
    });
  });

  /**
   * Tests Chihuahuan Raven which gains 2 food instead of 1.
   * Chihuahuan Raven: GRASSLAND, "Discard 1 [egg] to gain 2 [wild] from the supply."
   */
  it("gains 2 food when power grants 2 (Chihuahuan Raven)", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToGainFood - 2 food",
      description: "Chihuahuan Raven discards 1 egg to gain 2 food",
      targetHandlers: ["layEggsHandler", "discardEggToGainFood"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // Chihuahuan Raven in GRASSLAND + a no-power bird with eggs
            GRASSLAND: [
              { cardId: "chihuahuan_raven", eggs: 0 },
              { cardId: "wild_turkey", eggs: 3 },
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
          label: "Alice activates GRASSLAND with Chihuahuan Raven",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 2 (2 birds) = 3 eggs
            {
              kind: "placeEggs",
              placements: {
                alice_chihuahuan_raven: 2, // capacity 5
                alice_wild_turkey: 1, // capacity 5
              },
            },
            // Wild Turkey (column 1) has no power
            // Chihuahuan Raven (column 0) power: activate
            { kind: "activatePower", activate: true },
            // Discard 1 egg from Wild Turkey
            { kind: "discardEggs", sources: { alice_wild_turkey: 1 } },
            // Choose 2 different foods (WILD lets us pick any)
            { kind: "selectFoodFromSupply", food: { FRUIT: 1, RODENT: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("discardEggToGainFood"),
        // Wild Turkey had 3 + 1 = 4 eggs, discarded 1, now has 3
        birdHasEggs("alice", "alice_wild_turkey", 3),
        // Chihuahuan Raven got 2 eggs from base action
        birdHasEggs("alice", "alice_chihuahuan_raven", 2),
        // Gained 2 food from power (FRUIT + RODENT)
        playerHasFood("alice", { FRUIT: 1, RODENT: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests that player can decline the discardEggToGainFood power.
   */
  it("can decline discardEggToGainFood power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline discardEggToGainFood",
      description: "Player declines the American Crow power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              { cardId: "american_crow", eggs: 0 },
              { cardId: "wild_turkey", eggs: 2 },
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
          label: "Alice declines American Crow power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
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
        handlerWasNotInvoked("discardEggToGainFood"),
        // Eggs unchanged
        birdHasEggs("alice", "alice_wild_turkey", 2),
        // Only base action food
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no other birds have eggs.
   * Key: The American Crow itself may have eggs, but those cannot be used.
   */
  it("skips power when no OTHER birds have eggs", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToGainFood - skip no eggs",
      description: "Power skipped when no other birds have eggs",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // American Crow has eggs but cannot discard from itself
            // No other birds have eggs
            FOREST: [
              { cardId: "american_crow", eggs: 3 },
              { cardId: "wild_turkey", eggs: 0 },
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
          label: "Alice activates FOREST but only crow has eggs",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
            // No activatePower prompt - power is skipped (no eligible eggs)
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("discardEggToGainFood"),
        handlerWasNotInvoked("discardEggToGainFood"),
        // All eggs unchanged
        birdHasEggs("alice", "alice_american_crow", 3),
        birdHasEggs("alice", "alice_wild_turkey", 0),
        // Only base action food
        playerHasTotalFood("alice", 2),
      ],
    });
  });

  /**
   * Tests discarding from a bird in a different habitat.
   */
  it("can discard eggs from bird in different habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToGainFood - cross habitat",
      description: "American Crow discards egg from bird in different habitat",
      targetHandlers: ["gainFoodHandler", "discardEggToGainFood"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "american_crow", eggs: 0 }],
            // Eggs are in a different habitat
            GRASSLAND: [{ cardId: "wild_turkey", eggs: 2 }],
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
          label: "Alice activates FOREST, discards egg from GRASSLAND",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Column 1 (1 bird) = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // American Crow power
            { kind: "activatePower", activate: true },
            // Discard from GRASSLAND bird
            { kind: "discardEggs", sources: { alice_wild_turkey: 1 } },
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("discardEggToGainFood"),
        birdHasEggs("alice", "alice_wild_turkey", 1),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
      ],
    });
  });
});

describe("discardEggToDrawCards handler", () => {
  /**
   * Tests that Franklin's Gull can discard 1 egg to draw 2 cards.
   * Franklin's Gull: GRASSLAND/WETLAND, WHEN_ACTIVATED, "Discard 1 [egg] to draw 2 [card]."
   *
   * Unlike discardEggToGainFood, eggs can come from ANY bird including this one.
   */
  it("discards egg to draw 2 cards from deck/tray", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToDrawCards - basic",
      description: "Franklin's Gull discards 1 egg to draw 2 cards",
      targetHandlers: ["drawCardsHandler", "discardEggToDrawCards"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Franklin's Gull in WETLAND with eggs
            WETLAND: [{ cardId: "franklins_gull", eggs: 2 }],
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
          label: "Alice activates WETLAND with Franklin's Gull",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Franklin's Gull power: activate
            { kind: "activatePower", activate: true },
            // Discard 1 egg from itself (allowed unlike discardEggToGainFood)
            { kind: "discardEggs", sources: { alice_franklins_gull: 1 } },
            // Draw 2 cards - can split between tray and deck
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 1 },
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
        handlerWasInvoked("discardEggToDrawCards"),
        // Had 2 eggs, discarded 1, now has 1
        birdHasEggs("alice", "alice_franklins_gull", 1),
        // Drew: 1 from base + 2 from power = 3 cards
        playerHandSize("alice", 3),
      ],
    });
  });

  /**
   * Tests using Killdeer which also has the same power.
   * Killdeer: GRASSLAND/WETLAND, WHEN_ACTIVATED, "Discard 1 [egg] to draw 2 [card]."
   */
  it("works with Killdeer in GRASSLAND", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToDrawCards - Killdeer",
      description: "Killdeer discards 1 egg to draw 2 cards",
      targetHandlers: ["layEggsHandler", "discardEggToDrawCards"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            // Killdeer in GRASSLAND
            GRASSLAND: [{ cardId: "killdeer", eggs: 1 }],
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
          label: "Alice activates GRASSLAND with Killdeer",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 0 = 2 eggs (Killdeer has capacity 4)
            { kind: "placeEggs", placements: { alice_killdeer: 2 } },
            // Killdeer power: activate
            { kind: "activatePower", activate: true },
            // Discard 1 egg (1 original + 2 just laid = 3 available)
            { kind: "discardEggs", sources: { alice_killdeer: 1 } },
            // Draw 2 cards from deck
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
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
        handlerWasInvoked("discardEggToDrawCards"),
        // Had 1 + laid 2 - discarded 1 = 2 eggs
        birdHasEggs("alice", "alice_killdeer", 2),
        // Drew 2 cards from power
        playerHandSize("alice", 2),
      ],
    });
  });

  /**
   * Tests that player can decline the discardEggToDrawCards power.
   */
  it("can decline discardEggToDrawCards power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline discardEggToDrawCards",
      description: "Player declines the Franklin's Gull power",
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
            WETLAND: [{ cardId: "franklins_gull", eggs: 2 }],
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
          label: "Alice declines Franklin's Gull power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("discardEggToDrawCards"),
        // Eggs unchanged
        birdHasEggs("alice", "alice_franklins_gull", 2),
        // Only base action card
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no birds have eggs.
   */
  it("skips power when no birds have eggs", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToDrawCards - skip no eggs",
      description: "Power skipped when no birds have eggs",
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
            // No eggs on any birds
            WETLAND: [{ cardId: "franklins_gull", eggs: 0 }],
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
          label: "Alice activates WETLAND but has no eggs",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // No activatePower prompt - power is skipped (no eggs)
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("discardEggToDrawCards"),
        handlerWasNotInvoked("discardEggToDrawCards"),
        birdHasEggs("alice", "alice_franklins_gull", 0),
        // Only base action card
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests discarding from a different bird (not the power bird).
   */
  it("can discard eggs from different bird", async () => {
    const scenario: ScenarioConfig = {
      name: "discardEggToDrawCards - other bird",
      description: "Franklin's Gull discards egg from a different bird",
      targetHandlers: ["drawCardsHandler", "discardEggToDrawCards"],

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
              { cardId: "franklins_gull", eggs: 0 },
              { cardId: "trumpeter_swan", eggs: 2 }, // no-power bird with eggs
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
          label: "Alice activates WETLAND with Franklin's Gull",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Column 2 (2 birds) = 2 cards
            { kind: "drawCards", trayCards: [], numDeckCards: 2 },
            // Trumpeter Swan (column 1) has no power
            // Franklin's Gull (column 0) power: activate
            { kind: "activatePower", activate: true },
            // Discard from Trumpeter Swan (not the Gull)
            { kind: "discardEggs", sources: { alice_trumpeter_swan: 1 } },
            // Draw 2 cards
            { kind: "drawCards", trayCards: ["barn_owl", "eastern_bluebird"], numDeckCards: 0 },
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
        handlerWasInvoked("discardEggToDrawCards"),
        // Franklin's Gull still has 0 eggs
        birdHasEggs("alice", "alice_franklins_gull", 0),
        // Trumpeter Swan had 2 eggs, discarded 1, now has 1
        birdHasEggs("alice", "alice_trumpeter_swan", 1),
        // Drew: 2 from base + 2 from power = 4 cards
        playerHandSize("alice", 4),
      ],
    });
  });
});

describe("tradeFoodType handler", () => {
  /**
   * Tests that Green Heron can trade 1 food of any type for 1 food of any other type.
   * Green Heron: WETLAND, WHEN_ACTIVATED, "Trade 1 [wild] for any other type from the supply."
   *
   * This is the only bird with this power.
   */
  it("trades 1 food for 1 different food", async () => {
    const scenario: ScenarioConfig = {
      name: "tradeFoodType - basic",
      description: "Green Heron trades 1 SEED for 1 FISH",
      targetHandlers: ["drawCardsHandler", "tradeFoodType"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          // Start with SEED to trade
          food: { SEED: 2, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "green_heron", eggs: 0 }],
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
          label: "Alice activates WETLAND with Green Heron",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Green Heron power: activate
            { kind: "activatePower", activate: true },
            // Discard 1 SEED
            { kind: "discardFood", food: { SEED: 1 } },
            // Choose to gain 1 FISH from supply
            { kind: "selectFoodFromSupply", food: { FISH: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tradeFoodType"),
        // Had 2 SEED, traded 1, now has 1 SEED + 1 FISH
        playerHasFood("alice", { SEED: 1, FISH: 1 }),
        playerHasTotalFood("alice", 2),
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests trading a different food type (INVERTEBRATE -> RODENT).
   */
  it("can trade any food type for any other", async () => {
    const scenario: ScenarioConfig = {
      name: "tradeFoodType - different types",
      description: "Green Heron trades 1 INVERTEBRATE for 1 RODENT",
      targetHandlers: ["drawCardsHandler", "tradeFoodType"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 1, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "green_heron", eggs: 0 }],
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
          label: "Alice activates WETLAND with Green Heron",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            { kind: "activatePower", activate: true },
            // Discard 1 INVERTEBRATE
            { kind: "discardFood", food: { INVERTEBRATE: 1 } },
            // Choose to gain 1 RODENT
            { kind: "selectFoodFromSupply", food: { RODENT: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tradeFoodType"),
        // Traded INVERTEBRATE -> RODENT
        playerHasFood("alice", { INVERTEBRATE: 0, RODENT: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that player can decline the tradeFoodType power.
   */
  it("can decline tradeFoodType power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline tradeFoodType",
      description: "Player declines the Green Heron power",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "green_heron", eggs: 0 }],
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
          label: "Alice declines Green Heron power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("tradeFoodType"),
        // Food unchanged
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no food to trade.
   */
  it("skips power when player has no food", async () => {
    const scenario: ScenarioConfig = {
      name: "tradeFoodType - skip no food",
      description: "Power skipped when player has no food to trade",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          // No food to trade
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "green_heron", eggs: 0 }],
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
          label: "Alice activates WETLAND but has no food",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // No activatePower prompt - power is skipped (no food to trade)
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("tradeFoodType"),
        handlerWasNotInvoked("tradeFoodType"),
        // Still no food
        playerHasTotalFood("alice", 0),
        // Only base action card
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests using the power after gaining food from the base action.
   * This verifies the power checks food after the base action completes.
   */
  it("can use power with food gained from base action", async () => {
    const scenario: ScenarioConfig = {
      name: "tradeFoodType - use gained food",
      description: "Green Heron trades food gained from FOREST action",
      targetHandlers: ["gainFoodHandler", "tradeFoodType"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          // No food initially
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Put Green Heron in FOREST so we use GAIN_FOOD action
            FOREST: [{ cardId: "green_heron", eggs: 0 }],
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
          label: "Alice gains food then trades it",
          choices: [
            // GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Column 1 (1 bird) = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Now we have 1 SEED, Green Heron power should be available
            { kind: "activatePower", activate: true },
            // Trade the SEED we just got
            { kind: "discardFood", food: { SEED: 1 } },
            { kind: "selectFoodFromSupply", food: { FRUIT: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tradeFoodType"),
        // Gained 1 SEED from base, traded for FRUIT
        playerHasFood("alice", { SEED: 0, FRUIT: 1 }),
        playerHasTotalFood("alice", 1),
      ],
    });
  });
});

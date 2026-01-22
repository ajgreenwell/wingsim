/**
 * Scenario tests for brown power handlers that involve tucking cards.
 *
 * Handlers covered:
 * - tuckAndDraw: Tuck from hand, draw from deck/tray (WHEN_ACTIVATED)
 * - tuckFromHandAndLay: Tuck from hand, lay eggs (WHEN_ACTIVATED)
 * - tuckAndGainFood: Tuck from hand, gain specific food type (WHEN_ACTIVATED)
 * - tuckAndGainFoodOfChoice: Tuck from hand, choose food type (WHEN_ACTIVATED)
 * - discardFoodToTuckFromDeck: Discard food, tuck from deck (WHEN_ACTIVATED)
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasNotInvoked,
  handlerWasSkipped,
  playerHandSize,
  playerHasCardInHand,
  playerHasFood,
  birdHasTuckedCards,
  birdHasEggs,
} from "../../assertions.js";

describe("tuckAndDraw handler", () => {
  /**
   * Tests that American Coot can tuck 1 card from hand and draw 1 card.
   * American Coot: WETLAND, WHEN_ACTIVATED, "Tuck a [card] from your hand behind
   * this bird. If you do, draw 1 [card]."
   */
  it("tucks card from hand and draws card", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndDraw - basic",
      description: "American Coot tucks 1 card and draws 1 card",
      targetHandlers: ["drawCardsHandler", "tuckAndDraw"],

      players: [
        {
          id: "alice",
          // Start with a card to tuck
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_coot", eggs: 0 }],
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
          label: "Alice activates WETLAND with American Coot",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards action: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // American Coot power: activate
            { kind: "activatePower", activate: true },
            // Select card to tuck from hand
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Draw 1 card from deck/tray
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["prothonotary_warbler", "blue_winged_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndDraw"),
        // Started with 1, tucked 1, base drew 1, power drew 1 = 2 cards
        playerHandSize("alice", 2),
        // Verify tucked card is on the bird
        birdHasTuckedCards("alice", "alice_american_coot", 1),
        // Verify drew from deck
        playerHasCardInHand("alice", "prothonotary_warbler"),
        playerHasCardInHand("alice", "blue_winged_warbler"),
      ],
    });
  });

  /**
   * Tests that player can decline the tuckAndDraw power.
   */
  it("can decline tuckAndDraw power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline tuckAndDraw",
      description: "Player declines the American Coot power",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_coot", eggs: 0 }],
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
          label: "Alice declines American Coot power",
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
      deckTopCards: ["prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // 1 starting + 1 base action = 2 cards
        playerHandSize("alice", 2),
        // No cards tucked
        birdHasTuckedCards("alice", "alice_american_coot", 0),
        playerHasCardInHand("alice", "hooded_warbler"),
        playerHasCardInHand("alice", "prothonotary_warbler"),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no cards in hand.
   * Using Yellow-Rumped Warbler (FOREST) with GAIN_FOOD action so
   * the base action doesn't add cards to hand.
   */
  it("skips power when hand is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndDraw - skip empty hand",
      description: "Power skipped when no cards in hand to tuck",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          // Empty hand - cannot tuck
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "yellow_rumped_warbler", eggs: 0 }],
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
          label: "Alice activates FOREST but has no cards",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // No activatePower prompt - power is skipped due to empty hand
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Power was skipped due to resource unavailable (empty hand)
        handlerWasSkipped("tuckAndDraw"),
        handlerWasNotInvoked("tuckAndDraw"),
        // Got 1 food from base action
        playerHasFood("alice", { SEED: 1 }),
        playerHandSize("alice", 0),
        birdHasTuckedCards("alice", "alice_yellow_rumped_warbler", 0),
      ],
    });
  });

  /**
   * Tests tuckAndDraw with a FOREST bird (Yellow-Rumped Warbler).
   */
  it("works with FOREST bird", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndDraw - FOREST",
      description: "Yellow-Rumped Warbler in FOREST tucks and draws",
      targetHandlers: ["gainFoodHandler", "tuckAndDraw"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "yellow_rumped_warbler", eggs: 0 }],
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
          label: "Alice activates FOREST with Yellow-Rumped Warbler",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 0 = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Yellow-Rumped Warbler power: activate
            { kind: "activatePower", activate: true },
            // Select card to tuck
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Draw 1 card
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndDraw"),
        playerHandSize("alice", 1),
        birdHasTuckedCards("alice", "alice_yellow_rumped_warbler", 1),
        playerHasCardInHand("alice", "barn_owl"),
        playerHasFood("alice", { SEED: 1 }),
      ],
    });
  });
});

describe("tuckFromHandAndLay handler", () => {
  /**
   * Tests that Brewer's Blackbird can tuck 1 card and lay 1 egg on itself.
   * Brewer's Blackbird: GRASSLAND, WHEN_ACTIVATED, "Tuck a [card] from your hand
   * behind this bird. If you do, also lay 1 [egg] on this bird."
   */
  it("tucks card and lays egg on THIS_BIRD", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckFromHandAndLay - THIS_BIRD",
      description: "Brewer's Blackbird tucks 1 card and lays 1 egg on itself",
      targetHandlers: ["layEggsHandler", "tuckFromHandAndLay"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "brewers_blackbird", eggs: 0 }],
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
          label: "Alice activates GRASSLAND with Brewer's Blackbird",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs action: column 0 = 2 eggs
            {
              kind: "placeEggs",
              placements: { alice_brewers_blackbird: 2 },
            },
            // Brewer's Blackbird power: activate
            { kind: "activatePower", activate: true },
            // Select card to tuck
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Place the power egg on this bird (handler prompts even for THIS_BIRD)
            { kind: "placeEggs", placements: { alice_brewers_blackbird: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckFromHandAndLay"),
        // Tucked 1 card
        birdHasTuckedCards("alice", "alice_brewers_blackbird", 1),
        // 2 from base + 1 from power = 3 eggs
        birdHasEggs("alice", "alice_brewers_blackbird", 3),
        // Hand is now empty
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests that White-Throated Swift can tuck 1 card and lay 1 egg on ANY bird.
   * White-Throated Swift: GRASSLAND, WHEN_ACTIVATED, "Tuck a [card] from your hand
   * behind this bird. If you do, also lay 1 [egg] on any bird."
   * (eggTarget: "ANY_BIRD")
   */
  it("tucks card and lays egg on ANY_BIRD", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckFromHandAndLay - ANY_BIRD",
      description: "White-Throated Swift tucks 1 card and lays egg on any bird",
      targetHandlers: ["layEggsHandler", "tuckFromHandAndLay"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Use a no-power bird to receive the egg
            FOREST: [{ cardId: "wild_turkey", eggs: 0 }],
            GRASSLAND: [{ cardId: "white_throated_swift", eggs: 0 }],
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
          label: "Alice activates GRASSLAND with White-Throated Swift",
          choices: [
            // Turn action: LAY_EGGS in GRASSLAND
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 1 = 2 eggs, distribute to both birds
            {
              kind: "placeEggs",
              placements: {
                alice_white_throated_swift: 1,
                alice_wild_turkey: 1,
              },
            },
            // White-Throated Swift power: activate
            { kind: "activatePower", activate: true },
            // Select card to tuck
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Place the power egg on the wild turkey (any bird)
            { kind: "placeEggs", placements: { alice_wild_turkey: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckFromHandAndLay"),
        birdHasTuckedCards("alice", "alice_white_throated_swift", 1),
        // Swift got 1 from base
        birdHasEggs("alice", "alice_white_throated_swift", 1),
        // Wild turkey got 1 from base + 1 from power = 2
        birdHasEggs("alice", "alice_wild_turkey", 2),
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests that player can decline the tuckFromHandAndLay power.
   */
  it("can decline tuckFromHandAndLay power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline tuckFromHandAndLay",
      description: "Player declines the Brewer's Blackbird power",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "brewers_blackbird", eggs: 0 }],
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
          label: "Alice declines Brewer's Blackbird power",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { alice_brewers_blackbird: 2 } },
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
        // Only base eggs, no power eggs
        birdHasEggs("alice", "alice_brewers_blackbird", 2),
        birdHasTuckedCards("alice", "alice_brewers_blackbird", 0),
        // Card still in hand
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no cards in hand.
   */
  it("skips power when hand is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckFromHandAndLay - skip empty hand",
      description: "Power skipped when no cards in hand to tuck",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          // Empty hand
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "brewers_blackbird", eggs: 0 }],
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
          label: "Alice activates GRASSLAND but has no cards",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { alice_brewers_blackbird: 2 } },
            // No activatePower prompt - power is skipped
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("tuckFromHandAndLay"),
        handlerWasNotInvoked("tuckFromHandAndLay"),
        // Only base eggs
        birdHasEggs("alice", "alice_brewers_blackbird", 2),
        birdHasTuckedCards("alice", "alice_brewers_blackbird", 0),
      ],
    });
  });
});

describe("tuckAndGainFood handler", () => {
  /**
   * Tests that Cedar Waxwing can tuck 1 card and gain 1 FRUIT.
   * Cedar Waxwing: FOREST/GRASSLAND, WHEN_ACTIVATED, "Tuck a [card] from your hand
   * behind this bird. If you do, gain 1 [fruit] from the supply."
   */
  it("tucks card and gains specific food type", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFood - FRUIT",
      description: "Cedar Waxwing tucks 1 card and gains 1 FRUIT",
      targetHandlers: ["gainFoodHandler", "tuckAndGainFood"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "cedar_waxwing", eggs: 0 }],
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
          label: "Alice activates FOREST with Cedar Waxwing",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 0 = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Cedar Waxwing power: activate
            { kind: "activatePower", activate: true },
            // Select card to tuck
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Food is gained automatically (no choice needed)
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndGainFood"),
        birdHasTuckedCards("alice", "alice_cedar_waxwing", 1),
        // 1 SEED from base + 1 FRUIT from power
        playerHasFood("alice", { SEED: 1, FRUIT: 1 }),
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests with Dark-Eyed Junco which gains SEED.
   * Dark-Eyed Junco: FOREST/GRASSLAND, WHEN_ACTIVATED, "Tuck a [card]...gain 1 [seed]"
   */
  it("works with different food types (SEED)", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFood - SEED",
      description: "Dark-Eyed Junco tucks 1 card and gains 1 SEED",
      targetHandlers: ["gainFoodHandler", "tuckAndGainFood"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "dark_eyed_junco", eggs: 0 }],
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
          label: "Alice activates FOREST with Dark-Eyed Junco",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Column 1 (1 bird) only offers 1 die - the first in the array (FRUIT in this case)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FRUIT" }] },
            { kind: "activatePower", activate: true },
            { kind: "selectCards", cards: ["hooded_warbler"] },
          ],
        },
      ],

      // Put FRUIT first so that's what's offered
      birdfeeder: ["FRUIT", "INVERTEBRATE", "FISH", "SEED", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndGainFood"),
        birdHasTuckedCards("alice", "alice_dark_eyed_junco", 1),
        // 1 FRUIT from base + 1 SEED from power
        playerHasFood("alice", { FRUIT: 1, SEED: 1 }),
      ],
    });
  });

  /**
   * Tests that player can decline the tuckAndGainFood power.
   */
  it("can decline tuckAndGainFood power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline tuckAndGainFood",
      description: "Player declines the Cedar Waxwing power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "cedar_waxwing", eggs: 0 }],
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
          label: "Alice declines Cedar Waxwing power",
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
        // Only base food
        playerHasFood("alice", { SEED: 1, FRUIT: 0 }),
        birdHasTuckedCards("alice", "alice_cedar_waxwing", 0),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no cards in hand.
   */
  it("skips power when hand is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFood - skip empty hand",
      description: "Power skipped when no cards in hand to tuck",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "cedar_waxwing", eggs: 0 }],
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
          label: "Alice activates FOREST but has no cards",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // No activatePower prompt - power is skipped
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("tuckAndGainFood"),
        handlerWasNotInvoked("tuckAndGainFood"),
        playerHasFood("alice", { SEED: 1, FRUIT: 0 }),
        birdHasTuckedCards("alice", "alice_cedar_waxwing", 0),
      ],
    });
  });
});

describe("tuckAndGainFoodOfChoice handler", () => {
  /**
   * Tests that Pygmy Nuthatch can tuck 1 card and choose food type.
   * Pygmy Nuthatch: FOREST, WHEN_ACTIVATED, "Tuck a [card] from your hand behind
   * this bird. If you do, gain 1 [invertebrate] or 1 [seed] from the supply."
   */
  it("tucks card and player chooses food type", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFoodOfChoice - choose INVERTEBRATE",
      description: "Pygmy Nuthatch tucks 1 card and player chooses INVERTEBRATE",
      targetHandlers: ["gainFoodHandler", "tuckAndGainFoodOfChoice"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "pygmy_nuthatch", eggs: 0 }],
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
          label: "Alice activates FOREST with Pygmy Nuthatch",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Choose INVERTEBRATE from the supply
            { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndGainFoodOfChoice"),
        birdHasTuckedCards("alice", "alice_pygmy_nuthatch", 1),
        // 1 SEED from base + 1 INVERTEBRATE from power choice
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests choosing the alternate food type (SEED).
   */
  it("can choose alternate food type", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFoodOfChoice - choose SEED",
      description: "Pygmy Nuthatch tucks 1 card and player chooses SEED",
      targetHandlers: ["gainFoodHandler", "tuckAndGainFoodOfChoice"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "pygmy_nuthatch", eggs: 0 }],
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
          label: "Alice activates FOREST with Pygmy Nuthatch",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Column 1 (1 bird) only offers 1 die - the first in the array (FRUIT)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FRUIT" }] },
            { kind: "activatePower", activate: true },
            { kind: "selectCards", cards: ["hooded_warbler"] },
            // Choose SEED from the supply
            { kind: "selectFoodFromSupply", food: { SEED: 1 } },
          ],
        },
      ],

      // Put FRUIT first so that's what's offered
      birdfeeder: ["FRUIT", "INVERTEBRATE", "FISH", "SEED", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("tuckAndGainFoodOfChoice"),
        birdHasTuckedCards("alice", "alice_pygmy_nuthatch", 1),
        // 1 FRUIT from base + 1 SEED from power choice
        playerHasFood("alice", { FRUIT: 1, SEED: 1 }),
      ],
    });
  });

  /**
   * Tests that player can decline the tuckAndGainFoodOfChoice power.
   */
  it("can decline tuckAndGainFoodOfChoice power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline tuckAndGainFoodOfChoice",
      description: "Player declines the Pygmy Nuthatch power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "pygmy_nuthatch", eggs: 0 }],
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
          label: "Alice declines Pygmy Nuthatch power",
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
        // Only base food
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 0 }),
        birdHasTuckedCards("alice", "alice_pygmy_nuthatch", 0),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no cards in hand.
   */
  it("skips power when hand is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "tuckAndGainFoodOfChoice - skip empty hand",
      description: "Power skipped when no cards in hand to tuck",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "pygmy_nuthatch", eggs: 0 }],
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
          label: "Alice activates FOREST but has no cards",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // No activatePower prompt - power is skipped
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("tuckAndGainFoodOfChoice"),
        handlerWasNotInvoked("tuckAndGainFoodOfChoice"),
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 0 }),
        birdHasTuckedCards("alice", "alice_pygmy_nuthatch", 0),
      ],
    });
  });
});

describe("discardFoodToTuckFromDeck handler", () => {
  /**
   * Tests that American White Pelican can discard 1 FISH to tuck 2 cards from deck.
   * American White Pelican: WETLAND, WHEN_ACTIVATED, "Discard 1 [fish] to tuck
   * 2 [card] from the deck behind this bird."
   */
  it("discards food to tuck cards from deck", async () => {
    const scenario: ScenarioConfig = {
      name: "discardFoodToTuckFromDeck - basic",
      description: "American White Pelican discards 1 FISH to tuck 2 cards",
      targetHandlers: ["drawCardsHandler", "discardFoodToTuckFromDeck"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 1, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_white_pelican", eggs: 0 }],
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
          label: "Alice activates WETLAND with American White Pelican",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards action: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // American White Pelican power: activate
            { kind: "activatePower", activate: true },
            // Discard the FISH
            { kind: "discardFood", food: { FISH: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler", "prothonotary_warbler", "blue_winged_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("discardFoodToTuckFromDeck"),
        // Tucked 2 cards from deck
        birdHasTuckedCards("alice", "alice_american_white_pelican", 2),
        // Discarded FISH
        playerHasFood("alice", { FISH: 0 }),
        // Drew 1 card from base action
        playerHandSize("alice", 1),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests with Canada Goose which requires SEED.
   * Canada Goose: GRASSLAND/WETLAND, WHEN_ACTIVATED, "Discard 1 [seed] to tuck 2 [card]..."
   */
  it("works with different food types (SEED)", async () => {
    const scenario: ScenarioConfig = {
      name: "discardFoodToTuckFromDeck - SEED",
      description: "Canada Goose discards 1 SEED to tuck 2 cards",
      targetHandlers: ["drawCardsHandler", "discardFoodToTuckFromDeck"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "canada_goose", eggs: 0 }],
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
          label: "Alice activates WETLAND with Canada Goose",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            { kind: "activatePower", activate: true },
            { kind: "discardFood", food: { SEED: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler", "prothonotary_warbler", "blue_winged_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("discardFoodToTuckFromDeck"),
        birdHasTuckedCards("alice", "alice_canada_goose", 2),
        playerHasFood("alice", { SEED: 0 }),
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests that player can decline the discardFoodToTuckFromDeck power.
   */
  it("can decline discardFoodToTuckFromDeck power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline discardFoodToTuckFromDeck",
      description: "Player declines the American White Pelican power",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 1, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_white_pelican", eggs: 0 }],
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
          label: "Alice declines American White Pelican power",
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
        // Still has FISH (not discarded)
        playerHasFood("alice", { FISH: 1 }),
        birdHasTuckedCards("alice", "alice_american_white_pelican", 0),
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests that the power is skipped when player has no required food.
   */
  it("skips power when required food is unavailable", async () => {
    const scenario: ScenarioConfig = {
      name: "discardFoodToTuckFromDeck - skip no food",
      description: "Power skipped when player has no FISH",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          // No FISH
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 0, FRUIT: 1, RODENT: 1 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_white_pelican", eggs: 0 }],
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
          label: "Alice activates WETLAND but has no FISH",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // No activatePower prompt - power is skipped
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
        handlerWasSkipped("discardFoodToTuckFromDeck"),
        handlerWasNotInvoked("discardFoodToTuckFromDeck"),
        birdHasTuckedCards("alice", "alice_american_white_pelican", 0),
        playerHandSize("alice", 1),
      ],
    });
  });
});

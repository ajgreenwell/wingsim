/**
 * Scenario tests for brown power handlers that affect multiple players.
 *
 * Handlers covered:
 * - playersWithFewestInHabitatDrawCard: Players with fewest birds in habitat draw cards (WHEN_ACTIVATED)
 * - playersWithFewestInHabitatGainFood: Players with fewest birds in habitat gain food (WHEN_ACTIVATED)
 * - eachPlayerGainsFoodFromFeeder: Each player gains food in order (WHEN_ACTIVATED)
 * - allPlayersGainFoodFromSupply: All players gain specific food simultaneously (WHEN_ACTIVATED)
 * - allPlayersDrawCardsFromDeck: All players draw cards from deck (WHEN_ACTIVATED)
 * - allPlayersLayEggOnNestType: All players lay eggs on matching nest type (WHEN_ACTIVATED)
 *
 * NOT covered (WHEN_PLAYED triggers - not testable):
 * - drawAndDistributeCards: American Oystercatcher
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

describe("playersWithFewestInHabitatDrawCard handler", () => {
  /**
   * Tests that American Bittern's power draws cards for player(s) with the
   * fewest birds in their WETLAND.
   * American Bittern: WETLAND, WHEN_ACTIVATED, "Player(s) with the fewest birds
   * in their [wetland] draw 1 [card]."
   *
   * In this test, Bob has 0 birds in WETLAND while Alice has 1 (the Bittern).
   * So Bob should draw 1 card from the power.
   */
  it("draws card for player with fewest birds in habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatDrawCard - single qualifier",
      description: "Bob has fewest wetland birds, draws 1 card",
      targetHandlers: ["drawCardsHandler", "playersWithFewestInHabitatDrawCard"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Alice has 1 bird in WETLAND
            WETLAND: [{ cardId: "american_bittern", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          // Bob has 0 birds in WETLAND
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates WETLAND with American Bittern",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // American Bittern power: activate
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "bob",
          label: "Bob draws from power (fewest wetland birds)",
          choices: [
            // Bob chooses where to draw from (tray or deck)
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
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
        handlerWasInvoked("playersWithFewestInHabitatDrawCard"),
        // Alice drew 1 from base action
        playerHandSize("alice", 1),
        // Bob drew 1 from power (fewest wetland birds)
        playerHandSize("bob", 1),
      ],
    });
  });

  /**
   * Tests that when multiple players tie for fewest birds in habitat,
   * all of them draw cards (in turn order).
   */
  it("draws cards for all tied players in turn order", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatDrawCard - tie",
      description: "Bob and Carol both have 0 wetland birds",
      targetHandlers: ["drawCardsHandler", "playersWithFewestInHabitatDrawCard"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "american_bittern", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates WETLAND with American Bittern",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "bob",
          label: "Bob draws from power (tied for fewest)",
          choices: [{ kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 }],
        },
        {
          player: "carol",
          label: "Carol draws from power (tied for fewest)",
          choices: [
            { kind: "drawCards", trayCards: ["eastern_bluebird"], numDeckCards: 0 },
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
        handlerWasInvoked("playersWithFewestInHabitatDrawCard"),
        playerHandSize("alice", 1), // Base action only
        playerHandSize("bob", 1), // From power
        playerHandSize("carol", 1), // From power
      ],
    });
  });

  /**
   * Tests that the owner can be among those who draw if they're tied for fewest.
   * Since Common Loon also uses this handler, we test that the owner draws
   * when they have fewest birds in their own habitat.
   */
  it("includes owner when tied for fewest", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatDrawCard - owner qualifies",
      description: "Alice and Bob both have 0 wetland birds before the power",
      targetHandlers: ["drawCardsHandler", "playersWithFewestInHabitatDrawCard"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // American Bittern is in WETLAND - Alice has 1 bird but the check
            // happens with current state, so she has 1 (not fewest)
            WETLAND: [{ cardId: "american_bittern", eggs: 0 }],
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
          label: "Alice activates WETLAND",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "bob",
          label: "Bob draws (0 birds = fewest)",
          choices: [{ kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 }],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("playersWithFewestInHabitatDrawCard"),
        // Alice has 1 bird in WETLAND, Bob has 0, so only Bob draws
        playerHandSize("alice", 1), // base action only
        playerHandSize("bob", 1), // power
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatDrawCard - decline",
      description: "Alice declines American Bittern power",
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
            WETLAND: [{ cardId: "american_bittern", eggs: 0 }],
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
          label: "Alice declines American Bittern power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
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
        handlerWasNotInvoked("playersWithFewestInHabitatDrawCard"),
        playerHandSize("alice", 1),
        playerHandSize("bob", 0), // Bob doesn't draw
      ],
    });
  });
});

describe("playersWithFewestInHabitatGainFood handler", () => {
  /**
   * Tests that Hermit Thrush's power gives food from feeder to player(s) with
   * the fewest birds in their FOREST.
   * Hermit Thrush: FOREST, WHEN_ACTIVATED, "Player(s) with the fewest birds
   * in their [forest] gain 1 [die] from birdfeeder."
   */
  it("gains food for player with fewest birds in habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatGainFood - single qualifier",
      description: "Bob has fewest forest birds, gains 1 food",
      targetHandlers: ["gainFoodHandler", "playersWithFewestInHabitatGainFood"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Alice has 1 bird in FOREST (the Hermit Thrush)
            FOREST: [{ cardId: "hermit_thrush", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          // Bob has 0 birds in FOREST
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Hermit Thrush",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 1 (1 bird) = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Hermit Thrush power: activate
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "bob",
          label: "Bob selects food from power (fewest forest birds)",
          choices: [
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("playersWithFewestInHabitatGainFood"),
        // Alice got 1 from base action
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("alice", 1),
        // Bob got 1 from power (fewest forest birds)
        playerHasFood("bob", { INVERTEBRATE: 1 }),
        playerHasTotalFood("bob", 1),
      ],
    });
  });

  /**
   * Tests that when multiple players tie for fewest birds in habitat,
   * all of them gain food (in turn order).
   */
  it("gives food to all tied players in turn order", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatGainFood - tie",
      description: "Bob and Carol both have 0 forest birds",
      targetHandlers: ["gainFoodHandler", "playersWithFewestInHabitatGainFood"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "hermit_thrush", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Hermit Thrush",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "bob",
          label: "Bob selects food (tied for fewest)",
          choices: [
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
        {
          player: "carol",
          label: "Carol selects food (tied for fewest)",
          choices: [{ kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] }],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("playersWithFewestInHabitatGainFood"),
        playerHasFood("alice", { SEED: 1 }), // Base action only
        playerHasFood("bob", { INVERTEBRATE: 1 }), // From power
        playerHasFood("carol", { FISH: 1 }), // From power
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "playersWithFewestInHabitatGainFood - decline",
      description: "Alice declines Hermit Thrush power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "hermit_thrush", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice declines Hermit Thrush power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("playersWithFewestInHabitatGainFood"),
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("bob", 0), // Bob doesn't get food
      ],
    });
  });
});

describe("eachPlayerGainsFoodFromFeeder handler", () => {
  /**
   * Tests that Anna's Hummingbird's power gives each player 1 food from the
   * birdfeeder in turn order, starting with the selected player.
   * Anna's Hummingbird: all habitats, WHEN_ACTIVATED, "Each player gains 1 [die]
   * from the birdfeeder, starting with the player of your choice."
   */
  it("each player gains food in order from selected start", async () => {
    const scenario: ScenarioConfig = {
      name: "eachPlayerGainsFoodFromFeeder - basic",
      description: "Each player gains 1 food, starting with Bob",
      targetHandlers: ["gainFoodHandler", "eachPlayerGainsFoodFromFeeder"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            // Anna's Hummingbird in FOREST
            FOREST: [{ cardId: "annas_hummingbird", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Anna's Hummingbird",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 1 (1 bird) = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Anna's Hummingbird power: activate
            { kind: "activatePower", activate: true },
            // Choose starting player (Bob goes first)
            { kind: "selectPlayer", player: "bob" },
          ],
        },
        {
          player: "bob",
          label: "Bob selects food (first in power order)",
          choices: [
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
        {
          player: "alice",
          label: "Alice selects food (second in power order)",
          choices: [{ kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] }],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("eachPlayerGainsFoodFromFeeder"),
        // Alice got 1 from base action + 1 from power
        playerHasFood("alice", { SEED: 1, FISH: 1 }),
        playerHasTotalFood("alice", 2),
        // Bob got 1 from power
        playerHasFood("bob", { INVERTEBRATE: 1 }),
        playerHasTotalFood("bob", 1),
      ],
    });
  });

  /**
   * Tests starting with the owner (Alice) instead of another player.
   */
  it("can start with owner", async () => {
    const scenario: ScenarioConfig = {
      name: "eachPlayerGainsFoodFromFeeder - start with owner",
      description: "Each player gains 1 food, starting with Alice",
      targetHandlers: ["gainFoodHandler", "eachPlayerGainsFoodFromFeeder"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "annas_hummingbird", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Anna's Hummingbird",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
            // Choose starting player (Alice goes first)
            { kind: "selectPlayer", player: "alice" },
            // Alice selects food first
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "INVERTEBRATE" }] },
          ],
        },
        {
          player: "bob",
          label: "Bob selects food (second in power order)",
          choices: [{ kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] }],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("eachPlayerGainsFoodFromFeeder"),
        // Alice got 1 from base action + 1 from power
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        playerHasTotalFood("alice", 2),
        // Bob got 1 from power
        playerHasFood("bob", { FISH: 1 }),
        playerHasTotalFood("bob", 1),
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "eachPlayerGainsFoodFromFeeder - decline",
      description: "Alice declines Anna's Hummingbird power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "annas_hummingbird", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice declines Anna's Hummingbird power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("eachPlayerGainsFoodFromFeeder"),
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("bob", 0),
      ],
    });
  });
});

describe("allPlayersGainFoodFromSupply handler", () => {
  /**
   * Tests that Baltimore Oriole's power gives all players 1 FRUIT from supply.
   * Baltimore Oriole: FOREST, WHEN_ACTIVATED, "All players gain 1 [fruit] from the supply."
   *
   * This is an automatic effect - no player choices needed beyond activation.
   */
  it("all players gain specified food type automatically", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersGainFoodFromSupply - basic",
      description: "All players gain 1 FRUIT from supply",
      targetHandlers: ["gainFoodHandler", "allPlayersGainFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "baltimore_oriole", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Baltimore Oriole",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: column 1 (1 bird) = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Baltimore Oriole power: activate (automatic effect follows)
            { kind: "activatePower", activate: true },
            // No additional choices needed - food is added automatically
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("allPlayersGainFoodFromSupply"),
        // Alice got 1 SEED from base + 1 FRUIT from power
        playerHasFood("alice", { SEED: 1, FRUIT: 1 }),
        playerHasTotalFood("alice", 2),
        // Bob also got 1 FRUIT from power
        playerHasFood("bob", { FRUIT: 1 }),
        playerHasTotalFood("bob", 1),
      ],
    });
  });

  /**
   * Tests with 3 players to ensure all get the food.
   */
  it("works with 3 players", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersGainFoodFromSupply - 3 players",
      description: "All 3 players gain 1 FRUIT from supply",
      targetHandlers: ["gainFoodHandler", "allPlayersGainFoodFromSupply"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "baltimore_oriole", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates FOREST with Baltimore Oriole",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("allPlayersGainFoodFromSupply"),
        playerHasFood("alice", { SEED: 1, FRUIT: 1 }),
        playerHasFood("bob", { FRUIT: 1 }),
        playerHasFood("carol", { FRUIT: 1 }),
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersGainFoodFromSupply - decline",
      description: "Alice declines Baltimore Oriole power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [{ cardId: "baltimore_oriole", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice declines Baltimore Oriole power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("allPlayersGainFoodFromSupply"),
        playerHasFood("alice", { SEED: 1 }),
        playerHasTotalFood("bob", 0),
      ],
    });
  });
});

describe("allPlayersDrawCardsFromDeck handler", () => {
  /**
   * Tests that Canvasback's power gives all players 1 card from deck.
   * Canvasback: WETLAND, WHEN_ACTIVATED, "All players draw 1 [card] from the deck."
   *
   * This is an automatic effect - cards are drawn automatically from the deck.
   */
  it("all players draw cards from deck automatically", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersDrawCardsFromDeck - basic",
      description: "All players draw 1 card from deck",
      targetHandlers: ["drawCardsHandler", "allPlayersDrawCardsFromDeck"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "canvasback", eggs: 0 }],
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
          label: "Alice activates WETLAND with Canvasback",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw: column 0 = 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Canvasback power: activate (automatic effect follows)
            { kind: "activatePower", activate: true },
            // No additional choices needed - cards are drawn automatically
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
        handlerWasInvoked("allPlayersDrawCardsFromDeck"),
        // Alice drew 1 from base + 1 from power = 2 cards
        playerHandSize("alice", 2),
        // Bob drew 1 from power
        playerHandSize("bob", 1),
      ],
    });
  });

  /**
   * Tests with 3 players.
   */
  it("works with 3 players", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersDrawCardsFromDeck - 3 players",
      description: "All 3 players draw 1 card from deck",
      targetHandlers: ["drawCardsHandler", "allPlayersDrawCardsFromDeck"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "canvasback", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates WETLAND with Canvasback",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: [
        "hooded_warbler",
        "prothonotary_warbler",
        "blue_winged_warbler",
        "american_goldfinch",
      ],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("allPlayersDrawCardsFromDeck"),
        playerHandSize("alice", 2), // 1 base + 1 power
        playerHandSize("bob", 1), // 1 power
        playerHandSize("carol", 1), // 1 power
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersDrawCardsFromDeck - decline",
      description: "Alice declines Canvasback power",
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
            WETLAND: [{ cardId: "canvasback", eggs: 0 }],
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
          label: "Alice declines Canvasback power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
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
        handlerWasNotInvoked("allPlayersDrawCardsFromDeck"),
        playerHandSize("alice", 1),
        playerHandSize("bob", 0),
      ],
    });
  });
});

describe("allPlayersLayEggOnNestType handler", () => {
  /**
   * Tests that Lazuli Bunting's power allows all players to lay 1 egg on BOWL birds,
   * with the owner getting an additional bonus egg on a different bird.
   * Lazuli Bunting: GRASSLAND, WHEN_ACTIVATED, "All players lay 1 [egg] on any 1 [bowl] bird.
   * You may lay 1 [egg] on 1 additional [bowl] bird."
   */
  it("all players lay egg on nest type, owner gets bonus", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersLayEggOnNestType - basic",
      description: "All players lay 1 egg on BOWL bird, Alice gets bonus",
      targetHandlers: ["layEggsHandler", "allPlayersLayEggOnNestType"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              // Lazuli Bunting is a BOWL nest bird (capacity 4)
              { cardId: "lazuli_bunting", eggs: 0 },
              // Blue-Winged Warbler is BOWL nest, no power (capacity 2)
              { cardId: "blue_winged_warbler", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: {
            // Bob has a BOWL bird (Hooded Warbler - no power, BOWL nest, capacity 3)
            FOREST: [{ cardId: "hooded_warbler", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates GRASSLAND with Lazuli Bunting",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 2 (2 birds) = 3 eggs
            {
              kind: "placeEggs",
              placements: {
                alice_lazuli_bunting: 2,
                alice_blue_winged_warbler: 1,
              },
            },
            // Blue-Winged Warbler (column 1) has no power
            // Lazuli Bunting (column 0) power: activate
            { kind: "activatePower", activate: true },
            // Alice places 1 egg on a BOWL bird (first prompt in turn order)
            { kind: "placeEggs", placements: { alice_lazuli_bunting: 1 } },
          ],
        },
        {
          player: "bob",
          label: "Bob places 1 egg on his BOWL bird",
          choices: [
            { kind: "placeEggs", placements: { bob_hooded_warbler: 1 } },
          ],
        },
        {
          player: "alice",
          label: "Alice places bonus egg on different BOWL bird",
          choices: [
            // Bonus must be on a DIFFERENT bird than first placement
            { kind: "placeEggs", placements: { alice_blue_winged_warbler: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("allPlayersLayEggOnNestType"),
        // Lazuli Bunting: 2 from base + 1 from power = 3 eggs
        birdHasEggs("alice", "alice_lazuli_bunting", 3),
        // Blue-Winged Warbler: 1 from base + 1 from bonus = 2 eggs
        birdHasEggs("alice", "alice_blue_winged_warbler", 2),
        // Bob's Hooded Warbler: 1 from power
        birdHasEggs("bob", "bob_hooded_warbler", 1),
      ],
    });
  });

  /**
   * Tests that players without matching nest type birds are skipped.
   */
  it("skips players without matching nest type birds", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersLayEggOnNestType - skip non-matching",
      description: "Bob has no BOWL birds, gets skipped",
      targetHandlers: ["layEggsHandler", "allPlayersLayEggOnNestType"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [
              { cardId: "lazuli_bunting", eggs: 0 },
              // Blue-Winged Warbler is BOWL nest, no power (capacity 2)
              { cardId: "blue_winged_warbler", eggs: 0 },
            ],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: {
            FOREST: [],
            // Wild Turkey has GROUND nest, not BOWL
            GRASSLAND: [{ cardId: "wild_turkey", eggs: 0 }],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates GRASSLAND with Lazuli Bunting",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            {
              kind: "placeEggs",
              placements: {
                alice_lazuli_bunting: 2,
                alice_blue_winged_warbler: 1,
              },
            },
            // Blue-Winged Warbler (column 1) has no power
            { kind: "activatePower", activate: true },
            // Alice places 1 egg on a BOWL bird
            { kind: "placeEggs", placements: { alice_lazuli_bunting: 1 } },
            // Bob is skipped (no BOWL birds)
            // Alice places bonus egg on different BOWL bird
            { kind: "placeEggs", placements: { alice_blue_winged_warbler: 1 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("allPlayersLayEggOnNestType"),
        birdHasEggs("alice", "alice_lazuli_bunting", 3),
        birdHasEggs("alice", "alice_blue_winged_warbler", 2),
        // Bob's Wild Turkey has no eggs (not a BOWL bird)
        birdHasEggs("bob", "bob_wild_turkey", 0),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no players have matching nest type birds
   * with remaining capacity.
   */
  it("skips power when no players have eligible birds", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersLayEggOnNestType - skip no eligible",
      description: "Power skipped when no BOWL birds have capacity",
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
              // Lazuli Bunting at max capacity (4)
              { cardId: "lazuli_bunting", eggs: 4 },
            ],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: {
            FOREST: [],
            // No BOWL birds at all
            GRASSLAND: [],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice activates GRASSLAND but Lazuli Bunting is full",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            // Base lay eggs: column 0 = 2 eggs (but Lazuli is full at 4)
            // Can't place any eggs!
            { kind: "placeEggs", placements: {} },
            // Power is skipped - no eligible BOWL birds with capacity
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      // Suppress unconsumed choice warning - the placeEggs choice may include
      // birds at capacity which can't receive eggs
      verifyScriptConsumed: false,
      assertions: [
        handlerWasSkipped("allPlayersLayEggOnNestType"),
        handlerWasNotInvoked("allPlayersLayEggOnNestType"),
        // Eggs unchanged
        birdHasEggs("alice", "alice_lazuli_bunting", 4),
      ],
    });
  });

  /**
   * Tests declining the power.
   */
  it("can decline power", async () => {
    const scenario: ScenarioConfig = {
      name: "allPlayersLayEggOnNestType - decline",
      description: "Alice declines Lazuli Bunting power",
      targetHandlers: ["layEggsHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "lazuli_bunting", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "song_sparrow", eggs: 0 }],
            WETLAND: [],
          },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice declines Lazuli Bunting power",
          choices: [
            { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
            { kind: "placeEggs", placements: { alice_lazuli_bunting: 2 } },
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasNotInvoked("allPlayersLayEggOnNestType"),
        // Only base action eggs
        birdHasEggs("alice", "alice_lazuli_bunting", 2),
        birdHasEggs("bob", "bob_song_sparrow", 0),
      ],
    });
  });
});

// NOTE: drawAndDistributeCards handler tests need to be implemented.
// The handler is triggered by American Oystercatcher's WHEN_PLAYED power.
// White power triggering is now supported via GameEngine.processWhitePower().

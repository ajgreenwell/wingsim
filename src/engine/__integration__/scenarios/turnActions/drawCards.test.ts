/**
 * Scenario tests for the drawCardsHandler turn action.
 *
 * Tests cover:
 * - Drawing from bird tray
 * - Drawing from deck
 * - Mixed tray/deck draws
 * - Habitat bonus (trade eggs for cards)
 * - Brown power chain triggers after draw cards action
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  playerHandSize,
  eventWasEmitted,
  handlerWasInvoked,
  birdHasEggs,
  birdHasTuckedCards,
  custom,
} from "../../assertions.js";

describe("drawCardsHandler", () => {
  /**
   * Tests basic card draw from bird tray.
   * With 0 birds in WETLAND, player gets 1 card (base reward for column 0).
   */
  it("draws single card from tray with empty wetland", async () => {
    const scenario: ScenarioConfig = {
      name: "Basic card draw from tray",
      description: "Player draws 1 card from tray with empty wetland",
      targetHandlers: ["drawCardsHandler"],

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
          label: "Alice draws card",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Draw 1 card from tray (remaining: 1)
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 1 card
        playerHandSize("alice", 1),

        // Verify HABITAT_ACTIVATED event was emitted for WETLAND
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" &&
          e.habitat === "WETLAND" &&
          e.playerId === "alice"
        ),
      ],
    });
  });

  /**
   * Tests drawing cards from deck instead of tray.
   * Player can choose to draw from deck (blind draw).
   */
  it("draws card from deck", async () => {
    const scenario: ScenarioConfig = {
      name: "Draw from deck",
      description: "Player draws 1 card from deck",
      targetHandlers: ["drawCardsHandler"],

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
          label: "Alice draws from deck",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Draw 1 card from deck (remaining: 1)
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["red_winged_blackbird"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 1 card
        playerHandSize("alice", 1),

        // Verify DRAW_CARDS effect was applied with fromDeck
        custom("DRAW_CARDS effect with fromDeck", (ctx) => {
          const drawEffects = ctx.effects.filter(
            (e) =>
              e.type === "DRAW_CARDS" &&
              e.playerId === "alice" &&
              e.fromDeck > 0
          );
          if (drawEffects.length === 0) {
            throw new Error("Expected DRAW_CARDS effect with fromDeck > 0");
          }
        }),
      ],
    });
  });

  /**
   * Tests drawing multiple cards with 2 birds in WETLAND.
   * Leftmost empty column is 2, which gives base reward of 2 cards.
   * Uses trumpeter_swan which has no power to avoid brown power triggers.
   */
  it("draws multiple cards with birds in wetland", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple card draw",
      description: "Player draws 2 cards with 2 birds in wetland",
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
            // Two no-power WETLAND birds to reach column 2 (base reward: 2)
            WETLAND: [
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
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
          label: "Alice draws 2 cards",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // First draw: 1 card from tray (remaining: 2)
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
            // Second draw: 1 card from tray (remaining: 1)
            {
              kind: "drawCards",
              trayCards: ["eastern_bluebird"],
              numDeckCards: 0,
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 2 cards
        playerHandSize("alice", 2),
      ],
    });
  });

  /**
   * Tests mixed draw from both tray and deck.
   * Player draws one card from tray and one from deck.
   */
  it("draws cards from both tray and deck", async () => {
    const scenario: ScenarioConfig = {
      name: "Mixed tray and deck draw",
      description: "Player draws 1 from tray and 1 from deck",
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
            // Two birds to get 2 cards base reward
            WETLAND: [
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
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
          label: "Alice draws from both sources",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // First draw: 1 from deck (remaining: 2)
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Second draw: 1 from tray (remaining: 1)
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      deckTopCards: ["red_winged_blackbird"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 2 cards total
        playerHandSize("alice", 2),
      ],
    });
  });

  /**
   * Tests drawing multiple cards in a single choice.
   * When remaining > 1, player can select multiple tray cards in one choice.
   */
  it("draws multiple cards in single choice", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple cards in single choice",
      description: "Player draws 2 cards from tray in one choice",
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
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
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
          label: "Alice draws 2 cards in one choice",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Draw both cards from tray in one choice
            {
              kind: "drawCards",
              trayCards: ["barn_owl", "eastern_bluebird"],
              numDeckCards: 0,
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 2 cards
        playerHandSize("alice", 2),
      ],
    });
  });

  /**
   * Tests habitat bonus: trade 1 egg to draw 1 extra card.
   * The bonus is available at columns 1, 3, 5 (see player_board.json).
   * With 1 bird in WETLAND, leftmost empty is column 1, which has a bonus slot.
   */
  it("applies habitat bonus: trade egg for extra card", async () => {
    const scenario: ScenarioConfig = {
      name: "Habitat bonus card draw",
      description: "Player trades 1 egg to draw 1 extra card",
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
            // 1 bird in WETLAND to reach column 1 where bonus is available
            // trumpeter_swan has eggs to spend for bonus
            WETLAND: [{ cardId: "trumpeter_swan", eggs: 1 }],
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
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: true },
            // Discard 1 egg for bonus
            { kind: "discardEggs", sources: { alice_trumpeter_swan: 1 } },
            // Column 1 has base reward 1 + bonus 1 = 2 cards
            // First draw
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
            // Second draw (bonus)
            {
              kind: "drawCards",
              trayCards: ["eastern_bluebird"],
              numDeckCards: 0,
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 2 cards (1 base + 1 bonus)
        playerHandSize("alice", 2),

        // Bird should have 0 eggs left (discarded for bonus)
        birdHasEggs("alice", "alice_trumpeter_swan", 0),

        // Verify DISCARD_EGGS effect was emitted
        custom("DISCARD_EGGS effect was emitted", (ctx) => {
          const discardEffects = ctx.effects.filter(
            (e) => e.type === "DISCARD_EGGS" && e.playerId === "alice"
          );
          if (discardEffects.length === 0) {
            throw new Error("Expected DISCARD_EGGS effect for bonus trade");
          }
        }),
      ],
    });
  });

  /**
   * Tests that bonus is not applied when player has no eggs.
   * Even with takeBonus: true, bonus requires eggs to discard.
   */
  it("does not apply bonus when player has no eggs", async () => {
    const scenario: ScenarioConfig = {
      name: "No bonus without eggs",
      description: "Player cannot use bonus without eggs to trade",
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
            // 1 bird to reach column 1, but NO eggs to trade
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
          label: "Alice tries bonus without eggs",
          choices: [
            // Request bonus, but no eggs means no discard prompt
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: true },
            // Only base reward: 1 card (column 1)
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn only 1 card (no bonus)
        playerHandSize("alice", 1),
      ],
    });
  });

  /**
   * Tests brown power chain triggers after draw cards action.
   * Uses american_coot which has tuckAndDraw power.
   * This bird can tuck a card from hand and draw another.
   */
  it("triggers brown power chain after card draw", async () => {
    const scenario: ScenarioConfig = {
      name: "Brown power chain",
      description: "Brown powers trigger after DRAW_CARDS habitat activation",
      targetHandlers: ["drawCardsHandler", "tuckAndDraw"],

      players: [
        {
          id: "alice",
          // Give alice a card in hand to tuck
          hand: ["blue_gray_gnatcatcher"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // american_coot has tuckAndDraw brown power
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
          label: "Alice draws card, then triggers brown power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Column 1 gives 1 card base reward
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
            // american_coot power: choose to activate
            { kind: "activatePower", activate: true },
            // Tuck the gnatcatcher from hand
            { kind: "selectCards", cards: ["blue_gray_gnatcatcher"] },
            // Draw a card from the power (tuckAndDraw)
            {
              kind: "drawCards",
              trayCards: ["eastern_bluebird"],
              numDeckCards: 0,
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify brown power handler was invoked
        handlerWasInvoked("tuckAndDraw"),

        // Alice should have 2 cards: barn_owl from base + eastern_bluebird from power
        // (gnatcatcher was tucked)
        playerHandSize("alice", 2),

        // Bird should have 1 tucked card
        birdHasTuckedCards("alice", "alice_american_coot", 1),
      ],
    });
  });

  /**
   * Tests declining optional brown power after card draw.
   */
  it("allows declining brown power after card draw", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline brown power",
      description: "Player declines optional brown power after card draw",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: ["blue_gray_gnatcatcher"],
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
          label: "Alice declines brown power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            { kind: "drawCards", trayCards: ["barn_owl"], numDeckCards: 0 },
            // Decline the brown power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have 2 cards: original gnatcatcher + drawn barn_owl
        playerHandSize("alice", 2),

        // Bird should have 0 tucked cards (power was declined)
        birdHasTuckedCards("alice", "alice_american_coot", 0),
      ],
    });
  });

  /**
   * Tests that empty tray/deck doesn't crash.
   * When no cards are available, the action completes gracefully.
   */
  it("handles empty tray gracefully", async () => {
    const scenario: ScenarioConfig = {
      name: "Empty tray",
      description: "Player draws from deck when tray is empty",
      targetHandlers: ["drawCardsHandler"],

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
          label: "Alice draws from empty tray",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // With empty tray, must draw from deck
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Empty tray - will be null slots
      birdTray: [],
      deckTopCards: ["red_winged_blackbird"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 1 card from deck
        playerHandSize("alice", 1),

        // HABITAT_ACTIVATED should still fire
        eventWasEmitted("HABITAT_ACTIVATED", (e) =>
          e.type === "HABITAT_ACTIVATED" && e.habitat === "WETLAND"
        ),
      ],
    });
  });

  /**
   * Tests drawing 3 cards with more birds in wetland.
   * With 4 birds in WETLAND, leftmost empty is column 4, which gives 3 cards.
   */
  it("draws 3 cards with full wetland row", async () => {
    const scenario: ScenarioConfig = {
      name: "Maximum card draw",
      description: "Player draws 3 cards with 4 birds in wetland",
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
            // 4 birds to reach column 4 (base reward: 3)
            WETLAND: [
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
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
          label: "Alice draws 3 cards",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Draw all 3 cards from tray
            {
              kind: "drawCards",
              trayCards: ["barn_owl", "eastern_bluebird", "song_sparrow"],
              numDeckCards: 0,
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have drawn 3 cards
        playerHandSize("alice", 3),
      ],
    });
  });
});

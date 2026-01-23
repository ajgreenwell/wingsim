/**
 * Scenario tests for brown power handlers that draw cards.
 *
 * Handlers covered:
 * - drawCards: Draw cards from deck or tray (WHEN_ACTIVATED)
 * - drawCardsWithDelayedDiscard: Draw cards now, discard at end of turn (WHEN_ACTIVATED)
 *
 * NOTE: WHEN_PLAYED (white power) handlers have been moved to whitePowers/:
 * - drawFaceUpCardsFromTray: See whitePowers/drawCardHandlers.test.ts
 * - drawBonusCardsAndKeep: See whitePowers/drawCardHandlers.test.ts
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasSkipped,
  playerHandSize,
  playerHasCardInHand,
  custom,
} from "../../assertions.js";

describe("drawCards handler", () => {
  /**
   * Tests that Mallard can draw 1 card from the deck.
   * Mallard: WETLAND, WHEN_ACTIVATED, "Draw 1 [card]."
   */
  it("draws card from deck", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCards - from deck",
      description: "Mallard draws 1 card from deck",
      targetHandlers: ["drawCardsHandler", "drawCards"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "mallard", eggs: 0 }],
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
          label: "Alice activates WETLAND with Mallard",
          choices: [
            // Turn action: DRAW_CARDS in WETLAND
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base draw cards action: column 0 = 1 card from tray/deck
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Mallard power: activate
            { kind: "activatePower", activate: true },
            // Draw 1 card from deck via power
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Set up tray separately so deckTopCards stay in deck
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      // Stack deck with known cards for drawing
      deckTopCards: ["hooded_warbler", "prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawCards"),
        // 1 from base action + 1 from power = 2 cards in hand
        playerHandSize("alice", 2),
        // Verify specific cards drawn (deck draws from top)
        playerHasCardInHand("alice", "hooded_warbler"),
        playerHasCardInHand("alice", "prothonotary_warbler"),
      ],
    });
  });

  /**
   * Tests that Mallard can draw 1 card from the bird tray.
   */
  it("draws card from bird tray", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCards - from tray",
      description: "Mallard draws 1 card from tray",
      targetHandlers: ["drawCardsHandler", "drawCards"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "mallard", eggs: 0 }],
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
          label: "Alice activates WETLAND with Mallard",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base action: draw from tray
            { kind: "drawCards", trayCards: ["hooded_warbler"], numDeckCards: 0 },
            // Mallard power: activate
            { kind: "activatePower", activate: true },
            // Draw from tray via power
            { kind: "drawCards", trayCards: ["prothonotary_warbler"], numDeckCards: 0 },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Set up bird tray with specific cards
      birdTray: ["hooded_warbler", "prothonotary_warbler", "blue_winged_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawCards"),
        playerHandSize("alice", 2),
        playerHasCardInHand("alice", "hooded_warbler"),
        playerHasCardInHand("alice", "prothonotary_warbler"),
      ],
    });
  });

  /**
   * Tests that player can decline the optional drawCards power.
   */
  it("can decline drawCards power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline drawCards",
      description: "Player declines the Mallard power",
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
            WETLAND: [{ cardId: "mallard", eggs: 0 }],
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
          label: "Alice declines Mallard power",
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
      deckTopCards: ["hooded_warbler", "prothonotary_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Only 1 card from base action
        playerHandSize("alice", 1),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

});

describe("drawCardsWithDelayedDiscard handler", () => {
  /**
   * Tests that Black Tern draws 1 card and then must discard 1 at end of turn.
   * Black Tern: WETLAND, WHEN_ACTIVATED
   * "Draw 1 [card]. If you do, discard 1 [card] from your hand at the end of your turn."
   */
  it("draws card now and discards at end of turn", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCardsWithDelayedDiscard - basic",
      description: "Black Tern draws 1, discards 1 at end of turn",
      targetHandlers: ["drawCardsHandler", "drawCardsWithDelayedDiscard"],

      players: [
        {
          id: "alice",
          // Start with 1 card in hand to have something to discard
          hand: ["american_woodcock"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "black_tern", eggs: 0 }],
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
          label: "Alice uses Black Tern power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base action: draw 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Black Tern power: activate
            { kind: "activatePower", activate: true },
            // Deferred discard at end of turn - discard one card
            { kind: "selectCards", cards: ["american_woodcock"] },
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
        handlerWasInvoked("drawCardsWithDelayedDiscard"),
        // Started with 1, base drew 1, power drew 1, discarded 1 = 2 cards
        playerHandSize("alice", 2),
        // Verify drew from deck (hooded_warbler first)
        playerHasCardInHand("alice", "hooded_warbler"),
        // Second card drawn from power (prothonotary_warbler)
        playerHasCardInHand("alice", "prothonotary_warbler"),
        // american_woodcock was discarded
        custom("american_woodcock was discarded", (ctx) => {
          const player = ctx.engine.getGameState().findPlayer("alice");
          const hasCard = player.hand.some((c) => c.id === "american_woodcock");
          if (hasCard) {
            throw new Error("american_woodcock should have been discarded");
          }
        }),
      ],
    });
  });

  /**
   * Tests that player can decline the drawCardsWithDelayedDiscard power.
   */
  it("can decline drawCardsWithDelayedDiscard power", async () => {
    const scenario: ScenarioConfig = {
      name: "decline drawCardsWithDelayedDiscard",
      description: "Player declines the Black Tern power",
      targetHandlers: ["drawCardsHandler"],

      players: [
        {
          id: "alice",
          hand: ["american_woodcock"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "black_tern", eggs: 0 }],
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
          label: "Alice declines Black Tern power",
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
        // 1 starting + 1 base action = 2 cards (no discard since power declined)
        playerHandSize("alice", 2),
        playerHasCardInHand("alice", "american_woodcock"),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests with a bird that draws 2 cards and discards 1.
   * Common Yellowthroat: WETLAND, "Draw 2 [card]. If you do, discard 1 [card]..."
   */
  it("draws 2 cards and discards 1 at end of turn", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCardsWithDelayedDiscard - draw 2 discard 1",
      description: "Common Yellowthroat draws 2, discards 1",
      targetHandlers: ["drawCardsHandler", "drawCardsWithDelayedDiscard"],

      players: [
        {
          id: "alice",
          hand: ["american_woodcock"],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "common_yellowthroat", eggs: 0 }],
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
          label: "Alice uses Common Yellowthroat power",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base action: draw 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Common Yellowthroat power: activate
            { kind: "activatePower", activate: true },
            // Deferred discard at end of turn
            { kind: "selectCards", cards: ["american_woodcock"] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "eastern_bluebird", "song_sparrow"],
      // Need 3 cards: 1 for base, 2 for power
      deckTopCards: ["hooded_warbler", "prothonotary_warbler", "blue_winged_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawCardsWithDelayedDiscard"),
        // Started 1 + base 1 + power 2 - discarded 1 = 3 cards
        playerHandSize("alice", 3),
        playerHasCardInHand("alice", "hooded_warbler"),
        playerHasCardInHand("alice", "prothonotary_warbler"),
        playerHasCardInHand("alice", "blue_winged_warbler"),
      ],
    });
  });

  /**
   * Tests that the power is skipped when both deck AND discard are empty.
   * The engine gracefully handles attempts to draw from an empty deck by drawing 0 cards.
   * The power handler checks for available cards before prompting, so it auto-skips.
   */
  it("skips power when deck and discard are both empty", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCardsWithDelayedDiscard - empty deck",
      description: "Power is skipped when no cards available to draw",
      targetHandlers: ["drawCardsWithDelayedDiscard"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "black_tern", eggs: 0 }],
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

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Use empty tray and empty deck for this test
      birdTray: [null, null, null],
      emptyBirdDeck: true,

      turns: [
        {
          player: "alice",
          label: "Activate wetland - power skipped due to empty deck",
          choices: [
            // DRAW_CARDS action activates wetland habitat
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base action: request deck draw, but deck is empty - gracefully draws 0
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Power is auto-skipped - no activation prompt needed since deck is empty
          ],
        },
      ],
    };

    await runScenario(scenario, {
      assertions: [
        // Verify the deck and discard are empty
        (ctx) => {
          const state = ctx.engine.getGameState();
          const deckSize = state.birdCardSupply.getDeckSize();
          const discardSize = state.birdCardSupply.getDiscardSize();
          if (deckSize !== 0 || discardSize !== 0) {
            throw new Error(
              `Expected empty deck and discard, got deck=${deckSize}, discard=${discardSize}`
            );
          }
        },
        // Handler was skipped due to empty deck (resource unavailable)
        handlerWasSkipped("drawCardsWithDelayedDiscard"),
        // Alice has no cards (deck was empty)
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests delayed discard when hand becomes empty before end of turn.
   * Edge case: player discards all cards before the deferred discard runs.
   */
  it("handles deferred discard when hand has fewer cards than required", async () => {
    const scenario: ScenarioConfig = {
      name: "drawCardsWithDelayedDiscard - partial discard",
      description: "Deferred discard adapts to current hand size",
      targetHandlers: ["drawCardsHandler", "drawCardsWithDelayedDiscard"],

      players: [
        {
          id: "alice",
          // Start with no cards
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "black_tern", eggs: 0 }],
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
          label: "Alice uses Black Tern power starting with empty hand",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // Base action: draw 1 card
            { kind: "drawCards", trayCards: [], numDeckCards: 1 },
            // Black Tern power: activate
            { kind: "activatePower", activate: true },
            // Deferred discard: must discard 1 (only has 2 cards now)
            { kind: "selectCards", cards: ["hooded_warbler"] },
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
        handlerWasInvoked("drawCardsWithDelayedDiscard"),
        // Started 0 + base 1 + power 1 - discarded 1 = 1 card
        playerHandSize("alice", 1),
        playerHasCardInHand("alice", "prothonotary_warbler"),
      ],
    });
  });
});


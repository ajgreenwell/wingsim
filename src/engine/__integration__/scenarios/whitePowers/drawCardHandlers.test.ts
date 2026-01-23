/**
 * Scenario tests for white power (WHEN_PLAYED) handlers that draw cards.
 *
 * Handlers covered:
 * - drawFaceUpCardsFromTray: Brant (WHEN_PLAYED)
 * - drawBonusCardsAndKeep: Atlantic Puffin, Bell's Vireo, etc. (WHEN_PLAYED)
 *
 * These tests verify that WHEN_PLAYED powers are automatically triggered
 * by the GameEngine when a bird is played.
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasSkipped,
  playerHandSize,
  playerHasCardInHand,
  playerBonusCardCount,
  birdExistsOnBoard,
} from "../../assertions.js";

describe("drawFaceUpCardsFromTray handler (white power)", () => {
  /**
   * Tests that Brant's WHEN_PLAYED power draws all face-up cards from tray.
   * Brant: WETLAND, costs SEED: 1, WILD: 1
   * Power: "Draw the 3 face-up [card] in the bird tray."
   */
  it("draws all face-up cards from tray when played", async () => {
    const scenario: ScenarioConfig = {
      name: "Brant white power - basic",
      description: "Brant draws all 3 face-up cards from tray",
      targetHandlers: ["playBirdHandler", "drawFaceUpCardsFromTray"],

      players: [
        {
          id: "alice",
          hand: ["brant"],
          bonusCards: [],
          // Brant costs SEED: 1, WILD: 1 - pay with 1 SEED + 1 INVERTEBRATE
          food: { SEED: 1, INVERTEBRATE: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Brant and draws tray cards",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "brant",
              habitat: "WETLAND",
              foodToSpend: { SEED: 1, INVERTEBRATE: 1 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Set up specific cards in tray
      birdTray: ["barn_owl", "mallard", "hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawFaceUpCardsFromTray"),
        birdExistsOnBoard("alice", "alice_brant"),
        // Alice should have 3 cards from tray
        playerHandSize("alice", 3),
        playerHasCardInHand("alice", "barn_owl"),
        playerHasCardInHand("alice", "mallard"),
        playerHasCardInHand("alice", "hooded_warbler"),
      ],
    });
  });

  /**
   * Tests that power handles partial tray (fewer than 3 cards).
   */
  it("handles partial tray when some cards already taken", async () => {
    const scenario: ScenarioConfig = {
      name: "Brant white power - partial tray",
      description: "Brant draws remaining cards when tray has fewer than 3",
      targetHandlers: ["playBirdHandler", "drawFaceUpCardsFromTray"],

      players: [
        {
          id: "alice",
          hand: ["brant"],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Brant with partial tray",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "brant",
              habitat: "WETLAND",
              foodToSpend: { SEED: 1, INVERTEBRATE: 1 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Only 1 card in tray (simulating cards already taken)
      birdTray: ["barn_owl"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawFaceUpCardsFromTray"),
        birdExistsOnBoard("alice", "alice_brant"),
        // Alice should have 1 card from the partial tray
        playerHandSize("alice", 1),
        playerHasCardInHand("alice", "barn_owl"),
      ],
    });
  });

  /**
   * Tests that power is skipped when tray is empty.
   */
  it("skips when tray is empty", async () => {
    const scenario: ScenarioConfig = {
      name: "Brant white power - empty tray",
      description: "Power skipped when no cards in tray",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["brant"],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Brant with empty tray",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "brant",
              habitat: "WETLAND",
              foodToSpend: { SEED: 1, INVERTEBRATE: 1 },
              eggsToSpend: {},
            },
            // Power is skipped - no cards in tray
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Empty tray
      birdTray: [],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("drawFaceUpCardsFromTray"),
        birdExistsOnBoard("alice", "alice_brant"),
        // Alice has no cards in hand
        playerHandSize("alice", 0),
      ],
    });
  });

  /**
   * Tests that player can decline the power.
   */
  it("can decline the power", async () => {
    const scenario: ScenarioConfig = {
      name: "Brant white power - decline",
      description: "Player declines Brant power",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["brant"],
          bonusCards: [],
          food: { SEED: 1, INVERTEBRATE: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Brant and declines power",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "brant",
              habitat: "WETLAND",
              foodToSpend: { SEED: 1, INVERTEBRATE: 1 },
              eggsToSpend: {},
            },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["barn_owl", "mallard", "hooded_warbler"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        birdExistsOnBoard("alice", "alice_brant"),
        // Alice has no cards - power was declined
        playerHandSize("alice", 0),
      ],
    });
  });
});

describe("drawBonusCardsAndKeep handler (white power)", () => {
  /**
   * Tests that Atlantic Puffin's WHEN_PLAYED power draws and keeps bonus cards.
   * Atlantic Puffin: WETLAND, costs FISH: 3
   * Power: "Draw 2 new bonus cards and keep 1."
   */
  it("draws bonus cards and keeps selected ones", async () => {
    const scenario: ScenarioConfig = {
      name: "Atlantic Puffin white power - basic",
      description: "Atlantic Puffin draws 2 bonus cards, keeps 1",
      targetHandlers: ["playBirdHandler", "drawBonusCardsAndKeep"],

      players: [
        {
          id: "alice",
          hand: ["atlantic_puffin"],
          bonusCards: [],
          food: { FISH: 3 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Atlantic Puffin and gets bonus card",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "atlantic_puffin",
              habitat: "WETLAND",
              foodToSpend: { FISH: 3 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
            // Select bonus card to keep (first of 2 drawn)
            { kind: "selectBonusCards", cards: ["anatomist"] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      // Set up bonus deck with known cards
      bonusDeckTopCards: ["anatomist", "cartographer", "ecologist"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawBonusCardsAndKeep"),
        birdExistsOnBoard("alice", "alice_atlantic_puffin"),
        // Alice should have 1 bonus card
        playerBonusCardCount("alice", 1),
      ],
    });
  });

  /**
   * Tests that Bell's Vireo can also draw and keep bonus cards.
   * Bell's Vireo: FOREST/GRASSLAND, costs INVERTEBRATE: 2
   * Power: "Draw 2 new bonus cards and keep 1."
   */
  it("works with multi-habitat birds like Bell's Vireo", async () => {
    const scenario: ScenarioConfig = {
      name: "Bell's Vireo white power",
      description: "Bell's Vireo draws 2 bonus cards, keeps 1",
      targetHandlers: ["playBirdHandler", "drawBonusCardsAndKeep"],

      players: [
        {
          id: "alice",
          hand: ["bells_vireo"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Bell's Vireo in FOREST",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "bells_vireo",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
            // Select bonus card to keep
            { kind: "selectBonusCards", cards: ["ecologist"] },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      bonusDeckTopCards: ["ecologist", "photographer", "historian"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("drawBonusCardsAndKeep"),
        birdExistsOnBoard("alice", "alice_bells_vireo"),
        playerBonusCardCount("alice", 1),
      ],
    });
  });

  /**
   * Tests that player can decline the bonus card power.
   */
  it("can decline the power", async () => {
    const scenario: ScenarioConfig = {
      name: "Atlantic Puffin white power - decline",
      description: "Player declines Atlantic Puffin power",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["atlantic_puffin"],
          bonusCards: [],
          food: { FISH: 3 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
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
          label: "Alice plays Atlantic Puffin and declines power",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "atlantic_puffin",
              habitat: "WETLAND",
              foodToSpend: { FISH: 3 },
              eggsToSpend: {},
            },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      bonusDeckTopCards: ["anatomist", "cartographer"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        birdExistsOnBoard("alice", "alice_atlantic_puffin"),
        // Alice has no bonus cards - power was declined
        playerBonusCardCount("alice", 0),
      ],
    });
  });
});

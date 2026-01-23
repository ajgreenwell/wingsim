/**
 * Scenario tests for white power (WHEN_PLAYED) handlers that gain food.
 *
 * Handlers covered:
 * - gainAllFoodTypeFromFeeder: Bald Eagle, Northern Flicker (WHEN_PLAYED)
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
  playerHasFood,
  playerHasTotalFood,
  birdExistsOnBoard,
} from "../../assertions.js";

describe("gainAllFoodTypeFromFeeder handler (white power)", () => {
  /**
   * Tests that Bald Eagle's WHEN_PLAYED power gains all FISH from the feeder.
   * Bald Eagle: WETLAND, costs FISH: 2, WILD: 1
   * Power: "Gain all [fish] that are in the birdfeeder."
   */
  it("gains all matching food from feeder when played", async () => {
    const scenario: ScenarioConfig = {
      name: "Bald Eagle white power - basic",
      description: "Bald Eagle gains all FISH from feeder when played",
      targetHandlers: ["playBirdHandler", "gainAllFoodTypeFromFeeder"],

      players: [
        {
          id: "alice",
          hand: ["bald_eagle"],
          bonusCards: [],
          // Bald Eagle costs FISH: 2, WILD: 1 - pay with 2 FISH + 1 RODENT
          food: { FISH: 2, RODENT: 1 },
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
          label: "Alice plays Bald Eagle and gains all FISH",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "bald_eagle",
              habitat: "WETLAND",
              foodToSpend: { FISH: 2, RODENT: 1 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      // 2 FISH in feeder for the power to collect
      birdfeeder: ["FISH", "FISH", "SEED", "INVERTEBRATE", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainAllFoodTypeFromFeeder"),
        birdExistsOnBoard("alice", "alice_bald_eagle"),
        // Alice paid 2 FISH + 1 RODENT, then gained 2 FISH from power
        // Final: 2 FISH (paid 2, gained 2)
        playerHasFood("alice", { FISH: 2, RODENT: 0 }),
      ],
    });
  });

  /**
   * Tests that Northern Flicker collects INVERTEBRATE + dual dice when matching.
   * Northern Flicker: FOREST/GRASSLAND, costs WILD: 2
   * Power: "Gain all [invertebrate] that are in the birdfeeder."
   *
   * SEED_INVERTEBRATE dual dice should count as INVERTEBRATE.
   */
  it("collects dual dice when matching food type", async () => {
    const scenario: ScenarioConfig = {
      name: "Northern Flicker white power - dual dice",
      description: "Northern Flicker gains INVERTEBRATE including dual dice",
      targetHandlers: ["playBirdHandler", "gainAllFoodTypeFromFeeder"],

      players: [
        {
          id: "alice",
          hand: ["northern_flicker"],
          bonusCards: [],
          // Northern Flicker costs WILD: 2 - pay with any 2 food
          food: { SEED: 2 },
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
          label: "Alice plays Northern Flicker and gains all INVERTEBRATE",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "northern_flicker",
              habitat: "FOREST",
              foodToSpend: { SEED: 2 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      // INVERTEBRATE and SEED_INVERTEBRATE (dual) both count
      birdfeeder: [
        "INVERTEBRATE",
        "INVERTEBRATE",
        "SEED_INVERTEBRATE",
        "SEED",
        "FISH",
      ],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("gainAllFoodTypeFromFeeder"),
        birdExistsOnBoard("alice", "alice_northern_flicker"),
        // Alice paid 2 SEED, gained 3 INVERTEBRATE (2 regular + 1 dual)
        playerHasFood("alice", { INVERTEBRATE: 3, SEED: 0 }),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no matching food in feeder.
   */
  it("skips when no matching food in feeder", async () => {
    const scenario: ScenarioConfig = {
      name: "Bald Eagle white power - no fish",
      description: "Power skipped when no FISH in feeder",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["bald_eagle"],
          bonusCards: [],
          food: { FISH: 2, RODENT: 1 },
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
          label: "Alice plays Bald Eagle with no FISH in feeder",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "bald_eagle",
              habitat: "WETLAND",
              foodToSpend: { FISH: 2, RODENT: 1 },
              eggsToSpend: {},
            },
            // Power is skipped - no prompt needed
          ],
        },
      ],

      // No FISH in feeder
      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasSkipped("gainAllFoodTypeFromFeeder"),
        birdExistsOnBoard("alice", "alice_bald_eagle"),
        // Alice paid food but gained nothing from power
        playerHasFood("alice", { FISH: 0, RODENT: 0 }),
        playerHasTotalFood("alice", 0),
      ],
    });
  });

  /**
   * Tests that the player can decline the white power.
   */
  it("can decline the power", async () => {
    const scenario: ScenarioConfig = {
      name: "Bald Eagle white power - decline",
      description: "Player declines Bald Eagle power",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["bald_eagle"],
          bonusCards: [],
          food: { FISH: 2, RODENT: 1 },
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
          label: "Alice plays Bald Eagle and declines power",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "bald_eagle",
              habitat: "WETLAND",
              foodToSpend: { FISH: 2, RODENT: 1 },
              eggsToSpend: {},
            },
            // Decline the power
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["FISH", "FISH", "SEED", "INVERTEBRATE", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        birdExistsOnBoard("alice", "alice_bald_eagle"),
        // Alice paid food but didn't get power benefit
        playerHasFood("alice", { FISH: 0, RODENT: 0 }),
        playerHasTotalFood("alice", 0),
      ],
    });
  });
});

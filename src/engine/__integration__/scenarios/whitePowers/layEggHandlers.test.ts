/**
 * Scenario tests for white power (WHEN_PLAYED) handlers that lay eggs.
 *
 * Handlers covered:
 * - layEggOnBirdsWithNestType: Ash-Throated Flycatcher (CAVITY), Bobolink (GROUND),
 *   Inca Dove (PLATFORM), Say's Phoebe (BOWL) - all WHEN_PLAYED
 *
 * These tests verify that WHEN_PLAYED powers are automatically triggered
 * by the GameEngine when a bird is played.
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  birdExistsOnBoard,
  birdHasEggs,
} from "../../assertions.js";

describe("layEggOnBirdsWithNestType handler (white power)", () => {
  /**
   * Tests that Ash-Throated Flycatcher's WHEN_PLAYED power lays eggs on CAVITY birds.
   * Ash-Throated Flycatcher: GRASSLAND, costs INVERTEBRATE: 2, FRUIT: 1
   * Power: "Lay 1 [egg] on each of your birds with a [cavity] nest."
   * This bird itself has CAVITY nest.
   */
  it("lays eggs on all birds with matching nest type", async () => {
    const scenario: ScenarioConfig = {
      name: "Ash-Throated Flycatcher white power - basic",
      description: "Lays 1 egg on each CAVITY nest bird",
      targetHandlers: ["playBirdHandler", "layEggOnBirdsWithNestType"],

      players: [
        {
          id: "alice",
          hand: ["ash_throated_flycatcher"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, FRUIT: 1 },
          board: {
            FOREST: [
              // Downy Woodpecker has CAVITY nest (capacity 2)
              { cardId: "downy_woodpecker", eggs: 0 },
            ],
            GRASSLAND: [
              // Eastern Bluebird has CAVITY nest (capacity 5) - has eggs for egg cost
              { cardId: "eastern_bluebird", eggs: 2 },
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
          label: "Alice plays Ash-Throated Flycatcher",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "ash_throated_flycatcher",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2, FRUIT: 1 },
              // Column 1 costs 1 egg (playBirdCosts[1] = 1)
              eggsToSpend: { alice_eastern_bluebird: 1 },
            },
            // WHEN_PLAYED power triggers automatically
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggOnBirdsWithNestType"),
        birdExistsOnBoard("alice", "alice_ash_throated_flycatcher"),
        // Downy Woodpecker (CAVITY) should have 1 egg from power
        birdHasEggs("alice", "alice_downy_woodpecker", 1),
        // Eastern Bluebird (CAVITY) started with 2, paid 1, gained 1 = 2
        birdHasEggs("alice", "alice_eastern_bluebird", 2),
        // The just-played bird also has CAVITY - should get 1 egg too
        birdHasEggs("alice", "alice_ash_throated_flycatcher", 1),
      ],
    });
  });

  /**
   * Tests that WILD nest birds are included when matching nest type.
   * WILD nests count as any nest type.
   */
  it("includes WILD nest birds when matching nest type", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggOnBirdsWithNestType - WILD nest inclusion",
      description: "WILD nest birds count as matching any nest type",
      targetHandlers: ["playBirdHandler", "layEggOnBirdsWithNestType"],

      players: [
        {
          id: "alice",
          hand: ["ash_throated_flycatcher"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, FRUIT: 1 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Atlantic Puffin has WILD nest (capacity 1)
            WETLAND: [{ cardId: "atlantic_puffin", eggs: 0 }],
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
          label: "Alice plays Ash-Throated Flycatcher",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "ash_throated_flycatcher",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2, FRUIT: 1 },
              eggsToSpend: {},
            },
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggOnBirdsWithNestType"),
        birdExistsOnBoard("alice", "alice_ash_throated_flycatcher"),
        // Atlantic Puffin (WILD) should get 1 egg - WILD matches any nest type
        birdHasEggs("alice", "alice_atlantic_puffin", 1),
        // The just-played bird (CAVITY) should also get 1 egg
        birdHasEggs("alice", "alice_ash_throated_flycatcher", 1),
      ],
    });
  });

  /**
   * Tests that the power is skipped when no birds have matching nest type.
   * Note: The just-played bird itself has CAVITY nest, so it will still get an egg.
   */
  it("only affects birds with matching nest type", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggOnBirdsWithNestType - non-matching birds",
      description: "Only CAVITY birds get eggs, not GROUND",
      targetHandlers: ["playBirdHandler", "layEggOnBirdsWithNestType"],

      players: [
        {
          id: "alice",
          hand: ["ash_throated_flycatcher"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, FRUIT: 1 },
          board: {
            // Wild Turkey has GROUND nest, not CAVITY
            FOREST: [],
            GRASSLAND: [{ cardId: "wild_turkey", eggs: 2 }],
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
          label: "Alice plays Ash-Throated Flycatcher with no CAVITY birds",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "ash_throated_flycatcher",
              habitat: "GRASSLAND",
              // Column 1 costs 1 egg (playBirdCosts[1] = 1)
              foodToSpend: { INVERTEBRATE: 2, FRUIT: 1 },
              eggsToSpend: { alice_wild_turkey: 1 },
            },
            // Power activates but only places egg on the just-played bird (which is CAVITY)
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggOnBirdsWithNestType"),
        birdExistsOnBoard("alice", "alice_ash_throated_flycatcher"),
        // Wild Turkey (GROUND) should NOT have gained an egg from power
        // Started with 2, paid 1 for egg cost = 1 remaining
        birdHasEggs("alice", "alice_wild_turkey", 1),
        // The just-played bird (CAVITY) gets 1 egg
        birdHasEggs("alice", "alice_ash_throated_flycatcher", 1),
      ],
    });
  });

  /**
   * Tests Bobolink which targets GROUND nest birds.
   * Bobolink: GRASSLAND, costs INVERTEBRATE: 1, SEED: 2
   * Power: "Lay 1 [egg] on each of your birds with a [ground] nest."
   */
  it("works with Bobolink targeting GROUND nests", async () => {
    const scenario: ScenarioConfig = {
      name: "Bobolink white power - GROUND nests",
      description: "Lays 1 egg on each GROUND nest bird",
      targetHandlers: ["playBirdHandler", "layEggOnBirdsWithNestType"],

      players: [
        {
          id: "alice",
          hand: ["bobolink"],
          bonusCards: [],
          food: { SEED: 2, INVERTEBRATE: 1 },
          board: {
            FOREST: [],
            // Wild Turkey has GROUND nest (capacity 5)
            GRASSLAND: [{ cardId: "wild_turkey", eggs: 2 }],
            // Brant has GROUND nest (capacity 2)
            WETLAND: [{ cardId: "brant", eggs: 0 }],
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
          label: "Alice plays Bobolink",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "bobolink",
              habitat: "GRASSLAND",
              foodToSpend: { SEED: 2, INVERTEBRATE: 1 },
              // Column 1 costs 1 egg (playBirdCosts[1] = 1)
              eggsToSpend: { alice_wild_turkey: 1 },
            },
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("layEggOnBirdsWithNestType"),
        birdExistsOnBoard("alice", "alice_bobolink"),
        // Wild Turkey (GROUND) started with 2, paid 1 for egg cost, gained 1 from power = 2
        birdHasEggs("alice", "alice_wild_turkey", 2),
        // Brant (GROUND) should have 1 egg from power
        birdHasEggs("alice", "alice_brant", 1),
        // The just-played Bobolink (GROUND) should also have 1 egg
        birdHasEggs("alice", "alice_bobolink", 1),
      ],
    });
  });

  /**
   * Tests that player can decline the power.
   */
  it("can decline the power", async () => {
    const scenario: ScenarioConfig = {
      name: "layEggOnBirdsWithNestType - decline",
      description: "Player declines the power",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["ash_throated_flycatcher"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, FRUIT: 1 },
          board: {
            FOREST: [{ cardId: "downy_woodpecker", eggs: 0 }],
            GRASSLAND: [],
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
          label: "Alice plays Ash-Throated Flycatcher and declines power",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "ash_throated_flycatcher",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2, FRUIT: 1 },
              eggsToSpend: {},
            },
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
        birdExistsOnBoard("alice", "alice_ash_throated_flycatcher"),
        // No eggs placed - power was declined
        birdHasEggs("alice", "alice_downy_woodpecker", 0),
        birdHasEggs("alice", "alice_ash_throated_flycatcher", 0),
      ],
    });
  });
});

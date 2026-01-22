/**
 * Scenario tests for special/unique brown power handlers.
 *
 * Handlers covered:
 * - moveToAnotherHabitatIfRightmost: Bewick's Wren, Blue Grosbeak, Chimney Swift,
 *   Common Nighthawk, Lincoln's Sparrow, Song Sparrow, White-Crowned Sparrow,
 *   Yellow-Breasted Chat (all WHEN_ACTIVATED)
 *
 * Handlers NOT covered (WHEN_PLAYED only - not auto-triggered by GameEngine):
 * - playAdditionalBirdInHabitat: Downy Woodpecker, Eastern Bluebird, Great Blue Heron,
 *   Great Egret, House Wren, etc.
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerWasSkipped,
  handlerWasNotInvoked,
  birdIsInHabitat,
  habitatBirdCount,
  playerHasFood,
  custom,
} from "../../assertions.js";
import type { ScenarioContext } from "../../ScenarioRunner.js";
import type { MoveBirdEffect } from "../../../../types/effects.js";

describe("moveToAnotherHabitatIfRightmost handler", () => {
  /**
   * Tests that a bird with this power can move to another habitat when it's
   * the rightmost bird in its current habitat.
   *
   * Bewick's Wren: "If this bird is to the right of all other birds in its
   * habitat, move it to another habitat."
   *
   * Setup: Alice has Hooded Warbler (no power) in FOREST column 0, and
   * Bewick's Wren in FOREST column 1 (rightmost).
   *
   * With 2 birds in FOREST: leftmostEmpty = 2 → baseRewards[2] = 2 food
   * Power executes after base action. Bird can move to GRASSLAND or WETLAND.
   */
  it("moves bird to another habitat when rightmost", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - basic",
      description:
        "Bewick's Wren moves from FOREST to GRASSLAND when rightmost",
      targetHandlers: ["gainFoodHandler", "moveToAnotherHabitatIfRightmost"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Column 0: Hooded Warbler (no power, FOREST only)
              { cardId: "hooded_warbler", eggs: 0 },
              // Column 1: Bewick's Wren (moveToAnotherHabitatIfRightmost)
              { cardId: "bewicks_wren", eggs: 0 },
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
          label: "Alice activates FOREST",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: 2 food (2 prompts, select first die each time)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            {
              kind: "selectFoodFromFeeder",
              diceOrReroll: [{ die: "INVERTEBRATE" }],
            },
            // Bewick's Wren power: choose to activate
            { kind: "activatePower", activate: true },
            // Choose destination habitat (GRASSLAND or WETLAND available)
            { kind: "selectHabitat", habitat: "GRASSLAND" },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("moveToAnotherHabitatIfRightmost"),
        // Verify bird moved to GRASSLAND
        birdIsInHabitat("alice", "alice_bewicks_wren", "GRASSLAND"),
        // FOREST now has only 1 bird
        habitatBirdCount("alice", "FOREST", 1),
        // GRASSLAND now has 1 bird
        habitatBirdCount("alice", "GRASSLAND", 1),
        // Verify MOVE_BIRD effect was emitted
        custom("MOVE_BIRD effect emitted", (ctx: ScenarioContext) => {
          const moveEffects = ctx.effects.filter(
            (e): e is MoveBirdEffect => e.type === "MOVE_BIRD"
          );
          if (moveEffects.length !== 1) {
            throw new Error(
              `Expected 1 MOVE_BIRD effect, got ${moveEffects.length}`
            );
          }
          const move = moveEffects[0];
          if (move.birdInstanceId !== "alice_bewicks_wren") {
            throw new Error(
              `Expected bird alice_bewicks_wren to move, got ${move.birdInstanceId}`
            );
          }
          if (move.fromHabitat !== "FOREST" || move.toHabitat !== "GRASSLAND") {
            throw new Error(
              `Expected FOREST→GRASSLAND, got ${move.fromHabitat}→${move.toHabitat}`
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the power is skipped when the bird is NOT the rightmost
   * in its habitat.
   *
   * Setup: Alice has Bewick's Wren in column 0, Hooded Warbler in column 1.
   * Bewick's Wren is NOT rightmost, so power should be skipped.
   */
  it("skips when bird is not rightmost in habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - not rightmost",
      description: "Bewick's Wren skips power when not rightmost",
      targetHandlers: ["gainFoodHandler", "moveToAnotherHabitatIfRightmost"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Column 0: Bewick's Wren (NOT rightmost)
              { cardId: "bewicks_wren", eggs: 0 },
              // Column 1: Hooded Warbler (rightmost, no power)
              { cardId: "hooded_warbler", eggs: 0 },
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
          label: "Alice activates FOREST",
          choices: [
            // Turn action: GAIN_FOOD in FOREST
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // Base food action: 2 food (2 prompts)
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            {
              kind: "selectFoodFromFeeder",
              diceOrReroll: [{ die: "INVERTEBRATE" }],
            },
            // No power prompts - Bewick's Wren power is skipped
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Handler was skipped due to resource unavailable (not rightmost)
        handlerWasSkipped("moveToAnotherHabitatIfRightmost"),
        // Verify bird did NOT move
        birdIsInHabitat("alice", "alice_bewicks_wren", "FOREST"),
        habitatBirdCount("alice", "FOREST", 2),
        habitatBirdCount("alice", "GRASSLAND", 0),
        // Player still got base action food
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
      ],
    });
  });

  /**
   * Tests that the power can be declined even when the bird is rightmost.
   */
  it("can decline the power when rightmost", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - decline",
      description: "Alice declines Bewick's Wren power",
      targetHandlers: ["gainFoodHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              { cardId: "hooded_warbler", eggs: 0 },
              { cardId: "bewicks_wren", eggs: 0 },
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
          label: "Alice activates FOREST and declines power",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            {
              kind: "selectFoodFromFeeder",
              diceOrReroll: [{ die: "INVERTEBRATE" }],
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
        // Handler was NOT invoked (declined)
        handlerWasNotInvoked("moveToAnotherHabitatIfRightmost"),
        // Bird did not move
        birdIsInHabitat("alice", "alice_bewicks_wren", "FOREST"),
        habitatBirdCount("alice", "FOREST", 2),
        // Player still got base food
        playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
      ],
    });
  });

  /**
   * Tests that the power is skipped when the bird is rightmost but there are
   * no eligible habitats to move to (all other habitats are full or bird can't
   * live there).
   *
   * Setup: Alice has only Bewick's Wren in FOREST (rightmost). All other
   * habitats have 5 birds, so no room to move.
   */
  it("skips when no eligible habitats available", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - no room",
      description: "Bewick's Wren skips when all other habitats are full",
      targetHandlers: ["gainFoodHandler", "moveToAnotherHabitatIfRightmost"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Bewick's Wren is rightmost (only bird)
              { cardId: "bewicks_wren", eggs: 0 },
            ],
            // Fill GRASSLAND with 5 birds
            GRASSLAND: [
              { cardId: "wild_turkey", eggs: 0 },
              { cardId: "blue_winged_warbler", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
              { cardId: "eastern_bluebird", eggs: 0 },
              { cardId: "bairds_sparrow", eggs: 0 },
            ],
            // Fill WETLAND with 5 birds
            WETLAND: [
              { cardId: "trumpeter_swan", eggs: 0 },
              { cardId: "prothonotary_warbler", eggs: 0 },
              { cardId: "american_coot", eggs: 0 },
              { cardId: "mallard", eggs: 0 },
              { cardId: "american_bittern", eggs: 0 },
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
          label: "Alice activates FOREST",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 1 bird in FOREST: leftmostEmpty = 1 → baseRewards[1] = 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Power is skipped - no eligible habitats
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Handler was skipped due to no available habitats
        handlerWasSkipped("moveToAnotherHabitatIfRightmost"),
        // Bird did not move
        birdIsInHabitat("alice", "alice_bewicks_wren", "FOREST"),
        habitatBirdCount("alice", "FOREST", 1),
        habitatBirdCount("alice", "GRASSLAND", 5),
        habitatBirdCount("alice", "WETLAND", 5),
      ],
    });
  });

  /**
   * Tests that the bird can only move to habitats it's allowed to live in.
   * Hooded Warbler is FOREST-only, so even if it had this power it couldn't
   * move elsewhere. We'll use a hypothetical scenario where the bird can only
   * move to one valid habitat.
   *
   * Setup: Use Blue Grosbeak (FOREST/GRASSLAND/WETLAND compatible) in WETLAND.
   * Fill GRASSLAND completely but leave FOREST open.
   * The bird should only have FOREST as an eligible destination.
   */
  it("respects bird habitat eligibility when choosing destination", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - limited options",
      description: "Blue Grosbeak only has FOREST as eligible destination",
      targetHandlers: ["drawCardsHandler", "moveToAnotherHabitatIfRightmost"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [], // Open for movement
            GRASSLAND: [
              // Fill GRASSLAND so only FOREST is available
              { cardId: "wild_turkey", eggs: 0 },
              { cardId: "bairds_sparrow", eggs: 0 },
              { cardId: "grasshopper_sparrow", eggs: 0 },
              { cardId: "eastern_bluebird", eggs: 0 },
              { cardId: "american_woodcock", eggs: 0 },
            ],
            WETLAND: [
              // Blue Grosbeak is rightmost in WETLAND
              { cardId: "blue_grosbeak", eggs: 0 },
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
          label: "Alice activates WETLAND with Blue Grosbeak",
          choices: [
            { kind: "turnAction", action: "DRAW_CARDS", takeBonus: false },
            // 1 bird in WETLAND: leftmostEmpty = 1 → baseRewards[1] = 1 card
            {
              kind: "drawCards",
              trayCards: ["american_goldfinch"],
              numDeckCards: 0,
            },
            // Blue Grosbeak power activates (rightmost)
            { kind: "activatePower", activate: true },
            // Only FOREST is available (GRASSLAND full, WETLAND is current)
            { kind: "selectHabitat", habitat: "FOREST" },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      birdTray: ["american_goldfinch", "barn_owl", "downy_woodpecker"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("moveToAnotherHabitatIfRightmost"),
        // Bird moved to FOREST
        birdIsInHabitat("alice", "alice_blue_grosbeak", "FOREST"),
        habitatBirdCount("alice", "FOREST", 1),
        habitatBirdCount("alice", "WETLAND", 0),
        habitatBirdCount("alice", "GRASSLAND", 5),
      ],
    });
  });

  /**
   * Tests that when there's only one bird in the habitat (rightmost by default),
   * the power can still activate.
   */
  it("works when bird is the only one in habitat (rightmost by definition)", async () => {
    const scenario: ScenarioConfig = {
      name: "moveToAnotherHabitatIfRightmost - solo bird",
      description: "Solo Bewick's Wren in FOREST is rightmost",
      targetHandlers: ["gainFoodHandler", "moveToAnotherHabitatIfRightmost"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
          board: {
            FOREST: [
              // Only bird in FOREST - is rightmost
              { cardId: "bewicks_wren", eggs: 0 },
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
          label: "Alice activates FOREST",
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            // 1 bird: 1 food
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Bewick's Wren power
            { kind: "activatePower", activate: true },
            { kind: "selectHabitat", habitat: "WETLAND" },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        handlerWasInvoked("moveToAnotherHabitatIfRightmost"),
        birdIsInHabitat("alice", "alice_bewicks_wren", "WETLAND"),
        habitatBirdCount("alice", "FOREST", 0),
        habitatBirdCount("alice", "WETLAND", 1),
      ],
    });
  });
});

describe("playAdditionalBirdInHabitat handler", () => {
  /**
   * NOTE: This handler uses WHEN_PLAYED trigger exclusively.
   * All birds with this power (Downy Woodpecker, Eastern Bluebird, Great Blue Heron,
   * Great Egret, House Wren, etc.) trigger when played, not when activated.
   *
   * Since WHEN_PLAYED powers are not automatically triggered by the GameEngine
   * (see Task 8 learnings), these handlers CANNOT be tested via scenario tests.
   */
  it.skip("BLOCKED: playAdditionalBirdInHabitat uses WHEN_PLAYED trigger only", () => {
    // All birds with this handler have trigger: "WHEN_PLAYED"
    // The GameEngine does not auto-trigger WHEN_PLAYED powers after bird placement.
    // This is a known limitation documented in ScenarioTestLearnings.md.
  });
});

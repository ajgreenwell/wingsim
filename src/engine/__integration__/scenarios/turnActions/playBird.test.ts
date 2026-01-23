/**
 * Scenario tests for the playBirdHandler turn action.
 *
 * Tests cover:
 * - Basic bird play with food cost
 * - Bird play with egg cost (based on habitat column)
 * - Wild food cost payment options
 * - Bird placement in correct habitat slot
 * - Verify BIRD_PLAYED event emission
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  playerHasFood,
  playerHandSize,
  habitatBirdCount,
  birdExistsOnBoard,
  birdIsInHabitat,
  eventWasEmitted,
  custom,
} from "../../assertions.js";

describe("playBirdHandler", () => {
  /**
   * Tests basic bird play with food cost.
   * Uses hooded_warbler which costs 2 INVERTEBRATE and has no power.
   * Places into empty FOREST (column 0).
   */
  it("plays bird with food cost into empty habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Basic bird play",
      description: "Player plays hooded_warbler into empty FOREST with food cost",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["hooded_warbler"],
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
          label: "Alice plays hooded_warbler",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "hooded_warbler",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have spent the food
        playerHasFood("alice", { INVERTEBRATE: 0 }),

        // Alice's hand should be empty (bird was played)
        playerHandSize("alice", 0),

        // Bird should be on the board in FOREST
        birdExistsOnBoard("alice", "alice_hooded_warbler"),
        birdIsInHabitat("alice", "alice_hooded_warbler", "FOREST"),
        habitatBirdCount("alice", "FOREST", 1),

        // BIRD_PLAYED event should be emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.playerId === "alice" &&
          e.habitat === "FOREST" &&
          e.birdCardId === "hooded_warbler"
        ),
      ],
    });
  });

  /**
   * Tests bird play with egg cost based on habitat column.
   * Per playBirdCosts = [0, 1, 1, 2, 2]:
   * - Column 0: Free (0 eggs)
   * - Columns 1-2: 1 egg
   * - Columns 3-4: 2 eggs
   * With 2 birds already in FOREST (columns 0-1 filled), playing into column 2
   * requires playBirdCosts[2] = 1 egg.
   */
  it("plays bird with egg cost when habitat has birds", async () => {
    const scenario: ScenarioConfig = {
      name: "Bird play with egg cost",
      description: "Player plays third bird into FOREST, requiring egg payment",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // blue_winged_warbler costs 2 INVERTEBRATE, can go in FOREST or GRASSLAND
          hand: ["blue_winged_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: {
            // Already have 2 birds in FOREST (columns 0-1 filled)
            // prothonotary_warbler has eggs for egg cost payment
            FOREST: [
              { cardId: "prothonotary_warbler", eggs: 2 },
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
          food: { SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice plays blue_winged_warbler with egg cost",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              // Column 2 costs 1 egg (playBirdCosts[2] = 1)
              eggsToSpend: { alice_prothonotary_warbler: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have spent the food
        playerHasFood("alice", { INVERTEBRATE: 0 }),

        // Alice's hand should be empty
        playerHandSize("alice", 0),

        // Three birds should be in FOREST
        habitatBirdCount("alice", "FOREST", 3),
        birdExistsOnBoard("alice", "alice_blue_winged_warbler"),
        birdIsInHabitat("alice", "alice_blue_winged_warbler", "FOREST"),

        // Verify the egg was removed from the first bird
        custom("prothonotary_warbler has 1 egg remaining", (ctx) => {
          const player = ctx.engine.getGameState().findPlayer("alice");
          const bird = player.board.findBirdInstance("alice_prothonotary_warbler");
          if (!bird) throw new Error("prothonotary_warbler not found");
          if (bird.eggs !== 1) {
            throw new Error(`Expected 1 egg, found ${bird.eggs}`);
          }
        }),

        // BIRD_PLAYED event should be emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.playerId === "alice" &&
          e.birdCardId === "blue_winged_warbler" &&
          e.position === 2 // Third column (index 2)
        ),
      ],
    });
  });

  /**
   * Tests wild food cost payment.
   * american_crow costs WILD: 1, meaning any food type can be used.
   * Player pays with any concrete food type (RODENT in this case).
   * WILD is NOT an actual food type players can have - it's a wildcard.
   */
  it("plays bird with wild food cost using any concrete food type", async () => {
    const scenario: ScenarioConfig = {
      name: "Wild food cost payment with concrete food",
      description: "Player plays american_crow with WILD cost, paying with RODENT",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // american_crow costs WILD: 1 - player pays with any concrete food
          hand: ["american_crow"],
          bonusCards: [],
          food: { RODENT: 1, SEED: 1 },
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
          label: "Alice plays american_crow",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "american_crow",
              habitat: "WETLAND",
              // Pay the WILD cost with any concrete food type
              foodToSpend: { RODENT: 1 },
              eggsToSpend: {},
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Alice should have spent the RODENT, kept the SEED
        playerHasFood("alice", { RODENT: 0, SEED: 1 }),

        // Bird should be in WETLAND
        habitatBirdCount("alice", "WETLAND", 1),
        birdExistsOnBoard("alice", "alice_american_crow"),
        birdIsInHabitat("alice", "alice_american_crow", "WETLAND"),

        // BIRD_PLAYED event should be emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.playerId === "alice" &&
          e.birdCardId === "american_crow" &&
          e.habitat === "WETLAND"
        ),
      ],
    });
  });

  /**
   * Tests bird placement into a multi-habitat bird's alternate habitat.
   * blue_winged_warbler can go in FOREST or GRASSLAND; player chooses GRASSLAND.
   */
  it("places bird in chosen habitat from multi-habitat options", async () => {
    const scenario: ScenarioConfig = {
      name: "Multi-habitat bird placement",
      description: "Player plays blue_winged_warbler into GRASSLAND instead of FOREST",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // blue_winged_warbler: FOREST or GRASSLAND, costs 2 INVERTEBRATE
          hand: ["blue_winged_warbler"],
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
          label: "Alice plays blue_winged_warbler to GRASSLAND",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bird should be in GRASSLAND, not FOREST
        habitatBirdCount("alice", "GRASSLAND", 1),
        habitatBirdCount("alice", "FOREST", 0),
        birdExistsOnBoard("alice", "alice_blue_winged_warbler"),
        birdIsInHabitat("alice", "alice_blue_winged_warbler", "GRASSLAND"),

        // BIRD_PLAYED event with correct habitat
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.habitat === "GRASSLAND" &&
          e.birdCardId === "blue_winged_warbler"
        ),
      ],
    });
  });

  /**
   * Tests that PLAY_BIRD effect contains correct food and egg payment info.
   */
  it("emits PLAY_BIRD effect with correct payment details", async () => {
    const scenario: ScenarioConfig = {
      name: "PLAY_BIRD effect details",
      description: "Verify PLAY_BIRD effect contains food and egg payment",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // wild_turkey costs SEED: 2, FRUIT: 1
          hand: ["wild_turkey"],
          bonusCards: [],
          food: { SEED: 2, FRUIT: 1 },
          board: {
            FOREST: [{ cardId: "hooded_warbler", eggs: 2 }],
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
          label: "Alice plays wild_turkey with food and egg cost",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "wild_turkey",
              habitat: "FOREST",
              foodToSpend: { SEED: 2, FRUIT: 1 },
              // Column 1 costs 1 egg (playBirdCosts[1] = 1)
              eggsToSpend: { alice_hooded_warbler: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify PLAY_BIRD effect has correct details
        custom("PLAY_BIRD effect has correct payment details", (ctx) => {
          const playBirdEffect = ctx.effects.find(
            (e) => e.type === "PLAY_BIRD" && e.birdInstanceId === "alice_wild_turkey"
          );
          if (!playBirdEffect) {
            throw new Error("PLAY_BIRD effect not found");
          }
          if (playBirdEffect.type !== "PLAY_BIRD") {
            throw new Error("Wrong effect type");
          }
          // Check food paid
          if (playBirdEffect.foodPaid.SEED !== 2) {
            throw new Error(`Expected SEED: 2, got ${playBirdEffect.foodPaid.SEED}`);
          }
          if (playBirdEffect.foodPaid.FRUIT !== 1) {
            throw new Error(`Expected FRUIT: 1, got ${playBirdEffect.foodPaid.FRUIT}`);
          }
          // Check eggs paid
          const eggsPaid = playBirdEffect.eggsPaid;
          if (eggsPaid["alice_hooded_warbler"] !== 1) {
            throw new Error(`Expected 1 egg from hooded_warbler, got ${eggsPaid["alice_hooded_warbler"]}`);
          }
          // Check placement
          if (playBirdEffect.habitat !== "FOREST") {
            throw new Error(`Expected FOREST, got ${playBirdEffect.habitat}`);
          }
          if (playBirdEffect.column !== 1) {
            throw new Error(`Expected column 1, got ${playBirdEffect.column}`);
          }
        }),

        // Bird should be on board
        birdExistsOnBoard("alice", "alice_wild_turkey"),
        habitatBirdCount("alice", "FOREST", 2),
      ],
    });
  });

  /**
   * Tests that a bird with WHEN_PLAYED power is placed correctly and its
   * white power is automatically triggered.
   * american_goldfinch has WHEN_PLAYED power: gain 3 SEED from supply.
   *
   * After bird placement, the GameEngine processes the BIRD_PLAYED event
   * which triggers the white power (WHEN_PLAYED) before any pink powers.
   */
  it("plays bird with WHEN_PLAYED power (power is auto-triggered)", async () => {
    const scenario: ScenarioConfig = {
      name: "Bird with WHEN_PLAYED power",
      description: "american_goldfinch is played and WHEN_PLAYED power triggers",
      targetHandlers: ["playBirdHandler", "gainFoodFromSupply"],

      players: [
        {
          id: "alice",
          // american_goldfinch costs SEED: 2
          hand: ["american_goldfinch"],
          bonusCards: [],
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
          label: "Alice plays american_goldfinch",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "american_goldfinch",
              habitat: "GRASSLAND",
              foodToSpend: { SEED: 2 },
              eggsToSpend: {},
            },
            // WHEN_PLAYED power triggers automatically after bird is played
            { kind: "activatePower", activate: true },
            // Select the food to gain from supply (3 SEED)
            { kind: "selectFoodFromSupply", food: { SEED: 3 } },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bird should be on board
        birdExistsOnBoard("alice", "alice_american_goldfinch"),
        birdIsInHabitat("alice", "alice_american_goldfinch", "GRASSLAND"),

        // Alice paid 2 SEED, then gained 3 SEED from power = net 3 SEED
        playerHasFood("alice", { SEED: 3 }),

        // BIRD_PLAYED event should be emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.birdCardId === "american_goldfinch"
        ),
      ],
    });
  });

  /**
   * Tests that no birds can be played when hand is empty.
   * This is an edge case - the action should complete without error.
   */
  it("handles empty hand gracefully (no birds to play)", async () => {
    const scenario: ScenarioConfig = {
      name: "No birds in hand",
      description: "Player selects PLAY_BIRD but has no birds in hand",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [], // No birds
          bonusCards: [],
          food: { SEED: 5 },
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
          label: "Alice tries to play bird with empty hand",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            // No playBird choice needed - handler returns early when no eligible birds
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // No birds should be on the board
        habitatBirdCount("alice", "FOREST", 0),
        habitatBirdCount("alice", "GRASSLAND", 0),
        habitatBirdCount("alice", "WETLAND", 0),

        // Food should be unchanged
        playerHasFood("alice", { SEED: 5 }),
      ],
    });
  });

  /**
   * Tests that bird cannot be played when player lacks required food.
   * This scenario verifies eligibility filtering works correctly.
   */
  it("cannot play bird when lacking food cost", async () => {
    const scenario: ScenarioConfig = {
      name: "Cannot afford bird",
      description: "Player has bird in hand but cannot afford food cost",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // hooded_warbler costs 2 INVERTEBRATE but alice only has 1
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 1 },
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
          label: "Alice cannot afford to play hooded_warbler",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            // No playBird choice - bird is not eligible due to insufficient food
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Bird should still be in hand
        playerHandSize("alice", 1),

        // No birds on board
        habitatBirdCount("alice", "FOREST", 0),

        // Food unchanged
        playerHasFood("alice", { INVERTEBRATE: 1 }),

        // No BIRD_PLAYED event
        custom("no BIRD_PLAYED event emitted", (ctx) => {
          const birdPlayedEvents = ctx.events.filter((e) => e.type === "BIRD_PLAYED");
          if (birdPlayedEvents.length > 0) {
            throw new Error("BIRD_PLAYED event should not be emitted when bird cannot be played");
          }
        }),
      ],
    });
  });

  /**
   * Tests higher egg cost at later column.
   * Per playBirdCosts = [0, 1, 1, 2, 2]:
   * With 4 birds in habitat, playing into column 4 costs playBirdCosts[4] = 2 eggs.
   */
  it("pays higher egg cost for later columns", async () => {
    const scenario: ScenarioConfig = {
      name: "Higher column egg cost",
      description: "Playing bird into column 4 costs 2 eggs",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["blue_winged_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: {
            // 4 birds already in FOREST (columns 0-3 filled)
            FOREST: [
              { cardId: "hooded_warbler", eggs: 3 }, // Has eggs for payment
              { cardId: "prothonotary_warbler", eggs: 0 },
              { cardId: "eastern_screech_owl", eggs: 0 },
              { cardId: "barn_owl", eggs: 0 },
            ],
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
          label: "Alice plays bird with 2-egg cost",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              // Column 4 costs 2 eggs (playBirdCosts[4] = 2)
              eggsToSpend: { alice_hooded_warbler: 2 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "INVERTEBRATE", "FISH", "FRUIT", "RODENT"],
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Now 5 birds in FOREST
        habitatBirdCount("alice", "FOREST", 5),
        birdExistsOnBoard("alice", "alice_blue_winged_warbler"),

        // hooded_warbler should have 1 egg remaining (3 - 2 = 1)
        custom("hooded_warbler has 1 egg remaining", (ctx) => {
          const player = ctx.engine.getGameState().findPlayer("alice");
          const bird = player.board.findBirdInstance("alice_hooded_warbler");
          if (!bird) throw new Error("hooded_warbler not found");
          if (bird.eggs !== 1) {
            throw new Error(`Expected 1 egg, found ${bird.eggs}`);
          }
        }),

        // Verify position in event
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.birdCardId === "blue_winged_warbler" &&
          e.position === 4 // Fifth column (index 4)
        ),
      ],
    });
  });
});

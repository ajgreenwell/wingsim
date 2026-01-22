/**
 * Unit tests for assertion helpers.
 *
 * These tests verify that each assertion helper correctly:
 * - Passes when conditions are met
 * - Fails with descriptive errors when conditions are not met
 */

import { describe, it, expect } from "vitest";
import { runScenario } from "./ScenarioRunner.js";
import type { ScenarioConfig } from "./ScenarioBuilder.js";
import {
  handlerWasInvoked,
  handlerInvokedTimes,
  handlerWasNotInvoked,
  playerHasFood,
  playerHasTotalFood,
  birdHasCachedFood,
  birdHasNoCachedFood,
  birdHasEggs,
  birdHasTuckedCards,
  playerHandSize,
  playerHasCardInHand,
  birdIsInHabitat,
  birdExistsOnBoard,
  habitatBirdCount,
  totalBirdCount,
  eventWasEmitted,
  eventWasNotEmitted,
  eventEmittedTimes,
  playerBonusCardCount,
  all,
  custom,
} from "./assertions.js";

describe("Assertion Helpers", () => {
  // Basic scenario for testing assertions
  // Alice gains food from feeder and triggers blue-gray gnatcatcher's brown power
  const createBasicScenario = (): ScenarioConfig => ({
    name: "Basic assertion test",
    description: "Tests basic assertion helpers",
    targetHandlers: ["gainFoodHandler", "gainFoodFromSupply"],
    players: [
      {
        id: "alice",
        hand: ["eastern_bluebird"], // Keep one card in hand
        bonusCards: ["anatomist"],
        food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
        board: {
          FOREST: [{ cardId: "blue_gray_gnatcatcher", eggs: 2 }],
          GRASSLAND: [{ cardId: "spotted_towhee", eggs: 0, tuckedCards: ["american_robin", "barn_swallow"] }],
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
        label: "Alice's turn 1",
        choices: [
          { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
          { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
          // Blue-gray Gnatcatcher power: activate
          { kind: "activatePower", activate: true },
          { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
        ],
      },
    ],
    birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
    turnsToRun: 1,
  });

  describe("handlerWasInvoked", () => {
    // Verifies the assertion passes when the handler was actually invoked
    it("passes when handler was invoked", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [handlerWasInvoked("gainFoodFromSupply")],
      });
    });

    // Verifies the assertion fails when the handler was not invoked
    it("fails when handler was not invoked", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [handlerWasInvoked("nonExistentHandler")],
        })
      ).rejects.toThrow('Expected handler "nonExistentHandler" to be invoked, but it was not');
    });
  });

  describe("handlerInvokedTimes", () => {
    // Verifies correct counting of handler invocations
    it("passes when handler invoked expected number of times", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [handlerInvokedTimes("gainFoodFromSupply", 1)],
      });
    });

    // Verifies failure when count doesn't match
    it("fails when count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [handlerInvokedTimes("gainFoodFromSupply", 5)],
        })
      ).rejects.toThrow('Expected handler "gainFoodFromSupply" to be invoked 5 time(s)');
    });
  });

  describe("handlerWasNotInvoked", () => {
    // Verifies the assertion passes when the handler was not invoked
    it("passes when handler was not invoked", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [handlerWasNotInvoked("nonExistentHandler")],
      });
    });

    // Verifies the assertion fails when the handler was invoked
    it("fails when handler was invoked", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [handlerWasNotInvoked("gainFoodFromSupply")],
        })
      ).rejects.toThrow('Expected handler "gainFoodFromSupply" to NOT be invoked');
    });
  });

  describe("playerHasFood", () => {
    // Verifies correct food amount checking
    it("passes when player has expected food", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [
          // Alice started with 0, gained 1 SEED from feeder + 1 INVERTEBRATE from power
          playerHasFood("alice", { SEED: 1, INVERTEBRATE: 1 }),
        ],
      });
    });

    // Verifies failure when food amount doesn't match
    it("fails when food doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [playerHasFood("alice", { SEED: 999 })],
        })
      ).rejects.toThrow("Expected alice to have 999 SEED, but has 1");
    });
  });

  describe("playerHasTotalFood", () => {
    // Verifies total food counting
    it("passes when total matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [
          // Alice gained 1 SEED + 1 INVERTEBRATE = 2 total
          playerHasTotalFood("alice", 2),
        ],
      });
    });

    // Verifies failure when total doesn't match
    it("fails when total doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [playerHasTotalFood("alice", 100)],
        })
      ).rejects.toThrow("Expected alice to have 100 total food, but has 2");
    });
  });

  describe("birdHasCachedFood", () => {
    // Test with a scenario that caches food
    // Using acorn_woodpecker which has gainFoodFromFeederWithCache
    const createCacheScenario = (): ScenarioConfig => ({
      name: "Cache food test",
      description: "Tests cached food assertion",
      targetHandlers: ["gainFoodFromFeederWithCache"],
      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { SEED: 1 },
          board: {
            FOREST: [{ cardId: "acorn_woodpecker", eggs: 0, cachedFood: { SEED: 1 } }],
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
          choices: [
            { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            // Acorn Woodpecker power - activate and cache
            { kind: "activatePower", activate: true },
            { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            { kind: "selectFoodDestination", destination: "CACHE_ON_SOURCE_BIRD" },
          ],
        },
      ],
      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      turnsToRun: 1,
    });

    // Verifies cached food checking
    it("passes when bird has expected cached food", async () => {
      const config = createCacheScenario();
      await runScenario(config, {
        assertions: [
          // Started with 1 SEED cached, added 1 more
          birdHasCachedFood("alice", "alice_acorn_woodpecker", { SEED: 2 }),
        ],
      });
    });

    // Verifies failure when cached food doesn't match
    it("fails when cached food doesn't match", async () => {
      const config = createCacheScenario();
      await expect(
        runScenario(config, {
          assertions: [birdHasCachedFood("alice", "alice_acorn_woodpecker", { SEED: 100 })],
        })
      ).rejects.toThrow("Expected bird alice_acorn_woodpecker to have 100 cached SEED, but has 2");
    });

    // Verifies failure when bird not found
    it("fails when bird not found", async () => {
      const config = createCacheScenario();
      await expect(
        runScenario(config, {
          assertions: [birdHasCachedFood("alice", "nonexistent_bird", { SEED: 1 })],
        })
      ).rejects.toThrow("Bird nonexistent_bird not found on alice's board");
    });
  });

  describe("birdHasNoCachedFood", () => {
    // Verifies no cached food checking
    it("passes when bird has no cached food", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [birdHasNoCachedFood("alice", "alice_blue_gray_gnatcatcher")],
      });
    });
  });

  describe("birdHasEggs", () => {
    // Verifies egg count checking
    it("passes when bird has expected eggs", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [birdHasEggs("alice", "alice_blue_gray_gnatcatcher", 2)],
      });
    });

    // Verifies failure when egg count doesn't match
    it("fails when egg count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [birdHasEggs("alice", "alice_blue_gray_gnatcatcher", 10)],
        })
      ).rejects.toThrow("Expected bird alice_blue_gray_gnatcatcher to have 10 egg(s), but has 2");
    });
  });

  describe("birdHasTuckedCards", () => {
    // Verifies tucked cards counting
    it("passes when bird has expected tucked cards", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [birdHasTuckedCards("alice", "alice_spotted_towhee", 2)],
      });
    });

    // Verifies failure when count doesn't match
    it("fails when count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [birdHasTuckedCards("alice", "alice_spotted_towhee", 10)],
        })
      ).rejects.toThrow("Expected bird alice_spotted_towhee to have 10 tucked card(s), but has 2");
    });
  });

  describe("playerHandSize", () => {
    // Verifies hand size checking
    it("passes when hand size matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [playerHandSize("alice", 1)],
      });
    });

    // Verifies failure when hand size doesn't match
    it("fails when hand size doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [playerHandSize("alice", 10)],
        })
      ).rejects.toThrow("Expected alice to have 10 card(s) in hand, but has 1");
    });
  });

  describe("playerHasCardInHand", () => {
    // Verifies card in hand checking
    it("passes when card is in hand", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [playerHasCardInHand("alice", "eastern_bluebird")],
      });
    });

    // Verifies failure when card not in hand
    it("fails when card not in hand", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [playerHasCardInHand("alice", "nonexistent_card")],
        })
      ).rejects.toThrow('Expected alice to have card "nonexistent_card" in hand');
    });
  });

  describe("birdIsInHabitat", () => {
    // Verifies habitat checking
    it("passes when bird is in expected habitat", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [birdIsInHabitat("alice", "alice_blue_gray_gnatcatcher", "FOREST")],
      });
    });

    // Verifies failure when bird is in wrong habitat
    it("fails when bird is in wrong habitat", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [birdIsInHabitat("alice", "alice_blue_gray_gnatcatcher", "WETLAND")],
        })
      ).rejects.toThrow("Expected bird alice_blue_gray_gnatcatcher to be in WETLAND, but is in FOREST");
    });
  });

  describe("birdExistsOnBoard", () => {
    // Verifies bird existence on board
    it("passes when bird exists", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [birdExistsOnBoard("alice", "alice_blue_gray_gnatcatcher")],
      });
    });

    // Verifies failure when bird doesn't exist
    it("fails when bird doesn't exist", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [birdExistsOnBoard("alice", "nonexistent_bird")],
        })
      ).rejects.toThrow("Expected bird nonexistent_bird to exist on alice's board");
    });
  });

  describe("habitatBirdCount", () => {
    // Verifies habitat bird counting
    it("passes when count matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [habitatBirdCount("alice", "FOREST", 1)],
      });
    });

    // Verifies failure when count doesn't match
    it("fails when count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [habitatBirdCount("alice", "FOREST", 5)],
        })
      ).rejects.toThrow("Expected alice to have 5 bird(s) in FOREST, but has 1");
    });
  });

  describe("totalBirdCount", () => {
    // Verifies total bird counting
    it("passes when total matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [totalBirdCount("alice", 2)], // 1 in forest, 1 in grassland
      });
    });

    // Verifies failure when total doesn't match
    it("fails when total doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [totalBirdCount("alice", 10)],
        })
      ).rejects.toThrow("Expected alice to have 10 total bird(s), but has 2");
    });
  });

  describe("eventWasEmitted", () => {
    // Verifies event emission checking
    it("passes when event was emitted", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [eventWasEmitted("TURN_STARTED")],
      });
    });

    // Verifies event with predicate
    it("passes when event matches predicate", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [
          eventWasEmitted("TURN_STARTED", (e) => e.playerId === "alice"),
        ],
      });
    });

    // Verifies failure when event not emitted
    it("fails when event not emitted", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [eventWasEmitted("GAME_ENDED")],
        })
      ).rejects.toThrow('Expected event of type "GAME_ENDED" to be emitted, but it was not');
    });

    // Verifies failure when predicate doesn't match
    it("fails when predicate doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [
            eventWasEmitted("TURN_STARTED", (e) => e.playerId === "nonexistent"),
          ],
        })
      ).rejects.toThrow("didn't match predicate");
    });
  });

  describe("eventWasNotEmitted", () => {
    // Verifies event not emitted checking
    it("passes when event was not emitted", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [eventWasNotEmitted("GAME_ENDED")],
      });
    });

    // Verifies failure when event was emitted
    it("fails when event was emitted", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [eventWasNotEmitted("TURN_STARTED")],
        })
      ).rejects.toThrow('Expected no event of type "TURN_STARTED" to be emitted');
    });
  });

  describe("eventEmittedTimes", () => {
    // Verifies event count checking
    it("passes when count matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [eventEmittedTimes("TURN_STARTED", 1)],
      });
    });

    // Verifies failure when count doesn't match
    it("fails when count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [eventEmittedTimes("TURN_STARTED", 10)],
        })
      ).rejects.toThrow('Expected event of type "TURN_STARTED" to be emitted 10 time(s), but was emitted 1 time(s)');
    });
  });

  describe("playerBonusCardCount", () => {
    // Verifies bonus card counting
    it("passes when count matches", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [playerBonusCardCount("alice", 1)],
      });
    });

    // Verifies failure when count doesn't match
    it("fails when count doesn't match", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [playerBonusCardCount("alice", 10)],
        })
      ).rejects.toThrow("Expected alice to have 10 bonus card(s), but has 1");
    });
  });

  describe("all", () => {
    // Verifies combining multiple assertions
    it("passes when all assertions pass", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [
          all(
            playerHasFood("alice", { SEED: 1 }),
            playerHandSize("alice", 1),
            eventWasEmitted("TURN_STARTED")
          ),
        ],
      });
    });

    // Verifies failure when any assertion fails
    it("fails when any assertion fails", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [
            all(
              playerHasFood("alice", { SEED: 1 }),
              playerHasFood("alice", { SEED: 999 }), // This should fail
              eventWasEmitted("TURN_STARTED")
            ),
          ],
        })
      ).rejects.toThrow("Expected alice to have 999 SEED");
    });
  });

  describe("custom", () => {
    // Verifies custom assertion
    it("passes when custom assertion passes", async () => {
      const config = createBasicScenario();
      await runScenario(config, {
        assertions: [
          custom("alice has positive food", (ctx) => {
            const alice = ctx.engine.getGameState().findPlayer("alice");
            if (alice.getTotalFood() <= 0) {
              throw new Error("Alice should have positive food");
            }
          }),
        ],
      });
    });

    // Verifies custom assertion failure includes name
    it("includes name in error message", async () => {
      const config = createBasicScenario();
      await expect(
        runScenario(config, {
          assertions: [
            custom("my custom check", () => {
              throw new Error("Inner error");
            }),
          ],
        })
      ).rejects.toThrow('Custom assertion "my custom check" failed: Inner error');
    });
  });
});

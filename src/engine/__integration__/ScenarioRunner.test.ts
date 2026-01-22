/**
 * Unit tests for ScenarioRunner.
 *
 * These tests verify that the ScenarioRunner correctly:
 * - Creates a GameEngine from a ScenarioConfig
 * - Collects events and effects via the observer
 * - Runs the specified number of turns
 * - Executes assertions
 * - Verifies script consumption
 */

import { describe, it, expect, vi } from "vitest";
import { runScenario, type ScenarioAssertion } from "./ScenarioRunner.js";
import type { ScenarioConfig } from "./ScenarioBuilder.js";

describe("ScenarioRunner", () => {
  // Minimal valid scenario configuration for testing
  // Uses spotted_towhee which has a simple WHEN_ACTIVATED power: gainFoodFromSupply (SEED, 1)
  const createMinimalConfig = (
    overrides?: Partial<ScenarioConfig>
  ): ScenarioConfig => ({
    name: "Test Scenario",
    description: "A minimal test scenario",
    targetHandlers: ["gainFoodHandler"],
    players: [
      {
        id: "alice",
        hand: [],
        bonusCards: [],
        food: { SEED: 1, INVERTEBRATE: 1, FISH: 1, FRUIT: 1, RODENT: 1 },
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
        label: "Alice's turn 1",
        choices: [
          { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
          { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
        ],
      },
    ],
    birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
    turnsToRun: 1,
    ...overrides,
  });

  describe("runScenario()", () => {
    // Verifies that runScenario returns a ScenarioContext with all expected fields
    it("returns ScenarioContext with correct structure", async () => {
      const config = createMinimalConfig();
      const ctx = await runScenario(config);

      expect(ctx).toHaveProperty("engine");
      expect(ctx).toHaveProperty("events");
      expect(ctx).toHaveProperty("effects");
      expect(ctx).toHaveProperty("agents");
      expect(ctx).toHaveProperty("config");
      expect(ctx.config).toBe(config);
    });

    // Verifies that events are collected during scenario execution
    it("collects events during execution", async () => {
      const config = createMinimalConfig();
      const ctx = await runScenario(config);

      // Should have TURN_STARTED, HABITAT_ACTIVATED, and TURN_ENDED events at minimum
      expect(ctx.events.length).toBeGreaterThan(0);
      expect(ctx.events.some((e) => e.type === "TURN_STARTED")).toBe(true);
      expect(ctx.events.some((e) => e.type === "TURN_ENDED")).toBe(true);
    });

    // Verifies that effects are collected during scenario execution
    it("collects effects during execution", async () => {
      const config = createMinimalConfig();
      const ctx = await runScenario(config);

      // Should have at least a GAIN_FOOD effect from the turn action
      expect(ctx.effects.length).toBeGreaterThan(0);
      expect(ctx.effects.some((e) => e.type === "GAIN_FOOD")).toBe(true);
    });

    // Verifies that the engine state reflects the scenario execution
    it("engine state reflects scenario execution", async () => {
      const config = createMinimalConfig();
      const ctx = await runScenario(config);

      const alice = ctx.engine.getGameState().findPlayer("alice");

      // Alice started with 1 SEED and gained 1 from the birdfeeder
      expect(alice.food.SEED).toBe(2);
    });

    // Verifies that agent scripts are consumed during execution
    it("consumes agent scripts during execution", async () => {
      const config = createMinimalConfig();
      const ctx = await runScenario(config);

      // Alice had 2 choices, both should be consumed
      expect(ctx.agents[0].isScriptFullyConsumed()).toBe(true);
      expect(ctx.agents[0].getRemainingChoiceCount()).toBe(0);

      // Bob had no choices
      expect(ctx.agents[1].isScriptFullyConsumed()).toBe(true);
      expect(ctx.agents[1].getRemainingChoiceCount()).toBe(0);
    });
  });

  describe("assertions", () => {
    // Verifies that assertions are called with the correct context
    it("calls assertions with ScenarioContext", async () => {
      const config = createMinimalConfig();
      const assertion = vi.fn();

      await runScenario(config, { assertions: [assertion] });

      expect(assertion).toHaveBeenCalledTimes(1);
      expect(assertion).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: expect.anything(),
          events: expect.any(Array),
          effects: expect.any(Array),
          agents: expect.any(Array),
          config: expect.anything(),
        })
      );
    });

    // Verifies that multiple assertions are all executed
    it("executes multiple assertions in order", async () => {
      const config = createMinimalConfig();
      const callOrder: number[] = [];

      const assertion1 = vi.fn(() => {
        callOrder.push(1);
      });
      const assertion2 = vi.fn(() => {
        callOrder.push(2);
      });
      const assertion3 = vi.fn(() => {
        callOrder.push(3);
      });

      await runScenario(config, { assertions: [assertion1, assertion2, assertion3] });

      expect(callOrder).toEqual([1, 2, 3]);
    });

    // Verifies that assertion failures propagate
    it("propagates assertion failures", async () => {
      const config = createMinimalConfig();
      const failingAssertion: ScenarioAssertion = () => {
        throw new Error("Assertion failed");
      };

      await expect(
        runScenario(config, { assertions: [failingAssertion] })
      ).rejects.toThrow("Assertion failed");
    });

    // Verifies that async assertions work correctly
    it("supports async assertions", async () => {
      const config = createMinimalConfig();
      let wasRun = false;

      const asyncAssertion: ScenarioAssertion = async () => {
        await Promise.resolve();
        wasRun = true;
      };

      await runScenario(config, { assertions: [asyncAssertion] });
      expect(wasRun).toBe(true);
    });
  });

  describe("turnsToRun", () => {
    // Verifies that turnsToRun defaults to 1
    it("runs 1 turn by default", async () => {
      const config = createMinimalConfig({ turnsToRun: undefined });
      const ctx = await runScenario(config);

      // Count TURN_ENDED events to verify number of turns run
      const turnEndedEvents = ctx.events.filter((e) => e.type === "TURN_ENDED");
      expect(turnEndedEvents).toHaveLength(1);
    });

    // Verifies that multiple turns can be run
    // Note: The birdfeeder selection prompt only offers dice from the front of the array
    // up to the reward amount (1 die for column 0). Both players must select SEED
    // because it's first in the birdfeeder array.
    it("runs specified number of turns", async () => {
      const config = createMinimalConfig({
        turnsToRun: 2,
        turns: [
          {
            player: "alice",
            label: "Alice's turn 1",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            ],
          },
          {
            player: "bob",
            label: "Bob's turn 1",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              // After Alice takes a SEED, the next die in array position 0 is SEED
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
            ],
          },
        ],
      });

      const ctx = await runScenario(config);

      // Count TURN_ENDED events to verify number of turns run
      const turnEndedEvents = ctx.events.filter((e) => e.type === "TURN_ENDED");
      expect(turnEndedEvents).toHaveLength(2);
    });
  });

  describe("script consumption verification", () => {
    // Verifies that unconsumed scripts generate warnings by default
    it("warns about unconsumed scripts by default", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Provide more choices than needed
      const config = createMinimalConfig({
        turns: [
          {
            player: "alice",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
              // Extra choice that won't be consumed
              { kind: "activatePower", activate: true },
            ],
          },
        ],
      });

      await runScenario(config);

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("unconsumed choices")
      );

      consoleWarn.mockRestore();
    });

    // Verifies that script verification can be disabled
    it("can disable script consumption verification", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = createMinimalConfig({
        turns: [
          {
            player: "alice",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
              // Extra choice that won't be consumed
              { kind: "activatePower", activate: true },
            ],
          },
        ],
      });

      await runScenario(config, { verifyScriptConsumed: false });

      expect(consoleWarn).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe("with brown powers", () => {
    // Verifies that brown powers are triggered during habitat activation
    it("triggers brown powers during GAIN_FOOD action", async () => {
      // Use blue_gray_gnatcatcher which has gainFoodFromSupply (INVERTEBRATE, 1) WHEN_ACTIVATED
      const config: ScenarioConfig = {
        name: "Brown power test",
        description: "Test that brown powers trigger during habitat activation",
        targetHandlers: ["gainFoodHandler", "gainFoodFromSupply"],
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
            board: {
              FOREST: [{ cardId: "blue_gray_gnatcatcher", eggs: 0 }],
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
            label: "Alice's turn 1",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
              // Blue-gray Gnatcatcher power: choose to activate
              { kind: "activatePower", activate: true },
              // Then select the food from supply (handler prompts for this)
              { kind: "selectFoodFromSupply", food: { INVERTEBRATE: 1 } },
            ],
          },
        ],
        birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
        turnsToRun: 1,
      };

      const ctx = await runScenario(config);

      // Verify the power was activated
      const activatePowerEffects = ctx.effects.filter(
        (e) => e.type === "ACTIVATE_POWER" && e.handlerId === "gainFoodFromSupply"
      );
      expect(activatePowerEffects.length).toBeGreaterThan(0);

      // Alice should have gained SEED from feeder + INVERTEBRATE from power
      const alice = ctx.engine.getGameState().findPlayer("alice");
      expect(alice.food.SEED).toBe(1);
      expect(alice.food.INVERTEBRATE).toBe(1);
    });

    // Verifies that declining brown powers works correctly
    it("allows declining optional brown powers", async () => {
      const config: ScenarioConfig = {
        name: "Decline brown power test",
        description: "Test that optional brown powers can be declined",
        targetHandlers: ["gainFoodHandler", "gainFoodFromSupply"],
        players: [
          {
            id: "alice",
            hand: [],
            bonusCards: [],
            food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
            board: {
              FOREST: [{ cardId: "blue_gray_gnatcatcher", eggs: 0 }],
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
            label: "Alice's turn 1",
            choices: [
              { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
              { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
              // Decline to activate the brown power
              { kind: "activatePower", activate: false },
            ],
          },
        ],
        birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
        turnsToRun: 1,
      };

      const ctx = await runScenario(config);

      // Verify the power was NOT activated
      const activatePowerEffects = ctx.effects.filter(
        (e) =>
          e.type === "ACTIVATE_POWER" &&
          e.handlerId === "gainFoodFromSupply" &&
          e.activated === true
      );
      expect(activatePowerEffects).toHaveLength(0);

      // Alice should only have gained SEED from feeder, not INVERTEBRATE from power
      const alice = ctx.engine.getGameState().findPlayer("alice");
      expect(alice.food.SEED).toBe(1);
      expect(alice.food.INVERTEBRATE).toBe(0);
    });
  });
});

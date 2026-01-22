/**
 * Unit tests for ScriptedAgent.
 *
 * These tests ensure that the ScriptedAgent correctly:
 * - Consumes choices in order from the script
 * - Adds promptId to returned choices
 * - Throws ScriptExhaustedError when script runs out
 * - Throws ScriptMismatchError when choice kind doesn't match prompt kind
 * - Tracks remaining choices and consumption status correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ScriptedAgent,
  ScriptExhaustedError,
  ScriptMismatchError,
  type ScriptedChoice,
} from "./ScriptedAgent.js";
import type {
  TurnActionPrompt,
  OptionPrompt,
  PlayerView,
  PromptContext,
} from "../../types/prompts.js";

// Helper to create a minimal PlayerView for prompts
function createMinimalView(playerId: string): PlayerView {
  return {
    playerId,
    hand: [],
    bonusCards: [],
    food: { SEED: 0, INVERTEBRATE: 0, FISH: 0, FRUIT: 0, RODENT: 0 },
    board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
    actionCubes: 8,
    round: 1,
    turn: 1,
    activePlayerId: playerId,
    birdfeeder: [],
    birdTray: [],
    deckSize: 100,
    opponents: [],
  };
}

// Helper to create a minimal PromptContext
function createMinimalContext(playerId: string): PromptContext {
  return {
    round: 1,
    activePlayerId: playerId,
    trigger: {
      type: "WHEN_ACTIVATED",
      habitat: "FOREST",
      sourceBirdId: "test_bird_001",
    },
  };
}

describe("ScriptedAgent", () => {
  let agent: ScriptedAgent;
  let playerId: string;

  beforeEach(() => {
    playerId = "alice";
  });

  // Tests that the agent correctly returns scripted choices in order and
  // adds the promptId from the prompt to the returned choice.
  describe("choice consumption", () => {
    it("returns scripted turnAction choice with promptId", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };

      const choice = await agent.chooseTurnAction(prompt);

      expect(choice.promptId).toBe("prompt_001");
      expect(choice.kind).toBe("turnAction");
      expect(choice.action).toBe("GAIN_FOOD");
      expect(choice.takeBonus).toBe(false);
    });

    it("returns scripted option choice with promptId", async () => {
      const script: ScriptedChoice[] = [
        { kind: "activatePower", activate: true },
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: OptionPrompt = {
        promptId: "prompt_002",
        playerId,
        kind: "activatePower",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        birdInstanceId: "alice_barn_owl",
        power: {
          trigger: "WHEN_ACTIVATED",
          handlerId: "testHandler",
          params: {},
          text: "Test power",
        },
      };

      const choice = await agent.chooseOption(prompt);

      expect(choice.promptId).toBe("prompt_002");
      expect(choice.kind).toBe("activatePower");
      if (choice.kind === "activatePower") {
        expect(choice.activate).toBe(true);
      }
    });

    it("consumes choices in order across multiple prompts", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
        { kind: "activatePower", activate: true },
        { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
      ];

      agent = new ScriptedAgent({ playerId, script });

      // First prompt: turnAction
      const turnPrompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };
      const turnChoice = await agent.chooseTurnAction(turnPrompt);
      expect(turnChoice.action).toBe("GAIN_FOOD");

      // Second prompt: activatePower
      const activatePrompt: OptionPrompt = {
        promptId: "prompt_002",
        playerId,
        kind: "activatePower",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        birdInstanceId: "alice_woodpecker",
        power: {
          trigger: "WHEN_ACTIVATED",
          handlerId: "testHandler",
          params: {},
          text: "Test",
        },
      };
      const activateChoice = await agent.chooseOption(activatePrompt);
      expect(activateChoice.kind).toBe("activatePower");

      // Third prompt: selectFoodFromFeeder
      const foodPrompt: OptionPrompt = {
        promptId: "prompt_003",
        playerId,
        kind: "selectFoodFromFeeder",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        availableDice: {
          SEED: 3,
          INVERTEBRATE: 1,
          FISH: 1,
          FRUIT: 0,
          RODENT: 0,
          SEED_INVERTEBRATE: 0,
        },
      };
      const foodChoice = await agent.chooseOption(foodPrompt);
      expect(foodChoice.kind).toBe("selectFoodFromFeeder");
    });
  });

  // Tests that the agent correctly reports script consumption status
  describe("script tracking", () => {
    it("reports script not consumed when choices remain", () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
        { kind: "activatePower", activate: true },
      ];

      agent = new ScriptedAgent({ playerId, script });

      expect(agent.isScriptFullyConsumed()).toBe(false);
      expect(agent.getRemainingChoiceCount()).toBe(2);
    });

    it("reports script fully consumed when all choices used", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "LAY_EGGS", takeBonus: false },
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };

      await agent.chooseTurnAction(prompt);

      expect(agent.isScriptFullyConsumed()).toBe(true);
      expect(agent.getRemainingChoiceCount()).toBe(0);
    });

    it("updates remaining count after each choice consumed", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
        { kind: "activatePower", activate: true },
        { kind: "activatePower", activate: false },
      ];

      agent = new ScriptedAgent({ playerId, script });

      expect(agent.getRemainingChoiceCount()).toBe(3);

      // Consume first
      await agent.chooseTurnAction({
        promptId: "p1",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      });

      expect(agent.getRemainingChoiceCount()).toBe(2);

      // Consume second
      await agent.chooseOption({
        promptId: "p2",
        playerId,
        kind: "activatePower",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        birdInstanceId: "bird1",
        power: {
          trigger: "WHEN_ACTIVATED",
          handlerId: "test",
          params: {},
          text: "test",
        },
      });

      expect(agent.getRemainingChoiceCount()).toBe(1);
    });
  });

  // Tests that ScriptExhaustedError is thrown when script runs out
  describe("ScriptExhaustedError", () => {
    it("throws when script is empty from the start", async () => {
      agent = new ScriptedAgent({ playerId, script: [] });

      const prompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };

      await expect(agent.chooseTurnAction(prompt)).rejects.toThrow(
        ScriptExhaustedError
      );
    });

    it("throws when script runs out after consuming all choices", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };

      // First call succeeds
      await agent.chooseTurnAction(prompt);

      // Second call should fail
      await expect(agent.chooseTurnAction(prompt)).rejects.toThrow(
        ScriptExhaustedError
      );
    });

    it("includes useful information in ScriptExhaustedError", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
      ];

      agent = new ScriptedAgent({ playerId, script });

      // Consume the one choice
      await agent.chooseTurnAction({
        promptId: "p1",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      });

      try {
        await agent.chooseTurnAction({
          promptId: "second_prompt",
          playerId,
          kind: "turnAction",
          view: createMinimalView(playerId),
          context: createMinimalContext(playerId),
          eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
          rewardsByAction: {
            PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
            GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
            LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
            DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
          },
        });
        expect.fail("Should have thrown ScriptExhaustedError");
      } catch (error) {
        expect(error).toBeInstanceOf(ScriptExhaustedError);
        const err = error as ScriptExhaustedError;
        expect(err.promptKind).toBe("turnAction");
        expect(err.promptId).toBe("second_prompt");
        expect(err.choicesConsumed).toBe(1);
        expect(err.message).toContain("turnAction");
        expect(err.message).toContain("second_prompt");
        expect(err.message).toContain("1");
      }
    });
  });

  // Tests that ScriptMismatchError is thrown when choice kind doesn't match prompt
  describe("ScriptMismatchError", () => {
    it("throws when next choice kind does not match prompt kind", async () => {
      const script: ScriptedChoice[] = [
        { kind: "activatePower", activate: true }, // Wrong kind for turnAction prompt
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: TurnActionPrompt = {
        promptId: "prompt_001",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      };

      await expect(agent.chooseTurnAction(prompt)).rejects.toThrow(
        ScriptMismatchError
      );
    });

    it("includes useful information in ScriptMismatchError", async () => {
      const script: ScriptedChoice[] = [
        { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "SEED" }] },
      ];

      agent = new ScriptedAgent({ playerId, script });

      const prompt: OptionPrompt = {
        promptId: "activate_prompt",
        playerId,
        kind: "activatePower",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        birdInstanceId: "alice_bird",
        power: {
          trigger: "WHEN_ACTIVATED",
          handlerId: "test",
          params: {},
          text: "test",
        },
      };

      try {
        await agent.chooseOption(prompt);
        expect.fail("Should have thrown ScriptMismatchError");
      } catch (error) {
        expect(error).toBeInstanceOf(ScriptMismatchError);
        const err = error as ScriptMismatchError;
        expect(err.expectedKind).toBe("selectFoodFromFeeder");
        expect(err.receivedKind).toBe("activatePower");
        expect(err.promptId).toBe("activate_prompt");
        expect(err.scriptIndex).toBe(0);
        expect(err.message).toContain("selectFoodFromFeeder");
        expect(err.message).toContain("activatePower");
      }
    });

    it("reports correct script index in mismatch after some consumption", async () => {
      const script: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
        { kind: "activatePower", activate: true },
        { kind: "selectFoodFromFeeder", diceOrReroll: [{ die: "FISH" }] }, // At index 2
      ];

      agent = new ScriptedAgent({ playerId, script });

      // Consume first two choices
      await agent.chooseTurnAction({
        promptId: "p1",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      });

      await agent.chooseOption({
        promptId: "p2",
        playerId,
        kind: "activatePower",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        birdInstanceId: "bird",
        power: {
          trigger: "WHEN_ACTIVATED",
          handlerId: "test",
          params: {},
          text: "test",
        },
      });

      // Third choice is selectFoodFromFeeder, but we send activatePower prompt
      try {
        await agent.chooseOption({
          promptId: "p3",
          playerId,
          kind: "activatePower", // Wrong - expecting selectFoodFromFeeder
          view: createMinimalView(playerId),
          context: createMinimalContext(playerId),
          birdInstanceId: "bird2",
          power: {
            trigger: "WHEN_ACTIVATED",
            handlerId: "test",
            params: {},
            text: "test",
          },
        });
        expect.fail("Should have thrown ScriptMismatchError");
      } catch (error) {
        expect(error).toBeInstanceOf(ScriptMismatchError);
        const err = error as ScriptMismatchError;
        expect(err.scriptIndex).toBe(2);
      }
    });
  });

  // Tests that the original script array is not mutated
  describe("immutability", () => {
    it("does not mutate the original script array", async () => {
      const originalScript: ScriptedChoice[] = [
        { kind: "turnAction", action: "GAIN_FOOD", takeBonus: false },
      ];

      const scriptCopy = [...originalScript];

      agent = new ScriptedAgent({ playerId, script: originalScript });

      await agent.chooseTurnAction({
        promptId: "p1",
        playerId,
        kind: "turnAction",
        view: createMinimalView(playerId),
        context: createMinimalContext(playerId),
        eligibleActions: ["PLAY_BIRD", "GAIN_FOOD", "LAY_EGGS", "DRAW_CARDS"],
        rewardsByAction: {
          PLAY_BIRD: { reward: { type: "CARDS", count: 0 } },
          GAIN_FOOD: { reward: { type: "FOOD", count: 1 } },
          LAY_EGGS: { reward: { type: "EGGS", count: 2 } },
          DRAW_CARDS: { reward: { type: "CARDS", count: 1 } },
        },
      });

      // Original should be unchanged
      expect(originalScript).toEqual(scriptCopy);
      expect(originalScript.length).toBe(1);
    });
  });
});

/**
 * Assertion Helpers for Scenario-Based Integration Tests
 *
 * Provides reusable assertion factory functions for common scenario checks.
 * Each function returns a ScenarioAssertion that can be passed to runScenario().
 */

import type { ScenarioAssertion, ScenarioContext } from "./ScenarioRunner.js";
import type {
  PlayerId,
  BirdInstanceId,
  FoodByType,
  Habitat,
  FoodType,
} from "../../types/core.js";
import type { Event } from "../../types/events.js";
import type { ActivatePowerEffect } from "../../types/effects.js";

/**
 * Assert that a specific handler was invoked during the scenario.
 * Checks for ACTIVATE_POWER effects with the given handlerId and activated=true.
 */
export function handlerWasInvoked(handlerId: string): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const activations = ctx.effects.filter(
      (e): e is ActivatePowerEffect =>
        e.type === "ACTIVATE_POWER" &&
        e.handlerId === handlerId &&
        e.activated === true
    );
    if (activations.length === 0) {
      throw new Error(
        `Expected handler "${handlerId}" to be invoked, but it was not`
      );
    }
  };
}

/**
 * Assert that a handler was invoked a specific number of times.
 */
export function handlerInvokedTimes(
  handlerId: string,
  times: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const activations = ctx.effects.filter(
      (e): e is ActivatePowerEffect =>
        e.type === "ACTIVATE_POWER" &&
        e.handlerId === handlerId &&
        e.activated === true
    );
    if (activations.length !== times) {
      throw new Error(
        `Expected handler "${handlerId}" to be invoked ${times} time(s), ` +
          `but was invoked ${activations.length} time(s)`
      );
    }
  };
}

/**
 * Assert that a handler was NOT invoked (with activated=true) during the scenario.
 * Note: A handler that was skipped (activated=false) is NOT considered "invoked".
 */
export function handlerWasNotInvoked(handlerId: string): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const activations = ctx.effects.filter(
      (e): e is ActivatePowerEffect =>
        e.type === "ACTIVATE_POWER" &&
        e.handlerId === handlerId &&
        e.activated === true
    );
    if (activations.length > 0) {
      throw new Error(
        `Expected handler "${handlerId}" to NOT be invoked, but it was invoked ${activations.length} time(s)`
      );
    }
  };
}

/**
 * Assert that a handler was skipped due to resource unavailability.
 * Checks for ACTIVATE_POWER effects with activated=false and skipReason="RESOURCE_UNAVAILABLE".
 */
export function handlerWasSkipped(handlerId: string): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const skips = ctx.effects.filter(
      (e): e is ActivatePowerEffect =>
        e.type === "ACTIVATE_POWER" &&
        e.handlerId === handlerId &&
        e.activated === false &&
        e.skipReason === "RESOURCE_UNAVAILABLE"
    );
    if (skips.length === 0) {
      throw new Error(
        `Expected handler "${handlerId}" to be skipped due to resource unavailability, but it was not`
      );
    }
  };
}

/**
 * Assert that a player has specific food in their supply.
 * Only checks the food types specified; other food types are ignored.
 */
export function playerHasFood(
  playerId: PlayerId,
  food: FoodByType
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    for (const [foodType, expectedCount] of Object.entries(food)) {
      const ft = foodType as FoodType;
      const actualCount = player.food[ft] ?? 0;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected ${playerId} to have ${expectedCount} ${foodType}, but has ${actualCount}`
        );
      }
    }
  };
}

/**
 * Assert the total amount of food a player has (all types combined).
 */
export function playerHasTotalFood(
  playerId: PlayerId,
  total: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualTotal = player.getTotalFood();
    if (actualTotal !== total) {
      throw new Error(
        `Expected ${playerId} to have ${total} total food, but has ${actualTotal}`
      );
    }
  };
}

/**
 * Assert that a bird has specific cached food.
 * Only checks the food types specified; other food types are ignored.
 */
export function birdHasCachedFood(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  food: FoodByType
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    for (const [foodType, expectedCount] of Object.entries(food)) {
      const ft = foodType as FoodType;
      const actualCount = bird.cachedFood[ft] ?? 0;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected bird ${birdInstanceId} to have ${expectedCount} cached ${foodType}, ` +
            `but has ${actualCount}`
        );
      }
    }
  };
}

/**
 * Assert that a bird has no cached food.
 */
export function birdHasNoCachedFood(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    const totalCached = Object.values(bird.cachedFood).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    );
    if (totalCached !== 0) {
      throw new Error(
        `Expected bird ${birdInstanceId} to have no cached food, ` +
          `but has ${totalCached} cached food items`
      );
    }
  };
}

/**
 * Assert that a bird has a specific number of eggs.
 */
export function birdHasEggs(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  eggs: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    if (bird.eggs !== eggs) {
      throw new Error(
        `Expected bird ${birdInstanceId} to have ${eggs} egg(s), but has ${bird.eggs}`
      );
    }
  };
}

/**
 * Assert that a bird has a specific number of tucked cards.
 */
export function birdHasTuckedCards(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(`Bird ${birdInstanceId} not found on ${playerId}'s board`);
    }
    if (bird.tuckedCards.length !== count) {
      throw new Error(
        `Expected bird ${birdInstanceId} to have ${count} tucked card(s), ` +
          `but has ${bird.tuckedCards.length}`
      );
    }
  };
}

/**
 * Assert that a player has a specific hand size.
 */
export function playerHandSize(
  playerId: PlayerId,
  size: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    if (player.hand.length !== size) {
      throw new Error(
        `Expected ${playerId} to have ${size} card(s) in hand, but has ${player.hand.length}`
      );
    }
  };
}

/**
 * Assert that a player has a specific card in their hand.
 */
export function playerHasCardInHand(
  playerId: PlayerId,
  cardId: string
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const hasCard = player.hand.some((card) => card.id === cardId);
    if (!hasCard) {
      throw new Error(
        `Expected ${playerId} to have card "${cardId}" in hand, but they don't`
      );
    }
  };
}

/**
 * Assert that a bird is in a specific habitat.
 */
export function birdIsInHabitat(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId,
  habitat: Habitat
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualHabitat = player.board.getBirdHabitat(birdInstanceId);
    if (actualHabitat !== habitat) {
      throw new Error(
        `Expected bird ${birdInstanceId} to be in ${habitat}, but is in ${actualHabitat ?? "no habitat"}`
      );
    }
  };
}

/**
 * Assert that a bird exists on a player's board.
 */
export function birdExistsOnBoard(
  playerId: PlayerId,
  birdInstanceId: BirdInstanceId
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const bird = player.board.findBirdInstance(birdInstanceId);
    if (!bird) {
      throw new Error(
        `Expected bird ${birdInstanceId} to exist on ${playerId}'s board, but it doesn't`
      );
    }
  };
}

/**
 * Assert the number of birds in a player's habitat.
 */
export function habitatBirdCount(
  playerId: PlayerId,
  habitat: Habitat,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualCount = player.board.countBirdsInHabitat(habitat);
    if (actualCount !== count) {
      throw new Error(
        `Expected ${playerId} to have ${count} bird(s) in ${habitat}, but has ${actualCount}`
      );
    }
  };
}

/**
 * Assert the total number of birds on a player's board.
 */
export function totalBirdCount(
  playerId: PlayerId,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    const actualCount = player.board.getAllBirds().length;
    if (actualCount !== count) {
      throw new Error(
        `Expected ${playerId} to have ${count} total bird(s), but has ${actualCount}`
      );
    }
  };
}

/**
 * Assert that a specific event was emitted.
 * Optionally pass a predicate to match specific event properties.
 */
export function eventWasEmitted<T extends Event["type"]>(
  eventType: T,
  predicate?: (event: Extract<Event, { type: T }>) => boolean
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const matches = ctx.events.filter(
      (e): e is Extract<Event, { type: T }> => e.type === eventType
    );
    if (matches.length === 0) {
      throw new Error(
        `Expected event of type "${eventType}" to be emitted, but it was not`
      );
    }
    if (predicate && !matches.some(predicate)) {
      throw new Error(
        `Event of type "${eventType}" was emitted but didn't match predicate`
      );
    }
  };
}

/**
 * Assert that a specific event was NOT emitted.
 */
export function eventWasNotEmitted<T extends Event["type"]>(
  eventType: T,
  predicate?: (event: Extract<Event, { type: T }>) => boolean
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const matches = ctx.events.filter(
      (e): e is Extract<Event, { type: T }> => e.type === eventType
    );
    if (predicate) {
      if (matches.some(predicate)) {
        throw new Error(
          `Expected no event of type "${eventType}" matching predicate to be emitted, but one was`
        );
      }
    } else if (matches.length > 0) {
      throw new Error(
        `Expected no event of type "${eventType}" to be emitted, but ${matches.length} were`
      );
    }
  };
}

/**
 * Assert the number of times a specific event type was emitted.
 */
export function eventEmittedTimes<T extends Event["type"]>(
  eventType: T,
  times: number,
  predicate?: (event: Extract<Event, { type: T }>) => boolean
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    let matches = ctx.events.filter(
      (e): e is Extract<Event, { type: T }> => e.type === eventType
    );
    if (predicate) {
      matches = matches.filter(predicate);
    }
    if (matches.length !== times) {
      throw new Error(
        `Expected event of type "${eventType}" to be emitted ${times} time(s), ` +
          `but was emitted ${matches.length} time(s)`
      );
    }
  };
}

/**
 * Assert the number of bonus cards a player has.
 */
export function playerBonusCardCount(
  playerId: PlayerId,
  count: number
): ScenarioAssertion {
  return (ctx: ScenarioContext) => {
    const player = ctx.engine.getGameState().findPlayer(playerId);
    if (player.bonusCards.length !== count) {
      throw new Error(
        `Expected ${playerId} to have ${count} bonus card(s), but has ${player.bonusCards.length}`
      );
    }
  };
}

/**
 * Combine multiple assertions into one.
 * All assertions must pass for the combined assertion to pass.
 */
export function all(...assertions: ScenarioAssertion[]): ScenarioAssertion {
  return async (ctx: ScenarioContext) => {
    for (const assertion of assertions) {
      await assertion(ctx);
    }
  };
}

/**
 * Create a custom assertion with a descriptive name.
 * Useful for inline assertions with better error messages.
 */
export function custom(
  name: string,
  fn: (ctx: ScenarioContext) => void | Promise<void>
): ScenarioAssertion {
  return async (ctx: ScenarioContext) => {
    try {
      await fn(ctx);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Custom assertion "${name}" failed: ${error.message}`);
      }
      throw error;
    }
  };
}

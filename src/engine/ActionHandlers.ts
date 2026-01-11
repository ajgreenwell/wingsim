import {
  BirdCard,
  BirdInstance,
  FoodByType,
  FoodType,
  Habitat,
  NestType,
  PlayerId,
  PlayerState,
  PowerSpec,
} from "../types/core.js";
import {
  ActionReceive,
  ActionYield,
  DeferredContinuation,
  PowerContext,
  PowerHandler,
  PowerReceive,
  PowerYield,
  PromptRequest,
  TurnActionHandler,
  TurnActionHandlerContext,
} from "../types/power.js";
import {
  DiscardEggsPrompt,
  DiscardFoodPrompt,
  DrawCardsPrompt,
  OptionChoice,
  OptionPrompt,
  PlaceEggsPrompt,
  PlayerView,
  PlayBirdPrompt,
  SelectCardsPrompt,
  SelectFoodFromFeederPrompt,
} from "../types/prompts.js";
import { Effect } from "../types/effects.js";
import { event } from "./HandlerHelpers.js";

const HABITATS: Habitat[] = ["FOREST", "GRASSLAND", "WETLAND"];
const HABITAT_SIZE = 5;

/**
 * Simple handler that gains food from the supply.
 *
 * Handler params:
 * - foodType: The type of food to gain (e.g., "SEED", "INVERTEBRATE")
 * - count: Number of food to gain
 */
export const gainFoodFromSupply: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  // Get power spec from registry for the prompt
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const foodType = params.foodType as FoodType;
  const count = params.count as number;

  const foodChoice = yield* prompt(ctx, {
    kind: "selectFoodFromSupply",
    count,
    allowedFoods: [foodType],
  });

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: foodChoice.food,
    source: "SUPPLY",
  });
};

/**
 * Gain food from the birdfeeder (if available) and optionally cache it.
 *
 * Handler params:
 * - foodType: The type of food to gain (e.g., "SEED")
 * - count: Number of food to gain
 *
 * Example: Acorn Woodpecker - "Gain 1 [seed] from the birdfeeder, if available.
 * You may cache it on this bird."
 */
export const gainFoodFromFeederWithCache: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  const count = (params.count as number) || 1;

  // Check invariant: food must be available in feeder BEFORE prompting
  let view = ctx.buildOwnerView();
  const availableFood = countFoodInFeeder(view, foodType);

  if (availableFood === 0) {
    // Food not available, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Loop to handle reroll scenario - player may reroll then select food
  let selectedFood: FoodByType | undefined;

  while (!selectedFood) {
    view = ctx.buildOwnerView();

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      view,
      availableFood: buildAvailableFoodFromFeeder(view, foodType, count),
    });

    if (foodChoice.foodOrReroll === "reroll") {
      // Validate that reroll is allowed: all dice must show the same face
      if (!canRerollBirdfeeder(view.birdfeeder)) {
        // Invalid reroll request - agent asked for reroll when not allowed
        // Re-prompt by continuing the loop
        continue;
      }

      // Player chose to reroll - emit the effect
      yield* effect({
        type: "REROLL_BIRDFEEDER",
        playerId: ctx.ownerId,
        previousDice: view.birdfeeder,
        newDice: [], // Engine will fill this in
      });

      // After reroll, check if the desired food is now available
      const newView = ctx.buildOwnerView();
      if (countFoodInFeeder(newView, foodType) === 0) {
        // Still no matching food after reroll, power ends
        return;
      }
      // Loop back to prompt for food selection from new feeder state
      continue;
    }

    // Player selected food
    selectedFood = foodChoice.foodOrReroll;
  }

  const destChoice = yield* prompt(ctx, {
    kind: "selectFoodDestination",
    sourceBirdId: ctx.birdInstanceId,
    food: foodType,
    destinationOptions: ["PLAYER_SUPPLY", "CACHE_ON_SOURCE_BIRD"],
  });

  if (destChoice.destination === "CACHE_ON_SOURCE_BIRD") {
    yield* effect({
      type: "CACHE_FOOD",
      playerId: ctx.ownerId,
      birdInstanceId: ctx.birdInstanceId,
      food: selectedFood,
      source: "BIRDFEEDER",
    });
  } else {
    yield* effect({
      type: "GAIN_FOOD",
      playerId: ctx.ownerId,
      food: selectedFood,
      source: "BIRDFEEDER",
    });
  }
};

/**
 * Pink power triggered when an opponent takes the "lay eggs" action.
 * Lay eggs on birds with a specific nest type.
 *
 * Handler params:
 * - nestType: The nest type required (e.g., "GROUND")
 * - count: Number of eggs to lay
 *
 * Example: American Avocet - "When another player takes the 'lay eggs' action,
 * lay 1 [egg] on another bird with a [ground] nest."
 */
export const whenOpponentLaysEggsLayEggOnNestType: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const nestType = params.nestType as NestType;
  const count = (params.count as number) || 1;

  // Check invariant: must have eligible birds with remaining capacity BEFORE prompting
  const view = ctx.buildOwnerView();
  const eligibleBirds = findBirdsWithNestType(
    view,
    nestType,
    ctx.birdInstanceId
  );

  // Build remaining capacities for eligible birds
  const remainingCapacities: Record<string, number> = {};
  for (const bird of eligibleBirds) {
    const remaining = bird.card.eggCapacity - bird.eggs;
    if (remaining > 0) {
      remainingCapacities[bird.id] = remaining;
    }
  }

  if (Object.keys(remainingCapacities).length === 0) {
    // No eligible birds or all at capacity, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const eggChoice = yield* prompt(ctx, {
    kind: "placeEggs",
    count,
    remainingCapacitiesByEligibleBird: remainingCapacities,
  });

  // Validate the choice matches the prompt constraints
  const placements = eggChoice.placements as Record<string, number>;
  validatePlaceEggsChoice(placements, count, remainingCapacities);

  yield* effect({
    type: "LAY_EGGS",
    playerId: ctx.ownerId,
    placements,
  });
};

/**
 * Player(s) with the fewest birds in a habitat draw cards.
 *
 * Handler params:
 * - habitat: The habitat to count birds in
 * - drawCount: Number of cards to draw
 *
 * Example: American Bittern - "Player(s) with the fewest birds in their
 * [wetland] draw 1 [card]."
 */
export const playersWithFewestInHabitatDrawCard: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const habitat = params.habitat as Habitat;
  const drawCount = (params.drawCount as number) || 1;

  // Find players with fewest birds in the habitat
  const state = ctx.getState();
  const birdCounts: Record<PlayerId, number> = {};

  for (const player of state.players) {
    const birdsInHabitat = player.board[habitat].filter(
      (b) => b !== null
    ).length;
    birdCounts[player.id] = birdsInHabitat;
  }

  const minCount = Math.min(...Object.values(birdCounts));
  const playersWithFewest = Object.entries(birdCounts)
    .filter(([_, count]) => count === minCount)
    .map(([playerId]) => playerId);

  // Sort players in turn order (starting from current player)
  const currentPlayerIndex = state.players.findIndex(
    (p) => p.id === ctx.ownerId
  );
  const sortedPlayers = playersWithFewest.sort((a, b) => {
    const aIndex = state.players.findIndex((p) => p.id === a);
    const bIndex = state.players.findIndex((p) => p.id === b);
    // Calculate positions relative to current player in clockwise order
    const aRelative =
      (aIndex - currentPlayerIndex + state.players.length) %
      state.players.length;
    const bRelative =
      (bIndex - currentPlayerIndex + state.players.length) %
      state.players.length;
    return aRelative - bRelative;
  });

  // Prompt each player in turn order to choose where to draw from
  // Then emit individual DRAW_CARDS effects for each player
  for (const playerId of sortedPlayers) {
    // Get current view for this player (tray may change as players draw)
    const playerView = ctx.buildPlayerView(playerId);

    const drawChoice = yield* prompt(ctx, {
      kind: "drawCards",
      playerId,
      view: playerView,
      remaining: drawCount,
      trayCards: playerView.birdTray,
    });

    yield* effect({
      type: "DRAW_CARDS",
      playerId,
      fromDeck: drawChoice.numDeckCards,
      fromTray: drawChoice.trayCards,
    });
  }
};

/**
 * Tuck a card from hand behind this bird, then draw a card.
 *
 * Handler params:
 * - tuckCount: Number of cards to tuck (usually 1)
 * - drawCount: Number of cards to draw (usually 1)
 *
 * Example: American Coot - "Tuck 1 [card] from your hand behind this bird.
 * If you do, draw 1 [card]."
 */
export const tuckAndDraw: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const tuckCount = (params.tuckCount as number) || 1;
  const drawCount = (params.drawCount as number) || 1;

  // Check invariant: player must have cards in hand BEFORE prompting
  const view = ctx.buildOwnerView();
  if (view.hand.length === 0) {
    // No cards to tuck, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const tuckChoice = yield* prompt(ctx, {
    kind: "selectCards",
    mode: "TUCK",
    source: "HAND",
    count: Math.min(tuckCount, view.hand.length),
    eligibleCards: view.hand,
  });

  if (tuckChoice.cards.length === 0) {
    // Player chose not to tuck, power ends
    return;
  }

  // Tuck the selected cards
  yield* effect({
    type: "TUCK_CARDS",
    playerId: ctx.ownerId,
    targetBirdInstanceId: ctx.birdInstanceId,
    fromRevealed: [],
    fromHand: tuckChoice.cards,
    fromDeck: 0,
  });

  const updatedView = ctx.buildOwnerView();
  const drawChoice = yield* prompt(ctx, {
    kind: "drawCards",
    view: updatedView,
    remaining: drawCount,
    trayCards: updatedView.birdTray,
  });

  yield* effect({
    type: "DRAW_CARDS",
    playerId: ctx.ownerId,
    fromDeck: drawChoice.numDeckCards,
    fromTray: drawChoice.trayCards,
  });
};

/**
 * Discard an egg from another bird to gain food from the supply.
 *
 * Handler params:
 * - foodType: The type of food to gain (e.g., "WILD")
 * - foodCount: Number of food to gain
 * - eggCount: Number of eggs to discard
 *
 * Example: American Crow - "Discard 1 [egg] from any of your other birds
 * to gain 1 [wild] from the supply."
 */
export const discardEggToGainFood: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  const foodCount = (params.foodCount as number) || 1;
  const eggCount = (params.eggCount as number) || 1;

  // Check invariant: must have birds with eggs (excluding this bird) BEFORE prompting
  const view = ctx.buildOwnerView();
  const eggsByBird: Record<string, number> = {};

  for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
    for (const bird of view.board[habitat]) {
      if (bird && bird.id !== ctx.birdInstanceId && bird.eggs > 0) {
        eggsByBird[bird.id] = bird.eggs;
      }
    }
  }

  if (Object.keys(eggsByBird).length === 0) {
    // No eggs to discard, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const eggChoice = yield* prompt(ctx, {
    kind: "discardEggs",
    count: eggCount,
    eggsByEligibleBird: eggsByBird,
  });

  const totalDiscarded =
    Object.values(eggChoice.sources).reduce(
      (sum, c) => (sum || 0) + (c || 0),
      0
    ) || 0;

  if (totalDiscarded === 0) {
    // Player chose not to discard, power ends
    return;
  }

  // Discard the eggs
  yield* effect({
    type: "DISCARD_EGGS",
    playerId: ctx.ownerId,
    sources: eggChoice.sources as Record<string, number>,
  });

  // If food type is WILD, prompt player to choose specific food types
  let foodToGain: FoodByType;

  if (foodType === "WILD") {
    const allFoodTypes: FoodType[] = [
      "INVERTEBRATE",
      "SEED",
      "FISH",
      "FRUIT",
      "RODENT",
    ];

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromSupply",
      count: foodCount,
      allowedFoods: allFoodTypes,
    });

    foodToGain = foodChoice.food;
  } else {
    // Specific food type - no choice needed
    foodToGain = { [foodType]: foodCount };
  }

  // Gain food from supply
  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: foodToGain,
    source: "SUPPLY",
  });
};

/**
 * Roll dice not in birdfeeder; if any match, cache food on this bird.
 *
 * Handler params:
 * - foodType: The food type to look for (e.g., "RODENT")
 * - count: Number of food to cache if match found
 *
 * Example: American Kestrel - "Roll all dice not in birdfeeder. If any are
 * [rodent], cache 1 [rodent] from the supply on this bird."
 */
export const rollDiceAndCacheIfMatch: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  const count = (params.count as number) || 1;

  // Check invariant: must have dice not in feeder BEFORE prompting
  const view = ctx.buildOwnerView();
  const diceInFeeder = view.birdfeeder.length;
  const diceToRoll = 5 - diceInFeeder;

  if (diceToRoll === 0) {
    // All dice are in feeder, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Roll the dice - the engine will fill in the actual results
  const rollResult = yield* effect({
    type: "ROLL_DICE",
    playerId: ctx.ownerId,
    rolledDice: [], // Engine fills this in based on RNG
  });

  // Check if any rolled dice match the target food type
  const matchingDice = rollResult.rolledDice.filter((die) => die === foodType);
  const success = matchingDice.length > 0;

  // Emit predator power resolved event for pink power triggers
  yield* event({
    type: "PREDATOR_POWER_RESOLVED",
    playerId: ctx.ownerId,
    predatorBirdInstanceId: ctx.birdInstanceId,
    success,
    predatorType: "DICE_ROLL",
    diceRoll: {
      diceRolled: rollResult.rolledDice,
      targetFoodType: foodType,
      matchCount: matchingDice.length,
      cachedFood: success ? foodType : undefined,
    },
  });

  if (success) {
    // Cache food only if we rolled a match
    yield* effect({
      type: "CACHE_FOOD",
      playerId: ctx.ownerId,
      birdInstanceId: ctx.birdInstanceId,
      food: { [foodType]: count },
      source: "SUPPLY",
    });
  }
  // If no match, power ends without caching (per rules)
};

/**
 * Draw cards equal to number of players + 1, distribute one to each player.
 * Owner keeps the extra card.
 *
 * Handler params: (none needed - derived from game state)
 *
 * Example: American Oystercatcher - "Draw [card] equal to the number of players +1.
 * Starting with you and proceeding clockwise, each player selects 1 of those cards
 * and places it in their hand. You keep the extra card."
 */
export const drawAndDistributeCards: PowerHandler = function* (
  ctx: PowerContext,
  _params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const state = ctx.getState();
  const numPlayers = state.players.length;
  const cardsToDraw = numPlayers + 1;

  // Reveal cards from the deck
  const revealCardsEffect = yield* effect({
    type: "REVEAL_CARDS",
    playerId: ctx.ownerId,
    source: "DECK",
    count: cardsToDraw,
  });

  const revealedCardIds = revealCardsEffect.revealedCards;
  if (!revealedCardIds || revealedCardIds.length === 0) {
    return;
  }

  // Track which cards are still available for selection (resolve IDs to full cards)
  const registry = ctx.getRegistry();
  let remainingCards = revealedCardIds.map((id) => registry.getBirdById(id));

  // Get clockwise order starting from owner
  const ownerIndex = state.players.findIndex((p) => p.id === ctx.ownerId);
  const playerOrder: PlayerId[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const idx = (ownerIndex + i) % numPlayers;
    playerOrder.push(state.players[idx].id);
  }

  // Each player selects one card from the remaining revealed cards
  for (const playerId of playerOrder) {
    if (remainingCards.length === 0) break;

    const playerView = ctx.buildPlayerView(playerId);

    const selectChoice = yield* prompt(ctx, {
      kind: "selectCards",
      playerId,
      view: playerView,
      mode: "KEEP",
      source: "REVEALED_SET",
      count: 1,
      eligibleCards: remainingCards,
    });

    const selectedCardId = selectChoice.cards[0];

    // Give the selected card to this player
    yield* effect({
      type: "DRAW_CARDS",
      playerId,
      fromDeck: 0,
      fromTray: [],
      fromRevealed: [selectedCardId],
    });

    // Remove from remaining pool
    remainingCards = remainingCards.filter((c) => c.id !== selectedCardId);
  }

  // Owner keeps any remaining cards (the +1 extra)
  if (remainingCards.length > 0) {
    yield* effect({
      type: "DRAW_CARDS",
      playerId: ctx.ownerId,
      fromDeck: 0,
      fromTray: [],
      fromRevealed: remainingCards.map((c) => c.id),
    });
  }
};

/**
 * Gain food from the birdfeeder (any die).
 *
 * Handler params:
 * - foodType: "WILD" means any food type
 * - count: Number of food to gain
 *
 * Example: American Redstart - "Gain 1 [die] from the birdfeeder."
 */
export const gainFoodFromFeeder: PowerHandler = function* (
  ctx: PowerContext,
  _params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;

  // Check invariant: must have dice in feeder BEFORE prompting
  let view = ctx.buildOwnerView();

  if (view.birdfeeder.length === 0) {
    // No dice in feeder, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Loop to handle reroll scenario - player may reroll then select food
  let selectedFood: FoodByType | undefined;

  while (!selectedFood) {
    view = ctx.buildOwnerView();

    const availableFood: FoodByType = {};
    for (const food of view.birdfeeder) {
      availableFood[food] = (availableFood[food] || 0) + 1;
    }

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      availableFood,
    });

    if (foodChoice.foodOrReroll === "reroll") {
      // Validate that reroll is allowed: all dice must show the same face
      if (!canRerollBirdfeeder(view.birdfeeder)) {
        // Invalid reroll request - re-prompt
        continue;
      }

      yield* effect({
        type: "REROLL_BIRDFEEDER",
        playerId: ctx.ownerId,
        previousDice: view.birdfeeder,
        newDice: [],
      });

      // After reroll, check if feeder has food
      const newView = ctx.buildOwnerView();
      if (newView.birdfeeder.length === 0) {
        // Feeder empty after reroll, power ends
        return;
      }
      // Loop back to prompt for food selection from new feeder state
      continue;
    }

    // Player selected food
    selectedFood = foodChoice.foodOrReroll;
  }

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: selectedFood,
    source: "BIRDFEEDER",
  });
};

/**
 * Discard food to tuck cards from the deck behind this bird.
 *
 * Handler params:
 * - foodType: The type of food to discard (e.g., "FISH")
 * - tuckCount: Number of cards to tuck (text says 2, but param says 1?)
 *
 * Example: American White Pelican - "Discard 1 [fish] to tuck 2 [card] from
 * the deck behind this bird."
 */
export const discardFoodToTuckFromDeck: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  // Note: The CSV says tuckCount: 1 but the text says "tuck 2 cards"
  // We'll use the param but default to 2 if not specified
  const tuckCount = (params.tuckCount as number) || 2;

  // Check invariant: player must have the required food BEFORE prompting
  const view = ctx.buildOwnerView();
  const foodAvailable = view.food[foodType] || 0;

  if (foodAvailable === 0) {
    // No food to discard, skip without prompting
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const discardChoice = yield* prompt(ctx, {
    kind: "discardFood",
    foodCost: { [foodType]: 1 },
    tuckedCardsReward: tuckCount,
  });

  yield* effect({
    type: "DISCARD_FOOD",
    playerId: ctx.ownerId,
    food: discardChoice.food,
  });

  // Tuck cards from deck
  yield* effect({
    type: "TUCK_CARDS",
    playerId: ctx.ownerId,
    targetBirdInstanceId: ctx.birdInstanceId,
    fromRevealed: [],
    fromHand: [],
    fromDeck: tuckCount,
  });
};

/**
 * Each player gains food from the birdfeeder, starting with the player of your choice.
 *
 * Handler params:
 * - count: Number of food each player gains (usually 1)
 *
 * Example: Anna's Hummingbird - "Each player gains 1 [die] from the birdfeeder,
 * starting with the player of your choice."
 */
export const eachPlayerGainsFoodFromFeeder: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const count = (params.count as number) || 1;

  // Check invariant: must have dice in feeder BEFORE prompting
  let view = ctx.buildOwnerView();
  if (view.birdfeeder.length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const state = ctx.getState();
  const numPlayers = state.players.length;

  const playerChoice = yield* prompt(ctx, {
    kind: "selectPlayer",
    eligiblePlayers: state.players.map((p) => p.id),
  });

  // Get the clockwise order starting from selected player
  const startIndex = state.players.findIndex(
    (p) => p.id === playerChoice.player
  );
  const playerOrder: PlayerId[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const idx = (startIndex + i) % numPlayers;
    playerOrder.push(state.players[idx].id);
  }

  // Each player gains food from feeder in order, with individual prompts
  for (const playerId of playerOrder) {
    // Get current feeder state (may change as players take food)
    view = ctx.buildOwnerView();

    // Check if feeder has food - if empty, remaining players get nothing
    if (view.birdfeeder.length === 0) {
      break;
    }

    // Build available food for this player's selection
    const availableFood: FoodByType = {};
    for (const food of view.birdfeeder) {
      availableFood[food] = (availableFood[food] || 0) + 1;
    }

    // Limit to count items
    const limitedAvailableFood: FoodByType = {};
    let remaining = count;
    for (const [foodType, foodCount] of Object.entries(availableFood)) {
      if (remaining <= 0) break;
      const toTake = Math.min(remaining, foodCount || 0);
      if (toTake > 0) {
        limitedAvailableFood[foodType as FoodType] = toTake;
        remaining -= toTake;
      }
    }

    const playerView = ctx.buildPlayerView(playerId);

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      playerId,
      view: playerView,
      availableFood: limitedAvailableFood,
    });

    // Handle reroll option
    if (foodChoice.foodOrReroll === "reroll") {
      if (canRerollBirdfeeder(view.birdfeeder)) {
        yield* effect({
          type: "REROLL_BIRDFEEDER",
          playerId,
          previousDice: view.birdfeeder,
          newDice: [],
        });
        // After reroll, re-prompt this same player
        // Decrement loop counter to retry this player
        const currentIdx = playerOrder.indexOf(playerId);
        playerOrder.splice(currentIdx, 0, playerId);
      }
      continue;
    }

    // Player selected food
    yield* effect({
      type: "GAIN_FOOD",
      playerId,
      food: foodChoice.foodOrReroll,
      source: "BIRDFEEDER",
    });
  }
};

/**
 * Lay eggs on each bird with a specific nest type when played.
 *
 * Handler params:
 * - nestType: The nest type required (e.g., "CAVITY")
 * - count: Number of eggs to lay per bird
 *
 * Example: Ash-Throated Flycatcher - "Lay 1 [egg] on each of your birds
 * with a [cavity] nest."
 */
export const layEggOnBirdsWithNestType: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const nestType = params.nestType as NestType;
  const count = (params.count as number) || 1;

  // Find all birds with matching nest type and available capacity
  const view = ctx.buildOwnerView();
  const placements: Record<string, number> = {};

  for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
    for (const bird of view.board[habitat]) {
      if (bird) {
        if (bird.card.nestType === nestType || bird.card.nestType === "WILD") {
          const remaining = bird.card.eggCapacity - bird.eggs;
          if (remaining > 0) {
            placements[bird.id] = Math.min(count, remaining);
          }
        }
      }
    }
  }

  // Check invariant: must have eligible birds BEFORE prompting
  if (Object.keys(placements).length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  yield* effect({
    type: "LAY_EGGS",
    playerId: ctx.ownerId,
    placements,
  });
};

/**
 * Draw bonus cards and keep some.
 *
 * Handler params:
 * - drawCount: Number of bonus cards to draw
 * - keepCount: Number of bonus cards to keep
 *
 * Example: Atlantic Puffin - "Draw 2 new bonus cards and keep 1."
 */
export const drawBonusCardsAndKeep: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const drawCount = (params.drawCount as number) || 2;
  const keepCount = (params.keepCount as number) || 1;

  // Check invariant: must have bonus cards in deck BEFORE prompting
  const bonusCardDeck = ctx.getState().bonusCardDeck;
  if (bonusCardDeck.getDeckSize() === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Reveal bonus cards from deck via effect (engine handles the actual draw)
  const revealResult = yield* effect({
    type: "REVEAL_BONUS_CARDS",
    playerId: ctx.ownerId,
    count: drawCount,
  });

  const revealedCardIds = revealResult.revealedCards;
  if (!revealedCardIds || revealedCardIds.length === 0) {
    // No bonus cards revealed
    return;
  }

  // Resolve card IDs to full cards for the prompt
  const registry = ctx.getRegistry();
  const revealedCards = revealedCardIds.map((id) => registry.getBonusCardById(id));

  const selectChoice = yield* prompt(ctx, {
    kind: "selectBonusCards",
    count: Math.min(keepCount, revealedCards.length),
    eligibleCards: revealedCards,
  });

  // Choice returns card IDs
  const keptCardIds = selectChoice.cards;
  const discardedCardIds = revealedCardIds.filter((id) => !keptCardIds.includes(id));

  yield* effect({
    type: "DRAW_BONUS_CARDS",
    playerId: ctx.ownerId,
    keptCards: keptCardIds,
    discardedCards: discardedCardIds,
  });
};

/**
 * Lay eggs on any bird.
 *
 * Handler params:
 * - count: Number of eggs to lay
 * - eggTarget: "ANY_BIRD" to allow any bird
 *
 * Example: Baird's Sparrow - "Lay 1 [egg] on any bird."
 */
export const layEggsOnBird: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const count = (params.count as number) || 1;

  // Build remaining capacities for all birds
  const view = ctx.buildOwnerView();
  const remainingCapacities: Record<string, number> = {};

  for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
    for (const bird of view.board[habitat]) {
      if (bird) {
        const remaining = bird.card.eggCapacity - bird.eggs;
        if (remaining > 0) {
          remainingCapacities[bird.id] = remaining;
        }
      }
    }
  }

  // Check invariant: must have birds with remaining capacity BEFORE prompting
  if (Object.keys(remainingCapacities).length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const eggChoice = yield* prompt(ctx, {
    kind: "placeEggs",
    count,
    remainingCapacitiesByEligibleBird: remainingCapacities,
  });

  yield* effect({
    type: "LAY_EGGS",
    playerId: ctx.ownerId,
    placements: eggChoice.placements as Record<string, number>,
  });
};

/**
 * Gain all of a specific food type from the birdfeeder.
 *
 * Handler params:
 * - foodType: The food type to gain (e.g., "FISH")
 *
 * Example: Bald Eagle - "Gain all [fish] that are in the birdfeeder."
 */
export const gainAllFoodTypeFromFeeder: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;

  // Check invariant: must have matching food in feeder BEFORE prompting
  const view = ctx.buildOwnerView();
  const matchingCount = view.birdfeeder.filter((f) => f === foodType).length;

  if (matchingCount === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: { [foodType]: matchingCount },
    source: "BIRDFEEDER",
  });
};

/**
 * All players gain food from the supply.
 *
 * Handler params:
 * - foodType: The food type to gain (e.g., "FRUIT")
 * - count: Number of food each player gains
 *
 * Example: Baltimore Oriole - "All players gain 1 [fruit] from the supply."
 */
export const allPlayersGainFoodFromSupply: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  const count = (params.count as number) || 1;

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const state = ctx.getState();
  const gains: Record<PlayerId, FoodByType> = {};

  for (const player of state.players) {
    gains[player.id] = { [foodType]: count };
  }

  yield* effect({
    type: "ALL_PLAYERS_GAIN_FOOD",
    gains,
    source: "SUPPLY",
  });
};

/**
 * Look at a card from the deck; if wingspan is under threshold, tuck it.
 * Otherwise discard it.
 *
 * Handler params:
 * - wingspanThreshold: Maximum wingspan in cm to tuck (e.g., 75)
 *
 * Example: Barred Owl - "Look at a [card] from the deck. If less than 75cm,
 * tuck it behind this bird. If not, discard it."
 */
export const lookAtCardAndTuckIfWingspanUnder: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const wingspanThreshold = (params.wingspanThreshold as number) || 75;

  // Check invariant: must have cards in deck BEFORE prompting
  const state = ctx.getState();
  if (state.birdCardSupply.getDeckSize() === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Draw top card from deck
  const revealCardEffect = yield* effect({
    type: "REVEAL_CARDS",
    playerId: ctx.ownerId,
    source: "DECK",
    count: 1,
  });

  const revealedCards = revealCardEffect.revealedCards;
  if (!revealedCards || revealedCards.length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const revealedCard = ctx.getRegistry().getBirdById(revealedCards[0]);
  const success = revealedCard.wingspanCentimeters < wingspanThreshold;

  // Emit predator power resolved event for pink power triggers
  yield* event({
    type: "PREDATOR_POWER_RESOLVED",
    playerId: ctx.ownerId,
    predatorBirdInstanceId: ctx.birdInstanceId,
    success,
    predatorType: "WINGSPAN_CHECK",
    wingspanCheck: {
      revealedCardId: revealedCards[0],
      wingspan: revealedCard.wingspanCentimeters,
      threshold: wingspanThreshold,
      disposition: success ? "TUCKED" : "DISCARDED",
    },
  });

  if (success) {
    yield* effect({
      type: "TUCK_CARDS",
      playerId: ctx.ownerId,
      targetBirdInstanceId: ctx.birdInstanceId,
      fromRevealed: revealedCards,
      fromHand: [],
      fromDeck: 0,
    });
  } else {
    yield* effect({
      type: "DISCARD_CARDS",
      playerId: ctx.ownerId,
      cards: revealedCards,
    });
  }
};

/**
 * Pink power: When another player plays a bird in a specific habitat, gain food.
 *
 * Handler params:
 * - habitat: The habitat to watch (e.g., "WETLAND")
 * - foodType: The food type to gain (e.g., "FISH")
 * - count: Number of food to gain
 *
 * Example: Belted Kingfisher - "When another player plays a bird in their
 * [wetland], gain 1 [fish] from the supply."
 */
export const whenOpponentPlaysBirdInHabitatGainFood: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const foodType = params.foodType as FoodType;
  const count = (params.count as number) || 1;

  // This is a pink power - it only triggers on opponents' turns
  // The trigger condition is already verified by the event system
  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: { [foodType]: count },
    source: "SUPPLY",
  });
};

/**
 * Move this bird to another habitat if it's the rightmost in its current habitat.
 *
 * Handler params: (none)
 *
 * Example: Bewick's Wren - "If this bird is to the right of all other birds
 * in its habitat, move it to another habitat."
 */
export const moveToAnotherHabitatIfRightmost: PowerHandler = function* (
  ctx: PowerContext,
  _params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;

  // Check invariant: bird must be rightmost in its habitat BEFORE prompting
  const view = ctx.buildOwnerView();
  const currentHabitat = ctx.getHabitat();
  const birdsInHabitat = view.board[currentHabitat].filter((b) => b !== null);

  if (birdsInHabitat.length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  // Find the rightmost bird (last non-null slot)
  const rightmostBird = birdsInHabitat[birdsInHabitat.length - 1];
  if (!rightmostBird || rightmostBird.id !== ctx.birdInstanceId) {
    // This bird is not the rightmost, skip
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  // Find eligible habitats (those with open slots where this bird can go)
  const eligibleHabitats = (
    ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]
  ).filter((h) => {
    if (h === currentHabitat) return false;
    // Check if bird can live in this habitat
    if (!birdCard.habitats.includes(h)) return false;
    // Check if there's an open slot (after existing birds)
    const birdsCount = view.board[h].filter((b) => b !== null).length;
    return birdsCount < 5;
  });

  if (eligibleHabitats.length === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const habitatChoice = yield* prompt(ctx, {
    kind: "selectHabitat",
    eligibleHabitats,
  });

  yield* effect({
    type: "MOVE_BIRD",
    playerId: ctx.ownerId,
    birdInstanceId: ctx.birdInstanceId,
    fromHabitat: currentHabitat,
    toHabitat: habitatChoice.habitat,
  });
};

/**
 * Draw cards now, but must discard at end of turn.
 *
 * Handler params:
 * - drawCount: Number of cards to draw
 * - discardCount: Number of cards to discard at end of turn
 *
 * Example: Black Tern - "Draw 1 [card]. If you do, discard 1 [card] from your
 * hand at the end of your turn."
 */
export const drawCardsWithDelayedDiscard: PowerHandler = function* (
  ctx: PowerContext,
  params: Record<string, unknown>
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
  const power = birdCard.power!;
  const drawCount = (params.drawCount as number) || 1;
  const discardCount = (params.discardCount as number) || 1;

  // Check invariant: must have cards in deck BEFORE prompting
  const state = ctx.getState();
  if (state.birdCardSupply.getDeckSize() === 0) {
    yield* skipPowerDueToCondition(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Draw cards immediately
  yield* effect({
    type: "DRAW_CARDS",
    playerId: ctx.ownerId,
    fromDeck: drawCount,
    fromTray: [],
  });

  // Defer discard to end of turn
  // ctx methods read live state, so the continuation will see the updated hand
  yield* deferToEndOfTurn(function* () {
    const view = ctx.buildOwnerView();
    if (view.hand.length === 0) return;

    const discardChoice = yield* prompt(ctx, {
      kind: "selectCards",
      view,
      mode: "DISCARD",
      source: "HAND",
      count: Math.min(discardCount, view.hand.length),
      eligibleCards: view.hand,
    });

    if (discardChoice.cards.length > 0) {
      yield* effect({
        type: "DISCARD_CARDS",
        playerId: ctx.ownerId,
        cards: discardChoice.cards,
      });
    }
  });
};

/**
 * Helper generator that yields an effect and type-narrows the response.
 * Use with yield* to get the applied effect with engine-populated fields.
 *
 * The engine applies the effect and returns it with result fields populated
 * (e.g., drawnCards for DrawCardsEffect, revealedCards for RevealCardsEffect).
 *
 * @example
 * ```typescript
 * const result = yield* effect({
 *   type: "DRAW_CARDS",
 *   playerId: ctx.ownerId,
 *   fromDeck: 2,
 *   fromTray: [],
 * });
 * // result.drawnCards is now populated by the engine
 * ```
 */
function* effect<T extends Effect["type"]>(
  effect: Extract<Effect, { type: T }>
): Generator<
  Extract<Effect, { type: T }>,
  Extract<Effect, { type: T }>,
  OptionChoice | Effect | undefined
> {
  const result = yield effect;

  if (!result || !("type" in result) || result.type !== effect.type) {
    throw new Error(
      `Invalid result for ${effect.type} effect: expected same effect back`
    );
  }

  return result as Extract<Effect, { type: T }>;
}

/**
 * Helper generator that yields a prompt and type-narrows the response.
 * Use with yield* to get a properly typed choice without manual type guards.
 *
 * @example
 * ```typescript
 * const choice = yield* prompt(ctx, "selectFoodFromSupply", {
 *   count: 1,
 *   allowedFoods: ["SEED"],
 * });
 * // choice is SelectFoodFromSupplyChoice - no type guard needed!
 * ```
 */
function* prompt<K extends OptionChoice["kind"]>(
  ctx: PowerContext,
  promptFields: Omit<
    Extract<OptionPrompt, { kind: K }>,
    "promptId" | "playerId" | "view" | "context"
  > & {
    kind: K;
    playerId?: PlayerId;
    view?: PlayerView;
  }
): Generator<
  PowerYield,
  Extract<OptionChoice, { kind: K }>,
  OptionChoice | Effect | undefined
> {
  const playerId = promptFields.playerId ?? ctx.ownerId;
  const view = promptFields.view ?? ctx.buildOwnerView();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, playerId: _pid, view: _view, ...rest } = promptFields;

  const prompt = {
    ...rest,
    kind,
    promptId: ctx.generatePromptId(),
    playerId,
    view,
    context: ctx.buildPromptContext(),
  } as Extract<OptionPrompt, { kind: K }>;

  const choice = yield { type: "PROMPT", prompt };

  if (!choice || !("kind" in choice) || choice.kind !== kind) {
    throw new Error(`Invalid choice for ${kind} prompt`);
  }

  return choice as Extract<OptionChoice, { kind: K }>;
}

/**
 * Defer a continuation to be executed at end of turn.
 * The continuation can yield effects and prompts just like a normal power handler.
 *
 * Use this for powers that need to "do X now, do Y at end of turn" semantics.
 * The continuation is safe to capture ctx because all context methods read live state.
 *
 * @example
 * ```typescript
 * yield* deferToEndOfTurn(function* () {
 *   const view = ctx.buildOwnerView();
 *   const choice = yield* prompt(ctx, { kind: "selectCards", ... });
 *   yield* effect({ type: "DISCARD_CARDS", cards: choice.cards });
 * });
 * ```
 */
function* deferToEndOfTurn(
  continuation: () => Generator<PowerYield, void, PowerReceive>
): Generator<DeferredContinuation, void, OptionChoice | Effect | undefined> {
  yield {
    type: "DEFER_TO_END_OF_TURN",
    continuation,
  };
}

/**
 * Helper generator that emits a skip effect when invariants aren't met.
 * Use this when a power cannot be activated due to game state conditions.
 *
 * @example
 * ```typescript
 * const myHandler: PowerHandler = function* (ctx, params) {
 *   if (!someInvariant) {
 *     yield* skipPowerDueToCondition(ctx, power);
 *     return;
 *   }
 *   // ... rest of handler
 * };
 * ```
 */
function* skipPowerDueToCondition(
  ctx: PowerContext,
  power: PowerSpec
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  yield* effect({
    type: "ACTIVATE_POWER",
    playerId: ctx.ownerId,
    birdInstanceId: ctx.birdInstanceId,
    handlerId: power.handlerId,
    activated: false,
    skipReason: "CONDITION_NOT_MET",
  });
}

/**
 * Helper generator that handles the common activation prompt for optional powers.
 * Use with `yield*` to delegate to this generator.
 *
 * IMPORTANT: Check invariants BEFORE calling this function. Only prompt the player
 * if the power can actually be executed.
 *
 * @example
 * ```typescript
 * const myHandler: PowerHandler = function* (ctx, params) {
 *   const birdCard = ctx.getRegistry().getBirdById(ctx.birdCardId);
 *   // Check invariants first!
 *   if (!canExecute) {
 *     yield* skipPowerDueToCondition(ctx, birdCard.power!);
 *     return;
 *   }
 *   const shouldActivate = yield* withActivationPrompt(ctx, birdCard.power!);
 *   if (!shouldActivate) return;
 *
 *   // Rest of handler logic...
 * };
 * ```
 *
 * @returns boolean - true if player chose to activate, false otherwise
 */
function* withActivationPrompt(
  ctx: PowerContext,
  power: PowerSpec
): Generator<PowerYield, boolean, OptionChoice | Effect | undefined> {
  const choice = yield* prompt(ctx, {
    kind: "activatePower",
    birdInstanceId: ctx.birdInstanceId,
    power,
  });

  const shouldActivate = choice.activate;

  // Always emit ACTIVATE_POWER to record the decision
  yield* effect({
    type: "ACTIVATE_POWER",
    playerId: ctx.ownerId,
    birdInstanceId: ctx.birdInstanceId,
    handlerId: power.handlerId,
    activated: shouldActivate,
    skipReason: shouldActivate ? undefined : "AGENT_DECLINED",
  });

  return shouldActivate;
}

/**
 * Count how many of a specific food type are in the birdfeeder.
 */
function countFoodInFeeder(view: PlayerView, foodType: FoodType): number {
  return view.birdfeeder.filter((f) => f === foodType).length;
}

/**
 * Check if the birdfeeder can be rerolled.
 * Per Wingspan rules, you can only reroll if all dice in the feeder show the same face.
 */
function canRerollBirdfeeder(birdfeeder: FoodType[]): boolean {
  if (birdfeeder.length === 0) return false;
  const firstFood = birdfeeder[0];
  return birdfeeder.every((f) => f === firstFood);
}

/**
 * Validate that a PlaceEggsChoice matches the constraints from the prompt.
 * Throws an error if validation fails.
 */
function validatePlaceEggsChoice(
  placements: Record<string, number>,
  expectedCount: number,
  remainingCapacities: Record<string, number>
): void {
  // Validate total eggs match expected count
  const totalEggs = Object.values(placements).reduce(
    (sum, count) => sum + (count || 0),
    0
  );
  if (totalEggs !== expectedCount) {
    throw new Error(
      `Invalid PlaceEggsChoice: total eggs ${totalEggs} does not match expected count ${expectedCount}`
    );
  }

  // Validate each placement doesn't exceed the bird's remaining capacity
  for (const [birdId, eggCount] of Object.entries(placements)) {
    if (eggCount <= 0) continue;

    const capacity = remainingCapacities[birdId];
    if (capacity === undefined) {
      throw new Error(
        `Invalid PlaceEggsChoice: bird ${birdId} is not eligible for egg placement`
      );
    }
    if (eggCount > capacity) {
      throw new Error(
        `Invalid PlaceEggsChoice: ${eggCount} eggs on bird ${birdId} exceeds remaining capacity ${capacity}`
      );
    }
  }
}

/**
 * Build a FoodByType representing available food in the feeder,
 * filtered to a specific type and limited by count.
 */
function buildAvailableFoodFromFeeder(
  view: PlayerView,
  foodType: FoodType,
  maxCount: number
): FoodByType {
  const available = countFoodInFeeder(view, foodType);
  return { [foodType]: Math.min(available, maxCount) };
}

/**
 * Find all birds on the owner's board with a specific nest type.
 * Optionally exclude a specific bird instance.
 * Filters by nest type using the embedded card (WILD nest type matches any).
 */
function findBirdsWithNestType(
  view: PlayerView,
  nestType: NestType,
  excludeBirdId?: string
): BirdInstance[] {
  const result: BirdInstance[] = [];

  for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
    for (const bird of view.board[habitat]) {
      if (bird && bird.id !== excludeBirdId) {
        // Match if bird has the required nest type or WILD nest type
        if (bird.card.nestType === nestType || bird.card.nestType === "WILD") {
          result.push(bird);
        }
      }
    }
  }

  return result;
}

/**
 * Helper to yield an effect and get the applied result back (for turn action handlers).
 */
function* turnActionEffect<T extends Effect["type"]>(
  eff: Extract<Effect, { type: T }>
): Generator<
  Extract<Effect, { type: T }>,
  Extract<Effect, { type: T }>,
  OptionChoice | Effect | undefined
> {
  const result = yield eff;
  if (!result || !("type" in result) || result.type !== eff.type) {
    throw new Error(`Invalid result for ${eff.type} effect`);
  }
  return result as Extract<Effect, { type: T }>;
}

/**
 * Helper to yield a prompt and get a typed choice back (for turn action handlers).
 */
function* turnActionPrompt<K extends OptionChoice["kind"]>(
  _ctx: TurnActionHandlerContext,
  promptObj: Extract<OptionPrompt, { kind: K }>
): Generator<ActionYield, Extract<OptionChoice, { kind: K }>, ActionReceive> {
  const choice = yield { type: "PROMPT", prompt: promptObj } as PromptRequest;
  if (!choice || !("kind" in choice) || choice.kind !== promptObj.kind) {
    throw new Error(`Invalid choice for ${promptObj.kind} prompt`);
  }
  return choice as Extract<OptionChoice, { kind: K }>;
}

/**
 * Get the leftmost empty column in a habitat (0-4), or 5 if full.
 */
export function getLeftmostEmptyColumn(
  player: Readonly<PlayerState>,
  habitat: Habitat
): number {
  const row = player.board[habitat];
  for (let i = 0; i < row.length; i++) {
    if (row[i] === null) {
      return i;
    }
  }
  return HABITAT_SIZE; // Full habitat
}

/**
 * Get bird instance IDs with brown powers in a habitat, in right-to-left order.
 */
function getBirdsWithBrownPowers(
  player: Readonly<PlayerState>,
  habitat: Habitat
): string[] {
  const birds: string[] = [];
  const row = player.board[habitat];
  // Right to left order
  for (let i = row.length - 1; i >= 0; i--) {
    const bird = row[i];
    if (bird && bird.card.power?.trigger === "WHEN_ACTIVATED") {
      birds.push(bird.id);
    }
  }
  return birds;
}

/**
 * Get remaining egg capacities for all birds on a player's board.
 */
function getRemainingEggCapacities(
  player: Readonly<PlayerState>
): Record<string, number> {
  const capacities: Record<string, number> = {};
  for (const habitat of HABITATS) {
    for (const bird of player.board[habitat]) {
      if (bird) {
        const remaining = bird.card.eggCapacity - bird.eggs;
        if (remaining > 0) {
          capacities[bird.id] = remaining;
        }
      }
    }
  }
  return capacities;
}

/**
 * Get eggs on each bird that has any eggs.
 */
function getEggsOnBirds(
  player: Readonly<PlayerState>
): Record<string, number> {
  const eggs: Record<string, number> = {};
  for (const habitat of HABITATS) {
    for (const bird of player.board[habitat]) {
      if (bird && bird.eggs > 0) {
        eggs[bird.id] = bird.eggs;
      }
    }
  }
  return eggs;
}

/**
 * Get birds from hand that the player can afford to play.
 */
function getEligibleBirdsToPlay(player: Readonly<PlayerState>): BirdCard[] {
  return player.hand.filter((card) => {
    // Check if player can afford the food cost
    if (card.foodCostMode === "NONE") {
      return true;
    }

    if (card.foodCostMode === "AND") {
      // Must have all food types
      for (const [foodType, required] of Object.entries(card.foodCost)) {
        if (required && required > 0) {
          const available = player.food[foodType as FoodType] ?? 0;
          if (available < required) {
            return false;
          }
        }
      }
      return true;
    }

    if (card.foodCostMode === "OR") {
      // Must have at least one of the required food types
      const totalRequired = Object.values(card.foodCost).reduce(
        (sum, v) => sum + (v ?? 0),
        0
      );
      if (totalRequired === 0) return true;

      let totalAvailable = 0;
      for (const [foodType, required] of Object.entries(card.foodCost)) {
        if (required && required > 0) {
          totalAvailable += player.food[foodType as FoodType] ?? 0;
        }
      }
      return totalAvailable >= 1;
    }

    return false;
  });
}

/**
 * Build FoodByType from birdfeeder state.
 * Note: SEED_INVERTEBRATE dice are represented as SEED in the available food.
 */
function buildAvailableFoodFromBirdfeeder(
  birdfeeder: ReadonlyArray<FoodType>
): FoodByType {
  const food: FoodByType = {};
  for (const die of birdfeeder) {
    food[die] = (food[die] ?? 0) + 1;
  }
  return food;
}

/**
 * GAIN_FOOD action handler.
 * Player selects food from the birdfeeder.
 */
export const gainFoodHandler: TurnActionHandler = function* (ctx, params) {
  const state = ctx.getState();
  const player = state.players.find((p) => p.id === ctx.playerId)!;
  const registry = ctx.getRegistry();
  const board = registry.getPlayerBoard();

  const leftmostEmpty = getLeftmostEmptyColumn(player, "FOREST");
  const baseReward = board.forest.baseRewards[leftmostEmpty];
  const bonus = board.forest.bonusRewards[leftmostEmpty];

  // Handle bonus cost: discard 1 card from hand to gain 1 extra food
  let bonusApplied = false;
  if (params.takeBonus && bonus && player.hand.length > 0) {
    const selectCardsPrompt: SelectCardsPrompt = {
      promptId: ctx.generatePromptId(),
      playerId: ctx.playerId,
      kind: "selectCards",
      view: ctx.buildPlayerView(),
      context: ctx.buildPromptContext(),
      mode: "DISCARD",
      source: "HAND",
      count: bonus.tradeFromAmount,
      eligibleCards: player.hand,
    };

    const selectChoice = yield* turnActionPrompt(ctx, selectCardsPrompt);
    if (selectChoice.cards.length > 0) {
      yield* turnActionEffect({
        type: "DISCARD_CARDS",
        playerId: ctx.playerId,
        cards: selectChoice.cards,
      });
      bonusApplied = true;
    }
  }

  // Calculate food to gain based on base reward (plus bonus if paid)
  let foodToGain = baseReward;
  if (bonusApplied && bonus) {
    foodToGain += bonus.tradeToAmount;
  }

  const gainedFood: FoodByType = {};
  for (let i = 0; i < foodToGain; i++) {
    // Get current birdfeeder state from live state
    const currentState = ctx.getState();
    const currentBirdfeeder = currentState.birdfeeder.getDiceInFeeder();

    if (currentBirdfeeder.length === 0) {
      break; // No food available
    }

    const availableFood = buildAvailableFoodFromBirdfeeder(currentBirdfeeder as FoodType[]);

    const foodPrompt: SelectFoodFromFeederPrompt = {
      promptId: ctx.generatePromptId(),
      playerId: ctx.playerId,
      kind: "selectFoodFromFeeder",
      view: ctx.buildPlayerView(),
      context: ctx.buildPromptContext(),
      availableFood,
    };

    const choice = yield* turnActionPrompt(ctx, foodPrompt);

    if (choice.foodOrReroll === "reroll") {
      // Check if reroll is allowed (all dice show same face)
      const uniqueFaces = new Set(currentBirdfeeder);
      if (uniqueFaces.size <= 1) {
        yield* turnActionEffect({
          type: "REROLL_BIRDFEEDER",
          playerId: ctx.playerId,
          previousDice: currentBirdfeeder as FoodType[],
          newDice: [], // Engine fills this
        });
      }
      i--; // Don't count reroll as food gained
      continue;
    }

    // Take food from feeder - the GAIN_FOOD effect with source: "BIRDFEEDER"
    // will cause GameEngine.applyGainFood() to remove the die from the feeder
    for (const [foodType, count] of Object.entries(choice.foodOrReroll)) {
      if (count && count > 0) {
        const ft = foodType as FoodType;
        gainedFood[ft] = (gainedFood[ft] ?? 0) + 1;
        // Yield individual GAIN_FOOD effect per food item so birdfeeder is updated
        yield* turnActionEffect({
          type: "GAIN_FOOD",
          playerId: ctx.playerId,
          food: { [ft]: 1 },
          source: "BIRDFEEDER",
        });
        break; // One food per iteration
      }
    }
  }

  // Yield food gained event for pink power triggers
  yield* event({
    type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
    playerId: ctx.playerId,
    food: gainedFood,
  });

  // Get birds with brown powers in forest for activation
  const updatedPlayer = ctx.getState().players.find((p) => p.id === ctx.playerId)!;
  const forestBirds = getBirdsWithBrownPowers(updatedPlayer, "FOREST");

  yield* event({
    type: "HABITAT_ACTIVATED",
    playerId: ctx.playerId,
    habitat: "FOREST",
    birdInstanceIds: forestBirds,
  });
};

/**
 * LAY_EGGS action handler.
 * Player places eggs on birds with remaining capacity.
 */
export const layEggsHandler: TurnActionHandler = function* (ctx, params) {
  const state = ctx.getState();
  const player = state.players.find((p) => p.id === ctx.playerId)!;
  const registry = ctx.getRegistry();
  const board = registry.getPlayerBoard();

  const leftmostEmpty = getLeftmostEmptyColumn(player, "GRASSLAND");
  let eggsToLay = board.grassland.baseRewards[leftmostEmpty];
  const bonus = board.grassland.bonusRewards[leftmostEmpty];

  // Handle bonus cost: discard 1 food to lay 1 extra egg
  let bonusApplied = false;
  if (params.takeBonus && bonus) {
    // Check if player has enough food to pay the cost
    let totalFood = 0;
    for (const count of Object.values(player.food)) {
      totalFood += count ?? 0;
    }

    if (totalFood >= bonus.tradeFromAmount) {
      const discardFoodPrompt: DiscardFoodPrompt = {
        promptId: ctx.generatePromptId(),
        playerId: ctx.playerId,
        kind: "discardFood",
        view: ctx.buildPlayerView(),
        context: ctx.buildPromptContext(),
        foodCost: { WILD: bonus.tradeFromAmount }, // Any food type accepted
        tuckedCardsReward: 0,
      };

      const discardChoice = yield* turnActionPrompt(ctx, discardFoodPrompt);
      yield* turnActionEffect({
        type: "DISCARD_FOOD",
        playerId: ctx.playerId,
        food: discardChoice.food,
      });
      bonusApplied = true;
    }
  }

  if (bonusApplied && bonus) {
    eggsToLay += bonus.tradeToAmount;
  }

  // Find birds with remaining egg capacity
  const capacities = getRemainingEggCapacities(player);

  const placements: Array<{ birdInstanceId: string; count: number }> = [];

  if (Object.keys(capacities).length > 0 && eggsToLay > 0) {
    const placeEggsPrompt: PlaceEggsPrompt = {
      promptId: ctx.generatePromptId(),
      playerId: ctx.playerId,
      kind: "placeEggs",
      view: ctx.buildPlayerView(),
      context: ctx.buildPromptContext(),
      count: eggsToLay,
      remainingCapacitiesByEligibleBird: capacities,
    };

    const choice = yield* turnActionPrompt(ctx, placeEggsPrompt);
    // Collect placements for effect
    const eggPlacements: Record<string, number> = {};
    for (const [birdId, count] of Object.entries(choice.placements)) {
      if (count && count > 0) {
        eggPlacements[birdId] = count;
        placements.push({ birdInstanceId: birdId, count });
      }
    }

    if (Object.keys(eggPlacements).length > 0) {
      yield* turnActionEffect({
        type: "LAY_EGGS",
        playerId: ctx.playerId,
        placements: eggPlacements,
      });
    }
  }

  // Get birds with brown powers in grassland for activation
  const updatedPlayer = ctx.getState().players.find((p) => p.id === ctx.playerId)!;
  const grasslandBirds = getBirdsWithBrownPowers(updatedPlayer, "GRASSLAND");

  yield* event({
    type: "HABITAT_ACTIVATED",
    playerId: ctx.playerId,
    habitat: "GRASSLAND",
    birdInstanceIds: grasslandBirds,
  });

  yield* event({
    type: "EGGS_LAID_FROM_HABITAT_ACTIVATION",
    playerId: ctx.playerId,
    placements,
  });
};

/**
 * DRAW_CARDS action handler.
 * Player draws cards from tray and/or deck.
 */
export const drawCardsHandler: TurnActionHandler = function* (ctx, params) {
  const state = ctx.getState();
  const player = state.players.find((p) => p.id === ctx.playerId)!;
  const registry = ctx.getRegistry();
  const board = registry.getPlayerBoard();

  const leftmostEmpty = getLeftmostEmptyColumn(player, "WETLAND");
  let cardsToDraw = board.wetland.baseRewards[leftmostEmpty];
  const bonus = board.wetland.bonusRewards[leftmostEmpty];

  // Handle bonus cost: discard 1 egg to draw 1 extra card
  let bonusApplied = false;
  if (params.takeBonus && bonus) {
    // Get eggs on birds
    const eggsOnBirds = getEggsOnBirds(player);
    let totalEggs = 0;
    for (const count of Object.values(eggsOnBirds)) {
      totalEggs += count ?? 0;
    }

    if (totalEggs >= bonus.tradeFromAmount) {
      // Prompt player to choose which eggs to discard
      const discardEggsPrompt: DiscardEggsPrompt = {
        promptId: ctx.generatePromptId(),
        playerId: ctx.playerId,
        kind: "discardEggs",
        view: ctx.buildPlayerView(),
        context: ctx.buildPromptContext(),
        count: bonus.tradeFromAmount,
        eggsByEligibleBird: eggsOnBirds,
      };

      const discardChoice = yield* turnActionPrompt(ctx, discardEggsPrompt);
      // Filter to only include defined values
      const sources: Record<string, number> = {};
      for (const [birdId, count] of Object.entries(discardChoice.sources)) {
        if (count !== undefined && count > 0) {
          sources[birdId] = count;
        }
      }
      yield* turnActionEffect({
        type: "DISCARD_EGGS",
        playerId: ctx.playerId,
        sources,
      });
      bonusApplied = true;
    }
  }

  if (bonusApplied && bonus) {
    cardsToDraw += bonus.tradeToAmount;
  }

  // Collect all cards drawn across iterations
  const allFromTray: string[] = [];
  let allFromDeck = 0;

  let remaining = cardsToDraw;
  while (remaining > 0) {
    // Get current tray from live state
    const currentState = ctx.getState();
    const tray = currentState.birdCardSupply.getTray();
    const trayCards = tray.filter((c): c is BirdCard => c !== null);

    const drawCardsPrompt: DrawCardsPrompt = {
      promptId: ctx.generatePromptId(),
      playerId: ctx.playerId,
      kind: "drawCards",
      view: ctx.buildPlayerView(),
      context: ctx.buildPromptContext(),
      remaining,
      trayCards,
    };

    const choice = yield* turnActionPrompt(ctx, drawCardsPrompt);

    // Track what was selected
    const fromTray = choice.trayCards;
    const fromDeck = Math.min(choice.numDeckCards, remaining - fromTray.length);

    // Yield a single DRAW_CARDS effect for this batch
    if (fromTray.length > 0 || fromDeck > 0) {
      yield* turnActionEffect({
        type: "DRAW_CARDS",
        playerId: ctx.playerId,
        fromTray,
        fromDeck,
      });

      allFromTray.push(...fromTray);
      allFromDeck += fromDeck;
      remaining -= (fromTray.length + fromDeck);
    }

    // Refill tray after drawing
    yield* turnActionEffect({
      type: "REFILL_BIRD_TRAY",
      discardedCards: [],
      newCards: [], // Engine fills this
    });

    // Break if no cards were drawn this iteration
    if (choice.trayCards.length === 0 && choice.numDeckCards === 0) {
      break;
    }
  }

  const updatedPlayer = ctx.getState().players.find((p) => p.id === ctx.playerId)!;
  const wetlandBirds = getBirdsWithBrownPowers(updatedPlayer, "WETLAND");

  yield* event({
    type: "HABITAT_ACTIVATED",
    playerId: ctx.playerId,
    habitat: "WETLAND",
    birdInstanceIds: wetlandBirds,
  });
};

/**
 * PLAY_BIRD action handler.
 * Player plays a bird from hand to their board.
 */
export const playBirdHandler: TurnActionHandler = function* (ctx, _params) {
  const state = ctx.getState();
  const player = state.players.find((p) => p.id === ctx.playerId)!;
  const registry = ctx.getRegistry();
  const boardConfig = registry.getPlayerBoard();

  // Find eligible birds (cards in hand player can afford)
  const eligibleBirds = getEligibleBirdsToPlay(player);

  if (eligibleBirds.length === 0) {
    return; // No birds can be played
  }

  // Calculate egg costs for each habitat
  const eggCostByHabitat: Partial<Record<Habitat, number>> = {};
  for (const habitat of HABITATS) {
    const leftmostEmpty = getLeftmostEmptyColumn(player, habitat);
    if (leftmostEmpty < HABITAT_SIZE) {
      eggCostByHabitat[habitat] = boardConfig.playBirdCosts[leftmostEmpty];
    }
  }

  const playBirdPrompt: PlayBirdPrompt = {
    promptId: ctx.generatePromptId(),
    playerId: ctx.playerId,
    kind: "playBird",
    view: ctx.buildPlayerView(),
    context: ctx.buildPromptContext(),
    eligibleBirds,
    eggCostByEligibleHabitat: eggCostByHabitat,
  };

  const choice = yield* turnActionPrompt(ctx, playBirdPrompt);

  // Find the bird card
  const birdCard = player.hand.find((c) => c.id === choice.bird);
  if (!birdCard) {
    return;
  }

  // Find leftmost empty slot in chosen habitat
  const habitat = choice.habitat;
  const column = getLeftmostEmptyColumn(player, habitat);

  // Create bird instance ID
  const birdInstanceId = `${ctx.playerId}_${habitat}_${column}_${birdCard.id}`;

  // Build food paid (filter undefined values)
  const foodPaid: FoodByType = {};
  for (const [foodType, count] of Object.entries(choice.foodToSpend)) {
    if (count !== undefined && count > 0) {
      foodPaid[foodType as FoodType] = count;
    }
  }

  // Build eggs paid (filter undefined values)
  const eggsPaid: Record<string, number> = {};
  for (const [birdId, count] of Object.entries(choice.eggsToSpend)) {
    if (count !== undefined && count > 0) {
      eggsPaid[birdId] = count;
    }
  }

  // Yield play bird effect
  yield* turnActionEffect({
    type: "PLAY_BIRD",
    playerId: ctx.playerId,
    birdInstanceId,
    habitat,
    column,
    foodPaid,
    eggsPaid,
  });

  // Yield BirdPlayedEvent
  yield* event({
    type: "BIRD_PLAYED",
    playerId: ctx.playerId,
    birdInstanceId,
    birdCardId: birdCard.id,
    habitat,
    position: column,
  });
};

import {
  BirdCard,
  DieFace,
  DieSelection,
  FoodByDice,
  FoodByType,
  FoodType,
  Habitat,
  NestType,
  PlayerId,
  PowerSpec,
} from "../types/core.js";
import {
  ActionReceive,
  ActionYield,
  DeferredContinuation,
  EventYield,
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
import { Event } from "../types/events.js";
import { Effect } from "../types/effects.js";

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
  const availableFood = countFoodInFeederByType(view, foodType);

  if (availableFood === 0) {
    // Food not available, skip without prompting
    yield* skipPowerDueToResourceUnavailable(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Loop to handle reroll scenario - player may reroll then select food
  let selectedDice: DieSelection[] | undefined;

  while (!selectedDice) {
    view = ctx.buildOwnerView();

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      view,
      availableDice: buildAvailableDiceForFoodType(view.birdfeeder, foodType, count),
    });

    if (foodChoice.diceOrReroll === "reroll") {
      // Validate that reroll is allowed: all dice must show the same face
      if (!canRerollBirdfeederDice(view.birdfeeder)) {
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
      if (countFoodInFeederByType(newView, foodType) === 0) {
        // Still no matching food after reroll, power ends
        return;
      }
      // Loop back to prompt for food selection from new feeder state
      continue;
    }

    // Player selected dice
    selectedDice = foodChoice.diceOrReroll;
  }

  const selectedFood = convertDieSelectionsToFood(selectedDice);

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
      diceTaken: selectedDice,
    });
  } else {
    yield* effect({
      type: "GAIN_FOOD",
      playerId: ctx.ownerId,
      food: selectedFood,
      source: "BIRDFEEDER",
      diceTaken: selectedDice,
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
  const state = ctx.getState();
  const player = state.players.find((p) => p.id === ctx.ownerId)!;
  const eligibleBirds = player.board.getBirdsWithNestType(
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  const eggChoice = yield* prompt(ctx, {
    kind: "placeEggs",
    count,
    remainingCapacitiesByEligibleBird: remainingCapacities,
  });

  // Note: Validation is now done in ActionProcessor.runGenerator() before resuming the generator

  yield* effect({
    type: "LAY_EGGS",
    playerId: ctx.ownerId,
    placements: eggChoice.placements as Record<string, number>,
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
    const birdsInHabitat = player.board.countBirdsInHabitat(habitat);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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

  let view = ctx.buildOwnerView();

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Loop to handle reroll scenario - player may reroll then select food
  let selectedDice: DieSelection[] | undefined;

  while (!selectedDice) {
    view = ctx.buildOwnerView();

    const availableDice = buildAvailableDiceFromBirdfeeder(view.birdfeeder);

    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      availableDice,
    });

    if (foodChoice.diceOrReroll === "reroll") {
      // Validate that reroll is allowed: all dice must show the same face
      if (!canRerollBirdfeederDice(view.birdfeeder)) {
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

    // Player selected dice
    selectedDice = foodChoice.diceOrReroll;
  }

  const selectedFood = convertDieSelectionsToFood(selectedDice);

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: selectedFood,
    source: "BIRDFEEDER",
    diceTaken: selectedDice,
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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

  let view = ctx.buildOwnerView();

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
  // Use a while loop with explicit index to avoid mutating array during iteration
  let playerIndex = 0;
  while (playerIndex < playerOrder.length) {
    const playerId = playerOrder[playerIndex];

    // Refresh view to get current birdfeeder state
    view = ctx.buildOwnerView();

    // Check if feeder is empty - if so, remaining players get nothing
    if (view.birdfeeder.length === 0) {
      break;
    }

    // Build available dice for this player's selection (limited to count)
    const availableDice = buildLimitedAvailableDice(view.birdfeeder, count);
    const playerView = ctx.buildPlayerView(playerId);
    const foodChoice = yield* prompt(ctx, {
      kind: "selectFoodFromFeeder",
      playerId,
      view: playerView,
      availableDice,
    });

    // Handle reroll option
    if (foodChoice.diceOrReroll === "reroll") {
      if (canRerollBirdfeederDice(view.birdfeeder)) {
        yield* effect({
          type: "REROLL_BIRDFEEDER",
          playerId,
          previousDice: view.birdfeeder,
          newDice: [],
        });
        // Don't increment playerIndex - re-prompt same player after reroll
        continue;
      }
      // Invalid reroll attempt - re-prompt same player
      continue;
    }

    // Player selected dice
    const selectedDice = foodChoice.diceOrReroll;
    const selectedFood = convertDieSelectionsToFood(selectedDice);

    yield* effect({
      type: "GAIN_FOOD",
      playerId,
      food: selectedFood,
      source: "BIRDFEEDER",
      diceTaken: selectedDice,
    });

    // Only advance to next player after successful food selection
    playerIndex++;
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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

  const bonusCardDeck = ctx.getState().bonusCardDeck;
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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

  // Find all exact matches
  const exactMatches: Array<{ die: DieFace; index: number }> = [];
  view.birdfeeder.forEach((die, index) => {
    if (die === foodType) {
      exactMatches.push({ die, index });
    }
  });

  // For SEED or INVERTEBRATE, also check for SEED_INVERTEBRATE dual dice
  const dualDiceMatches: Array<{ die: DieFace; index: number }> = [];
  if (foodType === "SEED" || foodType === "INVERTEBRATE") {
    view.birdfeeder.forEach((die, index) => {
      if (die === "SEED_INVERTEBRATE") {
        dualDiceMatches.push({ die, index });
      }
    });
  }

  const totalMatchCount = exactMatches.length + dualDiceMatches.length;

  if (totalMatchCount === 0) {
    yield* skipPowerDueToResourceUnavailable(ctx, power);
    return;
  }

  const shouldActivate = yield* withActivationPrompt(ctx, power);
  if (!shouldActivate) return;

  // Build dice selections - exact matches don't need asFoodType, dual dice do
  const diceTaken: DieSelection[] = [
    ...exactMatches.map(({ die }) => ({ die })),
    ...dualDiceMatches.map(({ die }) => ({
      die,
      asFoodType: foodType as "SEED" | "INVERTEBRATE",
    })),
  ];

  yield* effect({
    type: "GAIN_FOOD",
    playerId: ctx.ownerId,
    food: { [foodType]: totalMatchCount },
    source: "BIRDFEEDER",
    diceTaken,
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
  const requiredHabitat = params.habitat as Habitat;

  // Check if the triggering event matches the required habitat
  const triggeringEvent = ctx.getTriggeringEvent();
  if (triggeringEvent?.type === "BIRD_PLAYED") {
    if (triggeringEvent.habitat !== requiredHabitat) {
      // Bird was played in wrong habitat, silently skip (no activation prompt)
      yield* effect({
        type: "ACTIVATE_POWER",
        playerId: ctx.ownerId,
        birdInstanceId: ctx.birdInstanceId,
        handlerId: power.handlerId,
        activated: false,
      });
      return;
    }
  }

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

  // Find the rightmost bird (last non-null slot)
  const rightmostBird = birdsInHabitat[birdsInHabitat.length - 1];
  if (!rightmostBird || rightmostBird.id !== ctx.birdInstanceId) {
    // This bird is not the rightmost, skip
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
    yield* skipPowerDueToResourceUnavailable(ctx, power);
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
 * Helper to yield an event from a handler.
 *
 * Events are collected by the runner and processed after the generator completes.
 * Unlike effects (which are applied immediately), events are queued for later
 * processing to ensure proper ordering of power triggers.
 *
 * Usage:
 * ```typescript
 * yield* event({
 *   type: "PREDATOR_POWER_RESOLVED",
 *   playerId: ctx.ownerId,
 *   // ... other event fields
 * });
 * ```
 */
export function* event(evt: Event): Generator<EventYield, void, unknown> {
  yield { type: "EVENT", event: evt };
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
 *     yield* skipPowerDueToResourceUnavailable(ctx, power);
 *     return;
 *   }
 *   // ... rest of handler
 * };
 * ```
 */
function* skipPowerDueToResourceUnavailable(
  ctx: PowerContext,
  power: PowerSpec
): Generator<PowerYield, void, OptionChoice | Effect | undefined> {
  yield* effect({
    type: "ACTIVATE_POWER",
    playerId: ctx.ownerId,
    birdInstanceId: ctx.birdInstanceId,
    handlerId: power.handlerId,
    activated: false,
    skipReason: "RESOURCE_UNAVAILABLE",
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
 *     yield* skipPowerDueToResourceUnavailable(ctx, birdCard.power!);
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
 * Count how many dice can produce a specific food type.
 * SEED_INVERTEBRATE dice can produce either SEED or INVERTEBRATE.
 */
function countFoodInFeederByType(view: PlayerView, foodType: FoodType): number {
  return view.birdfeeder.filter((die) => {
    if (die === foodType) return true;
    if (die === "SEED_INVERTEBRATE" && (foodType === "SEED" || foodType === "INVERTEBRATE")) {
      return true;
    }
    return false;
  }).length;
}

/**
 * Check if the birdfeeder can be rerolled.
 * Per Wingspan rules, you can only reroll if all dice in the feeder show the same face.
 */
function canRerollBirdfeederDice(birdfeeder: DieFace[]): boolean {
  if (birdfeeder.length === 0) return false;
  const firstDie = birdfeeder[0];
  return birdfeeder.every((die) => die === firstDie);
}

/**
 * Build a FoodByDice representing available dice in the feeder
 * that can produce a specific food type, limited by count.
 * SEED_INVERTEBRATE dice are included when looking for SEED or INVERTEBRATE.
 */
function buildAvailableDiceForFoodType(
  birdfeeder: readonly DieFace[],
  foodType: FoodType,
  maxCount: number
): FoodByDice {
  const result: FoodByDice = {};
  let remaining = maxCount;

  for (const die of birdfeeder) {
    if (remaining <= 0) break;

    // Check if this die can produce the desired food type
    const canProduce =
      die === foodType ||
      (die === "SEED_INVERTEBRATE" && (foodType === "SEED" || foodType === "INVERTEBRATE"));

    if (canProduce) {
      result[die] = (result[die] ?? 0) + 1;
      remaining--;
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
 * Build FoodByDice from birdfeeder state.
 * Preserves SEED_INVERTEBRATE as a distinct die face.
 */
function buildAvailableDiceFromBirdfeeder(
  birdfeeder: ReadonlyArray<DieFace>
): FoodByDice {
  const dice: FoodByDice = {};
  for (const die of birdfeeder) {
    dice[die] = (dice[die] ?? 0) + 1;
  }
  return dice;
}

/**
 * Build FoodByDice from birdfeeder, limited to a max count of dice.
 */
function buildLimitedAvailableDice(
  birdfeeder: readonly DieFace[],
  maxCount: number
): FoodByDice {
  const result: FoodByDice = {};
  let remaining = maxCount;

  for (const die of birdfeeder) {
    if (remaining <= 0) break;
    result[die] = (result[die] ?? 0) + 1;
    remaining--;
  }

  return result;
}

/**
 * Convert array of DieSelection to actual FoodByType gained.
 * Handles SEED_INVERTEBRATE dice using the asFoodType field.
 */
function convertDieSelectionsToFood(selections: DieSelection[]): FoodByType {
  const food: FoodByType = {};
  for (const selection of selections) {
    let foodType: FoodType;
    if (selection.die === "SEED_INVERTEBRATE") {
      // For SEED_INVERTEBRATE, use the asFoodType (required), default to SEED if missing
      foodType = selection.asFoodType ?? "SEED";
    } else {
      // For other dice, the die face is the food type
      foodType = selection.die as FoodType;
    }
    food[foodType] = (food[foodType] ?? 0) + 1;
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

  const leftmostEmpty = player.board.getLeftmostEmptyColumn("FOREST");
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

    const availableDice = buildLimitedAvailableDice(currentBirdfeeder, 1);

    const foodPrompt: SelectFoodFromFeederPrompt = {
      promptId: ctx.generatePromptId(),
      playerId: ctx.playerId,
      kind: "selectFoodFromFeeder",
      view: ctx.buildPlayerView(),
      context: ctx.buildPromptContext(),
      availableDice,
    };

    const choice = yield* turnActionPrompt(ctx, foodPrompt);

    if (choice.diceOrReroll === "reroll") {
      // Check if reroll is allowed (all dice show same face)
      const uniqueFaces = new Set(currentBirdfeeder);
      if (uniqueFaces.size <= 1) {
        yield* turnActionEffect({
          type: "REROLL_BIRDFEEDER",
          playerId: ctx.playerId,
          previousDice: [...currentBirdfeeder],
          newDice: [], // Engine fills this
        });
      }
      i--; // Don't count reroll as food gained
      continue;
    }

    // Take food from feeder - process the die selections
    const selectedDice = choice.diceOrReroll;
    if (selectedDice.length > 0) {
      const selectedFood = convertDieSelectionsToFood(selectedDice);
      // Add to accumulated food
      for (const [ft, count] of Object.entries(selectedFood)) {
        if (count && count > 0) {
          gainedFood[ft as FoodType] = (gainedFood[ft as FoodType] ?? 0) + count;
        }
      }
      // Yield GAIN_FOOD effect with diceTaken so engine removes the correct die
      yield* turnActionEffect({
        type: "GAIN_FOOD",
        playerId: ctx.playerId,
        food: selectedFood,
        source: "BIRDFEEDER",
        diceTaken: selectedDice,
      });
    }
  }

  // Get birds with brown powers in forest for activation
  const updatedPlayer = ctx.getState().players.find((p) => p.id === ctx.playerId)!;
  const forestBirds = updatedPlayer.board.getBirdsWithBrownPowers("FOREST");

  yield* event({
    type: "HABITAT_ACTIVATED",
    playerId: ctx.playerId,
    habitat: "FOREST",
    birdInstanceIds: forestBirds,
  });

  // Yield food gained event for pink power triggers
  yield* event({
    type: "FOOD_GAINED_FROM_HABITAT_ACTIVATION",
    playerId: ctx.playerId,
    food: gainedFood,
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

  const leftmostEmpty = player.board.getLeftmostEmptyColumn("GRASSLAND");
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
  const capacities = player.board.getRemainingEggCapacities();

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
  const grasslandBirds = updatedPlayer.board.getBirdsWithBrownPowers("GRASSLAND");

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

  const leftmostEmpty = player.board.getLeftmostEmptyColumn("WETLAND");
  let cardsToDraw = board.wetland.baseRewards[leftmostEmpty];
  const bonus = board.wetland.bonusRewards[leftmostEmpty];

  // Handle bonus cost: discard 1 egg to draw 1 extra card
  let bonusApplied = false;
  if (params.takeBonus && bonus) {
    // Get eggs on birds
    const eggsOnBirds = player.board.getEggsOnBirds();
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
  const wetlandBirds = updatedPlayer.board.getBirdsWithBrownPowers("WETLAND");

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
  const eligibleBirds = player.getEligibleBirdsToPlay();

  if (eligibleBirds.length === 0) {
    return; // No birds can be played
  }

  // Calculate egg costs for each habitat
  const eggCostByHabitat: Partial<Record<Habitat, number>> = {};
  for (const habitat of HABITATS) {
    const leftmostEmpty = player.board.getLeftmostEmptyColumn(habitat);
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
  const column = player.board.getLeftmostEmptyColumn(habitat);

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

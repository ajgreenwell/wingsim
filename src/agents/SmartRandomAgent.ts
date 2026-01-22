import type {
  PlayerId,
  BirdCardId,
  BirdCard,
  BirdInstance,
  BirdInstanceId,
  FoodType,
  FoodByType,
  Habitat,
  EggsByBird,
} from "../types/core.js";
import type {
  StartingHandPrompt,
  StartingHandChoice,
  TurnActionPrompt,
  TurnActionChoice,
  OptionPrompt,
  OptionChoice,
  ActivatePowerPrompt,
  ActivatePowerChoice,
  SelectFoodFromFeederPrompt,
  SelectFoodFromFeederChoice,
  SelectFoodFromSupplyPrompt,
  SelectFoodFromSupplyChoice,
  SelectFoodDestinationPrompt,
  SelectFoodDestinationChoice,
  DiscardEggsPrompt,
  DiscardEggsChoice,
  PlaceEggsPrompt,
  PlaceEggsChoice,
  SelectCardsPrompt,
  SelectCardsChoice,
  DrawCardsPrompt,
  DrawCardsChoice,
  SelectBonusCardsPrompt,
  SelectBonusCardsChoice,
  SelectPlayerPrompt,
  SelectPlayerChoice,
  RepeatPowerPrompt,
  RepeatPowerChoice,
  PlayBirdPrompt,
  PlayBirdChoice,
  DiscardFoodPrompt,
  DiscardFoodChoice,
  SelectHabitatPrompt,
  SelectHabitatChoice,
} from "../types/prompts.js";
import type { PlayerAgent } from "./PlayerAgent.js";
import { Rng } from "../util/Rng.js";
import { AgentRegistry } from "./AgentRegistry.js";

/**
 * A constraint-aware agent that makes valid random choices for all prompt types.
 * Unlike a naive random agent, it reads prompt constraints and ensures all choices
 * satisfy validation rules.
 *
 * Each SmartRandomAgent instance has its own seeded RNG for reproducible behavior
 * independent of the game's RNG.
 */
export class SmartRandomAgent implements PlayerAgent {
  readonly playerId: PlayerId;
  private readonly rng: Rng;

  constructor(playerId: PlayerId, seed: number) {
    this.playerId = playerId;
    this.rng = new Rng(seed);
  }

  async chooseStartingHand(
    prompt: StartingHandPrompt
  ): Promise<StartingHandChoice> {
    // Randomly keep 0-5 birds (clamped by available birds)
    const maxBirds = Math.min(prompt.eligibleBirds.length, 5);
    const possibleCounts = Array.from({ length: maxBirds + 1 }, (_, i) => i);
    const numBirdsToKeep = this.rng.pickMany(possibleCounts, 1)[0];
    const birdsToKeep = this.rng.pickMany(prompt.eligibleBirds, numBirdsToKeep);
    const birdIds = new Set<BirdCardId>(birdsToKeep.map((b) => b.id));

    // Pick 1 bonus card
    const bonusCards = this.rng.pickMany(prompt.eligibleBonusCards, 1);
    const bonusCardId = bonusCards[0].id;

    // Discard food matching the number of kept birds
    // Prioritize discarding food NOT needed by kept birds
    const neededFood = this.calculateNeededFood(birdsToKeep);
    const foodToDiscard = this.selectFoodToDiscard(
      prompt.view.food,
      neededFood,
      numBirdsToKeep
    );

    return {
      promptId: prompt.promptId,
      kind: "startingHand",
      birds: birdIds,
      bonusCard: bonusCardId,
      foodToDiscard,
    };
  }

  /**
   * Calculates the food types needed to play the given birds.
   * For OR mode birds, includes all possible food types.
   * For AND mode birds, includes all required food types (including WILD as any type).
   */
  private calculateNeededFood(birds: BirdCard[]): Set<FoodType> {
    const neededFood = new Set<FoodType>();
    const allFoodTypes: FoodType[] = [
      "INVERTEBRATE",
      "SEED",
      "FISH",
      "FRUIT",
      "RODENT",
    ];

    for (const bird of birds) {
      if (bird.foodCostMode === "NONE") {
        continue;
      }

      for (const [foodType, count] of Object.entries(bird.foodCost)) {
        if (count && count > 0) {
          if (foodType === "WILD") {
            // WILD can be satisfied by any food, so all types are "needed"
            for (const ft of allFoodTypes) {
              neededFood.add(ft);
            }
          } else {
            neededFood.add(foodType as FoodType);
          }
        }
      }
    }

    return neededFood;
  }

  /**
   * Selects food to discard, prioritizing food that isn't needed by kept birds.
   */
  private selectFoodToDiscard(
    playerFood: FoodByType,
    neededFood: Set<FoodType>,
    discardCount: number
  ): Set<FoodType> {
    const unneededFood: FoodType[] = [];
    const neededFoodList: FoodType[] = [];

    // Split available food into needed and unneeded
    for (const [foodType, count] of Object.entries(playerFood)) {
      if (count && count > 0) {
        const ft = foodType as FoodType;
        if (neededFood.has(ft)) {
          for (let i = 0; i < count; i++) {
            neededFoodList.push(ft);
          }
        } else {
          for (let i = 0; i < count; i++) {
            unneededFood.push(ft);
          }
        }
      }
    }

    // Shuffle both lists
    const shuffledUnneeded = this.rng.shuffle(unneededFood);
    const shuffledNeeded = this.rng.shuffle(neededFoodList);

    // Prefer discarding unneeded food first
    const toDiscard: FoodType[] = [];
    let remaining = discardCount;

    // Take from unneeded first
    for (const food of shuffledUnneeded) {
      if (remaining <= 0) break;
      toDiscard.push(food);
      remaining--;
    }

    // If still need more, take from needed
    for (const food of shuffledNeeded) {
      if (remaining <= 0) break;
      toDiscard.push(food);
      remaining--;
    }

    return new Set(toDiscard);
  }

  async chooseTurnAction(prompt: TurnActionPrompt): Promise<TurnActionChoice> {
    // Task 5: Full implementation
    // Pick random action from eligible actions
    const actions = prompt.eligibleActions;
    const action = this.rng.pickMany(actions, 1)[0];

    // Check if bonus is available for this action
    const reward = prompt.rewardsByAction[action];
    const hasBonus = reward?.bonus !== undefined;

    // Randomly decide whether to take bonus if available
    const takeBonus = hasBonus && this.rng.pickMany([true, false], 1)[0];

    return {
      promptId: prompt.promptId,
      kind: "turnAction",
      action,
      takeBonus,
    };
  }

  async chooseOption(prompt: OptionPrompt): Promise<OptionChoice> {
    switch (prompt.kind) {
      case "activatePower":
        return this.handleActivatePower(prompt);
      case "selectFoodFromFeeder":
        return this.handleSelectFoodFromFeeder(prompt);
      case "selectFoodFromSupply":
        return this.handleSelectFoodFromSupply(prompt);
      case "selectFoodDestination":
        return this.handleSelectFoodDestination(prompt);
      case "discardEggs":
        return this.handleDiscardEggs(prompt);
      case "placeEggs":
        return this.handlePlaceEggs(prompt);
      case "selectCards":
        return this.handleSelectCards(prompt);
      case "drawCards":
        return this.handleDrawCards(prompt);
      case "selectBonusCards":
        return this.handleSelectBonusCards(prompt);
      case "selectPlayer":
        return this.handleSelectPlayer(prompt);
      case "repeatPower":
        return this.handleRepeatPower(prompt);
      case "playBird":
        return this.handlePlayBird(prompt);
      case "discardFood":
        return this.handleDiscardFood(prompt);
      case "selectHabitat":
        return this.handleSelectHabitat(prompt);
      default:
        throw new Error(`Unknown prompt kind: ${(prompt as OptionPrompt).kind}`);
    }
  }

  // Simple prompt handlers (Task 3)

  private handleActivatePower(
    prompt: ActivatePowerPrompt
  ): ActivatePowerChoice {
    // Always activate powers
    return {
      promptId: prompt.promptId,
      kind: "activatePower",
      activate: true,
    };
  }

  private handleSelectFoodDestination(
    prompt: SelectFoodDestinationPrompt
  ): SelectFoodDestinationChoice {
    // Random from destinationOptions
    const destination = this.rng.pickMany(prompt.destinationOptions, 1)[0];
    return {
      promptId: prompt.promptId,
      kind: "selectFoodDestination",
      destination,
    };
  }

  private handleSelectPlayer(prompt: SelectPlayerPrompt): SelectPlayerChoice {
    // Random from eligiblePlayers
    const player = this.rng.pickMany(prompt.eligiblePlayers, 1)[0];
    return {
      promptId: prompt.promptId,
      kind: "selectPlayer",
      player,
    };
  }

  private handleSelectHabitat(
    prompt: SelectHabitatPrompt
  ): SelectHabitatChoice {
    // Random from eligibleHabitats
    const habitat = this.rng.pickMany(prompt.eligibleHabitats, 1)[0];
    return {
      promptId: prompt.promptId,
      kind: "selectHabitat",
      habitat,
    };
  }

  private handleRepeatPower(prompt: RepeatPowerPrompt): RepeatPowerChoice {
    // Random from eligibleBirds
    const bird = this.rng.pickMany(prompt.eligibleBirds, 1)[0];
    return {
      promptId: prompt.promptId,
      kind: "repeatPower",
      bird,
    };
  }

  private handleSelectBonusCards(
    prompt: SelectBonusCardsPrompt
  ): SelectBonusCardsChoice {
    // Pick count random cards from eligibleCards
    const cards = this.rng.pickMany(prompt.eligibleCards, prompt.count);
    return {
      promptId: prompt.promptId,
      kind: "selectBonusCards",
      cards: cards.map((c) => c.id),
    };
  }

  private handleSelectCards(prompt: SelectCardsPrompt): SelectCardsChoice {
    // Pick count random cards from eligibleCards
    const cards = this.rng.pickMany(prompt.eligibleCards, prompt.count);
    return {
      promptId: prompt.promptId,
      kind: "selectCards",
      cards: cards.map((c) => c.id),
    };
  }

  // Food & Egg prompt handlers (Task 4 - stubs for now)

  private handleSelectFoodFromFeeder(
    prompt: SelectFoodFromFeederPrompt
  ): SelectFoodFromFeederChoice {
    // Task 4: Full implementation with SEED_INVERTEBRATE handling
    // For now, pick a random available die or reroll if all same
    const availableDice = Object.entries(prompt.availableDice)
      .filter(([_, count]) => count && count > 0)
      .flatMap(([die, count]) => Array(count!).fill(die));

    if (availableDice.length === 0) {
      return {
        promptId: prompt.promptId,
        kind: "selectFoodFromFeeder",
        diceOrReroll: "reroll",
      };
    }

    // Check if all dice show the same face (trigger reroll option)
    const uniqueFaces = new Set(availableDice);
    if (uniqueFaces.size === 1) {
      // Randomly decide to reroll or take
      if (this.rng.pickMany([true, false], 1)[0]) {
        return {
          promptId: prompt.promptId,
          kind: "selectFoodFromFeeder",
          diceOrReroll: "reroll",
        };
      }
    }

    // Pick one die
    const selectedDie = this.rng.pickMany(availableDice, 1)[0];
    const dieSelection: { die: typeof selectedDie; asFoodType?: "SEED" | "INVERTEBRATE" } = {
      die: selectedDie,
    };

    // Handle SEED_INVERTEBRATE
    if (selectedDie === "SEED_INVERTEBRATE") {
      dieSelection.asFoodType = this.rng.pickMany(
        ["SEED", "INVERTEBRATE"] as const,
        1
      )[0];
    }

    return {
      promptId: prompt.promptId,
      kind: "selectFoodFromFeeder",
      diceOrReroll: [dieSelection],
    };
  }

  private handleSelectFoodFromSupply(
    prompt: SelectFoodFromSupplyPrompt
  ): SelectFoodFromSupplyChoice {
    // Task 4: Full implementation with bird preference
    // For now, pick count random food from allowed foods
    const selectedFood = this.rng.pickManyWithReplacement(
      prompt.allowedFoods,
      prompt.count
    );
    const food: Record<string, number> = {};
    for (const f of selectedFood) {
      food[f] = (food[f] || 0) + 1;
    }
    return {
      promptId: prompt.promptId,
      kind: "selectFoodFromSupply",
      food,
    };
  }

  private handleDiscardEggs(prompt: DiscardEggsPrompt): DiscardEggsChoice {
    // Task 4: Distribute count discards across eligible birds
    const sources: Record<string, number> = {};
    let remaining = prompt.count;

    // Flatten eligible birds with their egg counts
    const birdsWithEggs = Object.entries(prompt.eggsByEligibleBird)
      .filter(([_, eggs]) => eggs && eggs > 0)
      .map(([birdId, eggs]) => ({ birdId, eggs: eggs! }));

    // Shuffle and distribute
    const shuffled = this.rng.shuffle(birdsWithEggs);
    for (const { birdId, eggs } of shuffled) {
      if (remaining <= 0) break;
      const toDiscard = Math.min(remaining, eggs);
      sources[birdId] = toDiscard;
      remaining -= toDiscard;
    }

    return {
      promptId: prompt.promptId,
      kind: "discardEggs",
      sources,
    };
  }

  private handlePlaceEggs(prompt: PlaceEggsPrompt): PlaceEggsChoice {
    // Task 4: Distribute count placements respecting remaining capacities
    const placements: Record<string, number> = {};
    let remaining = prompt.count;

    // Flatten eligible birds with their remaining capacities
    const birdsWithCapacity = Object.entries(
      prompt.remainingCapacitiesByEligibleBird
    )
      .filter(([_, capacity]) => capacity && capacity > 0)
      .map(([birdId, capacity]) => ({ birdId, capacity: capacity! }));

    // Shuffle and distribute
    const shuffled = this.rng.shuffle(birdsWithCapacity);
    for (const { birdId, capacity } of shuffled) {
      if (remaining <= 0) break;
      const toPlace = Math.min(remaining, capacity);
      placements[birdId] = toPlace;
      remaining -= toPlace;
    }

    return {
      promptId: prompt.promptId,
      kind: "placeEggs",
      placements,
    };
  }

  // Card & Turn Action prompt handlers (Task 5 - stubs for now)

  private handleDrawCards(prompt: DrawCardsPrompt): DrawCardsChoice {
    // Task 5: Random mix of tray and deck cards up to remaining
    // For now, simple implementation
    const remaining = prompt.remaining;
    const traySize = prompt.trayCards.length;

    if (traySize === 0) {
      // Must draw from deck
      return {
        promptId: prompt.promptId,
        kind: "drawCards",
        trayCards: [],
        numDeckCards: remaining,
      };
    }

    // Randomly decide how many to draw from tray (0 to min(remaining, traySize))
    const maxFromTray = Math.min(remaining, traySize);
    const numFromTray = this.rng.pickMany(
      Array.from({ length: maxFromTray + 1 }, (_, i) => i),
      1
    )[0];

    const trayCards = this.rng.pickMany(prompt.trayCards, numFromTray);
    const numDeckCards = remaining - numFromTray;

    return {
      promptId: prompt.promptId,
      kind: "drawCards",
      trayCards: trayCards.map((c) => c.id),
      numDeckCards,
    };
  }

  // Complex prompt handlers (Task 6)

  private handlePlayBird(prompt: PlayBirdPrompt): PlayBirdChoice {
    const bird = this.rng.pickMany(prompt.eligibleBirds, 1)[0];

    // Get eligible habitats for this bird (intersection of bird's habitats and prompt's eligible habitats)
    const eligibleHabitats = bird.habitats.filter(
      (h) => prompt.eggCostByEligibleHabitat[h] !== undefined
    );
    const habitat = this.rng.pickMany(eligibleHabitats, 1)[0];

    // Generate food payment using helper
    const foodToSpend = this.generateFoodPayment(bird, prompt.view.food);

    // Generate egg payment using helper
    const eggCost = prompt.eggCostByEligibleHabitat[habitat] || 0;
    const eggsToSpend = this.generateEggPayment(eggCost, prompt.view.board);

    return {
      promptId: prompt.promptId,
      kind: "playBird",
      bird: bird.id,
      habitat,
      foodToSpend,
      eggsToSpend,
    };
  }

  /**
   * Generates a valid food payment for a bird's food cost.
   * Handles AND mode (pay all foods, resolve WILD to actual types),
   * OR mode (pick one food type from options), and NONE mode (no cost).
   */
  private generateFoodPayment(
    bird: BirdCard,
    playerFood: FoodByType
  ): FoodByType {
    if (bird.foodCostMode === "NONE") {
      return {};
    }

    const foodToSpend: FoodByType = {};

    if (bird.foodCostMode === "OR") {
      // OR mode: pick one random food type from options the player can actually afford
      const foodOptions = Object.entries(bird.foodCost)
        .filter(([foodType, count]) => {
          if (!count || count <= 0) return false;
          // Only include options the player can afford
          const available = playerFood[foodType as FoodType] ?? 0;
          return available >= count;
        })
        .map(([foodType]) => foodType as FoodType);

      if (foodOptions.length > 0) {
        const chosenFood = this.rng.pickMany(foodOptions, 1)[0];
        foodToSpend[chosenFood] = bird.foodCost[chosenFood]!;
      }
    } else {
      // AND mode: pay all specific foods, resolve WILD to actual food types
      // Build pool of available food for WILD costs (after paying specific costs)
      const availableForWild: FoodType[] = [];
      const usedFood: FoodByType = {};

      // First, handle specific food types (non-WILD)
      for (const [foodType, count] of Object.entries(bird.foodCost)) {
        if (foodType !== "WILD" && count && count > 0) {
          foodToSpend[foodType as FoodType] = count;
          usedFood[foodType as FoodType] = count;
        }
      }

      // Build available pool for WILD (player's food minus what we're already paying)
      for (const [foodType, count] of Object.entries(playerFood)) {
        if (count && count > 0) {
          const alreadyUsed = usedFood[foodType as FoodType] || 0;
          const remaining = count - alreadyUsed;
          for (let i = 0; i < remaining; i++) {
            availableForWild.push(foodType as FoodType);
          }
        }
      }

      // Resolve WILD costs to actual food types
      const wildCount = bird.foodCost.WILD || 0;
      if (wildCount > 0 && availableForWild.length > 0) {
        const shuffled = this.rng.shuffle(availableForWild);
        const wildFood = shuffled.slice(0, wildCount);
        for (const foodType of wildFood) {
          foodToSpend[foodType] = (foodToSpend[foodType] || 0) + 1;
        }
      }
    }

    return foodToSpend;
  }

  /**
   * Generates a valid egg payment from birds on the player's board.
   * Distributes eggs randomly across birds with eggs.
   */
  private generateEggPayment(
    eggCost: number,
    board: Record<Habitat, Array<BirdInstance | null>>
  ): EggsByBird {
    const eggsToSpend: EggsByBird = {};

    if (eggCost <= 0) {
      return eggsToSpend;
    }

    // Find birds with eggs from player's board
    const birdsWithEggs: Array<{ birdId: BirdInstanceId; eggs: number }> = [];
    for (const birds of Object.values(board)) {
      for (const birdInstance of birds) {
        if (birdInstance && birdInstance.eggs > 0) {
          birdsWithEggs.push({
            birdId: birdInstance.id,
            eggs: birdInstance.eggs,
          });
        }
      }
    }

    // Distribute egg cost across birds with eggs
    let remaining = eggCost;
    const shuffled = this.rng.shuffle(birdsWithEggs);
    for (const { birdId, eggs } of shuffled) {
      if (remaining <= 0) break;
      const toSpend = Math.min(remaining, eggs);
      eggsToSpend[birdId] = toSpend;
      remaining -= toSpend;
    }

    return eggsToSpend;
  }

  private handleDiscardFood(prompt: DiscardFoodPrompt): DiscardFoodChoice {
    // Handle WILD and specific food costs using player's available food
    const food: Record<string, number> = {};
    const playerFood = prompt.view.food;

    // Build pool of available food for WILD costs
    const availableForWild: string[] = [];
    for (const [foodType, count] of Object.entries(playerFood)) {
      if (count && count > 0) {
        for (let i = 0; i < count; i++) {
          availableForWild.push(foodType);
        }
      }
    }

    // First, handle specific food types (non-WILD)
    for (const [foodType, count] of Object.entries(prompt.foodCost)) {
      if (foodType !== "WILD" && count && count > 0) {
        food[foodType] = count;
        // Remove from available pool
        for (let i = 0; i < count; i++) {
          const idx = availableForWild.indexOf(foodType);
          if (idx !== -1) {
            availableForWild.splice(idx, 1);
          }
        }
      }
    }

    // Then, handle WILD costs by picking from remaining available food
    const wildCount = prompt.foodCost.WILD || 0;
    if (wildCount > 0) {
      const shuffled = this.rng.shuffle(availableForWild);
      const wildFood = shuffled.slice(0, wildCount);
      for (const foodType of wildFood) {
        food[foodType] = (food[foodType] || 0) + 1;
      }
    }

    return {
      promptId: prompt.promptId,
      kind: "discardFood",
      food,
    };
  }
}

// Register SmartRandomAgent in the agent registry
AgentRegistry.register(
  "SmartRandomAgent",
  "Constraint-aware random agent with seeded RNG",
  (playerId, seed) => new SmartRandomAgent(playerId, seed)
);

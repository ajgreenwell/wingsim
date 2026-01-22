import type { PlayerId, BirdCardId } from "../types/core.js";
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
    // Task 6: Full implementation with food prioritization
    // For now, simple random implementation
    const birdsToKeep = this.rng.pickMany(
      prompt.eligibleBirds,
      this.rng.pickMany([0, 1, 2, 3, 4, 5], 1)[0]
    );
    const birdIds = new Set<BirdCardId>(birdsToKeep.map((b) => b.id));

    const bonusCards = this.rng.pickMany(prompt.eligibleBonusCards, 1);
    const bonusCardId = bonusCards[0].id;

    // Discard food matching the number of kept birds
    const foodTypes = prompt.view.food;
    const availableFood = Object.entries(foodTypes)
      .filter(([_, count]) => count && count > 0)
      .flatMap(([type, count]) => Array(count).fill(type));
    const foodToDiscard = new Set(
      this.rng.pickMany(availableFood, birdIds.size)
    );

    return {
      promptId: prompt.promptId,
      kind: "startingHand",
      birds: birdIds,
      bonusCard: bonusCardId,
      foodToDiscard,
    };
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

  // Complex prompt handlers (Task 6 - stubs for now)

  private handlePlayBird(prompt: PlayBirdPrompt): PlayBirdChoice {
    // Task 6: Full implementation with food/egg payment generation
    // For now, pick random bird and habitat, generate simple payment
    const bird = this.rng.pickMany(prompt.eligibleBirds, 1)[0];

    // Get eligible habitats for this bird (intersection of bird's habitats and prompt's eligible habitats)
    const eligibleHabitats = bird.habitats.filter(
      (h) => prompt.eggCostByEligibleHabitat[h] !== undefined
    );
    const habitat = this.rng.pickMany(eligibleHabitats, 1)[0];

    // Generate food payment matching bird's food cost
    const foodToSpend: Record<string, number> = {};
    if (bird.foodCostMode !== "NONE") {
      for (const [foodType, count] of Object.entries(bird.foodCost)) {
        if (count && count > 0) {
          foodToSpend[foodType] = count;
        }
      }
    }

    // Generate egg payment for habitat's egg cost
    const eggCost = prompt.eggCostByEligibleHabitat[habitat] || 0;
    const eggsToSpend: Record<string, number> = {};

    if (eggCost > 0) {
      // Find birds with eggs from player's board
      const birdsWithEggs: Array<{ birdId: string; eggs: number }> = [];
      for (const birds of Object.values(prompt.view.board)) {
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
    }

    return {
      promptId: prompt.promptId,
      kind: "playBird",
      bird: bird.id,
      habitat,
      foodToSpend,
      eggsToSpend,
    };
  }

  private handleDiscardFood(prompt: DiscardFoodPrompt): DiscardFoodChoice {
    // Task 4: Match foodCost exactly using available food
    // For now, just return the exact food cost (assuming player has it)
    const food: Record<string, number> = {};
    for (const [foodType, count] of Object.entries(prompt.foodCost)) {
      if (count && count > 0) {
        food[foodType] = count;
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

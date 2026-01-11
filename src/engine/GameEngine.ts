import { Rng } from "../util/Rng.js";
import { DataRegistry } from "../data/DataRegistry.js";
import { Birdfeeder } from "./Birdfeeder.js";
import { BirdCardSupply } from "./BirdCardSupply.js";
import { DiscardableDeck } from "./DiscardableDeck.js";
import {
  ActionProcessor,
  type TurnActionContext,
  type TurnActionExecutionContext,
} from "./ActionProcessor.js";
import { buildPlayerView } from "./ViewBuilder.js";
import type { PlayerAgent } from "../agents/PlayerAgent.js";
import type {
  BirdCard,
  BirdInstance,
  BonusCard,
  DieFace,
  FoodByType,
  FoodType,
  Habitat,
  PlayerId,
  PlayerState,
  RoundGoalId,
} from "../types/core.js";
import type {
  Event,
  HabitatActivatedEvent,
  PinkPowerTriggerEvent,
} from "../types/events.js";
import type { Effect } from "../types/effects.js";
import type {
  ActionExecutionContext,
  PowerYield,
  PowerReceive,
} from "../types/power.js";
import type {
  PromptContext,
  PromptId,
  RewardsByAction,
  StartingHandPrompt,
  TurnActionPrompt,
  Resource,
} from "../types/prompts.js";

const HABITATS: Habitat[] = ["FOREST", "GRASSLAND", "WETLAND"];
const HABITAT_SIZE = 5;
const INITIAL_BIRDS_DEALT = 5;
const INITIAL_BONUS_CARDS_DEALT = 2;
const INITIAL_TURNS_PER_ROUND = 8;
const ROUND_GOALS_COUNT = 4;
const TOTAL_ROUNDS = 4;
const TURNS_BY_ROUND = [8, 7, 6, 5];

/**
 * Result of a completed game.
 */
export interface GameResult {
  winnerId: PlayerId;
  scores: Record<PlayerId, number>;
  roundsPlayed: number;
  totalTurns: number;
}

/**
 * The complete game state for a Wingspan match.
 * This is the authoritative state owned by the GameEngine.
 */
export interface GameState {
  players: PlayerState[];
  activePlayerIndex: number;
  birdfeeder: Birdfeeder;
  birdCardSupply: BirdCardSupply;
  bonusCardDeck: DiscardableDeck<BonusCard>;
  roundGoals: RoundGoalId[];
  round: number;
  turn: number;

  /**
   * Deferred continuations to execute at end of current turn.
   * Cleared after resolution.
   */
  endOfTurnContinuations: DeferredContinuationEntry[];
}

/**
 * Entry in the end-of-turn continuation queue.
 */
export interface DeferredContinuationEntry {
  playerId: PlayerId;
  continuation: () => Generator<PowerYield, void, PowerReceive>;
}

/**
 * Configuration for creating a GameEngine instance.
 */
export interface GameEngineConfig {
  agents: PlayerAgent[];
  seed: number;
  registry: DataRegistry;
}

/**
 * The GameEngine is the authoritative owner of the game state.
 * It implements base-game rules, validates actions, and applies effects.
 */
export class GameEngine {
  private readonly agents: PlayerAgent[];
  private readonly registry: DataRegistry;
  private readonly rng: Rng;
  private readonly seed: number;
  private readonly actionProcessor: ActionProcessor;
  private gameState: GameState;
  private promptCounter = 0;

  /**
   * History of all events that have occurred during the game.
   * Used for observability, debugging, and testing.
   */
  private readonly eventHistory: Event[] = [];

  constructor(config: GameEngineConfig) {
    this.agents = config.agents;
    this.registry = config.registry;
    this.seed = config.seed;
    this.rng = new Rng(config.seed);
    this.actionProcessor = new ActionProcessor();
    this.gameState = this.setupGame();
  }

  getGameState(): GameState {
    return this.gameState;
  }

  /**
   * Get the history of all events that have occurred during the game.
   * Useful for debugging, testing, and observability.
   */
  getEventHistory(): readonly Event[] {
    return this.eventHistory;
  }

  /**
   * Creates and returns the initial game state.
   * This sets up all components needed to start a game:
   * - Shuffled bird and bonus card decks
   * - Random round goals
   * - Initial player states with dealt cards and starting resources
   * - Birdfeeder with rolled dice
   * - Filled bird tray
   */
  setupGame(): GameState {
    // Create birdfeeder (automatically rolls 5 dice)
    const birdfeeder = new Birdfeeder(this.rng);

    // Create bird card supply with shuffled deck
    const birdCardSupply = new BirdCardSupply(
      this.registry.getAllBirds(),
      this.rng
    );

    // Create bonus card deck
    const bonusCardDeck = new DiscardableDeck<BonusCard>(
      this.registry.getAllBonusCards(),
      this.rng
    );

    // Select 4 random round goals
    const roundGoals = this.rng.pickMany(
      this.registry.getAllRoundGoalIds(),
      ROUND_GOALS_COUNT
    );

    // Create initial player states
    const players: PlayerState[] = this.agents.map((agent) => {
      // Deal initial bird cards
      const hand = birdCardSupply.drawFromDeck(INITIAL_BIRDS_DEALT);

      // Deal initial bonus cards
      const bonusCards = bonusCardDeck.draw(INITIAL_BONUS_CARDS_DEALT);

      // Initialize starting food (1 of each non-WILD type)
      const food: FoodByType = {
        INVERTEBRATE: 1,
        SEED: 1,
        FISH: 1,
        FRUIT: 1,
        RODENT: 1,
      };

      // Initialize empty board
      const board: Record<Habitat, Array<null>> = {
        FOREST: Array(HABITAT_SIZE).fill(null),
        GRASSLAND: Array(HABITAT_SIZE).fill(null),
        WETLAND: Array(HABITAT_SIZE).fill(null),
      };

      return {
        id: agent.playerId,
        board,
        hand,
        bonusCards,
        food,
        turnsRemaining: INITIAL_TURNS_PER_ROUND,
      };
    });

    // Fill the bird tray AFTER dealing starting hands to all players
    birdCardSupply.refillTray();

    return {
      players,
      activePlayerIndex: 0,
      birdfeeder,
      birdCardSupply,
      bonusCardDeck,
      roundGoals,
      round: 1,
      turn: 1,
      endOfTurnContinuations: [],
    };
  }

  /**
   * Run a complete game from start to finish.
   */
  async playGame(): Promise<GameResult> {
    // 1. Starting hand selection (simultaneous)
    await this.handleStartingHandSelection();

    // 2. Emit GameStartedEvent
    await this.processEvent({
      type: "GAME_STARTED",
      playerIds: this.gameState.players.map((p) => p.id),
      seed: this.seed,
    });

    // 3. Run 4 rounds
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      await this.runRound(round);
    }

    // 4. Calculate final scores
    const scores = this.calculateFinalScores();
    const winnerId = this.determineWinner(scores);

    // 5. Emit GameEndedEvent
    await this.processEvent({ type: "GAME_ENDED", finalScores: scores, winnerId });

    return {
      winnerId,
      scores,
      roundsPlayed: TOTAL_ROUNDS,
      totalTurns: this.gameState.turn - 1,
    };
  }

  /**
   * Handle simultaneous starting hand selection for all players.
   */
  private async handleStartingHandSelection(): Promise<void> {
    // Build prompts for all players
    const prompts: StartingHandPrompt[] = this.gameState.players.map(
      (player) => {
        const view = buildPlayerView(this.gameState, player.id);
        const context = this.createPromptContext();

        return {
          promptId: this.generatePromptId(),
          playerId: player.id,
          kind: "startingHand" as const,
          view,
          context,
          eligibleBirds: player.hand,
          eligibleBonusCards: player.bonusCards,
        };
      }
    );

    // Get choices simultaneously from all agents
    const choices = await Promise.all(
      this.agents.map((agent, index) =>
        agent.chooseStartingHand(prompts[index])
      )
    );

    // Process each player's choice
    for (let i = 0; i < this.gameState.players.length; i++) {
      const player = this.gameState.players[i];
      const choice = choices[i];

      // Keep selected birds, discard rest to supply
      const keptBirds: BirdCard[] = [];
      const discardedBirds: BirdCard[] = [];
      for (const card of player.hand) {
        if (choice.birds.has(card.id)) {
          keptBirds.push(card);
        } else {
          discardedBirds.push(card);
        }
      }
      player.hand = keptBirds;
      this.gameState.birdCardSupply.discardCards(discardedBirds);

      // Keep chosen bonus card, discard others
      const keptBonusCards: BonusCard[] = [];
      const discardedBonusCards: BonusCard[] = [];
      for (const card of player.bonusCards) {
        if (card.id === choice.bonusCard) {
          keptBonusCards.push(card);
        } else {
          discardedBonusCards.push(card);
        }
      }
      player.bonusCards = keptBonusCards;
      this.gameState.bonusCardDeck.discardItems(discardedBonusCards);

      // Discard food equal to birds kept
      for (const foodType of choice.foodToDiscard) {
        const current = player.food[foodType] ?? 0;
        if (current > 0) {
          player.food[foodType] = current - 1;
        }
      }
    }
  }

  /**
   * Run a single round of the game.
   */
  private async runRound(round: number): Promise<void> {
    this.gameState.round = round;

    // Set turns remaining for all players based on round
    const turnsThisRound = TURNS_BY_ROUND[round - 1];
    for (const player of this.gameState.players) {
      player.turnsRemaining = turnsThisRound;
    }

    await this.processEvent({ type: "ROUND_STARTED", round });

    // Round-robin turns until all players exhausted
    let currentPlayerIndex = 0;
    while (this.anyPlayerHasTurns()) {
      // Find next player with turns remaining
      let attempts = 0;
      while (
        this.gameState.players[currentPlayerIndex].turnsRemaining === 0 &&
        attempts < this.gameState.players.length
      ) {
        currentPlayerIndex =
          (currentPlayerIndex + 1) % this.gameState.players.length;
        attempts++;
      }

      if (this.gameState.players[currentPlayerIndex].turnsRemaining > 0) {
        await this.runTurn(currentPlayerIndex);
        currentPlayerIndex =
          (currentPlayerIndex + 1) % this.gameState.players.length;
      }
    }

    await this.processEvent({ type: "ROUND_ENDED", round });
  }

  /**
   * Run a single turn for a player.
   */
  private async runTurn(playerIndex: number): Promise<void> {
    this.gameState.activePlayerIndex = playerIndex;
    const player = this.gameState.players[playerIndex];
    const agent = this.agents[playerIndex];

    await this.processEvent({
      type: "TURN_STARTED",
      playerId: player.id,
      round: this.gameState.round,
      turnNumber: this.gameState.turn,
    });

    // Build turn action prompt
    const view = buildPlayerView(this.gameState, player.id);
    const rewardsByAction = this.buildRewardsByAction(player);

    const prompt: TurnActionPrompt = {
      promptId: this.generatePromptId(),
      playerId: player.id,
      kind: "turnAction",
      view,
      context: this.createPromptContext(),
      rewardsByAction,
    };

    const choice = await agent.chooseTurnAction(prompt);

    // Build context for turn action processor (simplified - no mutable objects)
    const ctx: TurnActionContext = {
      playerId: player.id,
      round: this.gameState.round,
    };

    // Build execution context for running the generator
    const execCtx: TurnActionExecutionContext = {
      getState: () => this.gameState,
      getRegistry: () => this.registry,
      getAgent: (playerId: PlayerId) => this.getAgentForPlayer(playerId),
      generatePromptId: () => this.generatePromptId(),
      buildPlayerView: (playerId: PlayerId) => buildPlayerView(this.gameState, playerId),
      buildPromptContext: () => this.createPromptContext(),
      applyEffect: (effect: Effect) => this.applyEffect(effect),
      deferContinuation: (playerId: PlayerId, continuation) => {
        this.gameState.endOfTurnContinuations.push({ playerId, continuation });
      },
    };

    // Execute the chosen action (effects applied immediately, events collected)
    const result = await this.actionProcessor.executeTurnAction(
      choice.action,
      ctx,
      choice.takeBonus,
      execCtx
    );

    // Process events from the turn action (handles brown powers, pink powers, etc.)
    for (const event of result.events) {
      await this.processEvent(event);
    }

    // Resolve end-of-turn continuations (e.g., delayed discards)
    await this.resolveEndOfTurnContinuations(player.id);

    // Decrement turns and increment global turn counter
    player.turnsRemaining--;
    this.gameState.turn++;

    await this.processEvent({ type: "TURN_ENDED", playerId: player.id });
  }

  /**
   * Resolve deferred continuations for a player at end of their turn.
   * Continuations can yield effects and prompts just like power handlers.
   */
  private async resolveEndOfTurnContinuations(playerId: PlayerId): Promise<void> {
    // Get continuations for this player
    const playerConts = this.gameState.endOfTurnContinuations.filter(
      (c) => c.playerId === playerId
    );

    // Clear them from state
    this.gameState.endOfTurnContinuations =
      this.gameState.endOfTurnContinuations.filter((c) => c.playerId !== playerId);

    // Execute each continuation using ActionProcessor
    const execCtx = this.createActionExecutionContext();
    for (const { continuation } of playerConts) {
      await this.actionProcessor.executeContinuation(continuation, playerId, execCtx);
    }
  }

  /**
   * Process an event: record it to history and handle it immediately.
   */
  private async processEvent(event: Event): Promise<void> {
    this.eventHistory.push(event);

    // TODO: Notify observers of event

    if (event.type === "HABITAT_ACTIVATED") {
      // GameEngine owns the brown power loop for proper pink power interleaving
      await this.processBrownPowerChain(event as HabitatActivatedEvent);
    } else if (this.isPinkPowerTriggerEvent(event)) {
      // Find and execute pink powers that trigger on this event
      await this.processPinkPowerTriggers(event as PinkPowerTriggerEvent);
    }
  }

  /**
   * Process brown powers for a habitat activation.
   * Iterates through birds right-to-left, processing pink triggers between each.
   */
  private async processBrownPowerChain(
    event: HabitatActivatedEvent
  ): Promise<void> {
    const execCtx = this.createActionExecutionContext();

    // Process each bird's brown power in order (right-to-left, already ordered in event)
    for (const birdInstanceId of event.birdInstanceIds) {
      // Execute this bird's brown power (effects are applied immediately within)
      const result = await this.actionProcessor.executeSinglePower(
        birdInstanceId,
        event.playerId,
        execCtx
      );

      // Process events yielded by the power handler (e.g., PREDATOR_POWER_RESOLVED)
      // These can trigger pink powers on other players' boards
      for (const evt of result.events) {
        await this.processEvent(evt);
      }
    }
  }

  /**
   * Process pink powers that trigger on an event.
   * Finds all pink powers on non-active players' boards and executes them in clockwise order.
   */
  private async processPinkPowerTriggers(
    event: PinkPowerTriggerEvent
  ): Promise<void> {
    const execCtx = this.createActionExecutionContext();

    // Find all pink powers that trigger on this event
    const triggers = this.actionProcessor.findTriggeredPinkPowers(
      event,
      this.gameState,
      execCtx
    );

    // Execute each pink power (effects are applied immediately within via execCtx.applyEffect())
    for (const trigger of triggers) {
      await this.actionProcessor.executeSinglePower(
        trigger.birdInstanceId,
        trigger.ownerId,
        execCtx
      );
      // Pink power effects don't generate further events (no cascading)
    }
  }

  /**
   * Check if an event is a pink power trigger event.
   */
  private isPinkPowerTriggerEvent(
    event: Event
  ): event is PinkPowerTriggerEvent {
    return (
      event.type === "FOOD_GAINED_FROM_HABITAT_ACTIVATION" ||
      event.type === "EGGS_LAID_FROM_HABITAT_ACTIVATION" ||
      event.type === "PREDATOR_POWER_RESOLVED" ||
      event.type === "BIRD_PLAYED"
    );
  }

  /**
   * Create the execution context for ActionProcessor.
   */
  private createActionExecutionContext(): ActionExecutionContext {
    return {
      getState: () => this.gameState,
      getRegistry: () => this.registry,
      generatePromptId: () => this.generatePromptId(),
      getAgent: (playerId: PlayerId) => this.getAgentForPlayer(playerId),
      buildPlayerView: (playerId: PlayerId) =>
        buildPlayerView(this.gameState, playerId),
      buildPromptContext: (trigger?) => ({
        round: this.gameState.round,
        activePlayerId:
          this.gameState.players[this.gameState.activePlayerIndex].id,
        trigger: trigger ?? { type: "WHEN_ACTIVATED", habitat: "FOREST", sourceBirdId: "" },
      }),
      applyEffect: (effect: Effect) => this.applyEffect(effect),
      deferContinuation: (playerId: PlayerId, continuation: () => Generator<PowerYield, void, PowerReceive>) => {
        this.gameState.endOfTurnContinuations.push({ playerId, continuation });
      },
    };
  }

  /**
   * Get the agent for a specific player.
   */
  private getAgentForPlayer(playerId: PlayerId): PlayerAgent {
    const index = this.gameState.players.findIndex((p) => p.id === playerId);
    if (index === -1) {
      throw new Error(`No agent found for player: ${playerId}`);
    }
    return this.agents[index];
  }

  /**
   * Apply an effect to the game state.
   * This is the ONLY method that mutates GameState.
   */
  private applyEffect(effect: Effect): void {
    // TODO: Notify observers of effect application

    switch (effect.type) {
      case "ACTIVATE_POWER":
        // Tracking effect - no state mutation needed
        break;

      case "GAIN_FOOD":
        this.applyGainFood(effect);
        break;

      case "LAY_EGGS":
        this.applyLayEggs(effect);
        break;

      case "DRAW_CARDS":
        this.applyDrawCards(effect);
        break;

      case "DISCARD_FOOD":
        this.applyDiscardFood(effect);
        break;

      case "DISCARD_EGGS":
        this.applyDiscardEggs(effect);
        break;

      case "DISCARD_CARDS":
        this.applyDiscardCards(effect);
        break;

      case "TUCK_CARDS":
        this.applyTuckCards(effect);
        break;

      case "CACHE_FOOD":
        this.applyCacheFood(effect);
        break;

      case "PLAY_BIRD":
        this.applyPlayBird(effect);
        break;

      case "REROLL_BIRDFEEDER":
        this.applyRerollBirdfeeder(effect);
        break;

      case "REFILL_BIRDFEEDER":
        this.applyRefillBirdfeeder(effect);
        break;

      case "REFILL_BIRD_TRAY":
        this.applyRefillBirdTray(effect);
        break;

      case "REMOVE_CARDS_FROM_TRAY":
        this.applyRemoveCardsFromTray(effect);
        break;

      default:
        console.warn(`Unhandled effect type: ${(effect as Effect).type}`);
    }
  }

  private applyGainFood(effect: Effect & { type: "GAIN_FOOD" }): void {
    const player = this.findPlayer(effect.playerId);
    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        player.food[ft] = (player.food[ft] ?? 0) + count;

        // Remove dice from birdfeeder when source is BIRDFEEDER
        // Note: WILD is not a valid die face, so skip it
        if (effect.source === "BIRDFEEDER" && foodType !== "WILD") {
          for (let i = 0; i < count; i++) {
            try {
              this.gameState.birdfeeder.takeDie(foodType as DieFace);
            } catch {
              // Die may not be available (e.g., already taken or SEED_INVERTEBRATE)
            }
          }
        }
      }
    }
  }

  private applyLayEggs(effect: Effect & { type: "LAY_EGGS" }): void {
    const player = this.findPlayer(effect.playerId);
    for (const [birdId, count] of Object.entries(effect.placements)) {
      if (count && count > 0) {
        const bird = this.findBirdOnBoard(player, birdId);
        if (bird) {
          bird.eggs += count;
        }
      }
    }
  }

  private applyDrawCards(effect: Effect & { type: "DRAW_CARDS" }): void {
    const player = this.findPlayer(effect.playerId);
    const drawnCardIds: string[] = [];

    // Draw from tray
    for (const cardId of effect.fromTray) {
      const tray = this.gameState.birdCardSupply.getTray();
      const trayIndex = tray.findIndex((c) => c?.id === cardId);
      if (trayIndex !== -1) {
        const card = this.gameState.birdCardSupply.takeFromTray(trayIndex);
        player.hand.push(card);
        drawnCardIds.push(card.id);
      }
    }

    // Draw from deck
    if (effect.fromDeck > 0) {
      const drawn = this.gameState.birdCardSupply.drawFromDeck(effect.fromDeck);
      player.hand.push(...drawn);
      drawnCardIds.push(...drawn.map((c) => c.id));
    }

    // Populate result field so handlers can see what was drawn
    effect.drawnCards = drawnCardIds;

    // Refill tray
    this.gameState.birdCardSupply.refillTray();
  }

  private applyDiscardFood(effect: Effect & { type: "DISCARD_FOOD" }): void {
    const player = this.findPlayer(effect.playerId);
    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        player.food[ft] = Math.max(0, (player.food[ft] ?? 0) - count);
      }
    }
  }

  private applyDiscardEggs(effect: Effect & { type: "DISCARD_EGGS" }): void {
    const player = this.findPlayer(effect.playerId);
    for (const [birdId, count] of Object.entries(effect.sources)) {
      if (count && count > 0) {
        const bird = this.findBirdOnBoard(player, birdId);
        if (bird) {
          bird.eggs = Math.max(0, bird.eggs - count);
        }
      }
    }
  }

  private applyDiscardCards(effect: Effect & { type: "DISCARD_CARDS" }): void {
    const player = this.findPlayer(effect.playerId);
    const discardedCards = player.hand.filter((c) =>
      effect.cards.includes(c.id)
    );
    player.hand = player.hand.filter((c) => !effect.cards.includes(c.id));
    this.gameState.birdCardSupply.discardCards(discardedCards);
  }

  private applyTuckCards(effect: Effect & { type: "TUCK_CARDS" }): void {
    const player = this.findPlayer(effect.playerId);
    const bird = this.findBirdOnBoard(player, effect.targetBirdInstanceId);
    if (!bird) return;

    // Tuck from hand
    for (const cardId of effect.fromHand) {
      const cardIndex = player.hand.findIndex((c) => c.id === cardId);
      if (cardIndex !== -1) {
        player.hand.splice(cardIndex, 1);
        bird.tuckedCards.push(cardId);
      }
    }

    // Tuck from deck
    if (effect.fromDeck > 0) {
      const drawn = this.gameState.birdCardSupply.drawFromDeck(effect.fromDeck);
      const tuckedIds: string[] = [];
      for (const card of drawn) {
        bird.tuckedCards.push(card.id);
        tuckedIds.push(card.id);
      }
      // Populate result field so handlers can see what was tucked
      effect.tuckedFromDeck = tuckedIds;
    }
  }

  private applyCacheFood(effect: Effect & { type: "CACHE_FOOD" }): void {
    const player = this.findPlayer(effect.playerId);
    const bird = this.findBirdOnBoard(player, effect.birdInstanceId);
    if (!bird) return;

    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof bird.cachedFood;
        bird.cachedFood[ft] = (bird.cachedFood[ft] ?? 0) + count;
      }
    }
  }

  private applyPlayBird(effect: Effect & { type: "PLAY_BIRD" }): void {
    const player = this.findPlayer(effect.playerId);

    // Find the card in hand
    const cardIndex = player.hand.findIndex(
      (c) => c.id === effect.birdInstanceId.split("_").pop()
    );
    if (cardIndex === -1) return;

    const card = player.hand[cardIndex];

    // Create bird instance
    const birdInstance: BirdInstance = {
      id: effect.birdInstanceId,
      card,
      cachedFood: {},
      tuckedCards: [],
      eggs: 0,
    };

    // Place on board
    player.board[effect.habitat][effect.column] = birdInstance;

    // Remove from hand
    player.hand.splice(cardIndex, 1);

    // Deduct food cost
    for (const [foodType, count] of Object.entries(effect.foodPaid)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        player.food[ft] = Math.max(0, (player.food[ft] ?? 0) - count);
      }
    }

    // Deduct egg cost
    for (const [birdId, eggCount] of Object.entries(effect.eggsPaid)) {
      if (eggCount && eggCount > 0) {
        const sourceBird = this.findBirdOnBoard(player, birdId);
        if (sourceBird) {
          sourceBird.eggs = Math.max(0, sourceBird.eggs - eggCount);
        }
      }
    }
  }

  private applyRerollBirdfeeder(
    effect: Effect & { type: "REROLL_BIRDFEEDER" }
  ): void {
    this.gameState.birdfeeder.rerollAll();
    // Populate result field so handlers can see the new dice
    const newDice = this.gameState.birdfeeder.getDiceInFeeder();
    effect.newDice = [...newDice] as FoodType[];
  }

  private applyRefillBirdfeeder(
    effect: Effect & { type: "REFILL_BIRDFEEDER" }
  ): void {
    // Birdfeeder auto-refills when empty via rerollAll
    this.gameState.birdfeeder.rerollAll();
    const addedDice = this.gameState.birdfeeder.getDiceInFeeder();
    effect.addedDice = [...addedDice] as FoodType[];
  }

  private applyRefillBirdTray(
    _effect: Effect & { type: "REFILL_BIRD_TRAY" }
  ): void {
    // Refill the bird card tray
    this.gameState.birdCardSupply.refillTray();
  }

  private applyRemoveCardsFromTray(
    effect: Effect & { type: "REMOVE_CARDS_FROM_TRAY" }
  ): void {
    for (const cardId of effect.cards) {
      const tray = this.gameState.birdCardSupply.getTray();
      const trayIndex = tray.findIndex((c) => c?.id === cardId);
      if (trayIndex !== -1) {
        this.gameState.birdCardSupply.takeFromTray(trayIndex);
      }
    }
  }

  /**
   * Find a player by ID.
   */
  private findPlayer(playerId: PlayerId): PlayerState {
    const player = this.gameState.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error(`Player not found: ${playerId}`);
    }
    return player;
  }

  /**
   * Find a bird on a player's board by instance ID.
   */
  private findBirdOnBoard(
    player: PlayerState,
    birdInstanceId: string
  ): BirdInstance | null {
    for (const habitat of HABITATS) {
      for (const bird of player.board[habitat]) {
        if (bird?.id === birdInstanceId) {
          return bird;
        }
      }
    }
    return null;
  }

  // ============================================================================
  // Board Query Utilities
  // ============================================================================

  /**
   * Get the leftmost empty column in a habitat (0-4), or 5 if full.
   * This is a static utility method that can be used by other components.
   */
  static getLeftmostEmptyColumn(
    player: Readonly<PlayerState>,
    habitat: Habitat
  ): number {
    const row = player.board[habitat];
    for (let i = 0; i < row.length; i++) {
      if (row[i] === null) {
        return i;
      }
    }
    return HABITAT_SIZE;
  }

  /**
   * Get bird instance IDs with brown powers in a habitat, in right-to-left order.
   * This is the activation order for brown powers when a habitat is activated.
   */
  static getBirdsWithBrownPowers(
    player: Readonly<PlayerState>,
    habitat: Habitat
  ): string[] {
    const birds: string[] = [];
    const row = player.board[habitat];
    // Right to left order (rightmost bird activates first)
    for (let i = row.length - 1; i >= 0; i--) {
      const bird = row[i];
      if (bird && bird.card.power?.trigger === "WHEN_ACTIVATED") {
        birds.push(bird.id);
      }
    }
    return birds;
  }

  // ============================================================================
  // Scoring
  // ============================================================================

  /**
   * Calculate final scores for all players.
   */
  calculateFinalScores(): Record<PlayerId, number> {
    const scores: Record<PlayerId, number> = {};

    for (const player of this.gameState.players) {
      let score = 0;

      // Bird VP
      for (const habitat of HABITATS) {
        for (const bird of player.board[habitat]) {
          if (bird) {
            score += bird.card.victoryPoints;
            // Eggs on birds
            score += bird.eggs;
            // Cached food on birds
            for (const count of Object.values(bird.cachedFood)) {
              score += count ?? 0;
            }
            // Tucked cards
            score += bird.tuckedCards.length;
          }
        }
      }

      // Bonus card VP (simplified - just count qualifying birds)
      for (const bonusCard of player.bonusCards) {
        score += this.calculateBonusCardScore(player, bonusCard);
      }

      scores[player.id] = score;
    }

    return scores;
  }

  /**
   * Calculate score from a bonus card.
   * Counts birds that satisfy the bonus card condition, then applies scoring.
   */
  calculateBonusCardScore(player: PlayerState, bonusCard: BonusCard): number {
    const qualifyingCount = this.countQualifyingBirds(player, bonusCard);

    if (bonusCard.scoringType === "PER_BIRD") {
      const tier = bonusCard.scoring[0];
      return qualifyingCount * (tier?.points ?? 0);
    } else {
      // TIERED scoring
      for (const tier of bonusCard.scoring.slice().reverse()) {
        const min = tier.minCount ?? 0;
        const max = tier.maxCount ?? Infinity;
        if (qualifyingCount >= min && qualifyingCount <= max) {
          return tier.points;
        }
      }
    }
    return 0;
  }

  /**
   * Count birds that qualify for a bonus card.
   * Handles both static conditions (from bird's bonusCards array) and
   * runtime conditions (eggs on birds, cards in hand, etc.).
   */
  countQualifyingBirds(player: PlayerState, bonusCard: BonusCard): number {
    // Handle special runtime-based bonus cards
    switch (bonusCard.id) {
      case "breeding_manager":
        // Birds that have at least 4 eggs laid on them
        return this.countBirdsWithMinEggs(player, 4);

      case "oologist":
        // Birds that have at least 1 egg laid on them
        return this.countBirdsWithMinEggs(player, 1);

      case "visionary_leader":
        // Bird cards in hand at end of game
        return player.hand.length;

      case "ecologist":
        // Birds in habitat with fewest birds
        return this.countBirdsInSmallestHabitat(player);

      default:
        // Static condition: check if bonus card ID is in bird's bonusCards array
        return this.countBirdsMatchingBonusCard(player, bonusCard.id);
    }
  }

  /**
   * Count birds that have at least minEggs eggs on them.
   */
  countBirdsWithMinEggs(player: PlayerState, minEggs: number): number {
    let count = 0;
    for (const habitat of HABITATS) {
      for (const bird of player.board[habitat]) {
        if (bird && bird.eggs >= minEggs) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Count birds in the habitat with the fewest birds.
   */
  countBirdsInSmallestHabitat(player: PlayerState): number {
    let smallest = Infinity;
    for (const habitat of HABITATS) {
      const birdCount = player.board[habitat].filter((b) => b !== null).length;
      if (birdCount < smallest) {
        smallest = birdCount;
      }
    }
    return smallest === Infinity ? 0 : smallest;
  }

  /**
   * Count birds whose bonusCards array includes the given bonus card ID.
   */
  countBirdsMatchingBonusCard(
    player: PlayerState,
    bonusCardId: string
  ): number {
    let count = 0;
    for (const habitat of HABITATS) {
      for (const bird of player.board[habitat]) {
        if (bird && bird.card.bonusCards.includes(bonusCardId)) {
          count++;
        }
      }
    }
    return count;
  }

  private determineWinner(scores: Record<PlayerId, number>): PlayerId {
    let winnerId = this.gameState.players[0].id;
    let highScore = scores[winnerId] ?? 0;

    for (const [playerId, score] of Object.entries(scores)) {
      if (score > highScore) {
        highScore = score;
        winnerId = playerId;
      }
    }

    return winnerId;
  }

  private generatePromptId(): PromptId {
    return `prompt_${++this.promptCounter}`;
  }

  private createPromptContext(): PromptContext {
    return {
      round: this.gameState.round,
      activePlayerId:
        this.gameState.players[this.gameState.activePlayerIndex].id,
      trigger: { type: "WHEN_ACTIVATED", habitat: "FOREST", sourceBirdId: "" },
    };
  }

  private anyPlayerHasTurns(): boolean {
    return this.gameState.players.some((p) => p.turnsRemaining > 0);
  }

  private buildRewardsByAction(player: PlayerState): RewardsByAction {
    const board = this.registry.getPlayerBoard();

    const forestColumn = GameEngine.getLeftmostEmptyColumn(player, "FOREST");
    const grasslandColumn = GameEngine.getLeftmostEmptyColumn(player, "GRASSLAND");
    const wetlandColumn = GameEngine.getLeftmostEmptyColumn(player, "WETLAND");

    const forestBonus = board.forest.bonusRewards[forestColumn];
    const grasslandBonus = board.grassland.bonusRewards[grasslandColumn];
    const wetlandBonus = board.wetland.bonusRewards[wetlandColumn];

    return {
      PLAY_BIRD: {
        reward: { type: "CARDS" as Resource, count: 0 },
      },
      GAIN_FOOD: {
        reward: {
          type: "FOOD" as Resource,
          count: board.forest.baseRewards[forestColumn],
        },
        ...(forestBonus && {
          bonus: {
            cost: {
              type: forestBonus.tradeFrom as Resource,
              count: forestBonus.tradeFromAmount,
            },
            reward: {
              type: forestBonus.tradeTo as Resource,
              count: forestBonus.tradeToAmount,
            },
          },
        }),
      },
      LAY_EGGS: {
        reward: {
          type: "EGGS" as Resource,
          count: board.grassland.baseRewards[grasslandColumn],
        },
        ...(grasslandBonus && {
          bonus: {
            cost: {
              type: grasslandBonus.tradeFrom as Resource,
              count: grasslandBonus.tradeFromAmount,
            },
            reward: {
              type: grasslandBonus.tradeTo as Resource,
              count: grasslandBonus.tradeToAmount,
            },
          },
        }),
      },
      DRAW_CARDS: {
        reward: {
          type: "CARDS" as Resource,
          count: board.wetland.baseRewards[wetlandColumn],
        },
        ...(wetlandBonus && {
          bonus: {
            cost: {
              type: wetlandBonus.tradeFrom as Resource,
              count: wetlandBonus.tradeFromAmount,
            },
            reward: {
              type: wetlandBonus.tradeTo as Resource,
              count: wetlandBonus.tradeToAmount,
            },
          },
        }),
      },
    };
  }
}

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
import { GameState, DeferredContinuationEntry } from "./GameState.js";
export { GameState, DeferredContinuationEntry } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";
import { PlayerBoard } from "./PlayerBoard.js";
import { AgentForfeitError } from "./errors.js";
import type {
  BirdCard,
  BirdInstance,
  BirdInstanceId,
  BonusCard,
  DieFace,
  FoodByType,
  FoodType,
  Habitat,
  PlayerId,
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
  TurnActionKind,
  TurnActionPrompt,
  Resource,
} from "../types/prompts.js";
import type { GameObserver } from "./GameObserver.js";

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
  /** Players who forfeited during the game (if any) */
  forfeitedPlayers?: PlayerId[];
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
 * Configuration for creating a GameEngine from a pre-built GameState.
 * Used by the ScenarioRunner for integration testing.
 */
export interface GameEngineFromStateConfig {
  agents: PlayerAgent[];
  seed: number;
  registry: DataRegistry;
  gameState: GameState;
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

  /**
   * Registered observers that receive notifications about events and effects.
   */
  private readonly observers: GameObserver[] = [];

  constructor(config: GameEngineConfig) {
    this.agents = config.agents;
    this.registry = config.registry;
    this.seed = config.seed;
    this.rng = new Rng(config.seed);
    this.actionProcessor = new ActionProcessor();
    this.gameState = this.setupGame();
  }

  /**
   * Create a GameEngine from a pre-built GameState.
   * Used by the ScenarioRunner for integration testing with controlled initial states.
   */
  static fromState(config: GameEngineFromStateConfig): GameEngine {
    // Create an instance without calling setupGame()
    // Use a record to bypass private field constraints
    const engine = Object.create(GameEngine.prototype) as GameEngine;

    // Use a record type to initialize private fields
    const engineRecord = engine as unknown as Record<string, unknown>;
    engineRecord.agents = config.agents;
    engineRecord.registry = config.registry;
    engineRecord.seed = config.seed;
    engineRecord.rng = new Rng(config.seed);
    engineRecord.actionProcessor = new ActionProcessor();
    engineRecord.gameState = config.gameState;
    engineRecord.promptCounter = 0;
    engineRecord.eventHistory = [];
    engineRecord.observers = [];

    return engine;
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
   * Register an observer to receive event and effect notifications.
   */
  addObserver(observer: GameObserver): void {
    this.observers.push(observer);
  }

  /**
   * Remove a previously registered observer.
   */
  removeObserver(observer: GameObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Notify all observers of an event.
   */
  private notifyEventProcessing(event: Event): void {
    for (const observer of this.observers) {
      observer.onEventProcessing?.(event);
    }
  }

  /**
   * Notify all observers of an effect.
   */
  private notifyEffectApplied(effect: Effect): void {
    for (const observer of this.observers) {
      observer.onEffectApplied?.(effect);
    }
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

      return PlayerState.from(agent.playerId, {
        hand,
        bonusCards,
        food,
        turnsRemaining: INITIAL_TURNS_PER_ROUND,
        board: PlayerBoard.empty(),
      });
    });

    // Fill the bird tray AFTER dealing starting hands to all players
    birdCardSupply.refillTray();

    return new GameState({
      players,
      activePlayerIndex: 0,
      birdfeeder,
      birdCardSupply,
      bonusCardDeck,
      roundGoals,
      round: 1,
      turn: 1,
    });
  }

  /**
   * Run a complete game from start to finish.
   */
  async playGame(): Promise<GameResult> {
    const forfeitedPlayers: PlayerId[] = [];

    // 1. Starting hand selection (simultaneous)
    await this.handleStartingHandSelection();

    // 2. Emit GameStartedEvent
    await this.processEvent({
      type: "GAME_STARTED",
      playerIds: this.gameState.players.map((p) => p.id),
      seed: this.seed,
    });

    // 3. Run 4 rounds (with forfeit handling)
    try {
      for (let round = 1; round <= TOTAL_ROUNDS; round++) {
        const shouldContinue = await this.runRoundWithForfeitHandling(
          round,
          forfeitedPlayers
        );
        if (!shouldContinue) {
          break; // Game ended due to forfeit (only 1 player remaining)
        }
      }
    } catch (error) {
      // Re-throw unexpected errors
      if (!(error instanceof AgentForfeitError)) {
        throw error;
      }
      // This shouldn't happen as runRoundWithForfeitHandling handles forfeits,
      // but handle it just in case
      await this.handleForfeit(error, forfeitedPlayers);
    }

    // 4. Calculate final scores
    const scores = this.calculateFinalScores();
    const winnerId = this.determineWinner(scores);

    // 5. Emit GameEndedEvent
    await this.processEvent({
      type: "GAME_ENDED",
      finalScores: scores,
      winnerId,
    });

    return {
      winnerId,
      scores,
      roundsPlayed: this.gameState.round,
      totalTurns: this.gameState.turn - 1,
      ...(forfeitedPlayers.length > 0 && { forfeitedPlayers }),
    };
  }

  /**
   * Run a single turn for the active player.
   * Used by the ScenarioRunner for controlled turn-by-turn execution.
   *
   * Unlike playGame(), this method:
   * - Does NOT handle starting hand selection
   * - Does NOT emit GAME_STARTED/GAME_ENDED events
   * - Does NOT handle round transitions
   *
   * After the turn completes, activePlayerIndex is advanced to the next player.
   * The caller is responsible for managing the game lifecycle.
   */
  async runSingleTurn(): Promise<void> {
    await this.runTurn(this.gameState.activePlayerIndex);
    // Advance to next player (round-robin)
    this.gameState.activePlayerIndex =
      (this.gameState.activePlayerIndex + 1) % this.gameState.players.length;
  }

  /**
   * Handle a player forfeit.
   * Marks the player as forfeited and emits the PLAYER_FORFEITED event.
   * @returns true if the game should continue, false if only 1 player remains
   */
  private async handleForfeit(
    error: AgentForfeitError,
    forfeitedPlayers: PlayerId[]
  ): Promise<boolean> {
    const player = this.gameState.findPlayer(error.playerId);
    player.forfeited = true;
    player.turnsRemaining = 0;
    forfeitedPlayers.push(error.playerId);

    const remainingCount = this.getActivePlayerCount();

    await this.processEvent({
      type: "PLAYER_FORFEITED",
      playerId: error.playerId,
      reason: error.lastError.message,
      remainingPlayerCount: remainingCount,
    });

    // Game continues if more than 1 active player remains
    return remainingCount > 1;
  }

  /**
   * Get the count of players who haven't forfeited.
   */
  private getActivePlayerCount(): number {
    return this.gameState.players.filter((p) => !p.forfeited).length;
  }

  /**
   * Run a round with forfeit handling.
   * @returns true if the game should continue, false if only 1 player remains
   */
  private async runRoundWithForfeitHandling(
    round: number,
    forfeitedPlayers: PlayerId[]
  ): Promise<boolean> {
    this.gameState.round = round;

    // Set turns remaining for all non-forfeited players based on round
    const turnsThisRound = TURNS_BY_ROUND[round - 1];
    for (const player of this.gameState.players) {
      if (!player.forfeited) {
        player.turnsRemaining = turnsThisRound;
      }
    }

    await this.processEvent({ type: "ROUND_STARTED", round });

    // Round-robin turns until all players exhausted
    let currentPlayerIndex = 0;
    while (this.anyActivePlayerHasTurns()) {
      // Find next active player with turns remaining
      let attempts = 0;
      while (attempts < this.gameState.players.length) {
        const player = this.gameState.players[currentPlayerIndex];
        if (!player.forfeited && player.turnsRemaining > 0) {
          break;
        }
        currentPlayerIndex =
          (currentPlayerIndex + 1) % this.gameState.players.length;
        attempts++;
      }

      const currentPlayer = this.gameState.players[currentPlayerIndex];
      if (!currentPlayer.forfeited && currentPlayer.turnsRemaining > 0) {
        try {
          await this.runTurn(currentPlayerIndex);
        } catch (error) {
          if (error instanceof AgentForfeitError) {
            const shouldContinue = await this.handleForfeit(
              error,
              forfeitedPlayers
            );
            if (!shouldContinue) {
              // Only 1 player remaining, end the game
              await this.processEvent({ type: "ROUND_ENDED", round });
              return false;
            }
            // Continue with next player
          } else {
            throw error;
          }
        }
      }

      currentPlayerIndex =
        (currentPlayerIndex + 1) % this.gameState.players.length;
    }

    await this.processEvent({ type: "ROUND_ENDED", round });
    return true;
  }

  /**
   * Check if any active (non-forfeited) player has turns remaining.
   */
  private anyActivePlayerHasTurns(): boolean {
    return this.gameState.players.some(
      (p) => !p.forfeited && p.turnsRemaining > 0
    );
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

    // Build turn action prompt with eligibility filtering
    const view = buildPlayerView(this.gameState, player.id);
    const boardConfig = this.registry.getPlayerBoard();
    const { eligibleActions, rewardsByAction } = this.buildEligibleActionsAndRewards(player, boardConfig);

    const prompt: TurnActionPrompt = {
      promptId: this.generatePromptId(),
      playerId: player.id,
      kind: "turnAction",
      view,
      context: this.createPromptContext(),
      eligibleActions,
      rewardsByAction,
    };

    const choice = await agent.chooseTurnAction(prompt);

    // Build context for turn action processor (simplified - no mutable objects)
    const ctx: TurnActionContext = {
      playerId: player.id,
      round: this.gameState.round,
    };

    // Build execution context for running the generator
    const execCtx: ActionExecutionContext = {
      getState: () => this.gameState,
      getRegistry: () => this.registry,
      getAgent: (playerId: PlayerId) => this.getAgentForPlayer(playerId),
      generatePromptId: () => this.generatePromptId(),
      buildPlayerView: (playerId: PlayerId) =>
        buildPlayerView(this.gameState, playerId),
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
  private async resolveEndOfTurnContinuations(
    playerId: PlayerId
  ): Promise<void> {
    // Get continuations for this player
    const playerConts = this.gameState.endOfTurnContinuations.filter(
      (c) => c.playerId === playerId
    );

    // Clear them from state
    this.gameState.endOfTurnContinuations =
      this.gameState.endOfTurnContinuations.filter(
        (c) => c.playerId !== playerId
      );

    // Execute each continuation using ActionProcessor
    const execCtx = this.createActionExecutionContext();
    for (const { continuation } of playerConts) {
      await this.actionProcessor.executeContinuation(
        continuation,
        playerId,
        execCtx
      );
    }
  }

  /**
   * Process an event: record it to history and handle it immediately.
   */
  private async processEvent(event: Event): Promise<void> {
    this.eventHistory.push(event);

    // Notify observers of event
    this.notifyEventProcessing(event);

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
    for (const birdInstanceId of event.brownPowerBirdInstanceIds) {
      await this.processBrownPower(birdInstanceId, event.playerId, execCtx);
    }
  }

  private async processBrownPower(
    birdInstanceId: BirdInstanceId,
    ownerId: PlayerId,
    execCtx: ActionExecutionContext
  ): Promise<void> {
    const result = await this.actionProcessor.executeSinglePower(
      birdInstanceId,
      ownerId,
      execCtx
    );
    for (const evt of result.events) {
      await this.processEvent(evt);
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
      // Set the triggering event on the context so the handler can access it
      execCtx.triggeringEvent = trigger.triggeringEvent;
      await this.actionProcessor.executeSinglePower(
        trigger.birdInstanceId,
        trigger.ownerId,
        execCtx
      );
      // Clear the triggering event after execution
      execCtx.triggeringEvent = undefined;
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
        trigger: trigger ?? {
          type: "WHEN_ACTIVATED",
          habitat: "FOREST",
          sourceBirdId: "",
        },
      }),
      applyEffect: (effect: Effect) => this.applyEffect(effect),
      deferContinuation: (
        playerId: PlayerId,
        continuation: () => Generator<PowerYield, void, PowerReceive>
      ) => {
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
   *
   * Most effects are synchronous state mutations, but some (like REPEAT_BROWN_POWER)
   * require async execution to invoke other power handlers.
   */
  async applyEffect(effect: Effect): Promise<void> {
    // Notify observers of effect application
    this.notifyEffectApplied(effect);

    switch (effect.type) {
      case "ACTIVATE_POWER":
        // Tracking effect - no state mutation needed
        break;

      case "REPEAT_BROWN_POWER":
        await this.applyRepeatBrownPower(effect);
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

      case "ROLL_DICE":
        this.applyRollDice(effect);
        break;

      case "REVEAL_CARDS":
        this.applyRevealCards(effect);
        break;

      case "REVEAL_BONUS_CARDS":
        this.applyRevealBonusCards(effect);
        break;

      case "DRAW_BONUS_CARDS":
        this.applyDrawBonusCards(effect);
        break;

      case "MOVE_BIRD":
        this.applyMoveBird(effect);
        break;

      case "ALL_PLAYERS_GAIN_FOOD":
        this.applyAllPlayersGainFood(effect);
        break;

      case "ALL_PLAYERS_DRAW_CARDS":
        this.applyAllPlayersDrawCards(effect);
        break;

      case "ALL_PLAYERS_LAY_EGGS":
        this.applyAllPlayersLayEggs(effect);
        break;

      default:
        console.warn(`Unhandled effect type: ${(effect as Effect).type}`);
    }
  }

  applyGainFood(effect: Effect & { type: "GAIN_FOOD" }): void {
    const player = this.gameState.findPlayer(effect.playerId);

    // Add food to player's supply
    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        player.food[ft] = (player.food[ft] ?? 0) + count;
      }
    }

    // Remove dice from birdfeeder when source is BIRDFEEDER
    if (effect.source === "BIRDFEEDER" && effect.diceTaken) {
      for (const dieSelection of effect.diceTaken) {
        this.gameState.birdfeeder.takeDie(dieSelection.die);
      }
    }
  }

  applyLayEggs(effect: Effect & { type: "LAY_EGGS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    for (const [birdId, count] of Object.entries(effect.placements)) {
      if (count && count > 0) {
        const bird = player.board.findBirdInstance(birdId);
        if (!bird) {
          throw new Error(
            `Cannot lay eggs: bird instance "${birdId}" not found on player "${effect.playerId}"'s board`
          );
        }
        const newTotal = bird.eggs + count;
        if (newTotal > bird.card.eggCapacity) {
          throw new Error(
            `Cannot lay ${count} egg(s) on bird "${birdId}": would exceed egg capacity of ${bird.card.eggCapacity} (current: ${bird.eggs})`
          );
        }
        bird.eggs = newTotal;
      }
    }
  }

  applyDrawCards(effect: Effect & { type: "DRAW_CARDS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    const drawnCardIds: string[] = [];

    // Draw from tray
    for (const cardId of effect.fromTray) {
      const tray = this.gameState.birdCardSupply.getTray();
      const trayIndex = tray.findIndex((c) => c?.id === cardId);
      if (trayIndex === -1) {
        throw new Error(
          `Cannot draw card: card "${cardId}" not found in bird tray`
        );
      }
      const card = this.gameState.birdCardSupply.takeFromTray(trayIndex);
      player.hand.push(card);
      drawnCardIds.push(card.id);
    }

    // Draw from deck
    if (effect.fromDeck > 0) {
      const drawn = this.gameState.birdCardSupply.drawFromDeck(effect.fromDeck);
      player.hand.push(...drawn);
      drawnCardIds.push(...drawn.map((c) => c.id));
    }

    // Draw from revealed cards (used by powers like American Oystercatcher)
    if (effect.fromRevealed && effect.fromRevealed.length > 0) {
      for (const cardId of effect.fromRevealed) {
        const card = this.registry.getBirdById(cardId);
        player.hand.push(card);
        drawnCardIds.push(cardId);
      }
    }

    // Populate result field so handlers can see what was drawn
    effect.drawnCards = drawnCardIds;

    // Refill tray
    this.gameState.birdCardSupply.refillTray();
  }

  applyDiscardFood(effect: Effect & { type: "DISCARD_FOOD" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        const available = player.food[ft] ?? 0;
        if (count > available) {
          throw new Error(
            `Cannot discard ${count} ${foodType}: player "${effect.playerId}" only has ${available}`
          );
        }
        player.food[ft] = available - count;
      }
    }
  }

  applyDiscardEggs(effect: Effect & { type: "DISCARD_EGGS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    for (const [birdId, count] of Object.entries(effect.sources)) {
      if (count && count > 0) {
        const bird = player.board.findBirdInstance(birdId);
        if (!bird) {
          throw new Error(
            `Cannot discard eggs: bird instance "${birdId}" not found on player "${effect.playerId}"'s board`
          );
        }
        if (count > bird.eggs) {
          throw new Error(
            `Cannot discard ${count} egg(s) from bird "${birdId}": only has ${bird.eggs} egg(s)`
          );
        }
        bird.eggs -= count;
      }
    }
  }

  applyDiscardCards(effect: Effect & { type: "DISCARD_CARDS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);

    if (effect.fromRevealed) {
      // Cards from revealed state (e.g., predator power failure)
      // Discard directly without checking player's hand
      const cards = effect.cards.map((cardId) =>
        this.registry.getBirdById(cardId)
      );
      this.gameState.birdCardSupply.discardCards(cards);
    } else {
      // Standard discard from hand
      // Validate all cards are in hand
      const handCardIds = new Set(player.hand.map((c) => c.id));
      for (const cardId of effect.cards) {
        if (!handCardIds.has(cardId)) {
          throw new Error(
            `Cannot discard card: card "${cardId}" not found in player "${effect.playerId}"'s hand`
          );
        }
      }

      const discardedCards = player.hand.filter((c) =>
        effect.cards.includes(c.id)
      );
      player.hand = player.hand.filter((c) => !effect.cards.includes(c.id));
      this.gameState.birdCardSupply.discardCards(discardedCards);
    }
  }

  applyTuckCards(effect: Effect & { type: "TUCK_CARDS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    const bird = player.board.findBirdInstance(effect.targetBirdInstanceId);
    if (!bird) {
      throw new Error(
        `Cannot tuck cards: target bird "${effect.targetBirdInstanceId}" not found on player "${effect.playerId}"'s board`
      );
    }

    // Tuck from hand
    for (const cardId of effect.fromHand) {
      const cardIndex = player.hand.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) {
        throw new Error(
          `Cannot tuck card: card "${cardId}" not found in player "${effect.playerId}"'s hand`
        );
      }
      player.hand.splice(cardIndex, 1);
      bird.tuckedCards.push(cardId);
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

    // Tuck from revealed cards (used by powers like Barred Owl)
    for (const cardId of effect.fromRevealed) {
      bird.tuckedCards.push(cardId);
    }
  }

  applyCacheFood(effect: Effect & { type: "CACHE_FOOD" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    const bird = player.board.findBirdInstance(effect.birdInstanceId);
    if (!bird) {
      throw new Error(
        `Cannot cache food: bird "${effect.birdInstanceId}" not found on player "${effect.playerId}"'s board`
      );
    }

    for (const [foodType, count] of Object.entries(effect.food)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof bird.cachedFood;
        bird.cachedFood[ft] = (bird.cachedFood[ft] ?? 0) + count;
      }
    }

    // Remove dice from birdfeeder when source is BIRDFEEDER
    if (effect.source === "BIRDFEEDER" && effect.diceTaken) {
      for (const dieSelection of effect.diceTaken) {
        this.gameState.birdfeeder.takeDie(dieSelection.die);
      }
    }
  }

  applyPlayBird(effect: Effect & { type: "PLAY_BIRD" }): void {
    const player = this.gameState.findPlayer(effect.playerId);

    // Find the card in hand
    // birdInstanceId format: {playerId}_{cardId}
    // cardId can contain underscores, so we join everything after the first underscore
    const parts = effect.birdInstanceId.split("_");
    const cardId = parts.slice(1).join("_");
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      throw new Error(
        `Cannot play bird: card "${cardId}" not found in player "${effect.playerId}"'s hand`
      );
    }

    const card = player.hand[cardIndex];

    // Check if slot is already occupied
    const existingBird = player.board.getSlot(effect.habitat, effect.column);
    if (existingBird !== null) {
      throw new Error(
        `Cannot play bird: slot ${effect.habitat}[${effect.column}] is already occupied by "${existingBird.id}"`
      );
    }

    // Validate food cost
    for (const [foodType, count] of Object.entries(effect.foodPaid)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        const available = player.food[ft] ?? 0;
        if (count > available) {
          throw new Error(
            `Cannot play bird: insufficient ${foodType} (need ${count}, have ${available})`
          );
        }
      }
    }

    // Validate egg cost
    for (const [birdId, eggCount] of Object.entries(effect.eggsPaid)) {
      if (eggCount && eggCount > 0) {
        const sourceBird = player.board.findBirdInstance(birdId);
        if (!sourceBird) {
          throw new Error(
            `Cannot play bird: source bird "${birdId}" for egg payment not found`
          );
        }
        if (eggCount > sourceBird.eggs) {
          throw new Error(
            `Cannot play bird: bird "${birdId}" has ${sourceBird.eggs} egg(s), need ${eggCount}`
          );
        }
      }
    }

    // Create bird instance
    const birdInstance: BirdInstance = {
      id: effect.birdInstanceId,
      card,
      cachedFood: {},
      tuckedCards: [],
      eggs: 0,
    };

    // Place on board
    player.board.setSlot(effect.habitat, effect.column, birdInstance);

    // Remove from hand
    player.hand.splice(cardIndex, 1);

    // Deduct food cost
    for (const [foodType, count] of Object.entries(effect.foodPaid)) {
      if (count && count > 0) {
        const ft = foodType as keyof typeof player.food;
        player.food[ft] = (player.food[ft] ?? 0) - count;
      }
    }

    // Deduct egg cost
    for (const [birdId, eggCount] of Object.entries(effect.eggsPaid)) {
      if (eggCount && eggCount > 0) {
        const sourceBird = player.board.findBirdInstance(birdId);
        if (sourceBird) {
          sourceBird.eggs -= eggCount;
        }
      }
    }
  }

  applyRerollBirdfeeder(effect: Effect & { type: "REROLL_BIRDFEEDER" }): void {
    this.gameState.birdfeeder.rerollAll();
    // Populate result field so handlers can see the new dice
    const newDice = this.gameState.birdfeeder.getDiceInFeeder();
    effect.newDice = [...newDice];
  }

  applyRefillBirdfeeder(effect: Effect & { type: "REFILL_BIRDFEEDER" }): void {
    // Unconditionally roll all dice (for refill scenarios)
    this.gameState.birdfeeder.rollAll();
    const addedDice = this.gameState.birdfeeder.getDiceInFeeder();
    effect.addedDice = [...addedDice];
  }

  applyRefillBirdTray(effect: Effect & { type: "REFILL_BIRD_TRAY" }): void {
    // Capture tray state before refilling
    const trayBefore = this.gameState.birdCardSupply
      .getTray()
      .map((c) => c?.id)
      .filter((id): id is string => id !== undefined);

    // Refill the bird card tray
    this.gameState.birdCardSupply.refillTray();

    // Capture tray state after refilling
    const trayAfter = this.gameState.birdCardSupply
      .getTray()
      .map((c) => c?.id)
      .filter((id): id is string => id !== undefined);

    // New cards are those in trayAfter but not in trayBefore
    const beforeSet = new Set(trayBefore);
    effect.newCards = trayAfter.filter((id) => !beforeSet.has(id));

    // discardedCards stays empty since refillTray() only fills empty slots
    effect.discardedCards = [];
  }

  applyRemoveCardsFromTray(
    effect: Effect & { type: "REMOVE_CARDS_FROM_TRAY" }
  ): void {
    for (const cardId of effect.cards) {
      const tray = this.gameState.birdCardSupply.getTray();
      const trayIndex = tray.findIndex((c) => c?.id === cardId);
      if (trayIndex === -1) {
        throw new Error(
          `Cannot remove card from tray: card "${cardId}" not found in bird tray`
        );
      }
      this.gameState.birdCardSupply.takeFromTray(trayIndex);
    }
  }

  applyRollDice(effect: Effect & { type: "ROLL_DICE" }): void {
    const diceInFeeder = this.gameState.birdfeeder.getDiceInFeeder().length;
    const diceToRoll = 5 - diceInFeeder;
    const results = this.gameState.birdfeeder.rollOutsideFeeder(diceToRoll);
    effect.rolledDice = results;
  }

  applyRevealCards(effect: Effect & { type: "REVEAL_CARDS" }): void {
    const cards = this.gameState.birdCardSupply.drawFromDeck(effect.count);
    effect.revealedCards = cards.map((c) => c.id);
  }

  applyRevealBonusCards(effect: Effect & { type: "REVEAL_BONUS_CARDS" }): void {
    const cards = this.gameState.bonusCardDeck.draw(effect.count);
    effect.revealedCards = cards.map((c) => c.id);
  }

  applyDrawBonusCards(effect: Effect & { type: "DRAW_BONUS_CARDS" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    // Add kept cards to player
    for (const cardId of effect.keptCards) {
      const card = this.registry.getBonusCardById(cardId);
      player.bonusCards.push(card);
    }
    // Discard others
    const discarded = effect.discardedCards.map((id) =>
      this.registry.getBonusCardById(id)
    );
    this.gameState.bonusCardDeck.discardItems(discarded);
  }

  applyMoveBird(effect: Effect & { type: "MOVE_BIRD" }): void {
    const player = this.gameState.findPlayer(effect.playerId);
    // Remove bird from source habitat
    const bird = player.board.removeBird(
      effect.birdInstanceId,
      effect.fromHabitat
    );
    // Place in destination habitat at next available slot
    const column = player.board.getLeftmostEmptyColumn(effect.toHabitat);
    if (column >= 5) {
      throw new Error(
        `Cannot move bird to ${effect.toHabitat}: habitat is full`
      );
    }
    player.board.setSlot(effect.toHabitat, column, bird);
  }

  applyAllPlayersGainFood(
    effect: Effect & { type: "ALL_PLAYERS_GAIN_FOOD" }
  ): void {
    for (const [playerId, food] of Object.entries(effect.gains)) {
      const player = this.gameState.findPlayer(playerId);
      for (const [foodType, count] of Object.entries(food)) {
        if (count && count > 0) {
          const ft = foodType as FoodType;
          player.food[ft] = (player.food[ft] ?? 0) + count;
        }
      }
    }
  }

  applyAllPlayersDrawCards(
    effect: Effect & { type: "ALL_PLAYERS_DRAW_CARDS" }
  ): void {
    const drawnCards: Record<PlayerId, string[]> = {};

    for (const [playerId, count] of Object.entries(effect.draws)) {
      if (count && count > 0) {
        const player = this.gameState.findPlayer(playerId);
        const drawn = this.gameState.birdCardSupply.drawFromDeck(count);
        player.hand.push(...drawn);
        drawnCards[playerId] = drawn.map((c) => c.id);
      }
    }

    // Populate result field so handlers can see what was drawn
    effect.drawnCards = drawnCards;

    // Refill tray after all draws complete
    this.gameState.birdCardSupply.refillTray();
  }

  applyAllPlayersLayEggs(
    effect: Effect & { type: "ALL_PLAYERS_LAY_EGGS" }
  ): void {
    for (const [playerId, birdPlacements] of Object.entries(
      effect.placements
    )) {
      const player = this.gameState.findPlayer(playerId);

      for (const [birdId, count] of Object.entries(birdPlacements)) {
        if (count && count > 0) {
          const bird = player.board.findBirdInstance(birdId);
          if (!bird) {
            throw new Error(
              `Cannot lay eggs: bird instance "${birdId}" not found on player "${playerId}"'s board`
            );
          }
          const newTotal = bird.eggs + count;
          if (newTotal > bird.card.eggCapacity) {
            throw new Error(
              `Cannot lay ${count} egg(s) on bird "${birdId}": would exceed egg capacity of ${bird.card.eggCapacity} (current: ${bird.eggs})`
            );
          }
          bird.eggs = newTotal;
        }
      }
    }
  }

  /**
   * Apply the REPEAT_BROWN_POWER effect by executing the target bird's brown power.
   * This triggers the full power execution cycle including any agent prompts.
   *
   * Validates that:
   * - The target bird exists and is on the specified player's board
   * - The target bird has a brown power (WHEN_ACTIVATED trigger)
   */
  async applyRepeatBrownPower(
    effect: Effect & { type: "REPEAT_BROWN_POWER" }
  ): Promise<void> {
    const player = this.gameState.findPlayer(effect.playerId);
    const bird = player.board.findBirdInstance(effect.targetBirdInstanceId);

    if (!bird) {
      throw new Error(
        `Cannot repeat brown power: bird "${effect.targetBirdInstanceId}" not found on player "${effect.playerId}"'s board`
      );
    }

    const power = bird.card.power;
    if (!power) {
      throw new Error(
        `Cannot repeat brown power: bird "${effect.targetBirdInstanceId}" has no power`
      );
    }

    if (power.trigger !== "WHEN_ACTIVATED") {
      throw new Error(
        `Cannot repeat brown power: bird "${effect.targetBirdInstanceId}" has a ${power.trigger} power, not a brown (WHEN_ACTIVATED) power`
      );
    }

    const execCtx = this.createActionExecutionContext();
    await this.processBrownPower(
      effect.targetBirdInstanceId,
      effect.playerId,
      execCtx
    );
  }

  /**
   * Calculate final scores for all players.
   */
  calculateFinalScores(): Record<PlayerId, number> {
    const scores: Record<PlayerId, number> = {};

    for (const player of this.gameState.players) {
      let score = 0;

      // Bird VP
      for (const bird of player.board.getAllBirds()) {
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
    return player.board.getAllBirds().filter((bird) => bird.eggs >= minEggs)
      .length;
  }

  /**
   * Count birds in the habitat with the fewest birds.
   */
  countBirdsInSmallestHabitat(player: PlayerState): number {
    let smallest = Infinity;
    for (const habitat of HABITATS) {
      const birdCount = player.board.countBirdsInHabitat(habitat);
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
    return player.board
      .getAllBirds()
      .filter((bird) => bird.card.bonusCards.includes(bonusCardId)).length;
  }

  private determineWinner(scores: Record<PlayerId, number>): PlayerId {
    // Find the first non-forfeited player as default winner
    const activePlayers = this.gameState.players.filter((p) => !p.forfeited);
    let winnerId = activePlayers[0]?.id ?? this.gameState.players[0].id;
    let highScore = scores[winnerId] ?? 0;

    // Only consider non-forfeited players for winning
    for (const player of activePlayers) {
      const score = scores[player.id] ?? 0;
      if (score > highScore) {
        highScore = score;
        winnerId = player.id;
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

  /**
   * Build eligible actions and rewards for a turn action prompt.
   * Filters actions based on player's ability to take them:
   * - PLAY_BIRD: Only if player can play at least one bird (food + egg + habitat)
   * - LAY_EGGS: Only if player has at least one bird on their board
   * - GAIN_FOOD and DRAW_CARDS: Always eligible
   */
  private buildEligibleActionsAndRewards(
    player: PlayerState,
    boardConfig: import("../types/core.js").PlayerBoardConfig
  ): { eligibleActions: TurnActionKind[]; rewardsByAction: RewardsByAction } {
    const eligibleActions: TurnActionKind[] = [];
    const rewardsByAction: Partial<RewardsByAction> = {};

    const forestColumn = player.board.getLeftmostEmptyColumn("FOREST");
    const grasslandColumn = player.board.getLeftmostEmptyColumn("GRASSLAND");
    const wetlandColumn = player.board.getLeftmostEmptyColumn("WETLAND");

    const forestBonus = boardConfig.forest.bonusRewards[forestColumn];
    const grasslandBonus = boardConfig.grassland.bonusRewards[grasslandColumn];
    const wetlandBonus = boardConfig.wetland.bonusRewards[wetlandColumn];

    // PLAY_BIRD: Only eligible if player can play at least one bird
    if (player.canPlayAnyBird(boardConfig)) {
      eligibleActions.push("PLAY_BIRD");
      rewardsByAction.PLAY_BIRD = {
        reward: { type: "CARDS" as Resource, count: 0 },
      };
    }

    // GAIN_FOOD: Always eligible (can take food action even if feeder empty - triggers reroll)
    eligibleActions.push("GAIN_FOOD");
    rewardsByAction.GAIN_FOOD = {
      reward: {
        type: "FOOD" as Resource,
        count: boardConfig.forest.baseRewards[forestColumn],
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
    };

    // LAY_EGGS: Only eligible if player has at least one bird on their board
    const hasBirdsOnBoard = player.board.getAllBirds().length > 0;
    if (hasBirdsOnBoard) {
      eligibleActions.push("LAY_EGGS");
      rewardsByAction.LAY_EGGS = {
        reward: {
          type: "EGGS" as Resource,
          count: boardConfig.grassland.baseRewards[grasslandColumn],
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
      };
    }

    // DRAW_CARDS: Always eligible
    eligibleActions.push("DRAW_CARDS");
    rewardsByAction.DRAW_CARDS = {
      reward: {
        type: "CARDS" as Resource,
        count: boardConfig.wetland.baseRewards[wetlandColumn],
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
    };

    return { eligibleActions, rewardsByAction: rewardsByAction as RewardsByAction };
  }
}

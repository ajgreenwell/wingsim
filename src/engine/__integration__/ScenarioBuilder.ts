/**
 * ScenarioBuilder - Constructs a fully configured GameEngine from a declarative scenario configuration.
 *
 * Used for deterministic integration testing where we need to set up specific game states
 * and control all agent decisions via scripted choices.
 */

import type { DataRegistry } from "../../data/DataRegistry.js";
import type {
  BirdCard,
  BirdCardId,
  BirdInstance,
  BonusCard,
  BonusCardId,
  DieFace,
  FoodByType,
  Habitat,
  PlayerId,
} from "../../types/core.js";
import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import { PlayerBoard } from "../PlayerBoard.js";
import { Birdfeeder } from "../Birdfeeder.js";
import { BirdCardSupply } from "../BirdCardSupply.js";
import { DiscardableDeck } from "../DiscardableDeck.js";
import { Rng } from "../../util/Rng.js";
import { ScriptedAgent, type ScriptedChoice } from "./ScriptedAgent.js";

/**
 * A bird placement on the board.
 */
export interface ScenarioBirdPlacement {
  /** The bird card ID */
  cardId: BirdCardId;
  /** Initial eggs on this bird (default: 0) */
  eggs?: number;
  /** Initial cached food (default: empty) */
  cachedFood?: FoodByType;
  /** Initial tucked cards (default: empty) */
  tuckedCards?: BirdCardId[];
}

/**
 * Board configuration for a player.
 * Birds are placed left-to-right in each habitat.
 */
export interface ScenarioBoardConfig {
  FOREST: ScenarioBirdPlacement[];
  GRASSLAND: ScenarioBirdPlacement[];
  WETLAND: ScenarioBirdPlacement[];
}

/**
 * Configuration for a single player in a scenario.
 * Note: Player scripts are defined separately in the `turns` field of ScenarioConfig
 * to make the game flow and turn order explicit.
 */
export interface ScenarioPlayerConfig {
  /** Player ID (used throughout scenario) */
  id: PlayerId;

  /** Bird cards in player's hand at scenario start */
  hand: BirdCardId[];

  /** Bonus cards held by player */
  bonusCards: BonusCardId[];

  /** Player's food supply */
  food: FoodByType;

  /**
   * Birds already on the player's board.
   * Each entry specifies bird card ID and optional initial state.
   */
  board: ScenarioBoardConfig;
}

/**
 * A turn block in the scenario script.
 * Each block represents a sequence of choices made by a single player.
 *
 * Turn blocks are processed in order. When the engine prompts a player,
 * the runner finds the next unprocessed turn block for that player and
 * consumes choices from it.
 *
 * This design makes the game flow explicit and readable:
 * - You can see exactly when control switches between players
 * - Pink power responses during another player's turn get their own block
 * - The order of blocks matches the actual execution order
 */
export interface ScenarioTurn {
  /** Which player this turn block belongs to */
  player: PlayerId;

  /**
   * Optional label for documentation/debugging.
   * Examples: "Turn 1", "Pink power response", "Between-turn trigger"
   */
  label?: string;

  /** The choices this player will make during this block */
  choices: ScriptedChoice[];
}

/**
 * Full scenario configuration.
 */
export interface ScenarioConfig {
  /** Human-readable scenario name (used in test output) */
  name: string;

  /** Optional description explaining what the scenario tests */
  description?: string;

  /**
   * Handler IDs this scenario is designed to test.
   * Used for coverage tracking and documentation.
   */
  targetHandlers: string[];

  /** Player configurations (2-5 players) */
  players: ScenarioPlayerConfig[];

  /**
   * The sequence of turn blocks that define the scenario script.
   * Each block specifies a player and the choices they will make.
   *
   * Blocks are consumed in order as the game executes. When a player
   * is prompted, the runner uses choices from their next unprocessed block.
   *
   * This makes the game flow explicit and readable, especially for
   * scenarios involving pink powers that trigger during other players' turns.
   */
  turns: ScenarioTurn[];

  /**
   * Initial birdfeeder dice configuration.
   * Array of 5 DieFace values (or fewer if some dice are "taken").
   */
  birdfeeder: DieFace[];

  /**
   * Initial bird tray configuration (3 cards, or null for empty slot).
   * If not specified, tray is filled normally from deck.
   */
  birdTray?: (BirdCardId | null)[];

  /**
   * Specific cards to place at top of deck in order.
   * First card in array is drawn first.
   * Useful for scenarios that draw from deck.
   */
  deckTopCards?: BirdCardId[];

  /**
   * Specific bonus cards to place at top of bonus deck.
   */
  bonusDeckTopCards?: BonusCardId[];

  /**
   * Game round to start at (default: 1).
   * Useful for testing round-specific behavior.
   */
  startRound?: number;

  /**
   * Starting turn number (default: 1).
   */
  startTurn?: number;

  /**
   * Index of the starting active player (default: 0).
   */
  startingPlayerIndex?: number;

  /**
   * Number of turns to run (default: 1).
   * Set higher for multi-turn scenarios.
   */
  turnsToRun?: number;

  /**
   * Seed for any remaining randomness (e.g., shuffled portions of deck).
   * Default: 12345 (deterministic).
   */
  seed?: number;
}

/**
 * Result of building a scenario, ready for execution.
 */
export interface BuiltScenario {
  /** The configured GameState */
  gameState: GameState;

  /** ScriptedAgents for each player, in order */
  agents: ScriptedAgent[];

  /** The original configuration (for reference) */
  config: ScenarioConfig;
}

/**
 * Builds a GameState and agents from a scenario configuration.
 */
export class ScenarioBuilder {
  private readonly registry: DataRegistry;

  constructor(registry: DataRegistry) {
    this.registry = registry;
  }

  /**
   * Build a scenario into a runnable GameState + agents.
   *
   * Processing:
   * 1. Groups turn blocks by player to create per-player choice queues
   * 2. Creates ScriptedAgents that consume choices from their queues
   * 3. Creates PlayerState objects with specified hands/boards/food
   * 4. Removes all dealt cards from the bird deck
   * 5. Removes all dealt bonus cards from the bonus deck
   * 6. Optionally stacks top of decks with specified cards
   * 7. Sets up birdfeeder with specified dice
   * 8. Creates GameState with prepared state
   */
  build(config: ScenarioConfig): BuiltScenario {
    const seed = config.seed ?? 12345;
    const rng = new Rng(seed);

    // 1. Group turn blocks by player to create per-player choice queues
    const choicesByPlayer = this.groupTurnsByPlayer(config.turns);

    // 2. Create ScriptedAgents
    const agents: ScriptedAgent[] = config.players.map((playerConfig) => {
      const script = choicesByPlayer.get(playerConfig.id) ?? [];
      return new ScriptedAgent({
        playerId: playerConfig.id,
        script,
      });
    });

    // 3. Collect all dealt cards to remove from decks
    const { dealtBirdCards, dealtBonusCards } = this.collectDealtCards(config);

    // 4. Create player states with specified hands/boards/food
    const players = this.createPlayerStates(config.players);

    // 5. Create bird card supply with dealt cards removed and deck stacked
    const birdCardSupply = this.createBirdCardSupply(
      dealtBirdCards,
      config.deckTopCards ?? [],
      config.birdTray,
      rng
    );

    // 6. Create bonus card deck with dealt cards removed and deck stacked
    const bonusCardDeck = this.createBonusCardDeck(
      dealtBonusCards,
      config.bonusDeckTopCards ?? [],
      rng
    );

    // 7. Create birdfeeder with specified dice
    const birdfeeder = this.createBirdfeeder(config.birdfeeder, rng);

    // 8. Select round goals (just use first 4 for scenarios)
    const roundGoals = this.registry.getAllRoundGoalIds().slice(0, 4);

    // 9. Create GameState
    const gameState = new GameState({
      players,
      activePlayerIndex: config.startingPlayerIndex ?? 0,
      birdfeeder,
      birdCardSupply,
      bonusCardDeck,
      roundGoals,
      round: config.startRound ?? 1,
      turn: config.startTurn ?? 1,
    });

    return {
      gameState,
      agents,
      config,
    };
  }

  /**
   * Group turn blocks by player to create per-player choice queues.
   * Choices within each player's queue maintain the order they appear in `turns`.
   */
  private groupTurnsByPlayer(
    turns: ScenarioTurn[]
  ): Map<PlayerId, ScriptedChoice[]> {
    const choicesByPlayer = new Map<PlayerId, ScriptedChoice[]>();

    for (const turn of turns) {
      const existing = choicesByPlayer.get(turn.player) ?? [];
      choicesByPlayer.set(turn.player, [...existing, ...turn.choices]);
    }

    return choicesByPlayer;
  }

  /**
   * Collect all cards that have been dealt to players, tray, or deck top.
   * These need to be removed from the main decks.
   */
  private collectDealtCards(config: ScenarioConfig): {
    dealtBirdCards: Set<BirdCardId>;
    dealtBonusCards: Set<BonusCardId>;
  } {
    const dealtBirdCards = new Set<BirdCardId>();
    const dealtBonusCards = new Set<BonusCardId>();

    for (const player of config.players) {
      // Cards in hand
      for (const cardId of player.hand) {
        dealtBirdCards.add(cardId);
      }

      // Cards on board
      for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
        for (const placement of player.board[habitat]) {
          dealtBirdCards.add(placement.cardId);
          // Tucked cards are also bird cards
          for (const tuckedId of placement.tuckedCards ?? []) {
            dealtBirdCards.add(tuckedId);
          }
        }
      }

      // Bonus cards held by player
      for (const cardId of player.bonusCards) {
        dealtBonusCards.add(cardId);
      }
    }

    // Cards in tray
    if (config.birdTray) {
      for (const cardId of config.birdTray) {
        if (cardId) {
          dealtBirdCards.add(cardId);
        }
      }
    }

    // Cards stacked on deck
    if (config.deckTopCards) {
      for (const cardId of config.deckTopCards) {
        dealtBirdCards.add(cardId);
      }
    }

    // Bonus cards stacked on deck
    if (config.bonusDeckTopCards) {
      for (const cardId of config.bonusDeckTopCards) {
        dealtBonusCards.add(cardId);
      }
    }

    return { dealtBirdCards, dealtBonusCards };
  }

  /**
   * Create PlayerState objects from scenario player configs.
   */
  private createPlayerStates(playerConfigs: ScenarioPlayerConfig[]): PlayerState[] {
    return playerConfigs.map((config) => {
      // Create bird instances for the board
      const board = this.createPlayerBoard(config.id, config.board);

      // Look up bird cards for hand
      const hand: BirdCard[] = config.hand.map((cardId) =>
        this.registry.getBirdById(cardId)
      );

      // Look up bonus cards
      const bonusCards: BonusCard[] = config.bonusCards.map((cardId) =>
        this.registry.getBonusCardById(cardId)
      );

      return PlayerState.from(config.id, {
        hand,
        bonusCards,
        food: { ...config.food },
        turnsRemaining: 8, // Default, can be adjusted if needed
        board,
      });
    });
  }

  /**
   * Create a PlayerBoard from scenario board config.
   */
  private createPlayerBoard(
    playerId: PlayerId,
    boardConfig: ScenarioBoardConfig
  ): PlayerBoard {
    const data: Record<Habitat, Array<BirdInstance | null>> = {
      FOREST: Array(5).fill(null),
      GRASSLAND: Array(5).fill(null),
      WETLAND: Array(5).fill(null),
    };

    for (const habitat of ["FOREST", "GRASSLAND", "WETLAND"] as Habitat[]) {
      const placements = boardConfig[habitat];
      for (let i = 0; i < placements.length && i < 5; i++) {
        const placement = placements[i];
        const card = this.registry.getBirdById(placement.cardId);

        const birdInstance: BirdInstance = {
          id: `${playerId}_${placement.cardId}`,
          card,
          eggs: placement.eggs ?? 0,
          cachedFood: { ...(placement.cachedFood ?? {}) },
          tuckedCards: [...(placement.tuckedCards ?? [])],
        };

        data[habitat][i] = birdInstance;
      }
    }

    return PlayerBoard.from(data);
  }

  /**
   * Create a BirdCardSupply with:
   * - Dealt cards removed from the deck
   * - Specific cards stacked on top of the deck
   * - Specific cards in the tray (or filled from deck)
   */
  private createBirdCardSupply(
    dealtCards: Set<BirdCardId>,
    deckTopCards: BirdCardId[],
    trayConfig: (BirdCardId | null)[] | undefined,
    rng: Rng
  ): BirdCardSupply {
    // Get all birds, filtering out dealt ones and deck top cards
    const allBirds = this.registry.getAllBirds();
    const excludedCards = new Set([...dealtCards, ...deckTopCards]);
    const remainingBirds = allBirds.filter((b) => !excludedCards.has(b.id));

    // Create the supply with remaining cards (shuffled)
    const supply = new BirdCardSupply(remainingBirds, rng);

    // Stack the deck top cards (first in array = first drawn = top of deck)
    // We need to "unshift" them onto the deck in reverse order
    // Since BirdCardSupply doesn't expose deck manipulation, we'll use a workaround:
    // Create a custom supply using BirdCardSupplyWithPreset
    if (deckTopCards.length > 0 || trayConfig) {
      return this.createPresetBirdCardSupply(
        remainingBirds,
        deckTopCards,
        trayConfig,
        rng
      );
    }

    // Fill tray if no specific config
    supply.refillTray();
    return supply;
  }

  /**
   * Create a BirdCardSupply with preset deck order and tray.
   */
  private createPresetBirdCardSupply(
    remainingBirds: readonly BirdCard[],
    deckTopCards: BirdCardId[],
    trayConfig: (BirdCardId | null)[] | undefined,
    rng: Rng
  ): BirdCardSupply {
    // Shuffle remaining birds first
    const shuffledRemaining = rng.shuffle(remainingBirds);

    // Build the final deck: deckTopCards at front, then shuffled remaining
    const topCards = deckTopCards.map((id) => this.registry.getBirdById(id));
    const finalDeck = [...topCards, ...shuffledRemaining];

    // Create supply with the custom deck order
    // We'll use a workaround: create with empty array, then manually set up
    // Actually, BirdCardSupply shuffles in constructor, so we need a different approach

    // Create a custom BirdCardSupply that accepts pre-ordered cards
    return createPresetBirdCardSupply(
      finalDeck,
      trayConfig ? this.resolveTrayConfig(trayConfig) : undefined,
      rng
    );
  }

  /**
   * Resolve tray config to actual BirdCards.
   */
  private resolveTrayConfig(
    trayConfig: (BirdCardId | null)[]
  ): (BirdCard | null)[] {
    return trayConfig.map((cardId) =>
      cardId ? this.registry.getBirdById(cardId) : null
    );
  }

  /**
   * Create a bonus card deck with dealt cards removed and deck stacked.
   */
  private createBonusCardDeck(
    dealtCards: Set<BonusCardId>,
    deckTopCards: BonusCardId[],
    rng: Rng
  ): DiscardableDeck<BonusCard> {
    // Get all bonus cards, filtering out dealt ones and deck top cards
    const allBonusCards = this.registry.getAllBonusCards();
    const excludedCards = new Set([...dealtCards, ...deckTopCards]);
    const remainingCards = allBonusCards.filter((c) => !excludedCards.has(c.id));

    if (deckTopCards.length > 0) {
      // Build custom deck order
      const topCards = deckTopCards.map((id) =>
        this.registry.getBonusCardById(id)
      );
      const shuffledRemaining = rng.shuffle(remainingCards);
      const finalDeck = [...topCards, ...shuffledRemaining];

      return createPresetDiscardableDeck(finalDeck);
    }

    return new DiscardableDeck(remainingCards, rng);
  }

  /**
   * Create a Birdfeeder with specific dice.
   */
  private createBirdfeeder(dice: DieFace[], rng: Rng): Birdfeeder {
    return createPresetBirdfeeder(dice, rng);
  }
}

/**
 * Factory function to create a BirdCardSupply with preset deck order and tray.
 * Uses duck-typing to create an object that matches the BirdCardSupply interface.
 */
function createPresetBirdCardSupply(
  orderedDeck: readonly BirdCard[],
  presetTray?: (BirdCard | null)[],
  rng?: Rng
): BirdCardSupply {
  const deck = [...orderedDeck];
  const tray: (BirdCard | null)[] = presetTray ?? [null, null, null];
  const discard: BirdCard[] = [];

  const supply = {
    drawFromDeck(count: number): BirdCard[] {
      const drawn: BirdCard[] = [];
      for (let i = 0; i < count; i++) {
        if (deck.length === 0) {
          if (discard.length === 0) {
            throw new Error("All cards are in use");
          }
          deck.push(...(rng ? rng.shuffle(discard) : discard));
          discard.length = 0;
        }
        drawn.push(deck.shift()!);
      }
      return drawn;
    },

    takeFromTray(index: number): BirdCard {
      if (index < 0 || index >= 3) {
        throw new Error(`Invalid tray index: ${index}. Must be 0, 1, or 2.`);
      }
      const card = tray[index];
      if (card === null) {
        throw new Error(`No card at tray index ${index}`);
      }
      tray[index] = null;
      return card;
    },

    refillTray(): void {
      for (let i = 0; i < 3; i++) {
        if (tray[i] === null && deck.length > 0) {
          tray[i] = deck.shift()!;
        }
      }
    },

    discardCards(cards: readonly BirdCard[]): void {
      discard.push(...cards);
    },

    getTray(): readonly (BirdCard | null)[] {
      return tray;
    },

    getDeckSize(): number {
      return deck.length;
    },

    getDiscardSize(): number {
      return discard.length;
    },
  };

  if (!presetTray) {
    supply.refillTray();
  }

  return supply as unknown as BirdCardSupply;
}

/**
 * Factory function to create a DiscardableDeck with preset order (no shuffling).
 * Uses duck-typing to create an object that matches the DiscardableDeck interface.
 */
function createPresetDiscardableDeck<T>(orderedDeck: readonly T[]): DiscardableDeck<T> {
  const deck = [...orderedDeck];
  const discard: T[] = [];

  const deckObj = {
    draw(count: number): T[] {
      if (count < 0) {
        throw new Error(`count must be non-negative, got ${count}`);
      }
      const drawn: T[] = [];
      for (let i = 0; i < count; i++) {
        if (deck.length === 0) {
          if (discard.length === 0) {
            throw new Error("All cards are in use");
          }
          deck.push(...discard);
          discard.length = 0;
        }
        drawn.push(deck.shift()!);
      }
      return drawn;
    },

    discardItems(items: readonly T[]): void {
      discard.push(...items);
    },

    getDeckSize(): number {
      return deck.length;
    },

    getDiscardSize(): number {
      return discard.length;
    },
  };

  return deckObj as unknown as DiscardableDeck<T>;
}

/**
 * Factory function to create a Birdfeeder with preset dice.
 * Uses duck-typing to create an object that matches the Birdfeeder interface.
 */
function createPresetBirdfeeder(dice: DieFace[], rng: Rng): Birdfeeder {
  const DIE_FACES: DieFace[] = [
    "INVERTEBRATE",
    "SEED",
    "FISH",
    "FRUIT",
    "RODENT",
    "SEED_INVERTEBRATE",
  ];
  const diceInFeeder = [...dice];

  const feeder = {
    takeDie(face: DieFace): DieFace {
      const index = diceInFeeder.indexOf(face);
      if (index === -1) {
        throw new Error(`No die showing ${face} in birdfeeder`);
      }
      diceInFeeder.splice(index, 1);
      if (diceInFeeder.length === 0) {
        diceInFeeder.push(...rng.pickManyWithReplacement(DIE_FACES, 5));
      }
      return face;
    },

    rollOutsideFeeder(count: number): DieFace[] {
      if (count < 0) {
        throw new Error(`count must be non-negative, got ${count}`);
      }
      if (count === 0) {
        return [];
      }
      return rng.pickManyWithReplacement(DIE_FACES, count);
    },

    rollAll(): void {
      diceInFeeder.length = 0;
      diceInFeeder.push(...rng.pickManyWithReplacement(DIE_FACES, 5));
    },

    canRerollAll(): boolean {
      if (diceInFeeder.length === 0) {
        return false;
      }
      if (diceInFeeder.length === 1) {
        return true;
      }
      const firstFace = diceInFeeder[0];
      return diceInFeeder.every((f) => f === firstFace);
    },

    rerollAll(): void {
      if (!feeder.canRerollAll()) {
        throw new Error("Cannot reroll: dice do not all show the same face");
      }
      const count = diceInFeeder.length;
      diceInFeeder.length = 0;
      diceInFeeder.push(...rng.pickManyWithReplacement(DIE_FACES, count));
    },

    getDiceInFeeder(): readonly DieFace[] {
      return diceInFeeder;
    },

    getCount(): number {
      return diceInFeeder.length;
    },
  };

  return feeder as unknown as Birdfeeder;
}

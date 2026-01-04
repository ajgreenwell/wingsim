import type { DieFace } from "../types/core.js";
import type { Rng } from "../util/Rng.js";

const TOTAL_DICE = 5;

const DIE_FACES: readonly DieFace[] = [
  "INVERTEBRATE",
  "SEED",
  "FISH",
  "FRUIT",
  "RODENT",
  "SEED_INVERTEBRATE",
] as const;

/**
 * Manages the 5 food dice in the birdfeeder.
 */
export class Birdfeeder {
  private readonly rng: Rng;
  private diceInFeeder: DieFace[];

  constructor(rng: Rng) {
    this.rng = rng;
    this.diceInFeeder = [];
    this.rollAll();
  }

  /**
   * Take a die showing the specified face from the feeder.
   * Throws if no die with that face is present.
   * If this was the last die, automatically rerolls all dice.
   */
  takeDie(face: DieFace): DieFace {
    const index = this.diceInFeeder.indexOf(face);
    if (index === -1) {
      throw new Error(`No die showing ${face} in birdfeeder`);
    }

    this.diceInFeeder.splice(index, 1);

    // Auto-reroll when feeder becomes empty
    if (this.diceInFeeder.length === 0) {
      this.rollAll();
    }

    return face;
  }

  /**
   * Roll dice outside the feeder (for hunting/fishing powers).
   * These dice are independent of the feeder state.
   */
  rollOutsideFeeder(count: number): DieFace[] {
    if (count < 0) {
      throw new Error(`count must be non-negative, got ${count}`);
    }
    if (count === 0) {
      return [];
    }
    return this.rng.pickManyWithReplacement(DIE_FACES, count);
  }

  /**
   * Roll all 5 dice and place them in the feeder.
   */
  rollAll(): void {
    this.diceInFeeder = this.rng.pickManyWithReplacement(DIE_FACES, TOTAL_DICE);
  }

  /**
   * Check if all dice in the feeder show the same face.
   * Returns true if only 1 die remains (per game rules).
   * Returns false if feeder is empty.
   */
  canRerollAll(): boolean {
    if (this.diceInFeeder.length === 0) {
      return false;
    }
    if (this.diceInFeeder.length === 1) {
      return true;
    }
    const firstFace = this.diceInFeeder[0];
    return this.diceInFeeder.every((face) => face === firstFace);
  }

  /**
   * Reroll all dice in the feeder if allowed (all show same face or only 1 remains).
   * Throws if reroll is not allowed.
   */
  rerollAll(): void {
    if (!this.canRerollAll()) {
      throw new Error("Cannot reroll: dice do not all show the same face");
    }
    const count = this.diceInFeeder.length;
    this.diceInFeeder = this.rng.pickManyWithReplacement(DIE_FACES, count);
  }

  /**
   * Get the faces of dice currently in the feeder.
   */
  getDiceInFeeder(): readonly DieFace[] {
    return this.diceInFeeder;
  }

  /**
   * Get the number of dice in the feeder.
   */
  getCount(): number {
    return this.diceInFeeder.length;
  }
}

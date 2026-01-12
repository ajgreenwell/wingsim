/**
 * PlayerBoard encapsulates a player's board (the 3 habitat rows) with query methods.
 *
 * This class provides methods for querying birds, slots, and board state
 * without exposing the internal data structure directly.
 */

import type {
  BirdInstance,
  BirdInstanceId,
  Habitat,
  NestType,
} from "../types/core.js";

const HABITATS: Habitat[] = ["FOREST", "GRASSLAND", "WETLAND"];
const HABITAT_SIZE = 5;

export class PlayerBoard {
  private readonly slots: Record<Habitat, Array<BirdInstance | null>>;

  private constructor(slots: Record<Habitat, Array<BirdInstance | null>>) {
    this.slots = slots;
  }

  /**
   * Create an empty player board with 5 empty slots per habitat.
   */
  static empty(): PlayerBoard {
    return new PlayerBoard({
      FOREST: Array(HABITAT_SIZE).fill(null),
      GRASSLAND: Array(HABITAT_SIZE).fill(null),
      WETLAND: Array(HABITAT_SIZE).fill(null),
    });
  }

  /**
   * Create a PlayerBoard from existing board data.
   */
  static from(data: Record<Habitat, Array<BirdInstance | null>>): PlayerBoard {
    return new PlayerBoard({
      FOREST: [...data.FOREST],
      GRASSLAND: [...data.GRASSLAND],
      WETLAND: [...data.WETLAND],
    });
  }

  /**
   * Get the leftmost empty column in a habitat (0-4), or HABITAT_SIZE (5) if full.
   */
  getLeftmostEmptyColumn(habitat: Habitat): number {
    const row = this.slots[habitat];
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
  getBirdsWithBrownPowers(habitat: Habitat): BirdInstanceId[] {
    const birds: BirdInstanceId[] = [];
    const row = this.slots[habitat];
    // Right to left order (rightmost bird activates first)
    for (let i = row.length - 1; i >= 0; i--) {
      const bird = row[i];
      if (bird && bird.card.power?.trigger === "WHEN_ACTIVATED") {
        birds.push(bird.id);
      }
    }
    return birds;
  }

  /**
   * Find a bird instance on this board by ID.
   */
  findBirdInstance(birdInstanceId: BirdInstanceId): BirdInstance | null {
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
        if (bird?.id === birdInstanceId) {
          return bird;
        }
      }
    }
    return null;
  }

  /**
   * Find which habitat a bird is in, or null if not found.
   */
  getBirdHabitat(birdInstanceId: BirdInstanceId): Habitat | null {
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
        if (bird?.id === birdInstanceId) {
          return habitat;
        }
      }
    }
    return null;
  }

  /**
   * Get all birds on the board.
   */
  getAllBirds(): BirdInstance[] {
    const birds: BirdInstance[] = [];
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
        if (bird) {
          birds.push(bird);
        }
      }
    }
    return birds;
  }

  /**
   * Get all birds in a specific habitat.
   */
  getBirdsInHabitat(habitat: Habitat): BirdInstance[] {
    return this.slots[habitat].filter((b): b is BirdInstance => b !== null);
  }

  /**
   * Get remaining egg capacities for all birds on the board.
   * Only includes birds with remaining capacity > 0.
   */
  getRemainingEggCapacities(): Record<BirdInstanceId, number> {
    const capacities: Record<BirdInstanceId, number> = {};
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
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
  getEggsOnBirds(): Record<BirdInstanceId, number> {
    const eggs: Record<BirdInstanceId, number> = {};
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
        if (bird && bird.eggs > 0) {
          eggs[bird.id] = bird.eggs;
        }
      }
    }
    return eggs;
  }

  /**
   * Find all birds on the board with a specific nest type.
   * Optionally exclude a specific bird instance.
   * WILD nest type matches any nest type.
   */
  getBirdsWithNestType(
    nestType: NestType,
    excludeId?: BirdInstanceId
  ): BirdInstance[] {
    const result: BirdInstance[] = [];
    for (const habitat of HABITATS) {
      for (const bird of this.slots[habitat]) {
        if (bird && bird.id !== excludeId) {
          if (bird.card.nestType === nestType || bird.card.nestType === "WILD") {
            result.push(bird);
          }
        }
      }
    }
    return result;
  }

  /**
   * Count the number of birds in a specific habitat.
   */
  countBirdsInHabitat(habitat: Habitat): number {
    return this.slots[habitat].filter((b) => b !== null).length;
  }

  /**
   * Get the bird at a specific slot (habitat + column).
   */
  getSlot(habitat: Habitat, column: number): BirdInstance | null {
    return this.slots[habitat][column] ?? null;
  }

  /**
   * Set the bird at a specific slot (habitat + column).
   * Used by GameEngine for mutations.
   */
  setSlot(habitat: Habitat, column: number, bird: BirdInstance | null): void {
    this.slots[habitat][column] = bird;
  }

  /**
   * Get all slots in a habitat as a readonly array.
   */
  getHabitat(habitat: Habitat): ReadonlyArray<BirdInstance | null> {
    return this.slots[habitat];
  }

  /**
   * Remove a bird from a habitat and return it.
   * Used for MOVE_BIRD effects.
   * Throws if the bird is not found in the specified habitat.
   */
  removeBird(birdInstanceId: BirdInstanceId, habitat: Habitat): BirdInstance {
    const row = this.slots[habitat];
    for (let i = 0; i < row.length; i++) {
      if (row[i]?.id === birdInstanceId) {
        const bird = row[i]!;
        row[i] = null;
        return bird;
      }
    }
    throw new Error(
      `Bird "${birdInstanceId}" not found in ${habitat} habitat`
    );
  }

  /**
   * Convert to a plain record (for serialization or compatibility).
   */
  toRecord(): Record<Habitat, Array<BirdInstance | null>> {
    return {
      FOREST: [...this.slots.FOREST],
      GRASSLAND: [...this.slots.GRASSLAND],
      WETLAND: [...this.slots.WETLAND],
    };
  }
}

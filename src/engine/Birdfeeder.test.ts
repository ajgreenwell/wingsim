import { describe, it, expect } from "vitest";
import { Birdfeeder } from "./Birdfeeder.js";
import { Rng } from "../util/Rng.js";
import type { DieFace } from "../types/core.js";

describe("Birdfeeder", () => {
  describe("constructor", () => {
    it("initializes with 5 rolled dice", () => {
      const feeder = new Birdfeeder(new Rng(42));
      expect(feeder.getCount()).toBe(5);
    });

    it("same seed produces same initial dice", () => {
      const feeder1 = new Birdfeeder(new Rng(42));
      const feeder2 = new Birdfeeder(new Rng(42));

      expect(feeder1.getDiceInFeeder()).toEqual(feeder2.getDiceInFeeder());
    });

    it("different seeds produce different dice", () => {
      const feeder1 = new Birdfeeder(new Rng(42));
      const feeder2 = new Birdfeeder(new Rng(99));

      // With high probability, these will differ
      expect(feeder1.getDiceInFeeder()).not.toEqual(feeder2.getDiceInFeeder());
    });
  });

  describe("takeDie()", () => {
    it("removes the correct die from feeder", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const dice = feeder.getDiceInFeeder();
      const faceToTake = dice[0];

      const countBefore = dice.filter((f) => f === faceToTake).length;
      feeder.takeDie(faceToTake);
      const countAfter = feeder
        .getDiceInFeeder()
        .filter((f) => f === faceToTake).length;

      expect(countAfter).toBe(countBefore - 1);
    });

    it("returns the taken face", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const faceToTake = feeder.getDiceInFeeder()[0];

      const result = feeder.takeDie(faceToTake);
      expect(result).toBe(faceToTake);
    });

    it("throws when face is not present", () => {
      // Find a seed that gives us dice without FISH
      const feeder = new Birdfeeder(new Rng(12345));
      const dice = feeder.getDiceInFeeder();

      // Find a face that's not in the feeder
      const allFaces: DieFace[] = [
        "INVERTEBRATE",
        "SEED",
        "FISH",
        "FRUIT",
        "RODENT",
        "SEED_INVERTEBRATE",
      ];
      const missingFace = allFaces.find((f) => !dice.includes(f));

      if (missingFace) {
        expect(() => feeder.takeDie(missingFace)).toThrow(
          `No die showing ${missingFace} in birdfeeder`
        );
      }
    });

    it("auto-rerolls all dice when last die is taken", () => {
      const feeder = new Birdfeeder(new Rng(42));

      // Take 4 dice
      for (let i = 0; i < 4; i++) {
        const dice = feeder.getDiceInFeeder();
        feeder.takeDie(dice[0]);
      }

      expect(feeder.getCount()).toBe(1);

      // Take the last die - should trigger auto-reroll
      const lastDie = feeder.getDiceInFeeder()[0];
      feeder.takeDie(lastDie);

      // Should now have 5 dice again
      expect(feeder.getCount()).toBe(5);
    });
  });

  describe("rollOutsideFeeder()", () => {
    it("returns correct number of dice", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const rolled = feeder.rollOutsideFeeder(3);

      expect(rolled).toHaveLength(3);
    });

    it("does not affect dice in feeder", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const diceBefore = [...feeder.getDiceInFeeder()];

      feeder.rollOutsideFeeder(3);

      expect(feeder.getDiceInFeeder()).toEqual(diceBefore);
    });

    it("returns empty array for count 0", () => {
      const feeder = new Birdfeeder(new Rng(42));
      expect(feeder.rollOutsideFeeder(0)).toEqual([]);
    });

    it("throws on negative count", () => {
      const feeder = new Birdfeeder(new Rng(42));
      expect(() => feeder.rollOutsideFeeder(-1)).toThrow(
        "count must be non-negative"
      );
    });

    it("is deterministic with same seed", () => {
      const rng1 = new Rng(42);
      const rng2 = new Rng(42);

      const feeder1 = new Birdfeeder(rng1);
      const feeder2 = new Birdfeeder(rng2);

      const rolled1 = feeder1.rollOutsideFeeder(3);
      const rolled2 = feeder2.rollOutsideFeeder(3);

      expect(rolled1).toEqual(rolled2);
    });
  });

  describe("rollAll()", () => {
    it("resets to 5 dice", () => {
      const feeder = new Birdfeeder(new Rng(42));

      // Remove some dice
      for (let i = 0; i < 3; i++) {
        const dice = feeder.getDiceInFeeder();
        feeder.takeDie(dice[0]);
      }

      feeder.rollAll();
      expect(feeder.getCount()).toBe(5);
    });

    it("produces valid die faces", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const validFaces: DieFace[] = [
        "INVERTEBRATE",
        "SEED",
        "FISH",
        "FRUIT",
        "RODENT",
        "SEED_INVERTEBRATE",
      ];

      const dice = feeder.getDiceInFeeder();
      dice.forEach((face) => {
        expect(validFaces).toContain(face);
      });
    });
  });

  describe("canRerollAll()", () => {
    it("returns true when all dice show same face", () => {
      // We need to find a seed that produces all same faces
      // This is rare, so we'll manipulate to test the logic
      const feeder = new Birdfeeder(new Rng(42));

      // Take dice until only same-faced ones remain
      const targetFace = feeder.getDiceInFeeder()[0];
      const dice = [...feeder.getDiceInFeeder()];

      for (const face of dice) {
        if (face !== targetFace) {
          feeder.takeDie(face);
        }
      }

      // Now all remaining dice show the same face
      if (feeder.getCount() > 0) {
        expect(feeder.canRerollAll()).toBe(true);
      }
    });

    it("returns true when only 1 die remains", () => {
      const feeder = new Birdfeeder(new Rng(42));

      // Take 4 dice
      for (let i = 0; i < 4; i++) {
        const dice = feeder.getDiceInFeeder();
        feeder.takeDie(dice[0]);
      }

      expect(feeder.getCount()).toBe(1);
      expect(feeder.canRerollAll()).toBe(true);
    });

    it("returns false when dice show different faces", () => {
      // Find a seed that gives different faces
      for (let seed = 0; seed < 100; seed++) {
        const feeder = new Birdfeeder(new Rng(seed));
        const dice = feeder.getDiceInFeeder();
        const uniqueFaces = new Set(dice);

        if (uniqueFaces.size > 1) {
          expect(feeder.canRerollAll()).toBe(false);
          return;
        }
      }
      // If we couldn't find a seed with different faces, skip
    });

    it("treats SEED_INVERTEBRATE as distinct face", () => {
      // Manually verify: if we have SEED and SEED_INVERTEBRATE, they're different
      const feeder = new Birdfeeder(new Rng(42));

      // Remove until we have mixed faces
      while (feeder.getCount() > 2) {
        const dice = feeder.getDiceInFeeder();
        feeder.takeDie(dice[0]);
      }

      const remaining = feeder.getDiceInFeeder();
      if (remaining.length === 2 && remaining[0] !== remaining[1]) {
        expect(feeder.canRerollAll()).toBe(false);
      }
    });
  });

  describe("rerollAll()", () => {
    it("rerolls when all dice show same face", () => {
      const feeder = new Birdfeeder(new Rng(42));

      // Remove dice until only same-faced ones remain
      const targetFace = feeder.getDiceInFeeder()[0];
      const dice = [...feeder.getDiceInFeeder()];

      for (const face of dice) {
        if (face !== targetFace) {
          feeder.takeDie(face);
        }
      }

      if (feeder.getCount() > 0 && feeder.canRerollAll()) {
        const countBefore = feeder.getCount();
        feeder.rerollAll();
        expect(feeder.getCount()).toBe(countBefore);
      }
    });

    it("throws when dice show different faces", () => {
      // Find a seed that gives different faces
      for (let seed = 0; seed < 100; seed++) {
        const feeder = new Birdfeeder(new Rng(seed));
        const dice = feeder.getDiceInFeeder();
        const uniqueFaces = new Set(dice);

        if (uniqueFaces.size > 1) {
          expect(() => feeder.rerollAll()).toThrow(
            "Cannot reroll: dice do not all show the same face"
          );
          return;
        }
      }
    });
  });

  describe("getDiceInFeeder()", () => {
    it("returns current dice state", () => {
      const feeder = new Birdfeeder(new Rng(42));
      const dice = feeder.getDiceInFeeder();

      expect(Array.isArray(dice)).toBe(true);
      expect(dice.length).toBe(5);
    });
  });

  describe("getCount()", () => {
    it("returns correct count", () => {
      const feeder = new Birdfeeder(new Rng(42));
      expect(feeder.getCount()).toBe(5);

      const face = feeder.getDiceInFeeder()[0];
      feeder.takeDie(face);

      expect(feeder.getCount()).toBe(4);
    });
  });
});

import { describe, it, expect } from "vitest";
import { Rng } from "./Rng.js";

describe("Rng", () => {
  describe("determinism", () => {
    it("same seed produces same sequence", () => {
      const rng1 = new Rng(12345);
      const rng2 = new Rng(12345);

      const items = ["a", "b", "c", "d", "e"];

      expect(rng1.shuffle(items)).toEqual(rng2.shuffle(items));
      expect(rng1.pickMany(items, 3)).toEqual(rng2.pickMany(items, 3));
      expect(rng1.pickManyWithReplacement(items, 5)).toEqual(
        rng2.pickManyWithReplacement(items, 5)
      );
    });

    it("different seeds produce different sequences", () => {
      const rng1 = new Rng(12345);
      const rng2 = new Rng(54321);

      const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

      // With high probability, these will be different
      expect(rng1.shuffle(items)).not.toEqual(rng2.shuffle(items));
    });

    it("sequential calls produce reproducible sequences", () => {
      // Record a sequence of operations
      const rng1 = new Rng(99999);
      const items = [1, 2, 3, 4, 5];
      const dice = ["A", "B", "C", "D", "E", "F"];

      const sequence1 = [
        rng1.shuffle(items),
        rng1.pickMany(items, 2),
        rng1.pickManyWithReplacement(dice, 4),
        rng1.shuffle(items),
        rng1.pickManyWithReplacement(dice, 3),
      ];

      // Replay with fresh RNG - must produce identical sequence
      const rng2 = new Rng(99999);
      const sequence2 = [
        rng2.shuffle(items),
        rng2.pickMany(items, 2),
        rng2.pickManyWithReplacement(dice, 4),
        rng2.shuffle(items),
        rng2.pickManyWithReplacement(dice, 3),
      ];

      expect(sequence1).toEqual(sequence2);
    });

    it("produces stable outputs across runs (snapshot)", () => {
      // Hardcoded expected values - if these change, determinism is broken
      const rng = new Rng(42);
      const items = ["a", "b", "c", "d", "e"];

      expect(rng.shuffle(items)).toEqual(["d", "e", "c", "b", "a"]);
      expect(rng.pickMany(items, 3)).toEqual(["d", "c", "b"]);
      expect(rng.pickManyWithReplacement(items, 5)).toEqual([
        "e",
        "d",
        "d",
        "a",
        "c",
      ]);
    });
  });

  describe("shuffle()", () => {
    it("returns a new array with same elements", () => {
      const rng = new Rng(42);
      const original = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle(original);

      expect(shuffled).not.toBe(original); // Different reference
      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.sort()).toEqual(original.sort()); // Same elements
    });

    it("does not mutate the original array", () => {
      const rng = new Rng(42);
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];

      rng.shuffle(original);

      expect(original).toEqual(copy);
    });

    it("returns empty array for empty input", () => {
      const rng = new Rng(42);
      expect(rng.shuffle([])).toEqual([]);
    });

    it("returns single-element array unchanged", () => {
      const rng = new Rng(42);
      expect(rng.shuffle([42])).toEqual([42]);
    });

    it("actually shuffles the array (not identity)", () => {
      const rng = new Rng(42);
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      // Run multiple shuffles - at least one should differ from original order
      let foundDifferent = false;
      for (let i = 0; i < 10; i++) {
        const shuffled = new Rng(i).shuffle(items);
        if (JSON.stringify(shuffled) !== JSON.stringify(items)) {
          foundDifferent = true;
          break;
        }
      }
      expect(foundDifferent).toBe(true);
    });
  });

  describe("pickMany()", () => {
    it("returns n unique items", () => {
      const rng = new Rng(42);
      const items = ["a", "b", "c", "d", "e"];
      const picked = rng.pickMany(items, 3);

      expect(picked).toHaveLength(3);
      // Check uniqueness
      expect(new Set(picked).size).toBe(3);
      // Check all items are from source
      picked.forEach((item) => expect(items).toContain(item));
    });

    it("does not mutate the source array", () => {
      const rng = new Rng(42);
      const original = ["a", "b", "c", "d", "e"];
      const copy = [...original];

      rng.pickMany(original, 3);

      expect(original).toEqual(copy);
    });

    it("throws if n > items.length", () => {
      const rng = new Rng(42);
      const items = ["a", "b", "c"];

      expect(() => rng.pickMany(items, 5)).toThrow(
        "Cannot pick 5 items from array of length 3"
      );
    });

    it("returns empty array when n is 0", () => {
      const rng = new Rng(42);
      expect(rng.pickMany(["a", "b", "c"], 0)).toEqual([]);
    });

    it("returns all items when n equals array length", () => {
      const rng = new Rng(42);
      const items = ["a", "b", "c"];
      const picked = rng.pickMany(items, 3);

      expect(picked).toHaveLength(3);
      expect(picked.sort()).toEqual(items.sort());
    });

    it("throws on negative n", () => {
      const rng = new Rng(42);
      expect(() => rng.pickMany(["a", "b"], -1)).toThrow(
        "n must be non-negative"
      );
    });
  });

  describe("pickManyWithReplacement()", () => {
    it("returns correct count", () => {
      const rng = new Rng(42);
      const items = ["a", "b", "c"];
      const picked = rng.pickManyWithReplacement(items, 10);

      expect(picked).toHaveLength(10);
    });

    it("all items are from source array", () => {
      const rng = new Rng(42);
      const items = ["a", "b", "c"];
      const picked = rng.pickManyWithReplacement(items, 100);

      picked.forEach((item) => expect(items).toContain(item));
    });

    it("allows duplicates (with replacement)", () => {
      // With 2 items and 100 picks, we must have duplicates
      const rng = new Rng(42);
      const items = ["a", "b"];
      const picked = rng.pickManyWithReplacement(items, 100);

      const counts = { a: 0, b: 0 };
      picked.forEach((item) => counts[item as "a" | "b"]++);

      // Both should appear multiple times
      expect(counts.a).toBeGreaterThan(1);
      expect(counts.b).toBeGreaterThan(1);
    });

    it("throws on empty array", () => {
      const rng = new Rng(42);
      expect(() => rng.pickManyWithReplacement([], 5)).toThrow(
        "Cannot pick from empty array"
      );
    });

    it("returns empty array when n is 0", () => {
      const rng = new Rng(42);
      expect(rng.pickManyWithReplacement(["a", "b"], 0)).toEqual([]);
    });

    it("throws on negative n", () => {
      const rng = new Rng(42);
      expect(() => rng.pickManyWithReplacement(["a", "b"], -1)).toThrow(
        "n must be non-negative"
      );
    });

    it("works with single-element array", () => {
      const rng = new Rng(42);
      const picked = rng.pickManyWithReplacement(["only"], 5);

      expect(picked).toEqual(["only", "only", "only", "only", "only"]);
    });
  });

  describe("seed normalization", () => {
    it("handles negative seeds", () => {
      const rng = new Rng(-42);
      expect(rng.seed).toBeGreaterThanOrEqual(0);
      // Should not throw
      expect(rng.shuffle([1, 2, 3])).toHaveLength(3);
    });

    it("handles floating point seeds", () => {
      const rng = new Rng(42.999);
      expect(rng.seed).toBe(42);
    });

    it("handles very large seeds", () => {
      const rng = new Rng(Number.MAX_SAFE_INTEGER);
      // Should not throw
      expect(rng.shuffle([1, 2, 3])).toHaveLength(3);
    });
  });
});

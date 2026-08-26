import { describe, expect, it } from "vitest";

import { MtRandom, mtTiles } from "../../src/play/scramble.js";

// Golden values generated with the original Python implementation.
describe("mtTiles", () => {
  it("matches Python _mt_tiles output", () => {
    expect(mtTiles(0x1234567, 10)).toEqual([2, 8, 7, 6, 9, 1, 3, 5, 0, 4]);
    expect(mtTiles(0, 16)).toEqual([
      2, 12, 0, 6, 1, 14, 4, 3, 11, 5, 9, 7, 13, 10, 15, 8,
    ]);
    expect(mtTiles(0xabcdef, 32)).toEqual([
      30, 22, 0, 2, 5, 12, 28, 20, 25, 6, 14, 21, 4, 18, 3, 15, 31, 10, 17, 11,
      13, 8, 1, 19, 7, 23, 29, 27, 9, 24, 26, 16,
    ]);
  });

  it("is deterministic per seed", () => {
    expect(mtTiles(42, 24)).toEqual(mtTiles(42, 24));
  });

  it("rejects oversized shuffles", () => {
    expect(() => mtTiles(1, 625)).toThrow(RangeError);
  });
});

describe("MtRandom", () => {
  it("produces floats in [0, 1)", () => {
    const rs = new MtRandom(12345);
    for (let i = 0; i < 100; i += 1) {
      const value = rs.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("matches CPython random.random() for Knuth seeding", () => {
    // Golden draws captured from CPython using upstream's _MTRandom seeding.
    const rs = new MtRandom(0x1234567);
    expect([
      rs.random(),
      rs.random(),
      rs.random(),
    ]).toEqual([
      0.4197644003159189, 0.6744351122387648, 0.24990916957846143,
    ]);
  });
});

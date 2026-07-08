/**
 * Unit tests for the pure pantry-merge logic (no React Native imports).
 * Run: npm test  (tsx --test; resolves the @/ alias via tsconfig paths)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ci, computeScanMerge, computeShoppingDone } from "../../utils/pantryMerge";

const P = (name: string, category?: string) => (category ? { name, category } : { name });
const row = (over: Partial<{ name: string; matchesPantry: string | null; edited: boolean; checked: boolean }>) => ({
  name: "eggs",
  matchesPantry: null,
  edited: false,
  checked: true,
  ...over,
});

describe("ci", () => {
  it("trims and lowercases", () => {
    assert.equal(ci("  Chicken Breast "), "chicken breast");
  });
});

describe("computeScanMerge", () => {
  it("adds new checked items, ci-deduped against pantry and within the scan", () => {
    const { merged, added } = computeScanMerge(
      [P("eggs")],
      [row({ name: "Tomato" }), row({ name: "tomato" }), row({ name: "EGGS" })],
    );
    assert.equal(added, 1);
    assert.deepEqual(merged.map((e) => e.name), ["eggs", "Tomato"]);
  });

  it("unedited matched row combines (no duplicate entry)", () => {
    const { merged, added } = computeScanMerge(
      [P("eggs")],
      [row({ name: "鸡蛋", matchesPantry: "eggs" })],
    );
    assert.equal(added, 0);
    assert.deepEqual(merged.map((e) => e.name), ["eggs"]);
  });

  it("edited matched row renames the existing entry and keeps its category", () => {
    const { merged, renamed } = computeScanMerge(
      [P("eggs", "dairy")],
      [row({ name: "free-range eggs", matchesPantry: "eggs", edited: true })],
    );
    assert.equal(renamed, 1);
    assert.deepEqual(merged, [{ name: "free-range eggs", category: "dairy" }]);
  });

  it("edited rename colliding with another entry combines instead", () => {
    const { merged, renamed, added } = computeScanMerge(
      [P("eggs"), P("tomato")],
      [row({ name: "Tomato", matchesPantry: "eggs", edited: true })],
    );
    assert.equal(renamed, 0);
    assert.equal(added, 0);
    assert.deepEqual(merged.map((e) => e.name), ["eggs", "tomato"]);
  });

  it("unchecked and blank rows are ignored; existing categories survive", () => {
    const { merged, added } = computeScanMerge(
      [P("rice", "grains")],
      [row({ name: "milk", checked: false }), row({ name: "   " })],
    );
    assert.equal(added, 0);
    assert.deepEqual(merged, [{ name: "rice", category: "grains" }]);
  });

  it("never removes pantry entries", () => {
    const { merged } = computeScanMerge([P("a"), P("b"), P("c")], []);
    assert.equal(merged.length, 3);
  });
});

describe("computeShoppingDone", () => {
  const groups = [
    {
      category: "meal-Shakshuka",
      items: [
        { name: "eggs", checked: true },
        { name: "tomato", checked: false },
      ],
    },
    { category: "Produce", items: [{ name: "onion", checked: true }] },
  ];

  it("moves checked items into the pantry and off the list", () => {
    const { merged, remaining, moved } = computeShoppingDone([P("rice")], groups);
    assert.equal(moved, 2);
    assert.deepEqual(merged.map((e) => e.name).sort(), ["eggs", "onion", "rice"]);
    assert.deepEqual(remaining, [
      { category: "meal-Shakshuka", items: [{ name: "tomato", checked: false }] },
    ]);
  });

  it("combines with items already in the pantry (no duplicates)", () => {
    const { merged } = computeShoppingDone([P("eggs", "dairy")], groups);
    assert.deepEqual(
      merged.filter((e) => ci(e.name) === "eggs"),
      [{ name: "eggs", category: "dairy" }],
    );
  });

  it("normalizes Chinese display names to canonical English", () => {
    const zhGroups = [{ category: "x", items: [{ name: "鸡蛋", checked: true }] }];
    const { merged } = computeShoppingDone([], zhGroups);
    assert.deepEqual(merged.map((e) => e.name), ["eggs"]);
  });

  it("empty checked set changes nothing", () => {
    const none = [{ category: "x", items: [{ name: "milk", checked: false }] }];
    const { merged, remaining, moved } = computeShoppingDone([P("rice")], none);
    assert.equal(moved, 0);
    assert.deepEqual(merged, [P("rice")]);
    assert.deepEqual(remaining, none);
  });
});

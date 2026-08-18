import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PANTRY_CATEGORIES, STAPLE_CATEGORY_KEYS } from "@/constants/filters";

describe("STAPLE_CATEGORY_KEYS", () => {
  // The set CookedSheet used to hardcode. Pinning it here is the whole point of
  // FIX-7: the flag now lives on the category definitions, and this test fails
  // if a category is renamed or its staple flag dropped without a deliberate
  // decision, which is exactly the silent drift the hardcoded copy allowed.
  const EXPECTED = ["grains", "condiments", "oils", "herbs", "frozen"];

  test("matches the set CookedSheet previously hardcoded", () => {
    assert.deepEqual([...STAPLE_CATEGORY_KEYS].sort(), [...EXPECTED].sort());
  });

  test("every staple key is a real pantry category", () => {
    const known = new Set(PANTRY_CATEGORIES.map((c) => c.key));
    for (const key of STAPLE_CATEGORY_KEYS) {
      assert.ok(known.has(key), `staple key "${key}" is not a pantry category`);
    }
  });

  test("perishable categories are not staples", () => {
    for (const key of ["meat", "veg", "dairy", "fruits"]) {
      assert.ok(!STAPLE_CATEGORY_KEYS.has(key), `${key} should not be a staple`);
    }
  });

  test("pantry category keys are unique", () => {
    const keys = PANTRY_CATEGORIES.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("each category has a Chinese label for every item", () => {
    for (const cat of PANTRY_CATEGORIES) {
      assert.equal(
        cat.items.length,
        cat.itemsZh.length,
        `${cat.key}: items and itemsZh are different lengths`,
      );
    }
  });
});

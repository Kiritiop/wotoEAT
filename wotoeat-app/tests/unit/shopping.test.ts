/** Unit tests for the pure shopping-list helpers. Run: npm test */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayCategory, formatShoppingListText, countShoppingItems } from "../../utils/shopping";

describe("displayCategory", () => {
  it("strips the internal meal- prefix", () => {
    assert.equal(displayCategory("meal-Kung Pao Chicken"), "Kung Pao Chicken");
  });
  it("passes plain categories through", () => {
    assert.equal(displayCategory("Produce"), "Produce");
  });
});

describe("countShoppingItems", () => {
  it("counts totals and checked across groups", () => {
    const { total, checked } = countShoppingItems({
      groups: [
        { category: "a", items: [{ name: "x", checked: true }, { name: "y" }] },
        { category: "b", items: [{ name: "z", checked: true }] },
      ],
    });
    assert.equal(total, 3);
    assert.equal(checked, 2);
  });
});

describe("formatShoppingListText", () => {
  const list = {
    groups: [
      { category: "meal-Shakshuka", items: [{ name: "eggs", checked: true }, { name: "tomato" }] },
    ],
  };
  it("renders title, uppercased display category, and checkboxes", () => {
    const text = formatShoppingListText(list, "en");
    assert.ok(text.startsWith("wotoEAT Shopping List"));
    assert.ok(text.includes("SHAKSHUKA"));
    assert.ok(!text.includes("MEAL-"));
    assert.ok(text.includes("[x] eggs"));
    assert.ok(text.includes("[ ] tomato"));
  });
  it("uses the Chinese title in zh", () => {
    assert.ok(formatShoppingListText(list, "zh").startsWith("wotoEAT 购物清单"));
  });
});

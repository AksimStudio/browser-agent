import test from "node:test";
import assert from "node:assert/strict";
import { scoreButtonForAction } from "../src/browser.js";

test("добавление и уменьшение количества не путаются", () => {
  const add = { testId: "add-spin-button", aria: "Добавить товар" };
  const remove = { testId: "remove-spin-button", aria: "Уменьшить количество" };
  assert.ok(scoreButtonForAction(add, "В корзину") > 0);
  assert.equal(scoreButtonForAction(remove, "В корзину"), 0);
  assert.ok(scoreButtonForAction(remove, "−") > 0);
  assert.equal(scoreButtonForAction(add, "−"), 0);
});

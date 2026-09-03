import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStateChange } from "../src/state-change.js";

test("проверка действия объясняет семантическое изменение страницы", () => {
  const before = JSON.stringify({ url: "https://shop.test/", title: "Каталог", bodyText: "Корзина пуста", elements: [], contextStats: { totalElements: 2 } });
  const after = JSON.stringify({ url: "https://shop.test/", title: "Каталог", bodyText: "Корзина\nТовар добавлен", elements: [], contextStats: { totalElements: 3 } });
  const result = summarizeStateChange(before, after);
  assert.match(result, /Товар добавлен/);
  assert.match(result, /2 → 3/);
});

test("одинаковое состояние отмечается явно", () => {
  const state = JSON.stringify({ url: "u", title: "t", bodyText: "same", elements: [] });
  assert.equal(summarizeStateChange(state, state), "значимых изменений не обнаружено");
});

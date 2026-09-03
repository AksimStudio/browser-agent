import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDom } from "../src/dom-agent.js";

test("DOM-анализатор сохраняет релевантные элементы при ограничении контекста", () => {
  const elements = Array.from({ length: 100 }, (_, index) => ({ ref: `e${index}`, text: `обычный ${index}` }));
  elements[99].text = "Купить музыку программистов";
  const result = analyzeDom({ title: "t", url: "u", bodyText: "Музыка программистов\nПрочий текст", elements }, "найди музыку программистов");
  assert.equal(result.elements.length, 50);
  assert.ok(result.elements.some((element) => element.ref === "e99"));
  assert.match(result.bodyText, /Музыка программистов/);
  assert.ok(result.bodyText.length <= 3500);
});

test("DOM-анализатор соблюдает бюджет элементов и сохраняет overlay", () => {
  const elements = Array.from({ length: 100 }, (_, index) => ({ ref: `e${index}`, text: "x".repeat(500), inOverlay: index === 99 }));
  const result = analyzeDom({ title: "t", url: "u", bodyText: "text", elements, overlays: [{ text: "Баннер", buttons: ["Пропустить"] }] }, "задача");
  assert.ok(result.contextStats.elementCharacters <= 7000);
  assert.ok(result.elements.some((element) => element.ref === "e99"));
  assert.equal(result.overlays[0].buttons[0], "Пропустить");
});

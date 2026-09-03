import test from "node:test";
import assert from "node:assert/strict";
import { actionNeedsApproval } from "../src/security.js";

test("обычная навигация и ввод текста не требуют подтверждения", () => {
  assert.equal(actionNeedsApproval({ action: "click", element: { text: "Следующая страница" } }), false);
  assert.equal(actionNeedsApproval({ action: "type", element: { type: "text" }, value: "отправить отчёт" }), false);
  assert.equal(actionNeedsApproval({ action: "click", element: { text: "Купить и добавить в корзину" } }), false);
});

test("удаление и оплата распознаются по тексту и контексту", () => {
  assert.equal(actionNeedsApproval({ action: "click", element: { ariaLabel: "Удалить письмо" } }), true);
  assert.equal(actionNeedsApproval({ action: "click", element: { text: "✓", context: "Итого 900 ₽ Оплатить заказ" } }), true);
  assert.equal(actionNeedsApproval({ action: "click", element: { text: "В архив" } }), true);
});

test("отправка внешней формы и ввод секрета требуют подтверждения", () => {
  assert.equal(actionNeedsApproval({ action: "press", element: { context: "Submit application" }, value: "Enter" }), true);
  assert.equal(actionNeedsApproval({ action: "type", element: { type: "password" }, value: "secret" }), true);
});

const FINAL_ACTION = [
  /оплат|оформить|подтвердить заказ|удалить|стереть|очистить|в спам|архив|отправить|откликнуться|опубликовать/i,
  /pay|place order|checkout|confirm order|delete|remove|trash|spam|archive|send|submit|apply|publish/i,
];

const SENSITIVE_FIELD = /password|парол|card|карты|cvv|cvc|security code|код безопасности/i;

export function actionNeedsApproval({ action, element = {}, value = "" }) {
  const description = [element.text, element.ariaLabel, element.title, element.name, element.autocomplete, element.context, element.href].filter(Boolean).join(" ");
  if (action === "type") return SENSITIVE_FIELD.test(`${element.type || ""} ${description}`);
  if (action === "press" && !/Enter/i.test(value)) return false;
  if (!["click", "press", "select"].includes(action)) return false;
  return FINAL_ACTION.some((pattern) => pattern.test(description));
}

export function describeDanger({ action, element = {}, value = "" }) {
  const label = element.text || element.ariaLabel || element.title || element.context || value || "неизвестное действие";
  return `${action}: ${String(label).replace(/\s+/g, " ").slice(0, 300)}`;
}

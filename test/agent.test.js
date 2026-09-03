import test from "node:test";
import assert from "node:assert/strict";
import { formatFinalReport, runAgent } from "../src/agent.js";

test("агент хранит заметки, но не пересылает старые снимки", async () => {
  const requests = [];
  const replies = [
    { tool_calls: [{ function: { name: "remember", arguments: '{"note":"Цена 42"}' } }] },
    { tool_calls: [{ function: { name: "click", arguments: '{"ref":"e1"}' } }] },
    { content: "Готово" },
  ];
  const client = { chat: { completions: { create: async (request) => {
    requests.push(request);
    return { choices: [{ message: replies.shift() }] };
  } } } };
  let state = '{"bodyText":"FIRST-SNAPSHOT","elements":[{"ref":"e1"}]}';
  const browser = {
    observe: async () => state,
    run: async () => (state = '{"bodyText":"SECOND-SNAPSHOT","elements":[]}'),
  };

  const result = await runAgent({ client, model: "test", browser, task: "Тест", log: () => {} });
  assert.match(result, /📋 Результат:\nГотово/);
  assert.match(result, /✅ Выполнено:/);
  assert.match(requests[1].messages[1].content, /Цена 42/);
  assert.match(requests[2].messages[1].content, /SECOND-SNAPSHOT/);
  assert.doesNotMatch(requests[2].messages[1].content, /FIRST-SNAPSHOT/);
});

test("агент не повторяет действие с теми же аргументами после ошибки", async () => {
  const replies = [
    { tool_calls: [{ function: { name: "click", arguments: '{"ref":"e7"}' } }] },
    { tool_calls: [{ function: { name: "click", arguments: '{"ref":"e7"}' } }] },
    { content: "Выбран другой способ" },
  ];
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: replies.shift() }] }) } } };
  let calls = 0;
  const browser = {
    observe: async () => '{"elements":[{"ref":"e7"}]}',
    run: async () => { calls += 1; throw new Error("element is obstructed"); },
  };
  const result = await runAgent({ client, model: "test", browser, task: "Тест", log: () => {} });
  assert.match(result, /📋 Результат:\nВыбран другой способ/);
  assert.match(result, /element is obstructed/);
  assert.equal(calls, 1);
});

test("терминальный журнал скрывает текст, введённый в поле", async () => {
  const replies = [
    { tool_calls: [{ function: { name: "type", arguments: '{"ref":"e1","text":"super-secret"}' } }] },
    { content: "Готово" },
  ];
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: replies.shift() }] }) } } };
  const logs = [];
  const browser = { observe: async () => '{"elements":[]}', run: async () => '{"elements":[]}' };
  await runAgent({ client, model: "test", browser, task: "Тест", log: (line) => logs.push(line) });
  assert.doesNotMatch(logs.join("\n"), /super-secret/);
  assert.match(logs.join("\n"), /скрыто, 12 символов/);
});

test("финальный отчёт сокращает технический CLICK_BLOCKED", () => {
  const report = formatFinalReport("Завершено безопасно", [
    '3. click — ошибка: {"code":"CLICK_BLOCKED","hint":"Используй другой способ","playwright":"очень длинный внутренний лог"}',
  ]);
  assert.match(report, /CLICK_BLOCKED: Используй другой способ/);
  assert.doesNotMatch(report, /очень длинный внутренний лог/);
});

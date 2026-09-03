import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexJsonl } from "../src/codex-client.js";

test("из JSONL Codex извлекается структурированное решение", () => {
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "t1" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"type":"tool","name":"observe","arguments":"{}","content":null}' } }),
  ].join("\n");
  assert.equal(parseCodexJsonl(stdout).name, "observe");
});

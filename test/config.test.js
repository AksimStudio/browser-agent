import test from "node:test";
import assert from "node:assert/strict";
import { resolveAiConfig } from "../src/config.js";

test("Codex является backend по умолчанию и не требует API-ключ", () => {
  assert.deepEqual(resolveAiConfig({}), {
    provider: "codex",
    binary: "codex",
    model: undefined,
    maxThreadSteps: 4,
  });
});

test("OpenAI требует API-ключ", () => {
  assert.throws(() => resolveAiConfig({ AI_PROVIDER: "openai" }), /OPENAI_API_KEY/);
});

test("неподдерживаемый provider отклоняется", () => {
  assert.throws(() => resolveAiConfig({ AI_PROVIDER: "other" }), /codex или openai/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { tools } from "../src/agent.js";

test("агент может искать сайт, если пользователь не указал URL", () => {
  const search = tools.find((tool) => tool.function.name === "web_search");
  assert.ok(search);
  assert.deepEqual(search.function.function, undefined);
  assert.deepEqual(search.function.parameters.required, ["query"]);
});

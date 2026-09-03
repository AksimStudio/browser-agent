import "dotenv/config";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { BrowserController } from "./browser.js";
import { runAgent } from "./agent.js";
import { resolveAiConfig } from "./config.js";
import { CodexClient } from "./codex-client.js";
import { OpenAIClient } from "./openai-client.js";

const rl = readline.createInterface({ input, output });
const approve = async (description) => {
  const answer = await rl.question(`\n⚠️ ${description}\nРазрешить? [y/N] `);
  return /^(y|yes|д|да)$/i.test(answer.trim());
};

let ai;
try {
  ai = resolveAiConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const client = ai.provider === "codex"
  ? new CodexClient({ binary: ai.binary, model: ai.model, maxThreadSteps: ai.maxThreadSteps })
  : new OpenAIClient({ apiKey: ai.apiKey, baseURL: ai.baseURL });
const browser = new BrowserController({
  profileDir: path.resolve(".browser-profile"),
  approve,
});

try {
  await browser.start();
  const model = ai.model;
  console.log(`AI backend: ${ai.provider}, модель: ${model || "из настроек Codex"}`);
  console.log("Браузер открыт. Можно вручную авторизоваться перед запуском задачи.");
  while (true) {
    const task = (await rl.question("\nЗадача (или exit): ")).trim();
    if (!task || task.toLowerCase() === "exit") break;
    console.log(`\n👤 You: ${task}`);
    const result = await runAgent({
      client,
      model,
      browser,
      task,
    });
    console.log(`\n${result}`);
  }
} catch (error) {
  console.error(`\nОшибка: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.stop();
  rl.close();
}

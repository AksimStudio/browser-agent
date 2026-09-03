import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "src", "codex-action.schema.json");

export function parseCodexJsonl(stdout) {
  let finalText = "";
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const item = event.item;
    if (event.type === "item.completed" && item?.type === "agent_message") finalText = item.text || "";
  }
  if (!finalText) throw new Error("Codex не вернул итоговое сообщение");
  return JSON.parse(finalText);
}

function parseThreadId(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && event.thread_id) return event.thread_id;
    } catch {}
  }
  return null;
}

function runCodex(prompt, { binary, model, image, threadId }) {
  return new Promise((resolve, reject) => {
    const args = threadId
      ? ["exec", "resume", "--json", "--skip-git-repo-check", "--output-schema", schemaPath]
      : ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "-C", root, "--output-schema", schemaPath];
    if (model) args.push("--model", model);
    if (image) args.push("--image", image);
    if (threadId) args.push(threadId);
    args.push("-");
    const child = spawn(binary, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(prompt);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Codex завершился с кодом ${code}: ${stderr.trim().slice(-1000)}`));
      try { resolve({ decision: parseCodexJsonl(stdout), threadId: parseThreadId(stdout) || threadId }); } catch (error) { reject(error); }
    });
  });
}

export class CodexClient {
  constructor({ binary = "codex", model, maxThreadSteps = 4 } = {}) {
    this.binary = binary;
    this.model = model;
    this.image = null;
    this.threadId = null;
    this.threadSteps = 0;
    this.maxThreadSteps = maxThreadSteps;
    this.chat = { completions: { create: (request) => this.create(request) } };
  }

  setImage(image) { this.image = image; }
  resetTask() { this.threadId = null; this.threadSteps = 0; this.image = null; }

  async create(request) {
    const system = request.messages.find((message) => message.role === "system")?.content || "";
    const state = request.messages.find((message) => message.role === "user")?.content || "";
    const available = request.tools.map(({ function: fn }) => ({ name: fn.name, description: fn.description, parameters: fn.parameters }));
    if (this.threadSteps >= this.maxThreadSteps) {
      this.threadId = null;
      this.threadSteps = 0;
    }
    const firstTurn = !this.threadId;
    const prompt = firstTurn
      ? `${system}\n\n${state}\n\nДоступные браузерные инструменты:\n${JSON.stringify(available)}\n\nСоставь короткий внутренний план задачи. Перед завершением проверь каждый пункт по наблюдаемому состоянию. Верни одно следующее действие: type=tool, name и arguments как JSON-строку; либо type=final, arguments="{}" и content. Не запускай команды и не изменяй файлы.`
      : `${state}\n\nЭто обновлённое состояние заменяет старые снимки страницы. Продолжи текущий план: верни одно следующее действие в прежнем JSON-формате либо final только после проверки всех пунктов.`;
    const image = this.image;
    this.image = null;
    const run = await runCodex(prompt, { binary: this.binary, model: this.model, image, threadId: this.threadId });
    this.threadId = run.threadId;
    this.threadSteps += 1;
    const decision = run.decision;
    const message = decision.type === "tool"
      ? { content: null, tool_calls: [{ function: { name: decision.name, arguments: decision.arguments || "{}" } }] }
      : { content: decision.content || "Задача завершена.", tool_calls: [] };
    return { choices: [{ message }] };
  }

  async close() {}
}

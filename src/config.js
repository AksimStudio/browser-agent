const PROVIDERS = new Set(["codex", "openai"]);

export function resolveAiConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || "codex").toLowerCase();
  if (!PROVIDERS.has(provider)) {
    throw new Error("AI_PROVIDER должен быть codex или openai.");
  }

  if (provider === "codex") {
    const configuredSteps = Number(env.CODEX_THREAD_STEPS || 4);
    return {
      provider,
      binary: env.CODEX_BIN || "codex",
      model: env.CODEX_MODEL || undefined,
      maxThreadSteps: Number.isInteger(configuredSteps) && configuredSteps > 0 ? configuredSteps : 4,
    };
  }

  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("Для AI_PROVIDER=openai требуется OPENAI_API_KEY.");
    return {
      provider,
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || undefined,
      model: env.OPENAI_MODEL || "gpt-5-mini",
    };
  }

  throw new Error(`Неизвестный AI_PROVIDER: ${provider}`);
}

function parseObservation(value) {
  const start = String(value).indexOf("{");
  if (start < 0) return null;
  try { return JSON.parse(String(value).slice(start)); } catch { return null; }
}

export function summarizeStateChange(before, after) {
  const previous = parseObservation(before);
  const current = parseObservation(after);
  if (!previous || !current) return before === after ? "изменений не обнаружено" : "состояние обновилось";
  const changes = [];
  if (previous.url !== current.url) changes.push(`URL: ${previous.url} → ${current.url}`);
  if (previous.title !== current.title) changes.push(`заголовок: ${previous.title} → ${current.title}`);
  const oldText = previous.bodyText || "";
  const newText = current.bodyText || "";
  if (oldText !== newText) {
    const oldLines = new Set(oldText.split("\n").map((line) => line.trim()).filter(Boolean));
    const additions = newText.split("\n").map((line) => line.trim()).filter((line) => line && !oldLines.has(line)).slice(0, 3);
    changes.push(additions.length ? `появилось: ${additions.join(" | ").slice(0, 300)}` : "текст страницы изменился");
  }
  const oldCount = previous.contextStats?.totalElements ?? previous.elements?.length;
  const newCount = current.contextStats?.totalElements ?? current.elements?.length;
  if (oldCount !== newCount) changes.push(`интерактивных элементов: ${oldCount} → ${newCount}`);
  return changes.length ? changes.join("; ") : "значимых изменений не обнаружено";
}

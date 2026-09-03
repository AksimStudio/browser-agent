function words(text) {
  return new Set(String(text || "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

const MAX_SENT_ELEMENTS = 50;
const MAX_ELEMENTS_JSON = 7000;

export function analyzeDom(snapshot, task = "") {
  const terms = words(task);
  const scored = snapshot.elements.map((element, index) => {
    const haystack = `${element.text || ""} ${element.ariaLabel || ""} ${element.testId || ""} ${element.href || ""} ${element.role || ""}`.toLowerCase();
    const score = [...terms].reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) + (element.inOverlay ? 4 : 0);
    return { element, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = [];
  let elementCharacters = 2;
  for (const item of scored) {
    const size = JSON.stringify(item.element).length + 1;
    if (selected.length >= MAX_SENT_ELEMENTS || elementCharacters + size > MAX_ELEMENTS_JSON) continue;
    selected.push(item);
    elementCharacters += size;
  }
  const elements = selected.sort((a, b) => a.index - b.index).map(({ element }) => element);
  const lines = String(snapshot.bodyText || "").split("\n").filter(Boolean);
  const relevant = lines.filter((line) => [...terms].some((term) => line.toLowerCase().includes(term))).slice(0, 30);
  const selectedLines = [...new Set([...relevant, ...lines.slice(0, 80)])];
  return {
    title: snapshot.title,
    url: snapshot.url,
    bodyText: selectedLines.join("\n").slice(0, 3500),
    elements,
    overlays: snapshot.overlays || [],
    contextStats: { totalElements: snapshot.elements.length, sentElements: elements.length, elementCharacters, bodyCharacters: snapshot.bodyText.length, sentCharacters: selectedLines.join("\n").slice(0, 3500).length },
  };
}

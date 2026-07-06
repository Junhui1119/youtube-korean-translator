export async function loadGlossaryMap() {
  try {
    const url = chrome.runtime.getURL("glossary/ko-zh-game-terms.csv");
    const response = await fetch(url);
    if (!response.ok) return new Map();
    return parseGlossaryCSV(await response.text());
  } catch {
    return new Map();
  }
}

export function parseGlossaryCSV(text) {
  const map = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cols = parseCSVRow(line);
    const korean = cols[0]?.trim();
    const chinese = cols[1]?.trim();
    if (!korean || !chinese || korean.toLowerCase() === "korean") continue;
    map.set(korean, chinese);
  }
  return map;
}

function parseCSVRow(line) {
  const cols = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

export function applyGlossaryPlaceholders(text, map) {
  const entries = [];
  let result = text;
  let i = 0;
  for (const [korean, chinese] of map) {
    if (!result.includes(korean)) continue;
    const tag = `<ykt${i}/>`;
    result = result.split(korean).join(tag);
    entries.push({ tagId: i, chinese });
    i++;
  }
  return { processed: result, entries };
}

export function restoreGlossaryPlaceholders(translated, entries) {
  let result = translated;
  for (const { tagId, chinese } of entries) {
    result = result.replace(new RegExp(`<ykt${tagId}\\s*/?>`, "gi"), chinese);
    result = result.replace(new RegExp(`ykt${tagId}`, "gi"), chinese);
  }
  return result;
}

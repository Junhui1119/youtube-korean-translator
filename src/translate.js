export function buildTranslateUrl(text, source = "ko", target = "zh-CN") {
  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
}

export function parseTranslateResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid translate response");
  }

  const translatedText = data[0]
    .map((segment) => {
      if (!Array.isArray(segment)) return "";
      return typeof segment[0] === "string" ? segment[0] : "";
    })
    .filter(Boolean)
    .join("");

  if (!translatedText) {
    throw new Error("Translate response did not contain text");
  }

  return translatedText;
}

export async function translateText(text, fetchFn = fetch, source = "ko", target = "zh-CN") {
  const normalizedText = text.trim();
  if (!normalizedText) return "";

  const response = await fetchFn(buildTranslateUrl(normalizedText, source, target));
  if (!response.ok) {
    throw new Error(`Translate request failed: HTTP ${response.status}`);
  }

  return parseTranslateResponse(await response.json());
}

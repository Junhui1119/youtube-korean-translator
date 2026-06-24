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
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  return data[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .filter(Boolean)
    .join("");
}

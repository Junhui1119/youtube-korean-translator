export async function translateText(text, apiKey, fetchFn = fetch) {
  const normalizedText = text.trim();
  if (!normalizedText) return "";

  if (apiKey) {
    return translateDeepL(normalizedText, apiKey, fetchFn);
  }
  return translateGoogle(normalizedText, fetchFn);
}

async function translateDeepL(text, apiKey, fetchFn) {
  const response = await fetchFn("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: "KO",
      target_lang: "ZH-HANS",
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepL request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const translated = data?.translations?.[0]?.text;
  if (!translated) throw new Error("DeepL response did not contain text");
  return translated;
}

async function translateGoogle(text, fetchFn) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "ko",
    tl: "zh-CN",
    dt: "t",
    q: text,
  });
  const response = await fetchFn(
    `https://translate.googleapis.com/translate_a/single?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Google Translate request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid Google Translate response");
  }

  const translated = data[0]
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
    .filter(Boolean)
    .join("");

  if (!translated) throw new Error("Google Translate response did not contain text");
  return translated;
}

import { translateText } from "./src/translate.js";

const DEFAULT_ENABLED = true;
const translationCache = new Map();

async function isEnabled() {
  const result = await chrome.storage.local.get({ enabled: DEFAULT_ENABLED });
  return result.enabled;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_ENABLED") {
    isEnabled()
      .then((enabled) => sendResponse({ enabled }))
      .catch((error) => sendResponse({ enabled: DEFAULT_ENABLED, error: error.message }));
    return true;
  }

  if (message?.type === "TRANSLATE_TEXT") {
    (async () => {
      const text = typeof message.text === "string" ? message.text : "";
      if (!(await isEnabled())) {
        sendResponse({ ok: false, text, error: "Extension disabled" });
        return;
      }

      try {
        const normalizedText = text.trim();
        if (!normalizedText) {
          sendResponse({ ok: true, text: "" });
          return;
        }

        if (translationCache.has(normalizedText)) {
          sendResponse({ ok: true, text: translationCache.get(normalizedText) });
          return;
        }

        const translatedText = await translateText(normalizedText);
        translationCache.set(normalizedText, translatedText);
        sendResponse({ ok: true, text: translatedText });
      } catch (error) {
        sendResponse({ ok: false, text, error: error.message });
      }
    })();
    return true;
  }

  return false;
});

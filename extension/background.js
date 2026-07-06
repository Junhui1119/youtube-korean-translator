import { translateText } from "./src/translate.js";
import { loadGlossaryMap } from "./src/glossary.js";

const DEFAULT_ENABLED = true;
const CACHE_MAX = 200;
const translationCache = new Map();

let cachedEnabled = DEFAULT_ENABLED;
let cachedApiKey = "";
const glossaryMapPromise = loadGlossaryMap();

function cacheSet(key, value) {
  if (translationCache.size >= CACHE_MAX) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

const settingsReady = new Promise((resolve) => {
  chrome.storage.local.get({ enabled: DEFAULT_ENABLED, deeplApiKey: "" }, (result) => {
    cachedEnabled = result.enabled;
    cachedApiKey = result.deeplApiKey;
    resolve();
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.enabled !== undefined) cachedEnabled = changes.enabled.newValue;
  if (changes.deeplApiKey !== undefined) {
    cachedApiKey = changes.deeplApiKey.newValue;
    translationCache.clear();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_ENABLED") {
    settingsReady.then(() => sendResponse({ enabled: cachedEnabled }));
    return true;
  }

  if (message?.type === "TRANSLATE_TEXT") {
    (async () => {
      await settingsReady;
      const text = typeof message.text === "string" ? message.text : "";
      if (!cachedEnabled) {
        sendResponse({ ok: false, text, error: "Extension disabled" });
        return;
      }

      try {
        const normalizedText = text.trim();
        if (!normalizedText) {
          sendResponse({ ok: true, text: "" });
          return;
        }

        const cacheKey = `${cachedApiKey ? "deepl" : "google"}:${normalizedText}`;
        if (translationCache.has(cacheKey)) {
          sendResponse({ ok: true, text: translationCache.get(cacheKey) });
          return;
        }

        const glossaryMap = await glossaryMapPromise;
        const translatedText = await translateText(normalizedText, cachedApiKey, glossaryMap);
        cacheSet(cacheKey, translatedText);
        sendResponse({ ok: true, text: translatedText });
      } catch (error) {
        sendResponse({ ok: false, text, error: error.message });
      }
    })();
    return true;
  }

  return false;
});

import { translateText } from "./src/translate.js";
import {
  loadGlossaryMap,
  applyGlossaryPlaceholders,
  restoreGlossaryPlaceholders,
} from "./src/glossary.js";

const DEFAULT_ENABLED = true;
const CACHE_MAX = 200;
const translationCache = new Map();

let cachedEnabled = DEFAULT_ENABLED;
let cachedApiKey = "";
let cachedBackendUrl = "";
let cachedBackendToken = "";
let cachedJwt = "";
let backendDegraded = false; // true 后不再重试后端，直到设置变更
let lastRecordedVideoId = "";
const glossaryMapPromise = loadGlossaryMap();

function cacheSet(key, value) {
  if (translationCache.size >= CACHE_MAX) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

const settingsReady = new Promise((resolve) => {
  chrome.storage.local.get(
    { enabled: DEFAULT_ENABLED, deeplApiKey: "", backendUrl: "", backendToken: "", jwt: "" },
    (result) => {
      cachedEnabled = result.enabled;
      cachedApiKey = result.deeplApiKey;
      cachedBackendUrl = result.backendUrl;
      cachedBackendToken = result.backendToken;
      cachedJwt = result.jwt;
      resolve();
    }
  );
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.enabled !== undefined) {
    cachedEnabled = changes.enabled.newValue;
    if (changes.enabled.newValue === true) {
      backendDegraded = false;
      chrome.storage.local.set({ backendDegraded: false });
      translationCache.clear();
    }
  }
  if (changes.deeplApiKey !== undefined) {
    cachedApiKey = changes.deeplApiKey.newValue;
    translationCache.clear();
  }
  if (changes.backendUrl !== undefined) {
    cachedBackendUrl = changes.backendUrl.newValue;
    backendDegraded = false; // 设置变更后重置降级状态
    chrome.storage.local.set({ backendDegraded: false });
    translationCache.clear();
  }
  if (changes.backendToken !== undefined) {
    cachedBackendToken = changes.backendToken.newValue;
    backendDegraded = false;
    chrome.storage.local.set({ backendDegraded: false });
    translationCache.clear();
  }
  if (changes.jwt !== undefined) {
    cachedJwt = changes.jwt.newValue ?? "";
    lastRecordedVideoId = ""; // reset so next video re-records with new identity
  }
});

async function translateViaBackend(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${cachedBackendUrl}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cachedBackendToken}`,
        "X-User-Token": cachedJwt,
      },
      body: JSON.stringify({ text, engine: "deepl" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.translated;
  } finally {
    clearTimeout(timer);
  }
}

async function recordHistory(videoId, title, channel, position) {
  if (!cachedJwt || !cachedBackendUrl || !videoId) return;
  try {
    await fetch(`${cachedBackendUrl}/api/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cachedJwt}`,
      },
      body: JSON.stringify({
        video_id: videoId,
        title: title || "Unknown",
        channel: channel || null,
        last_position: position || 0,
      }),
    });
  } catch {
    // fire-and-forget: ignore all errors
  }
}

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

        const useBackend = !!(cachedBackendUrl && cachedBackendToken && !backendDegraded);
        const cacheKey = useBackend
          ? `backend:${normalizedText}`
          : `${cachedApiKey ? "deepl" : "google"}:${normalizedText}`;

        if (translationCache.has(cacheKey)) {
          sendResponse({ ok: true, text: translationCache.get(cacheKey) });
          return;
        }

        const glossaryMap = await glossaryMapPromise;
        let translatedText;

        if (useBackend) {
          const { processed, entries } = glossaryMap?.size
            ? applyGlossaryPlaceholders(normalizedText, glossaryMap)
            : { processed: normalizedText, entries: [] };

          try {
            const raw = await translateViaBackend(processed);
            translatedText = entries.length
              ? restoreGlossaryPlaceholders(raw, entries)
              : raw;
            // Record history once per video (fire-and-forget)
            const msgVideoId = message.videoId || "";
            if (msgVideoId && msgVideoId !== lastRecordedVideoId) {
              lastRecordedVideoId = msgVideoId;
              recordHistory(
                msgVideoId,
                message.videoTitle || "",
                message.videoChannel || null,
                message.videoPosition || 0
              );
            }
          } catch (_backendError) {
            // 降级：标记后不再重试，通知 popup 变黄灯，回退直连 Google
            backendDegraded = true;
            chrome.storage.local.set({ backendDegraded: true });
            chrome.runtime.sendMessage({ type: "BACKEND_DEGRADED" }).catch(() => {});
            translatedText = await translateText(normalizedText, null, glossaryMap);
          }
        } else {
          translatedText = await translateText(normalizedText, cachedApiKey, glossaryMap);
        }

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

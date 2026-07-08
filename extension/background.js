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
let asrActive = false;
let asrRetried = false;
let asrTabId = null;
const glossaryMapPromise = loadGlossaryMap();

function cacheSet(key, value) {
  if (translationCache.size >= CACHE_MAX) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

const settingsReady = new Promise((resolve) => {
  chrome.storage.local.get(
    {
      enabled: DEFAULT_ENABLED,
      deeplApiKey: "",
      backendUrl: "",
      backendToken: "",
      jwt: "",
      asrActive: false,
      asrTabId: null,
    },
    (result) => {
      cachedEnabled = result.enabled;
      cachedApiKey = result.deeplApiKey;
      cachedBackendUrl = result.backendUrl;
      cachedBackendToken = result.backendToken;
      cachedJwt = result.jwt;
      asrActive = result.asrActive === true;
      asrTabId = result.asrTabId; // restore after SW restart
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
  if (changes.asrActive !== undefined) {
    asrActive = changes.asrActive.newValue === true;
  }
  if (changes.asrTabId !== undefined) {
    asrTabId = changes.asrTabId.newValue ?? null;
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

async function startAsr(isRetry = false) {
  if (asrActive) return;

  await settingsReady;
  if (!cachedBackendUrl || !cachedJwt) { stopAsr(); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  asrTabId = tab.id;
  chrome.storage.local.set({ asrTabId: tab.id });

  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });
  } catch (e) {
    chrome.runtime.sendMessage({ type: "ASR_ERROR", message: e.message }).catch(() => {});
    return;
  }

  // Always recreate the offscreen document so the WS url is fresh
  const hasDoc = await chrome.offscreen.hasDocument().catch(() => false);
  if (hasDoc) await chrome.offscreen.closeDocument().catch(() => {});
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Tab audio capture for speech recognition",
  });

  const wsUrl = cachedBackendUrl.replace(/^http/, "ws") + `/ws/asr?token=${cachedJwt}`;
  const offscreenResp = await chrome.runtime.sendMessage({ type: "START_OFFSCREEN", streamId, wsUrl }).catch(() => null);
  if (!offscreenResp?.ok) {
    stopAsr(false);
    return;
  }

  if (!isRetry) asrRetried = false;
  asrActive = true;
  chrome.storage.local.set({ asrActive: true });
}

async function stopAsr(intentional = true) {
  if (!asrActive && intentional) {
    chrome.runtime.sendMessage({ type: "ASR_STOPPED" }).catch(() => {});
    return;
  }
  asrActive = false;
  asrTabId = null;
  chrome.storage.local.set({ asrActive: false, asrTabId: null });

  chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN" }).catch(() => {});
  chrome.offscreen.closeDocument().catch(() => {});
  chrome.runtime.sendMessage({ type: "ASR_STOPPED" }).catch(() => {});
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

  if (message?.type === "START_ASR") {
    startAsr();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "STOP_ASR") {
    stopAsr(true);
    sendResponse({ ok: true });
    return false;
  }

  // Messages relayed from offscreen (transcript results)
  if (message?.type === "interim" || message?.type === "final" || message?.type === "error") {
    (async () => {
      await settingsReady; // ensure asrTabId restored after SW restart
      if (!asrTabId) return;
      if (message.type === "interim") {
        chrome.tabs.sendMessage(asrTabId, { type: "ASR_INTERIM", text: message.text }).catch(() => {});
      } else if (message.type === "final") {
        chrome.tabs.sendMessage(asrTabId, { type: "ASR_FINAL", korean: message.korean, chinese: message.chinese }).catch(() => {});
      } else {
        chrome.tabs.sendMessage(asrTabId, { type: "ASR_ERROR", message: message.message }).catch(() => {});
      }
    })();
    return false;
  }

  // WebSocket closed in offscreen — reconnect once, then give up
  if (message?.type === "WS_CLOSED") {
    (async () => {
      await settingsReady;
      if (!asrActive) return;
      if (message.code === 4001 || message.code === 4002) {
        stopAsr();
        return;
      }
      if (!asrRetried) {
        asrRetried = true;
        asrActive = false;
        chrome.storage.local.set({ asrActive: false });
        chrome.offscreen.closeDocument().catch(() => {});
        setTimeout(() => startAsr(true), 3000);
      } else {
        stopAsr();
      }
    })();
    return false;
  }

  return false;
});

chrome.tabs.onActivated.addListener(() => {
  if (asrActive) stopAsr(true);
});

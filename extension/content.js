const CAPTION_SELECTOR = ".ytp-caption-segment";
const OVERLAY_ID = "ykt-translation-overlay";

let lastCaptionText = "";
let debounceTimer = null;
let clearTimer = null;
let guidanceTimer = null;
let hasCaptionBeenDetected = false;
let enabled = true;
let observerStarted = false;
let asrMode = false;
let asrFadeTimer = null;

function getPlayerContainer() {
  return document.querySelector(".html5-video-player") || document.body;
}

function getOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;

  getPlayerContainer().appendChild(overlay);
  return overlay;
}

function renderText(text, state = "translated") {
  const overlay = getOverlay();
  overlay.textContent = state === "error" ? `⚠ ${text}` : text;
  overlay.dataset.state = state;
  overlay.hidden = !text;
}

function currentCaptionText() {
  return [...document.querySelectorAll(CAPTION_SELECTOR)]
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/>>+\s*/g, "");
}

function getVideoMetadata() {
  const params = new URLSearchParams(location.search);
  const videoId = params.get("v") || "";
  const rawTitle = document.title || "";
  const videoTitle = rawTitle.replace(/ - YouTube$/, "").trim() || rawTitle;
  const channelEl = document.querySelector("#channel-name a, #owner-name a");
  const videoChannel = channelEl ? channelEl.textContent.trim() : null;
  const video = document.querySelector("video");
  const videoPosition = video ? Math.floor(video.currentTime) : 0;
  return { videoId, videoTitle, videoChannel, videoPosition };
}

function requestTranslation(text) {
  if (!enabled) return;

  const { videoId, videoTitle, videoChannel, videoPosition } = getVideoMetadata();
  chrome.runtime.sendMessage(
    { type: "TRANSLATE_TEXT", text, videoId, videoTitle, videoChannel, videoPosition },
    (response) => {
    if (!enabled) return;
    if (text !== lastCaptionText) return; // a newer caption replaced this one while we were waiting

    if (chrome.runtime.lastError) {
      renderText(text, "error");
      return;
    }

    renderText(response?.text || text, response?.ok ? "translated" : "error");
    }
  );
}

function scheduleGuidance() {
  if (guidanceTimer !== null || hasCaptionBeenDetected) return;
  guidanceTimer = setTimeout(() => {
    guidanceTimer = null;
    if (!hasCaptionBeenDetected && enabled) {
      renderText("请先点播放器 CC 按钮 → 选择 Korean", "guidance");
    }
  }, 5000);
}

function cancelGuidance() {
  clearTimeout(guidanceTimer);
  guidanceTimer = null;
}

function scheduleCaptionCheck() {
  if (!enabled || asrMode) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!enabled) return;

    const text = currentCaptionText();

    if (!text) {
      scheduleGuidance();
      if (clearTimer === null) {
        clearTimer = setTimeout(() => {
          renderText("");
          lastCaptionText = "";
          clearTimer = null;
        }, 1000);
      }
      return;
    }

    hasCaptionBeenDetected = true;
    cancelGuidance();

    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }

    if (text === lastCaptionText) return;

    lastCaptionText = text;
    requestTranslation(text);
  }, 100);
}

function startObserver() {
  if (observerStarted) {
    scheduleCaptionCheck();
    return;
  }

  observerStarted = true;
  const observer = new MutationObserver(scheduleCaptionCheck);
  observer.observe(getPlayerContainer(), { childList: true, subtree: true, characterData: true });
  scheduleCaptionCheck();
}

function resetPageState() {
  clearTimeout(debounceTimer);
  clearTimeout(clearTimer);
  clearTimer = null;
  cancelGuidance();
  hasCaptionBeenDetected = false;
  lastCaptionText = "";
  renderText("");
}

// YouTube SPA navigation
window.addEventListener("yt-navigate-finish", () => {
  if (!enabled) return;
  resetPageState();
  scheduleCaptionCheck();
});

chrome.runtime.sendMessage({ type: "GET_ENABLED" }, (response) => {
  enabled = chrome.runtime.lastError || response?.enabled !== false;
  if (enabled) startObserver();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.enabled) return;

  enabled = changes.enabled.newValue !== false;
  if (!enabled) {
    clearTimeout(debounceTimer);
    clearTimeout(clearTimer);
    clearTimer = null;
    cancelGuidance();
    renderText("");
  } else {
    startObserver();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ASR_INTERIM") {
    asrMode = true;
    clearTimeout(asrFadeTimer);
    renderText(`${message.text}　识别中…`, "asr-interim");
  } else if (message?.type === "ASR_FINAL") {
    asrMode = true;
    clearTimeout(asrFadeTimer);
    const display = message.chinese || message.korean || "";
    if (display) renderText(display, "translated");
    asrFadeTimer = setTimeout(() => renderText(""), 3000);
  } else if (message?.type === "ASR_ERROR") {
    clearTimeout(asrFadeTimer);
    renderText("语音识别中断", "error");
    asrFadeTimer = setTimeout(() => renderText(""), 3000);
  } else if (message?.type === "ASR_STOPPED") {
    asrMode = false;
    clearTimeout(asrFadeTimer);
    renderText("");
  }
});

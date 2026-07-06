const CAPTION_SELECTOR = ".ytp-caption-segment";
const OVERLAY_ID = "ykt-translation-overlay";

let lastCaptionText = "";
let debounceTimer = null;
let clearTimer = null;
let guidanceTimer = null;
let hasCaptionBeenDetected = false;
let enabled = true;
let observerStarted = false;

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

function requestTranslation(text) {
  if (!enabled) return;

  chrome.runtime.sendMessage({ type: "TRANSLATE_TEXT", text }, (response) => {
    if (!enabled) return;
    if (text !== lastCaptionText) return; // a newer caption replaced this one while we were waiting

    if (chrome.runtime.lastError) {
      renderText(text, "error");
      return;
    }

    renderText(response?.text || text, response?.ok ? "translated" : "error");
  });
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
  if (!enabled) return;

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

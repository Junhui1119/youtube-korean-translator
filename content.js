const CAPTION_SELECTOR = ".ytp-caption-segment";
const OVERLAY_ID = "ykt-translation-overlay";

let lastCaptionText = "";
let debounceTimer = null;
let clearTimer = null;
let enabled = true;
let observerStarted = false;

function getOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;

  const player = document.querySelector(".html5-video-player") || document.body;
  player.appendChild(overlay);
  return overlay;
}

function renderText(text, isError = false) {
  const overlay = getOverlay();
  overlay.textContent = text;
  overlay.dataset.state = isError ? "error" : "translated";
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

    if (chrome.runtime.lastError) {
      renderText(text, true);
      return;
    }

    renderText(response?.text || text, !response?.ok);
  });
}

function scheduleCaptionCheck() {
  if (!enabled) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!enabled) return;

    const text = currentCaptionText();

    if (!text) {
      if (clearTimer === null) {
        clearTimer = setTimeout(() => {
          renderText("");
          lastCaptionText = "";
          clearTimer = null;
        }, 1000);
      }
      return;
    }

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
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scheduleCaptionCheck();
}

chrome.runtime.sendMessage({ type: "GET_ENABLED" }, (response) => {
  enabled = chrome.runtime.lastError || response?.enabled !== false;
  if (enabled) {
    startObserver();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.enabled) return;

  enabled = changes.enabled.newValue !== false;
  if (!enabled) {
    clearTimeout(debounceTimer);
    clearTimeout(clearTimer);
    clearTimer = null;
    renderText("");
  } else {
    startObserver();
  }
});

const enabledInput = document.getElementById("enabled");
const statusEl = document.getElementById("status");
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const engineTag = document.getElementById("engineTag");
const backendUrlInput = document.getElementById("backendUrl");
const backendTokenInput = document.getElementById("backendToken");
const saveBackendBtn = document.getElementById("saveBackend");
const backendTag = document.getElementById("backendTag");

function setStatus(enabled, degraded = false) {
  if (!enabled) {
    statusEl.textContent = "翻译已关闭";
    statusEl.className = "status";
  } else if (degraded) {
    statusEl.textContent = "后端不可用，已切换 Google 翻译";
    statusEl.className = "status degraded";
  } else {
    statusEl.textContent = "已启用，监听字幕中…";
    statusEl.className = "status on";
  }
}

function setEngineTag(apiKey) {
  if (apiKey) {
    engineTag.textContent = "当前引擎：DeepL";
    engineTag.className = "engine-tag deepl";
  } else {
    engineTag.textContent = "当前引擎：Google 翻译";
    engineTag.className = "engine-tag";
  }
}

function setBackendTag(url) {
  if (url) {
    backendTag.textContent = "后端模式已启用";
    backendTag.className = "engine-tag deepl";
  } else {
    backendTag.textContent = "直连模式";
    backendTag.className = "engine-tag";
  }
}

chrome.storage.local.get(
  { enabled: true, deeplApiKey: "", backendUrl: "", backendToken: "" },
  ({ enabled, deeplApiKey, backendUrl, backendToken }) => {
    enabledInput.checked = enabled;
    setStatus(enabled);
    apiKeyInput.value = deeplApiKey;
    setEngineTag(deeplApiKey);
    backendUrlInput.value = backendUrl;
    backendTokenInput.value = backendToken;
    setBackendTag(backendUrl);
  }
);

enabledInput.addEventListener("change", () => {
  const enabled = enabledInput.checked;
  chrome.storage.local.set({ enabled });
  setStatus(enabled);
});

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.local.set({ deeplApiKey: key });
  setEngineTag(key);
  saveKeyBtn.textContent = "已保存";
  setTimeout(() => (saveKeyBtn.textContent = "保存"), 1500);
});

saveBackendBtn.addEventListener("click", () => {
  const url = backendUrlInput.value.trim();
  const token = backendTokenInput.value.trim();
  chrome.storage.local.set({ backendUrl: url, backendToken: token });
  setBackendTag(url);
  saveBackendBtn.textContent = "已保存";
  setTimeout(() => (saveBackendBtn.textContent = "保存"), 1500);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "BACKEND_DEGRADED") {
    setStatus(enabledInput.checked, true);
  }
});

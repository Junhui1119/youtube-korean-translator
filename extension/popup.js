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
  { enabled: true, deeplApiKey: "", backendUrl: "", backendToken: "", backendDegraded: false },
  ({ enabled, deeplApiKey, backendUrl, backendToken, backendDegraded: degraded }) => {
    enabledInput.checked = enabled;
    setStatus(enabled, degraded);
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

saveBackendBtn.addEventListener("click", async () => {
  const url = backendUrlInput.value.trim();
  const token = backendTokenInput.value.trim();

  if (url) {
    let origin;
    try {
      origin = new URL(url).origin + "/*";
    } catch {
      saveBackendBtn.textContent = "URL 无效";
      setTimeout(() => (saveBackendBtn.textContent = "保存"), 1500);
      return;
    }
    const granted = await new Promise((resolve) => {
      chrome.permissions.request({ origins: [origin] }, resolve);
    });
    if (!granted) {
      saveBackendBtn.textContent = "权限被拒绝";
      setTimeout(() => (saveBackendBtn.textContent = "保存"), 1500);
      return;
    }
  }

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

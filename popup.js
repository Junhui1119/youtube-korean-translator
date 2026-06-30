const enabledInput = document.getElementById("enabled");
const statusEl = document.getElementById("status");
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const engineTag = document.getElementById("engineTag");

function setStatus(enabled) {
  if (enabled) {
    statusEl.textContent = "已启用，监听字幕中…";
    statusEl.className = "status on";
  } else {
    statusEl.textContent = "翻译已关闭";
    statusEl.className = "status";
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

chrome.storage.local.get({ enabled: true, deeplApiKey: "" }, ({ enabled, deeplApiKey }) => {
  enabledInput.checked = enabled;
  setStatus(enabled);
  apiKeyInput.value = deeplApiKey;
  setEngineTag(deeplApiKey);
});

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

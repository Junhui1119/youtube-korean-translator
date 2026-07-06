// ── DOM refs ────────────────────────────────────────────────
const loginView     = document.getElementById("login-view");
const mainView      = document.getElementById("main-view");
const authTitle     = document.getElementById("auth-title");
const authEmail     = document.getElementById("auth-email");
const authPassword  = document.getElementById("auth-password");
const authSubmit    = document.getElementById("auth-submit");
const authError     = document.getElementById("auth-error");
const authToggle    = document.getElementById("auth-toggle");
const userBar       = document.getElementById("user-bar");
const userEmailEl   = document.getElementById("user-email");
const logoutBtn     = document.getElementById("logout-btn");
const enabledInput  = document.getElementById("enabled");
const statusEl      = document.getElementById("status");
const apiKeyInput   = document.getElementById("apiKey");
const saveKeyBtn    = document.getElementById("saveKey");
const engineTag     = document.getElementById("engineTag");
const backendUrlInput   = document.getElementById("backendUrl");
const backendTokenInput = document.getElementById("backendToken");
const saveBackendBtn    = document.getElementById("saveBackend");
const backendTag        = document.getElementById("backendTag");

// ── JWT helpers ──────────────────────────────────────────────
function decodeJwtExp(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64)).exp;
  } catch {
    return 0;
  }
}

function isJwtValid(token) {
  return !!token && decodeJwtExp(token) > Date.now() / 1000;
}

// ── View switching ───────────────────────────────────────────
function showLoginView() {
  loginView.hidden = false;
  mainView.hidden = true;
}

function showMainView(email) {
  loginView.hidden = true;
  mainView.hidden = false;
  if (email) {
    userBar.hidden = false;
    userEmailEl.textContent = email;
  } else {
    userBar.hidden = true;
  }
}

// ── Status / tag helpers (unchanged logic) ───────────────────
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

function initMainViewFields({ enabled, deeplApiKey, backendUrl, backendToken, backendDegraded }) {
  enabledInput.checked = enabled;
  setStatus(enabled, backendDegraded);
  apiKeyInput.value = deeplApiKey;
  setEngineTag(deeplApiKey);
  backendUrlInput.value = backendUrl;
  backendTokenInput.value = backendToken;
  setBackendTag(backendUrl);
}

// ── Init ─────────────────────────────────────────────────────
chrome.storage.local.get(
  {
    jwt: "",
    userEmail: "",
    enabled: true,
    deeplApiKey: "",
    backendUrl: "",
    backendToken: "",
    backendDegraded: false,
  },
  (store) => {
    if (!store.backendUrl) {
      // No backend configured: show main view so user can set backend URL
      showMainView("");
      initMainViewFields(store);
    } else if (!isJwtValid(store.jwt)) {
      showLoginView();
    } else {
      showMainView(store.userEmail);
      initMainViewFields(store);
    }
  }
);

// ── Auth form ─────────────────────────────────────────────────
let isRegisterMode = false;

authToggle.addEventListener("click", (e) => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  authTitle.textContent = isRegisterMode ? "注册账号" : "登录账号";
  authSubmit.textContent = isRegisterMode ? "注册" : "登录";
  authToggle.textContent = isRegisterMode ? "已有账号？登录" : "没有账号？注册";
  authError.textContent = "";
});

authSubmit.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  authError.textContent = "";

  if (!email || !password) {
    authError.textContent = "请填写邮箱和密码";
    return;
  }

  const { backendUrl } = await new Promise((resolve) =>
    chrome.storage.local.get({ backendUrl: "" }, resolve)
  );

  if (!backendUrl) {
    authError.textContent = "请先配置后端地址";
    return;
  }

  const endpoint = isRegisterMode ? "/api/auth/register" : "/api/auth/login";
  authSubmit.disabled = true;

  try {
    const res = await fetch(`${backendUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      authError.textContent = data.detail || (isRegisterMode ? "注册失败" : "邮箱或密码错误");
      return;
    }
    chrome.storage.local.set({ jwt: data.token, userEmail: data.email });
    showMainView(data.email || email);
    const store = await new Promise((resolve) =>
      chrome.storage.local.get(
        { enabled: true, deeplApiKey: "", backendUrl: "", backendToken: "", backendDegraded: false },
        resolve
      )
    );
    initMainViewFields(store);
  } catch {
    authError.textContent = "网络错误，请检查后端地址";
  } finally {
    authSubmit.disabled = false;
  }
});

// ── Logout ────────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["jwt", "userEmail"]);
  showLoginView();
  isRegisterMode = false;
  authTitle.textContent = "登录账号";
  authSubmit.textContent = "登录";
  authToggle.textContent = "没有账号？注册";
  authError.textContent = "";
});

// ── Existing settings handlers (unchanged) ────────────────────
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

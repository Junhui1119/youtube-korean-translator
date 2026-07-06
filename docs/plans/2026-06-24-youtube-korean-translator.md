# 韩语 YouTube 中文字幕插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 Chrome 插件，自动读取 YouTube 的韩语 CC 字幕、用免费 Google 翻译接口翻成中文，并实时叠加显示在视频上。

**Architecture:** 纯前端 Manifest V3 插件。content script 只负责"读 DOM 字幕 / 画译文"这类浏览器粘合逻辑；所有可测试的核心逻辑（构造翻译请求、解析返回、缓存、去重编排）放在 background service worker 调用的 ES 模块里，用 Node 内置测试器单测。content script 通过消息把韩语文本发给 background，background 返回中文。

**Tech Stack:** 原生 JavaScript（ES Modules）、Chrome Extension Manifest V3、Node.js 内置测试器（`node --test`，无第三方依赖）、无构建步骤。

## Global Constraints

- Manifest V3；service worker 用 `"type": "module"`。
- 纯原生 JavaScript + ES Modules，**无构建步骤**。
- **零运行时/测试依赖**：测试用 Node 内置 `node:test` + `node:assert`，需 Node 18+。
- 源语言固定 `ko`，目标语言固定 `zh-CN`（v1 只做中文）。
- 翻译接口：`https://translate.googleapis.com/translate_a/single`（免费 gtx 客户端）。
- v1 只显示中文译文（单层叠加），翻译失败时回退显示原韩语。
- 所有翻译网络请求在 background service worker 中发起（避免 content script 跨域）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `package.json` | 声明 `"type":"module"` 与 `test` 脚本（`node --test`） |
| `manifest.json` | MV3 配置：content script、module service worker、host 权限、popup |
| `src/translate.js` | 纯逻辑：构造翻译 URL、解析返回、`translateText`（注入 fetch） |
| `src/cache.js` | 纯逻辑：内存缓存（Map 封装） |
| `src/translator-core.js` | 纯逻辑：编排「查缓存→翻译→存缓存→去空白」 |
| `background.js` | service worker：用真实 fetch+cache 组装 translator，监听消息 |
| `content.js` | 浏览器粘合：MutationObserver 读字幕、发消息、画叠加层（手测） |
| `styles.css` | 中文叠加层样式 |
| `popup.html` / `popup.js` | 开/关开关，状态存 `chrome.storage.local`（手测） |
| `README.md` | 安装与使用说明 |
| `tests/translate.test.js` | `src/translate.js` 单测 |
| `tests/cache.test.js` | `src/cache.js` 单测 |
| `tests/translator-core.test.js` | `src/translator-core.js` 单测 |

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `src/.gitkeep`、`tests/.gitkeep`（建目录占位）

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `npm test`（此时 0 个测试）；MV3 manifest 骨架。

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "youtube-korean-translator",
  "version": "0.1.0",
  "description": "Chrome extension that translates Korean YouTube captions to Chinese in real time.",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 创建 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "韩语 YouTube 中文字幕",
  "version": "0.1.0",
  "description": "把 YouTube 的韩语字幕实时翻译成中文，叠加显示。",
  "permissions": ["storage"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://translate.googleapis.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "韩语→中文字幕"
  }
}
```

- [ ] **Step 3: 建目录占位**

```bash
mkdir -p src tests
touch src/.gitkeep tests/.gitkeep
```

- [ ] **Step 4: 验证 `npm test` 能跑**

Run: `npm test`
Expected: 退出码 0，输出类似 `tests 0`（没有测试文件也算成功）。

- [ ] **Step 5: 提交**

```bash
git add package.json manifest.json src/.gitkeep tests/.gitkeep
git commit -m "chore: scaffold MV3 extension and node test runner"
```

---

## Task 2: 翻译 URL 构造 + 返回解析

**Files:**
- Create: `src/translate.js`
- Test: `tests/translate.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `buildTranslateUrl(text, source = "ko", target = "zh-CN") -> string`
  - `parseTranslateResponse(data) -> string`

- [ ] **Step 1: 写失败测试**

`tests/translate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTranslateUrl, parseTranslateResponse } from "../src/translate.js";

test("buildTranslateUrl 带上源语言、目标语言、编码后的文本", () => {
  const url = buildTranslateUrl("안녕하세요", "ko", "zh-CN");
  assert.ok(url.startsWith("https://translate.googleapis.com/translate_a/single?"));
  assert.ok(url.includes("sl=ko"));
  assert.ok(url.includes("tl=zh-CN"));
  assert.ok(url.includes("q=" + encodeURIComponent("안녕하세요")));
});

test("parseTranslateResponse 拼接所有译文分段", () => {
  const data = [[["大家好", "안녕하세요", null, null], ["，今天", "，오늘", null, null]], null, "ko"];
  assert.equal(parseTranslateResponse(data), "大家好，今天");
});

test("parseTranslateResponse 对畸形数据返回空串", () => {
  assert.equal(parseTranslateResponse(null), "");
  assert.equal(parseTranslateResponse([]), "");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/translate.test.js`
Expected: FAIL，报找不到 `../src/translate.js` 或导出未定义。

- [ ] **Step 3: 写最小实现**

`src/translate.js`:

```js
export function buildTranslateUrl(text, source = "ko", target = "zh-CN") {
  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
}

export function parseTranslateResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  return data[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .filter(Boolean)
    .join("");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/translate.test.js`
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src/translate.js tests/translate.test.js
git commit -m "feat: add translate URL builder and response parser"
```

---

## Task 3: translateText（带可注入 fetch）

**Files:**
- Modify: `src/translate.js`
- Test: `tests/translate.test.js`

**Interfaces:**
- Consumes: `buildTranslateUrl`、`parseTranslateResponse`
- Produces: `translateText(text, fetchFn = fetch, source = "ko", target = "zh-CN") -> Promise<string>`

- [ ] **Step 1: 追加失败测试**

在 `tests/translate.test.js` 顶部 import 里加上 `translateText`：

```js
import { buildTranslateUrl, parseTranslateResponse, translateText } from "../src/translate.js";
```

在文件末尾追加：

```js
test("translateText 请求 URL 并返回解析后的译文", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [[["你好", "안녕", null, null]], null, "ko"],
  });
  const result = await translateText("안녕", fakeFetch);
  assert.equal(result, "你好");
});

test("translateText 在响应非 ok 时抛错", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(() => translateText("안녕", fakeFetch), /429/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/translate.test.js`
Expected: FAIL，`translateText is not a function`。

- [ ] **Step 3: 追加实现**

在 `src/translate.js` 末尾追加：

```js
export async function translateText(text, fetchFn = fetch, source = "ko", target = "zh-CN") {
  const url = buildTranslateUrl(text, source, target);
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }
  const data = await response.json();
  return parseTranslateResponse(data);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/translate.test.js`
Expected: PASS（5 个测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src/translate.js tests/translate.test.js
git commit -m "feat: add translateText with injectable fetch"
```

---

## Task 4: 翻译缓存

**Files:**
- Create: `src/cache.js`
- Test: `tests/cache.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `createCache() -> { has(key), get(key), set(key, value), get size }`

- [ ] **Step 1: 写失败测试**

`tests/cache.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/cache.js";

test("缓存能存取值", () => {
  const cache = createCache();
  assert.equal(cache.has("안녕"), false);
  cache.set("안녕", "你好");
  assert.equal(cache.has("안녕"), true);
  assert.equal(cache.get("안녕"), "你好");
});

test("缓存能报告大小", () => {
  const cache = createCache();
  cache.set("a", "1");
  cache.set("b", "2");
  assert.equal(cache.size, 2);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/cache.test.js`
Expected: FAIL，找不到 `../src/cache.js`。

- [ ] **Step 3: 写最小实现**

`src/cache.js`:

```js
export function createCache() {
  const store = new Map();
  return {
    has(key) {
      return store.has(key);
    },
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
      return value;
    },
    get size() {
      return store.size;
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/cache.test.js`
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src/cache.js tests/cache.test.js
git commit -m "feat: add in-memory translation cache"
```

---

## Task 5: 翻译编排核心

**Files:**
- Create: `src/translator-core.js`
- Test: `tests/translator-core.test.js`

**Interfaces:**
- Consumes: 任意符合 `translateFn(text) -> Promise<string>` 的函数；任意符合 `createCache()` 返回结构的缓存对象
- Produces: `createTranslator({ translateFn, cache }) -> { translate(text) -> Promise<string> }`

- [ ] **Step 1: 写失败测试**

`tests/translator-core.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "../src/translator-core.js";
import { createCache } from "../src/cache.js";

test("translate 返回译文并缓存（重复输入不再请求）", async () => {
  let calls = 0;
  const translateFn = async () => { calls++; return "你好"; };
  const translator = createTranslator({ translateFn, cache: createCache() });

  assert.equal(await translator.translate("안녕"), "你好");
  assert.equal(await translator.translate("안녕"), "你好");
  assert.equal(calls, 1, "第二次应命中缓存");
});

test("translate 对空白输入返回空串且不调用 translateFn", async () => {
  let calls = 0;
  const translateFn = async () => { calls++; return "x"; };
  const translator = createTranslator({ translateFn, cache: createCache() });
  assert.equal(await translator.translate("   "), "");
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/translator-core.test.js`
Expected: FAIL，找不到 `../src/translator-core.js`。

- [ ] **Step 3: 写最小实现**

`src/translator-core.js`:

```js
export function createTranslator({ translateFn, cache }) {
  return {
    async translate(text) {
      const trimmed = (text || "").trim();
      if (!trimmed) return "";
      if (cache.has(trimmed)) {
        return cache.get(trimmed);
      }
      const translated = await translateFn(trimmed);
      cache.set(trimmed, translated);
      return translated;
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test`
Expected: PASS（全部测试：translate 5 + cache 2 + core 2 = 9 个通过）。

- [ ] **Step 5: 提交**

```bash
git add src/translator-core.js tests/translator-core.test.js
git commit -m "feat: add translator core orchestration with caching"
```

---

## Task 6: background service worker

**Files:**
- Create: `background.js`

**Interfaces:**
- Consumes: `translateText`（`src/translate.js`）、`createCache`（`src/cache.js`）、`createTranslator`（`src/translator-core.js`）
- Produces: 监听 `{ type: "translate", text }` 消息，回 `{ ok: true, translation }` 或 `{ ok: false, error }`

> 说明：service worker 依赖 `chrome.*` 运行时，无法用 Node 单测。逻辑已尽量下沉到 Task 2–5 的纯模块（已单测）；此处只做装配，靠浏览器手动验证。

- [ ] **Step 1: 写实现**

`background.js`:

```js
import { translateText } from "./src/translate.js";
import { createCache } from "./src/cache.js";
import { createTranslator } from "./src/translator-core.js";

const cache = createCache();
const translator = createTranslator({
  translateFn: (text) => translateText(text, fetch, "ko", "zh-CN"),
  cache,
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "translate") {
    translator
      .translate(message.text)
      .then((translation) => sendResponse({ ok: true, translation }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true; // 保持消息通道开启以异步回复
  }
  return false;
});
```

- [ ] **Step 2: 手动验证 service worker 注册成功**

1. 打开 `chrome://extensions`，右上角开「开发者模式」。
2. 点「加载已解压的扩展程序」，选项目根目录 `/Users/w./Desktop/AI开发`。
3. 扩展卡片上点「Service Worker」链接打开它的 DevTools，确认**无红色报错**（import 路径、module 类型都正确）。

Expected: service worker 成功启动，控制台无报错。

- [ ] **Step 3: 提交**

```bash
git add background.js
git commit -m "feat: add background service worker wiring translator to messages"
```

---

## Task 7: content script + 叠加层样式

**Files:**
- Create: `content.js`
- Create: `styles.css`

**Interfaces:**
- Consumes: 向 background 发 `{ type: "translate", text }`，期望回 `{ ok, translation }`
- Produces: 在视频上渲染 `#ktrans-overlay` 译文层；响应 `chrome.storage.local` 的 `enabled` 开关

> 说明：content script 是浏览器 DOM 粘合逻辑，靠真实 YouTube 手测。

- [ ] **Step 1: 写 `styles.css`**

```css
#ktrans-overlay {
  position: absolute;
  left: 50%;
  bottom: 12%;
  transform: translateX(-50%);
  max-width: 80%;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 22px;
  line-height: 1.4;
  text-align: center;
  border-radius: 4px;
  z-index: 2147483647;
  pointer-events: none;
  white-space: pre-wrap;
}
```

- [ ] **Step 2: 写 `content.js`**

```js
(() => {
  const OVERLAY_ID = "ktrans-overlay";
  let enabled = true;
  let lastText = "";
  let debounceTimer = null;

  // 读取开关状态（默认开）
  chrome.storage?.local.get(["enabled"], (res) => {
    if (typeof res.enabled === "boolean") enabled = res.enabled;
  });
  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
      if (!enabled) clearOverlay();
    }
  });

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      const player = document.querySelector(".html5-video-player") || document.body;
      player.appendChild(overlay);
    }
    return overlay;
  }

  function clearOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.textContent = "";
  }

  function showTranslation(text) {
    ensureOverlay().textContent = text;
  }

  function readCaptionText() {
    const segments = document.querySelectorAll(".ytp-caption-segment");
    if (!segments.length) return "";
    return Array.from(segments).map((s) => s.textContent).join(" ").trim();
  }

  function handleCaptionChange() {
    if (!enabled) return;
    const text = readCaptionText();
    if (!text || text === lastText) return;
    lastText = text;
    chrome.runtime.sendMessage({ type: "translate", text }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.ok && response.translation) {
        showTranslation(response.translation);
      } else {
        showTranslation(text); // 失败回退：显示原韩语
      }
    });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleCaptionChange, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
```

- [ ] **Step 3: 在真实 YouTube 上手测**

1. 在 `chrome://extensions` 点扩展卡片的「🔄 重新加载」。
2. 打开一个有韩语字幕的视频（如任意韩语频道）。
3. 点播放器右下角 CC，把字幕语言切到 **韩语 / Korean**。
4. 播放视频。

Expected: 视频底部出现黑底白字的**中文译文**，随韩语字幕滚动更新（有 1–2 秒延迟属正常）。若翻译失败则回退显示韩语原文。

- [ ] **Step 4: 提交**

```bash
git add content.js styles.css
git commit -m "feat: add content script and overlay styles for live caption translation"
```

---

## Task 8: popup 开关

**Files:**
- Create: `popup.html`
- Create: `popup.js`

**Interfaces:**
- Consumes: `chrome.storage.local` 的 `enabled` 字段
- Produces: 勾选框写入 `enabled`；content.js 监听其变化

- [ ] **Step 1: 写 `popup.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <style>
    body { width: 200px; font-family: sans-serif; padding: 12px; }
    .row { display: flex; align-items: center; justify-content: space-between; }
    h1 { font-size: 14px; margin: 0 0 10px; }
    .hint { font-size: 12px; color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>韩语→中文字幕</h1>
  <div class="row">
    <span>启用翻译</span>
    <input type="checkbox" id="toggle" />
  </div>
  <p class="hint">使用前请在 YouTube 播放器打开韩语 CC 字幕。</p>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 `popup.js`**

```js
const toggle = document.getElementById("toggle");

chrome.storage.local.get(["enabled"], (res) => {
  toggle.checked = res.enabled !== false; // 默认开
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});
```

- [ ] **Step 3: 手测开关**

1. 重新加载扩展，打开正在显示中文译文的视频。
2. 点工具栏插件图标，取消勾选「启用翻译」。

Expected: 译文叠加层立即清空/不再更新；重新勾选后恢复。

- [ ] **Step 4: 提交**

```bash
git add popup.html popup.js
git commit -m "feat: add popup with enable/disable toggle"
```

---

## Task 9: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: 安装与使用说明

- [ ] **Step 1: 写 `README.md`**

```markdown
# 韩语 YouTube 中文字幕

一个 Chrome 插件：把 YouTube 视频的韩语字幕实时翻译成中文，叠加显示在视频上。纯前端，无需后端和 API key。

## 安装（开发者模式）

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本项目根目录。

## 使用

1. 打开一个有韩语字幕的 YouTube 视频。
2. 点播放器右下角 **CC**，把字幕语言切到 **韩语 / Korean**。
3. 播放视频，底部会出现中文译文（约 1–2 秒延迟）。
4. 点工具栏插件图标可随时开/关翻译。

## 限制（v1）

- 只支持**有韩语字幕轨**的视频（含 YouTube 自动生成的字幕）。
- 完全没有字幕的视频暂不支持（后续语音识别阶段再做）。
- 仅翻译为中文；使用免费 Google 翻译接口，可能偶发限流。

## 开发

- 运行单元测试：`npm test`（需 Node 18+，无第三方依赖）。
- 核心可测逻辑在 `src/`，浏览器粘合逻辑在 `content.js` / `background.js`。
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: add README with install and usage instructions"
```

- [ ] **Step 3: 推送到 GitHub**

```bash
git push
```

---

## 完成标准

- `npm test` 全绿（9 个单元测试）。
- 在真实韩语 YouTube 视频上，开启韩语 CC 后能看到实时中文译文。
- popup 开关能即时启用/停用。
- 全部提交并推送到 `origin/main`。

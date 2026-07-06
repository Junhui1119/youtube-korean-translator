# Popup 状态提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 popup 的开关下方加一行状态文字，显示插件当前是否正在工作。

**Architecture:** 只改 `popup.html` 和 `popup.js` 两个文件。popup.html 加 `<p id="status">` 元素和对应 CSS；popup.js 在读取/更新 `enabled` 时同步更新状态文字。无新依赖、无后端通信、无消息通道。

**Tech Stack:** Vanilla HTML/CSS/JS，Chrome Extension MV3 `chrome.storage.local`

## Global Constraints

- 不引入任何第三方库
- 不修改 `content.js`、`background.js`、`src/translate.js`、`styles.css`、`manifest.json`
- popup 宽度保持 220px，不撑大布局

---

### Task 1: 修改 popup.html — 加状态元素和样式

**Files:**
- Modify: `popup.html`

**Interfaces:**
- Produces: `<p id="status" class="status">` 元素，供 `popup.js` 操作其 `textContent` 和 `className`

- [ ] **Step 1: 修改 popup.html**

将 `popup.html` 完整替换为以下内容：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>韩语→中文字幕</title>
    <style>
      body {
        width: 220px;
        margin: 0;
        padding: 14px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
      }

      input {
        width: 18px;
        height: 18px;
      }

      .status {
        margin: 10px 0 0;
        font-size: 12px;
        color: #666;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .status::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #ccc;
      }

      .status.on::before {
        background: #22c55e;
      }
    </style>
  </head>
  <body>
    <label>
      <span>显示中文字幕</span>
      <input id="enabled" type="checkbox" />
    </label>
    <p id="status" class="status">翻译已关闭</p>
    <script src="popup.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 2: 视觉验证**

在浏览器直接打开 `popup.html`（`open popup.html`），确认：
- 布局宽 220px，不溢出
- 状态行显示灰点 + "翻译已关闭"（初始 checkbox 未勾选时）

---

### Task 2: 修改 popup.js — 状态文字同步逻辑

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `<p id="status">` 元素（Task 1 产出）
- Consumes: `chrome.storage.local` 的 `enabled` 键（Boolean，默认 `true`）

- [ ] **Step 1: 修改 popup.js**

将 `popup.js` 完整替换为以下内容：

```js
const enabledInput = document.getElementById("enabled");
const statusEl = document.getElementById("status");

function setStatus(enabled) {
  if (enabled) {
    statusEl.textContent = "已启用，监听字幕中…";
    statusEl.className = "status on";
  } else {
    statusEl.textContent = "翻译已关闭";
    statusEl.className = "status";
  }
}

chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = enabled;
  setStatus(enabled);
});

enabledInput.addEventListener("change", () => {
  const enabled = enabledInput.checked;
  chrome.storage.local.set({ enabled });
  setStatus(enabled);
});
```

- [ ] **Step 2: 在 Chrome 中加载并测试**

1. 打开 `chrome://extensions`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"，选择项目根目录（`youtube-korean-translator/`）
4. 打开任意 YouTube 视频，打开韩语字幕
5. 点击工具栏中插件图标，确认：
   - popup 显示绿点 + "已启用，监听字幕中…"
   - 取消勾选后变为灰点 + "翻译已关闭"
   - 重新勾选后恢复绿点

- [ ] **Step 3: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add status indicator to popup"
```

---

## 自检

- [x] 覆盖设计文档所有验收标准：绿点启用、灰点关闭、切换即时生效
- [x] 无 placeholder、无 TBD
- [x] `setStatus` 函数签名在 Task 2 定义且唯一使用
- [x] 宽度 220px 不变，无新依赖

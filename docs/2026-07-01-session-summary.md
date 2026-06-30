# 开发记录 2026-07-01

## 项目背景

YouTube 韩语字幕实时翻译 Chrome 插件。纯前端，无后端，调用免费 Google 翻译 API，在原韩语字幕正下方追加中文译文。

技术栈：Vanilla JS + Chrome Extension MV3 + `chrome.storage.local`

---

## 本次完成的工作

### 1. Popup 状态指示器

**背景**：上一个 Claude 会话已写好实现计划（`docs/superpowers/plans/2026-07-01-popup-status.md`），本次接续执行。

**改动**：
- `popup.html`：在开关下方加 `<p id="status">` 元素，内联 CSS 实现圆点 + 文字布局
- `popup.js`：加 `setStatus(enabled)` 函数，读取/切换时同步更新状态文字

**效果**：
- 启用：绿点 + "已启用，监听字幕中…"
- 关闭：灰点 + "翻译已关闭"
- 切换即时生效，宽度保持 220px 不变

---

### 2. 字幕 `>>` 符号过滤

**问题**：多人视频的 CC 字幕文件本身用 `>>` 标注换人，翻译结果里也会带出来。

**修复**（`content.js` → `currentCaptionText()`）：
```js
.join(" ")
.replace(/>>+\s*/g, "")
```
在拼接所有字幕段后、发送给翻译 API 前全局替换，中文结果不再出现 `>>`。

---

### 3. 翻译延迟优化

**问题**：字幕变化到中文显示感知延迟偏高，说话快时跟不上。

**两处优化**：

| 位置 | 改动 | 原因 |
|------|------|------|
| `content.js` | 防抖 250ms → **100ms** | 字幕变化后更快触发翻译 |
| `background.js` | `enabled` 状态改为内存缓存，`onChanged` 同步更新 | 去掉每次翻译都读一次 `chrome.storage.local` 的额外异步 |

> 网络延迟（Google 翻译 API 响应时间）不可控，但触发链路的可控延迟已降到最低。

---

### 4. 字幕消失后的保留逻辑

**问题**：原字幕消失后，中文译文会一直残留直到下一条字幕出现，体验不干净。

**逻辑设计**（用户确认）：
- 字幕消失 → 1 秒内无新字幕 → 中文隐藏
- 1 秒内有新字幕 → 取消计时器，立即翻译

**实现**（`content.js`）：
```js
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
```
关闭扩展时同步清除 `clearTimer`，不留野计时器。

---

## 文件变更一览

| 文件 | 改动内容 |
|------|----------|
| `popup.html` | 加状态元素 + CSS（绿点/灰点） |
| `popup.js` | 加 `setStatus()` 函数，读取/切换时调用 |
| `content.js` | 过滤 `>>`、防抖 100ms、1s 字幕清除逻辑 |
| `background.js` | `enabled` 内存缓存，去掉每次翻译的 storage 读取 |
| `docs/superpowers/specs/2026-06-25-youtube-korean-translator-prd.md` | FR-1/FR-4/FR-5 补充新行为描述 |

---

## 当前状态（第一阶段）

- 所有改动已测试通过（用户在 Chrome 中验证）
- 已 commit：`656e961 feat(extension): popup status, DeepL engine, UX polish`

---

### 5. 切换翻译引擎为 DeepL

**背景**：Google 翻译质量有限，DeepL 免费版（50 万字/月）质量明显更好。

**实现**：
- `src/translate.js`：有 key 走 DeepL，无 key 走 Google，两者共存可随时切换
- `background.js`：缓存 `deeplApiKey`，切换引擎时自动清空翻译缓存
- `popup.html/js`：加 API Key 输入框 + 保存按钮，底部显示当前引擎
- `manifest.json`：加 `https://api-free.deepl.com/*` host 权限

**效果**：用户测试后确认翻译准确度提升明显。

---

### 6. Code Review 问题修复

| 问题 | 修复 |
|------|------|
| `translationCache` 无上限，长时间使用持续增长 | 加 200 条 FIFO 上限，超限时淘汰最旧条目 |
| 后端 `RecordWatchRequest` 无输入校验 | `video_id` 格式/长度、`title` 非空、`last_position >= 0`、`channel` 长度限制 |

已 commit：`8933ce8 fix: cap translation cache; add backend input validation`

---

### 7. 实现 8 个 v1 GitHub Issues

已 commit：`8e7a603 feat(v1): glossary correction, SPA navigation, no-CC guidance, 429 backoff, tests, README`

| Issue | 内容 | 关键文件 |
|-------|------|---------|
| #1 术语库校正（p0） | 占位符法：翻译前把韩语术语替换为 `<ykt0/>`，翻译后还原 | `src/glossary.js`（新建） |
| #2 无字幕引导（p1） | 从未检测到 CC 时 5 秒后显示"请先点 CC 按钮 → 选择 Korean" | `content.js` |
| #3 SPA 切换视频（p1） | 监听 `yt-navigate-finish`，重置所有状态，无需重建 Observer | `content.js` |
| #4 翻译失败可见状态（p1） | `renderText` 加 state 枚举，失败显示 `⚠ 原文` + 红色背景 | `content.js` `styles.css` |
| #5 429 退避重试（p1） | Google 遇 429/5xx 自动重试 3 次（1s→2s→4s），非重试错误直接抛 | `src/translate.js` |
| #6 README 更新（p2） | 重写，含 DeepL 配置、术语库说明、后端启动、Roadmap | `README.md` |
| #7 单元测试（p2） | 新增 glossary（7 个）、cache（2 个）、translate 更新，**15 个全绿** | `tests/` |
| #8 Store 图标（p1） | 图标生成器 HTML + manifest 加 icons 字段 | `scripts/generate-icons.html` |

---

## 所有 Commits

```
656e961  feat(extension): popup status, DeepL engine, UX polish
8933ce8  fix: cap translation cache at 200 entries; add backend input validation
2e99a72  docs: update roadmap with ASR phases and v1 completed items
8e7a603  feat(v1): glossary correction, SPA navigation, no-CC guidance, 429 backoff, tests, README
```

---

## 待做

- [ ] 生成图标：用 Chrome 打开 `scripts/generate-icons.html`，下载三个 PNG 到 `icons/` 目录
- [ ] 重新加载扩展，验证术语库校正生效（如 `한타` → "团战"）
- [ ] 验证 SPA 切换视频、无字幕引导、错误状态在 Chrome 中正常工作
- [ ] 扩充 `glossary/ko-zh-game-terms.csv`（按实际测试结果补充目标主播常用术语）
- [ ] 后端部署（FastAPI + PostgreSQL，Render 或 Railway）

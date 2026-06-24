# 韩语 YouTube 中文字幕

一个 Chrome 浏览器插件：把 YouTube 视频的**韩语字幕**实时翻译成**中文**，叠加显示在视频上。纯前端实现，无需后端服务器、无需 API key。

## 工作原理

插件读取 YouTube 播放器中已显示的韩语 CC 字幕文字 → 通过免费 Google 翻译接口翻成中文 → 叠加显示在视频上。

```
打开韩语 CC 字幕 → 监听字幕文字 → 翻译 → 叠加显示中文
```

## 安装（开发者模式）

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本项目目录。

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

```bash
npm test   # 运行单元测试（需 Node 18+，无第三方依赖）
```

核心可测逻辑在 `src/`，浏览器粘合逻辑在 `content.js` / `background.js`。详见 [AGENTS.md](AGENTS.md)。

设计与实现计划：

- 设计文档：`docs/superpowers/specs/2026-06-24-youtube-korean-translator-design.md`
- 实现计划：`docs/superpowers/plans/2026-06-24-youtube-korean-translator.md`

## 当前进度

开发中。已完成：

- [x] Task 1 — 项目脚手架（`manifest.json` / `package.json`）
- [x] Task 2 — 翻译 URL 构造 + 返回解析（`src/translate.js`）
- [ ] Task 3 — `translateText`（带可注入 fetch）
- [ ] Task 4 — 翻译缓存
- [ ] Task 5 — 翻译编排核心
- [ ] Task 6 — background service worker
- [ ] Task 7 — content script + 叠加层样式
- [ ] Task 8 — popup 开关
- [ ] Task 9 — README

> 在所有任务完成前，插件尚不能端到端运行。

## License

MIT

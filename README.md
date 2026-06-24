# 韩语 YouTube 中文字幕插件

一个 Chrome Manifest V3 插件：读取 YouTube 页面里已经显示的韩语 CC 字幕，调用免费的 Google 翻译接口翻成中文，并把译文叠加显示在视频上。

## 目标用户

看韩语游戏直播 / 视频，但**不懂韩语**的非韩语母语者。

使用前需要先在 YouTube 播放器中打开韩语 CC 字幕。完全没有字幕轨的视频，当前 v1 不支持。

## v1 功能

1. 监听 YouTube 字幕 DOM 变化，读取韩语字幕文本。
2. 在 background service worker 中请求 Google 翻译接口，避免 content script 跨域问题。
3. 把中文字幕叠加显示在视频画面上。
4. Popup 提供开关，状态保存在 `chrome.storage.local`。
5. 翻译失败时回退显示原韩语，不让字幕层空白。

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript ES Modules
- Node.js 内置测试器：`node --test`
- 可选 Web/FastAPI hello-world 验证工程，当前不参与插件主流程

## 运行测试

```bash
npm test
```

## 本地加载插件

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启 Developer mode。
3. 选择 Load unpacked。
4. 选择本仓库目录 `youtube-korean-translator/`。

## 当前限制

- 依赖 YouTube 页面已显示的韩语 CC 字幕。
- 使用的是非官方 Google 翻译接口，可能遇到频率限制或临时不可用。
- v1 不做语音识别、不支持无字幕视频、不保存翻译历史。

## License

MIT

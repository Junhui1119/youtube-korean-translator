# 韩语 YouTube 实时中文字幕插件 — 设计文档 (v1)

- 日期：2026-06-24
- 仓库：https://github.com/Junhui1119/youtube-korean-translator
- 状态：已确认，待实现

## 一句话

一个 Chrome 浏览器插件，自动把 YouTube 视频的**韩语字幕**实时翻译成**中文**，叠加显示在视频上。纯前端实现，无后端服务器、无需 API key。

## 目标与范围

### v1 要做的
- 读取 YouTube 播放器中**已显示的韩语 CC 字幕**文字
- 实时翻译成中文（使用免费的 Google 翻译网页接口）
- 把中文译文叠加显示在视频上
- 一个开关（开/关插件）

### v1 明确不做的（YAGNI）
- ❌ 语音识别 / 翻译无字幕的视频（留待后续阶段）
- ❌ 标题、简介、评论翻译
- ❌ 双语对照显示（默认只显示中文译文；以后易加）
- ❌ 英文等其他目标语言（v1 固定中文；以后可加切换）
- ❌ Claude / DeepL 等付费翻译引擎（先用免费的，跑通后再考虑替换）

## 关键前提（核心假设）

插件通过**读取 YouTube 已经渲染出来的韩语字幕文字**来工作。因此：

1. 使用时用户需先在播放器里打开韩语 CC 字幕（CC 按钮 → 选 Korean）。
2. 视频必须有韩语字幕轨（创作者上传的或 YouTube 自动生成的，绝大多数韩语视频都有）。
3. 完全没有任何字幕的视频，v1 不支持。

这条假设是 v1 能以纯前端、低复杂度实现的根本原因。

## 工作流程

```
用户打开韩语 CC 字幕
   ↓
content.js 用 MutationObserver 监听字幕元素的文字变化
   ↓
抓到新的韩语文字
   ↓
发送给 background.js
   ↓
background.js 调用免费 Google 翻译接口（韩→中），带缓存
   ↓
返回中文译文
   ↓
content.js 把中文叠加显示在视频上
```

## 组成部分

| 文件 | 职责 | 依赖 |
|------|------|------|
| `manifest.json` | 插件配置（Manifest V3）：声明在 `youtube.com` 运行、注册 content script 与 background service worker、声明对翻译接口域名的 host 权限 | — |
| `content.js` | 注入 YouTube 页面：用 MutationObserver 监听字幕容器（如 `.ytp-caption-segment`），提取韩语文字，向 background 请求翻译，把中文译文渲染为视频上的叠加层 | `styles.css`，向 background 发消息 |
| `background.js` | Service worker：接收韩语文字 → 调用免费 Google 翻译接口 → 返回中文。维护翻译缓存避免重复请求。放在 background 是为了绕开 content script 的跨域（CORS）限制 | 免费 Google 翻译网页接口 |
| `popup.html` / `popup.js` | 一个简单的开关界面：开/关插件，状态持久化（chrome.storage） | — |
| `styles.css` | 中文字幕叠加层的样式 | — |

### 模块边界
- **字幕提取**（content.js 内）：输入 = DOM 变化，输出 = 韩语文本字符串。可独立测试（喂模拟 DOM）。
- **翻译**（background.js 内）：输入 = 韩语字符串，输出 = 中文字符串。可独立测试（mock fetch）。
- **渲染**（content.js 内）：输入 = 中文字符串，输出 = 视频上的叠加层。
- 三者通过明确接口（消息传递、函数入参）通信，互不耦合内部实现。

## 翻译接口

使用免费的 Google 翻译网页接口：

```
https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=<待翻译文本>
```

- `sl=ko`（源语言韩语），`tl=zh-CN`（目标中文）
- 无需 API key、免费
- 在 background service worker 中调用以避免 CORS
- 返回结果需解析其嵌套数组结构，取出译文

> 注意：这是非官方接口，可能有频率限制或偶发不可用。v1 接受此风险；后续可平滑替换为 Claude / DeepL。

## 出错处理

| 情况 | 处理 |
|------|------|
| 翻译请求失败 | 回退显示原韩语文字 + 小提示，不崩溃 |
| 字幕文字变化过快 | 防抖（debounce），合并/限流请求 |
| 重复的字幕行 | 命中缓存，不重复请求 |
| 页面未检测到字幕元素 | 提示用户"请先打开韩语 CC 字幕" |
| YouTube SPA 页面切换 | 监听 URL 变化，重新初始化监听 |

## 测试策略

- **单元测试**：
  - 翻译函数：mock fetch，验证请求 URL 正确、能正确解析返回的译文、失败时的回退行为。
  - 字幕提取逻辑：喂模拟 DOM 节点，验证能正确提取韩语文本、防抖行为。
  - 缓存逻辑：相同输入只请求一次。
- **手动测试**：在真实 YouTube 韩语视频上验证端到端效果（字幕这类强依赖手测）。

## 后续阶段（不在 v1）

1. 双语对照显示（韩语 + 中文）
2. 目标语言切换（中文 / 英文）
3. 替换为更高质量翻译引擎（Claude / DeepL）
4. 无字幕视频的语音识别（捕获标签页音频 → ASR → 翻译），难度高，可能需后端
5. 标题 / 简介 / 评论翻译

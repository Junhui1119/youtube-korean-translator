# 韩语直播/视频实时翻译插件

一个面向 YouTube 韩语**直播和视频**的实时翻译工具：抓取直播/视频音频，经语音识别和大模型翻译，把韩语实时转成中文字幕显示给观众。配套一个 Web 控制台，管理账号、翻译历史和韩语生词本。

## 目标用户

看韩语游戏直播 / 视频，但**不懂韩语**的非韩语母语者。

现状痛点：YouTube 直播和视频 App 没有内置实时翻译，自动字幕也常常没有或不准。本项目就是为这类观众提供"边看边懂"的实时中文字幕。

## 核心功能

1. **实时语音翻译** —— 浏览器插件抓取直播/视频音频，经语音识别（Whisper）转成韩文，再由大模型（GPT-4o / DeepL）翻成中文，通过 WebSocket 实时推回渲染成字幕。
2. **韩语生词本** —— 看视频时一键收藏不认识的韩语生词及释义，集中复习。
3. **翻译历史记录** —— 自动保存每次翻译记录，可随时在 Web 控制台回看。
4. **用户账号系统** —— 注册 / 登录，生词本与历史记录跟随账号同步。

## 技术栈

**前端（React + Vite + Tailwind CSS，部署于 Cloudflare Pages）**
- Chrome 浏览器插件：React + Vite 开发，打包为浏览器扩展；负责抓取直播间音频并通过 WebSocket 发送给后端。
- Web 控制台 / 官网：用户在此注册、登录、查看生词本与翻译历史。

**后端（FastAPI，部署于 Render / Railway）**
- WebSocket 模块：与插件建立长连接，实时接收音频切片（Audio Chunks）。
- AI 对接模块：STT（Whisper）韩文识别 → 大模型（GPT-4o / DeepL）翻译为中文 → WebSocket 实时推回前端。
- API 路由模块：处理注册、登录、生词本等常规 HTTP 请求。

**数据库（PostgreSQL，托管于 Supabase / Neon）**
- `users` —— 账号、加盐哈希密码、Token。
- `history_records` —— 用户翻译历史。
- `vocabulary_notebook` —— 收藏的韩语生词与释义。

## 项目结构（规划）

```
youtube-korean-translator/
├── extension/   Chrome 插件（React + Vite）
├── web/         Web 控制台 / 官网（React + Vite）
├── backend/     FastAPI 后端（WebSocket + AI + API）
└── docs/        设计文档与实现计划
```

## 状态

早期阶段（Week 1）：仓库初始化、文档与开发工具箱搭建中，核心功能尚未实现。设计与计划见 `docs/`。详见 [CLAUDE.md](CLAUDE.md) 与 [AGENTS.md](AGENTS.md)。

## License

MIT

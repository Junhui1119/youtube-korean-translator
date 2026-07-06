# AGENTS.md

供 AI 编码助手与协作者在本仓库工作时参考。

完整的项目目标与详细技术栈见 [CLAUDE.md](CLAUDE.md)。

## 项目简介

面向 YouTube 韩语直播和视频的实时翻译工具：抓取音频 → 语音识别 → 大模型翻译 → 把中文字幕实时推回给观众。配套一个 Web 控制台，管理账号、翻译历史和韩语生词本。

## 架构

三个部分（规划中的 monorepo 结构）：

- **extension/** —— Chrome 浏览器插件（React + Vite + Tailwind）。抓取直播/视频音频，通过 WebSocket 把音频切片发给后端，并渲染返回的中文字幕。
- **web/** —— Web 控制台 / 官网（React + Vite，部署于 Cloudflare Pages）。注册/登录、查看生词本与翻译历史。
- **backend/** —— FastAPI 服务（部署于 Render / Railway）：
  - WebSocket 模块 —— 与插件保持长连接，接收音频切片。
  - AI 对接模块 —— STT（Whisper）识别韩文 → 大模型（GPT-4o / DeepL）翻译为中文 → 推回前端。
  - API 路由模块 —— 注册/登录/生词本/历史等 HTTP 接口。
- **PostgreSQL**（Supabase / Neon）—— 数据表：`users`、`history_records`、`vocabulary_notebook`。

## 技术栈

- 前端：React + Vite + Tailwind CSS；部署于 Cloudflare Pages。
- 后端：FastAPI（Python）；部署于 Render / Railway。
- AI：Whisper（语音识别）、GPT-4o / DeepL（翻译）。
- 数据库：PostgreSQL，托管于 Supabase / Neon。
- 通信：实时音频/字幕走 WebSocket，其余走 REST。

## 约定

- 保持三部分（extension / web / backend）解耦，只通过 WebSocket 和 HTTP 接口通信。
- 绝不提交密钥（API key、数据库连接串、Token）——一律用环境变量。
- 提交保持小而聚焦，message 清晰。

## 参考文档

- 设计文档：`docs/superpowers/specs/2026-06-24-youtube-korean-translator-design.md`
- 实现计划：`docs/superpowers/plans/2026-06-24-youtube-korean-translator.md`

> 注：当前 `docs/` 里的设计文档与计划描述的是更早、更简化的 v1（读取已有字幕、纯前端、免费 Google 翻译），后续会更新为上面的架构。

## 工具箱

工具与技能约定（gstack 的 `/browse`、codegraph、specify）记录在 [CLAUDE.md](CLAUDE.md)。

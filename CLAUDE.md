# Project: 韩语直播/视频翻译插件

## What this is
- 这个项目用来实时翻译韩语游戏直播以及视频的插件
- 给非韩语母语者使用
- 解决Youtube直播/视频app没有实时翻译的问题

## Tech stack
- 前端：React + Vite + Tailwind CSS
- 部署平台：Cloudflare Pages
- 包含两个部分：
- Chrome 浏览器插件：用 React + Vite 开发，打包后作为扩展程序嵌入到用户的浏览器中。负责抓取直播间音频，并通过 WebSocket 发送给后端。
- 用户 Web 控制台/官网：同样用 React + Vite 开发，部署在 Cloudflare Pages。用户可以在这里注册、登录、查看自己的韩语生词本和历史翻译记录。

- 后端：FastAPI
- 部署平台：Render 或 Railway
- 核心模块：WebSocket 模块：负责跟浏览器插件建立长连接，实时接收传入的音频切片（Audio Chunks）
- AI 对接模块：调用语音转文字（STT，如 OpenAI Whisper）获取韩文文本 -> 调用大模型（如 GPT-4o 或 DeepL）翻译为中文 -> 通过 WebSocket 实时推回给前端插件渲染
- API 路由模块：处理常规的 HTTP 请求，如用户注册、登录、获取生词本列表等。

- 数据库：PostgreSQL
- 托管平台：Supabase 或 Neon（它们都提供免费的、托管好的云端 PostgreSQL，提供标准的连接字符串，FastAPI 可以直接连接）。
- 表结构设计：
- users 表：存储账号、密码（加盐哈希）、Token。
- history_records 表：存储用户的翻译历史。
- vocabulary_notebook 表：存储用户一键收藏的韩语生词和释义。

# gstack

For all web browsing, use the `/browse` skill from gstack. Never use the `mcp__claude-in-chrome__*` tools.

Available gstack skills:

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

# codegraph

`codegraph` — code intelligence and knowledge graph for any codebase. Installed at `~/.local/bin/codegraph` (standalone bundle in `~/.codegraph`).

Common commands:

- `codegraph init [path]` — initialize CodeGraph in a project and build the initial index
- `codegraph sync [path]` — sync changes since the last index
- `codegraph status [path]` — show index status and statistics
- `codegraph query <search>` — search for symbols in the codebase
- `codegraph explore <query...>` — relevant symbols' source + call paths in one shot
- `codegraph node <name>` — one symbol's source + caller/callee trail
- `codegraph callers <symbol>` — find all functions/methods that call a symbol
- `codegraph upgrade` — upgrade in place

# specify (GitHub Spec Kit)

`specify` — Spec-Driven Development toolkit. Installed via `uv` (`uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<version>`).

Common commands:

- `specify init` — initialize a new Specify project
- `specify check` — check that all required tools are installed
- `specify version` — display version and system information
- `specify self` — manage/upgrade the specify CLI itself
- `specify workflow` — manage and run automation workflows

## Commands

## Conventions

- **所有 git commit 和 git push 必须先获得用户明确批准，才能执行。** 不得自行 commit 或 push，无论改动大小。
- **读取文件不用经过我的允许。**

## Current focus

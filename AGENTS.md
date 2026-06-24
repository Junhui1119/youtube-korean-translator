# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.

See [CLAUDE.md](CLAUDE.md) for the full project goals and detailed tech stack.

## Project

Real-time translation tool for Korean YouTube livestreams and videos: capture
audio → speech-to-text → LLM translation → push Chinese subtitles back to the
viewer. Ships with a Web console for accounts, translation history, and a
Korean vocabulary notebook.

## Architecture

Three parts (planned monorepo layout):

- **extension/** — Chrome browser extension (React + Vite, Tailwind). Captures
  livestream/video audio and streams audio chunks to the backend over a
  WebSocket; renders the returned Chinese subtitles.
- **web/** — Web console / marketing site (React + Vite, deployed on Cloudflare
  Pages). Register/login, view the vocabulary notebook and translation history.
- **backend/** — FastAPI service (deployed on Render / Railway):
  - WebSocket module — long-lived connection to the extension; receives audio chunks.
  - AI module — STT (Whisper) → Korean text → LLM (GPT-4o / DeepL) → Chinese → push back.
  - API module — HTTP routes for register/login/vocabulary/history.
- **PostgreSQL** (Supabase / Neon) — tables: `users`, `history_records`,
  `vocabulary_notebook`.

## Tech stack

- Frontend: React + Vite + Tailwind CSS; deployed on Cloudflare Pages.
- Backend: FastAPI (Python); deployed on Render / Railway.
- AI: Whisper (STT), GPT-4o / DeepL (translation).
- Database: PostgreSQL via Supabase / Neon.
- Transport: WebSocket for the real-time audio/subtitle stream; REST for the rest.

## Conventions

- Keep the three parts (extension / web / backend) decoupled; they communicate
  only over the WebSocket and HTTP APIs.
- Never commit secrets (API keys, DB connection strings, tokens) — use
  environment variables.
- Commit in small, focused steps with clear messages.

## Reference docs

- Design spec: `docs/superpowers/specs/2026-06-24-youtube-korean-translator-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-24-youtube-korean-translator.md`

> Note: the design spec and plan currently describe an earlier, simpler v1
> (read existing captions, pure-frontend, free Google Translate). They will be
> updated to match the architecture above.

## Tooling

Tool and skill conventions (gstack `/browse`, codegraph, specify) are documented
in [CLAUDE.md](CLAUDE.md).

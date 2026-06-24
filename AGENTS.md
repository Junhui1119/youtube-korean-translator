# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.

## Project

Chrome (Manifest V3) extension that translates Korean YouTube captions to Chinese in real time. Pure frontend — no backend, no API key.

## Commands

```bash
npm test   # run the unit test suite (Node built-in test runner)
```

- Requires Node 18+.
- There is **no build step** and **no third-party dependencies**.

## Architecture

- **content.js** — thin browser glue: a `MutationObserver` reads the on-screen
  Korean caption text and renders the translated overlay. Tested manually in a
  real browser.
- **background.js** — service worker (`"type": "module"`). Wires the pure
  modules together and handles `{ type: "translate", text }` messages.
- **src/** — all unit-testable logic lives here as pure ES modules:
  - `translate.js` — build the translate URL, parse the response, `translateText`.
  - `cache.js` — in-memory translation cache.
  - `translator-core.js` — orchestration (check cache → translate → store).
- **popup.html / popup.js** — enable/disable toggle (`chrome.storage.local`).

Keep logic in `src/` so it can be unit-tested without a browser. Keep
`content.js` as thin DOM I/O only.

## Conventions

- Plain JavaScript, ES Modules. No TypeScript, no bundler.
- Manifest V3; service worker uses `"type": "module"`.
- Zero runtime/test dependencies — tests use `node:test` + `node:assert`.
- Follow TDD: write the failing test first, then the minimal implementation.
- Translation direction is fixed for v1: source `ko` → target `zh-CN`.
- All translation network requests go through the background service worker
  (avoids content-script CORS).
- Commit in small, focused steps with clear messages.

## Reference docs

- Design spec: `docs/superpowers/specs/2026-06-24-youtube-korean-translator-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-24-youtube-korean-translator.md`

These define the v1 scope and the task-by-task plan. Read them before making
non-trivial changes.

## Tooling

Tool and skill conventions (gstack `/browse`, codegraph, specify) are documented
in [CLAUDE.md](CLAUDE.md).

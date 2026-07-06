# Review Todo - 2026-07-01

Source: project review on 2026-07-01.

## Priority 0 - Release blockers

- [ ] Add or remove manifest icon references.
  - Current issue: `manifest.json` references `icons/icon-16.png`, `icons/icon-48.png`, and `icons/icon-128.png`, but the `icons/` directory is missing.
  - Acceptance: Chrome can load the unpacked extension without missing-resource errors.

## Priority 1 - Runtime correctness

- [ ] Fix MV3 settings initialization race in `background.js`.
  - Current issue: `GET_ENABLED` can return the default `true` before `chrome.storage.local.get(...)` finishes after service worker cold start.
  - Suggested fix: create a `settingsReady` Promise and await it before handling `GET_ENABLED` and `TRANSLATE_TEXT`.
  - Acceptance: if the user disabled the extension before reload, a cold-started service worker still reports disabled.

- [ ] Prevent stale translation responses from overwriting newer captions.
  - Current issue: async translation responses render immediately; older requests can arrive after newer ones.
  - Suggested fix: track a monotonic `requestSeq` in `content.js`, or compare the returned request text with `lastCaptionText` before rendering.
  - Acceptance: rapid subtitle changes cannot display an older translation over the current caption.

- [ ] Narrow the YouTube DOM observer scope.
  - Current issue: `MutationObserver` watches all of `document.body`, which is noisy on YouTube.
  - Suggested fix: prefer the player or caption container; fall back to body only if necessary.
  - Acceptance: caption detection still works, and unrelated YouTube page changes trigger fewer checks.

## Priority 2 - Backend hardening

- [ ] Handle unknown users explicitly in history API.
  - Current issue: `X-User-Id` is only validated as a UUID; a non-existent user may fail via database FK and become a 500.
  - Suggested fix: check user existence before writing history, or return a clear 401/404 while the real auth system is pending.
  - Acceptance: invalid, missing, and unknown users return intentional HTTP statuses.

- [ ] Make backend tests easier to run locally.
  - Current issue: tests require reachable Postgres via `TEST_DATABASE_URL`; current sandbox run failed on `::1:5432`.
  - Suggested fix: add Docker Compose or a short setup script, and document the exact test command.
  - Acceptance: a new developer can run backend tests from README instructions.

## Priority 3 - Test quality

- [ ] Test production cache logic instead of a copied helper.
  - Current issue: `tests/background-cache.test.js` duplicates cache behavior rather than importing production code.
  - Suggested fix: extract cache logic to a small pure module and test that module directly.
  - Acceptance: changing production cache eviction behavior breaks the cache test.

## Verification snapshot

- `npm test`: 15 passed.
- `backend/python -m pytest -q`: 2 passed, 12 errors in this sandbox because local Postgres was not reachable.

## Notes

- Current git status during review also showed unrelated modified files:
  - `CLAUDE.md`
  - `docs/superpowers/specs/2026-06-25-history-records-storage-design.md`

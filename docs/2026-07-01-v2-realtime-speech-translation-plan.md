# V2 Realtime Speech Translation Plan

Status: Draft

## Goal

V2 upgrades the extension from translating existing YouTube Korean CC captions to translating Korean audio in videos or livestreams that do not have captions.

Target flow:

```text
Chrome extension
-> capture current tab audio
-> send audio stream/chunks to backend
-> backend calls speech recognition
-> backend translates Korean text to Chinese
-> backend returns subtitles
-> extension renders Chinese overlay
```

## Phase 1 - Backend Foundation

Build backend capabilities before handling audio.

Tasks:

- Add user settings APIs for translation preferences, glossary usage, and optional API keys.
- Add translation proxy API so the extension can call the backend instead of calling Google/DeepL directly.
- Connect the existing history API to the extension.
- Add basic auth. A simple token is acceptable for early V2; real accounts can come later.
- Add rate limiting by user/IP.
- Add basic logs for latency, failures, and third-party API errors.

Acceptance:

- The extension can translate text through the backend.
- API keys are not exposed in extension code.
- Backend can report translation latency and failure rate.

## Phase 2 - Audio Capture PoC

Validate whether the extension can reliably capture YouTube tab audio.

Preferred approach:

- Use Chrome `tabCapture` API.
- Capture current tab audio.
- Split audio into 1-3 second chunks or stream it continuously.
- Send audio to the backend.

Alternative:

- Try Web Audio from the page video element, but this may be less reliable on YouTube.

Acceptance:

- Extension can capture audio from the active YouTube tab.
- Backend receives valid audio bytes.
- Capture can start, stop, and recover when switching videos.

## Phase 3 - Speech Recognition PoC

Use an external ASR service first. Do not build a speech recognition model from scratch.

Candidates:

- Deepgram Streaming
- AssemblyAI Realtime
- OpenAI Whisper API
- Local `whisper.cpp` later, if cost or privacy requires it

Recommended PoC choice:

- Start with a streaming ASR provider such as Deepgram Streaming.

Acceptance:

- Korean videos/livestreams produce Korean text.
- End-to-end ASR latency is roughly 2-5 seconds.
- Results return continuously, not only after a full recording finishes.

## Phase 4 - Realtime Translation

Translate ASR output into Chinese.

Key work:

- Deduplicate incremental ASR results.
- Translate only stable phrases/sentences, not every unstable partial token.
- Keep a subtitle timing window.
- Use existing glossary logic.
- On translation failure, show Korean source text or keep the last good subtitle.

Acceptance:

- A no-caption Korean video can continuously show Chinese subtitles.
- Subtitles do not flicker excessively.
- Delay is acceptable for watching livestreams.
- Glossary terms still apply.

## Phase 5 - Product Polish

Add user-facing controls once the technical chain works.

Popup modes:

- CC caption translation
- Realtime speech recognition
- Auto mode

Status indicators:

- Listening to CC
- Capturing audio
- Connecting to backend
- Recognizing Korean speech
- Translating
- ASR failed
- Translation failed

Cost and safety controls:

- Daily usage limit per user.
- Stop recognition when the tab is paused.
- Detect silence/empty audio and avoid sending unnecessary data.
- Rate limit abnormal clients.
- Add privacy copy explaining that audio may be sent to backend and third-party ASR providers.

## Recommended Architecture

```text
Chrome Extension
  content.js
    - overlay rendering
    - YouTube state detection

  background.js
    - tabCapture audio capture
    - WebSocket connection to backend
    - receive subtitle results

FastAPI Backend
  /api/translate
    - text translation proxy

  /ws/asr
    - receive audio stream
    - forward to ASR provider
    - translate stable Korean text
    - return Chinese subtitles

PostgreSQL
  users
  settings
  history_records
  usage_logs
```

## Suggested Tech Choices

- Backend: FastAPI
- Realtime transport: WebSocket
- Database: PostgreSQL
- ASR PoC: Deepgram Streaming or similar realtime ASR provider
- Translation: DeepL / Google / future OpenAI option
- Deployment: simple PoC deployment first, such as Render, Fly.io, Railway, or a VPS

## Main Risks

1. Stable YouTube audio capture from a Chrome extension.
2. Korean ASR quality for gaming videos and livestreams.
3. End-to-end latency.
4. Third-party API cost.
5. Privacy expectations around sending tab audio to backend/ASR providers.

## Milestones

### v2.0-alpha

- Local-only prototype.
- Audio capture works.
- Backend WebSocket receives audio.
- ASR returns Korean text.
- Korean text is translated and rendered in overlay.

### v2.0-beta

- Small seed-user test.
- Track latency, failure rate, ASR quality, translation quality, and API cost.
- Add rate limits and basic auth.

### v2.0

- Public trial version.
- User accounts or reliable token system.
- Usage limits.
- Privacy messaging.
- Monitoring and error reporting.

## Recommended First Task

Start with a narrow PoC:

```text
tabCapture audio
-> backend WebSocket
-> ASR provider
-> return Korean text
```

Do not start V2 with accounts, billing, or a polished dashboard. The first technical question is whether audio capture, ASR quality, and latency are good enough.

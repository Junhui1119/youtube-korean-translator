import { test } from "node:test";
import assert from "node:assert/strict";

// 提取 background.js 后端翻译的核心逻辑为可测试纯函数
async function translateViaBackend(text, backendUrl, backendToken, fetchFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchFn(`${backendUrl}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backendToken}`,
      },
      body: JSON.stringify({ text, engine: "deepl" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.translated;
  } finally {
    clearTimeout(timer);
  }
}

test("translateViaBackend 成功返回译文", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ translated: "你好", engine: "deepl", latency_ms: 100 }),
  });
  const result = await translateViaBackend("안녕", "https://api.example.com", "token", fakeFetch);
  assert.equal(result, "你好");
});

test("translateViaBackend 非 200 时抛错", async () => {
  const fakeFetch = async () => ({ ok: false, status: 502 });
  await assert.rejects(
    () => translateViaBackend("안녕", "https://api.example.com", "token", fakeFetch),
    /HTTP 502/
  );
});

test("translateViaBackend 401 时抛错", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(
    () => translateViaBackend("안녕", "https://api.example.com", "wrong-token", fakeFetch),
    /HTTP 401/
  );
});

// ── content.js: getVideoMetadata ──────────────────────────────────────────────

// Inline testable version of getVideoMetadata (mirrors content.js implementation)
function getVideoMetadata(locationSearch, docTitle, channelText, videoCurrentTime) {
  const params = new URLSearchParams(locationSearch);
  const videoId = params.get("v") || "";
  const rawTitle = docTitle || "";
  const videoTitle = rawTitle.replace(/ - YouTube$/, "").trim() || rawTitle;
  const videoChannel = channelText !== undefined ? channelText : null;
  const videoPosition = videoCurrentTime !== undefined ? Math.floor(videoCurrentTime) : 0;
  return { videoId, videoTitle, videoChannel, videoPosition };
}

test("getVideoMetadata extracts videoId and strips YouTube suffix from title", () => {
  const meta = getVideoMetadata("?v=testVideoId", "My Video - YouTube", "TestChannel", 42.7);
  assert.equal(meta.videoId, "testVideoId");
  assert.equal(meta.videoTitle, "My Video");
  assert.equal(meta.videoChannel, "TestChannel");
  assert.equal(meta.videoPosition, 42);
});

test("getVideoMetadata returns empty videoId on non-video page", () => {
  const meta = getVideoMetadata("", "YouTube", null, 0);
  assert.equal(meta.videoId, "");
  assert.equal(meta.videoChannel, null);
  assert.equal(meta.videoPosition, 0);
});

// ── background.js: recordHistory ─────────────────────────────────────────────

// Inline testable version of recordHistory (mirrors background.js implementation)
function makeRecordHistory(state, fetchFn) {
  return async function recordHistory(videoId, title, channel, position) {
    if (!state.cachedJwt || !state.cachedBackendUrl || !videoId) return;
    try {
      await fetchFn(`${state.cachedBackendUrl}/api/history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.cachedJwt}`,
        },
        body: JSON.stringify({
          video_id: videoId,
          title: title || "Unknown",
          channel: channel || null,
          last_position: position || 0,
        }),
      });
    } catch {
      // fire-and-forget: ignore all errors
    }
  };
}

test("recordHistory called once per video, again on new videoId", async () => {
  const fetchCalls = [];
  const fakeFetch = async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true }; };
  const state = { cachedJwt: "jwt123", cachedBackendUrl: "https://api.example.com" };
  const recordHistory = makeRecordHistory(state, fakeFetch);

  // Simulate the dedup logic from background.js
  let lastRecordedVideoId = "";
  async function callWithDedup(videoId, videoTitle, videoChannel, videoPosition) {
    if (videoId && videoId !== lastRecordedVideoId) {
      lastRecordedVideoId = videoId;
      await recordHistory(videoId, videoTitle, videoChannel, videoPosition);
    }
  }

  await callWithDedup("abc123", "Video A", "Chan", 10);
  await callWithDedup("abc123", "Video A", "Chan", 20); // same video — should not call again
  assert.equal(fetchCalls.length, 1, "should only record once per video");

  await callWithDedup("xyz789", "Video B", "Chan", 0); // new video — should call again
  assert.equal(fetchCalls.length, 2, "should record again for new video");

  const body = JSON.parse(fetchCalls[0].opts.body);
  assert.equal(body.video_id, "abc123");
  assert.equal(body.title, "Video A");
});

test("recordHistory makes no fetch when cachedJwt is empty", async () => {
  const fetchCalls = [];
  const fakeFetch = async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true }; };
  const state = { cachedJwt: "", cachedBackendUrl: "https://api.example.com" };
  const recordHistory = makeRecordHistory(state, fakeFetch);

  await recordHistory("abc123", "Video A", "Chan", 0);
  assert.equal(fetchCalls.length, 0, "should not fetch when jwt is empty");
});

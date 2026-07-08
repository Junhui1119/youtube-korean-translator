import { test } from "node:test";
import assert from "node:assert/strict";

// ── 抽象重连逻辑（保留原有） ─────────────────────────────────────────────
function makeReconnectTracker() {
  let retried = false;
  let stopped = false;
  function onDisconnect(intentional) {
    if (intentional || stopped) { stopped = true; return "stop"; }
    if (!retried) { retried = true; return "retry"; }
    stopped = true;
    return "stop";
  }
  return { onDisconnect, isStopped: () => stopped };
}

test("第一次非主动断连 → retry", () => {
  const t = makeReconnectTracker();
  assert.equal(t.onDisconnect(false), "retry");
});

test("第二次非主动断连 → stop", () => {
  const t = makeReconnectTracker();
  t.onDisconnect(false);
  assert.equal(t.onDisconnect(false), "stop");
  assert.ok(t.isStopped());
});

test("主动停止 → 立即 stop", () => {
  const t = makeReconnectTracker();
  assert.equal(t.onDisconnect(true), "stop");
  assert.ok(t.isStopped());
});

// ── 集成测试：真实 background.js 重试状态机 ─────────────────────────────

function installRetryMock({ storageState = {}, offscreenOk = true } = {}) {
  let messageListener;
  const sentMessages = [];
  let pendingRetry = null;
  const origSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = (fn, delay) => {
    if (delay === 3000) { pendingRetry = fn; return 1; }
    return origSetTimeout(fn, delay);
  };

  globalThis.chrome = {
    runtime: {
      onMessage: { addListener(fn) { messageListener = fn; } },
      sendMessage(msg) {
        sentMessages.push(msg);
        if (msg?.type === "START_OFFSCREEN")
          return Promise.resolve(offscreenOk ? { ok: true } : { ok: false });
        return Promise.resolve();
      },
    },
    storage: {
      local: {
        get(defaults, cb) {
          origSetTimeout(() => cb({
            ...defaults,
            backendUrl: "https://test.example",
            backendToken: "tok",
            jwt: "jwt",
            ...storageState,
          }), 0);
        },
        set() {},
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      onActivated: { addListener() {} },
      query() { return Promise.resolve([{ id: 42, url: "https://www.youtube.com/" }]); },
      sendMessage(tabId, msg) { sentMessages.push({ tabId, msg }); return Promise.resolve(); },
    },
    tabCapture: { getMediaStreamId(_opts, cb) { cb("stream-1"); } },
    offscreen: {
      hasDocument() { return Promise.resolve(false); },
      createDocument() { return Promise.resolve(); },
      closeDocument() { return Promise.resolve(); },
    },
  };

  const tick = (ms = 50) => new Promise(r => origSetTimeout(r, ms));

  return {
    sentMessages,
    emitMessage(msg) { messageListener(msg, {}, () => {}); },
    tick,
    async executeRetry() {
      if (pendingRetry) { const fn = pendingRetry; pendingRetry = null; await fn(); }
    },
    restore() { globalThis.setTimeout = origSetTimeout; },
  };
}

async function freshBg() {
  return import(`../background.js?r=${Math.random()}`);
}

test("WS_CLOSED 重试一次后再次断开 → stopAsr 发送 ASR_STOPPED", async () => {
  globalThis.fetch = async () => { throw new Error("no-net"); };
  const m = installRetryMock({ storageState: { asrActive: true, asrTabId: 42 } });
  await freshBg();
  await m.tick(); // 等待 settingsReady

  // 第一次断开 → 触发重试，asrRetried=true
  m.emitMessage({ type: "WS_CLOSED", code: 1005, reason: "" });
  await m.tick();

  // 执行重试 startAsr(true) → 成功 → asrActive=true，asrRetried 保持 true
  await m.executeRetry();
  await m.tick();

  // 第二次断开 → asrRetried=true → 走 else → stopAsr
  m.emitMessage({ type: "WS_CLOSED", code: 1005, reason: "" });
  await m.tick();

  assert.ok(
    m.sentMessages.some(msg => msg?.type === "ASR_STOPPED"),
    "第二次 WS_CLOSED 后应发送 ASR_STOPPED，不再重试"
  );
  m.restore();
});

test("START_OFFSCREEN 返回 ok:false → 不标记 asrActive，发送 ASR_STOPPED", async () => {
  globalThis.fetch = async () => { throw new Error("no-net"); };
  const m = installRetryMock({ storageState: {}, offscreenOk: false });
  await freshBg();
  await m.tick();

  m.emitMessage({ type: "START_ASR" });
  await m.tick();

  assert.ok(
    m.sentMessages.some(msg => msg?.type === "ASR_STOPPED"),
    "offscreen 初始化失败后应发送 ASR_STOPPED，asrActive 不应被置 true"
  );
  m.restore();
});

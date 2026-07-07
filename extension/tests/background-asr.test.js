import { test } from "node:test";
import assert from "node:assert/strict";

// 验证：只重连一次，第二次断开就停止
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

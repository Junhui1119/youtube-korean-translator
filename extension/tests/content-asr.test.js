import { test } from "node:test";
import assert from "node:assert/strict";

function makeAsrInterlock() {
  let asrMode = false;
  function onMsg(type) {
    if (type === "ASR_INTERIM" || type === "ASR_FINAL") asrMode = true;
    if (type === "ASR_STOPPED") asrMode = false;
  }
  function shouldProcessCaption() { return !asrMode; }
  return { onMsg, shouldProcessCaption };
}

test("ASR 激活后 CC 字幕处理被屏蔽", () => {
  const il = makeAsrInterlock();
  il.onMsg("ASR_INTERIM");
  assert.equal(il.shouldProcessCaption(), false);
});

test("ASR_STOPPED 后 CC 字幕处理恢复", () => {
  const il = makeAsrInterlock();
  il.onMsg("ASR_INTERIM");
  il.onMsg("ASR_STOPPED");
  assert.equal(il.shouldProcessCaption(), true);
});

test("未启动 ASR 时 CC 字幕处理正常", () => {
  const il = makeAsrInterlock();
  assert.equal(il.shouldProcessCaption(), true);
});

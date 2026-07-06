import { test } from "node:test";
import assert from "node:assert/strict";

// 验证 float32 → int16 转换数学规格（与 audio-processor.js 使用相同算法）
function float32ToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

test("float32ToInt16: +1.0 → 32767", () => {
  assert.equal(float32ToInt16(new Float32Array([1.0]))[0], 32767);
});

test("float32ToInt16: -1.0 → -32768", () => {
  assert.equal(float32ToInt16(new Float32Array([-1.0]))[0], -32768);
});

test("float32ToInt16: 0.0 → 0", () => {
  assert.equal(float32ToInt16(new Float32Array([0.0]))[0], 0);
});

test("float32ToInt16: 超过 +1.0 被截断到 32767", () => {
  assert.equal(float32ToInt16(new Float32Array([2.0]))[0], 32767);
});

test("float32ToInt16: 低于 -1.0 被截断到 -32768", () => {
  assert.equal(float32ToInt16(new Float32Array([-2.0]))[0], -32768);
});

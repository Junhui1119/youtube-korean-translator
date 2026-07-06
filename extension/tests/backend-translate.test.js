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

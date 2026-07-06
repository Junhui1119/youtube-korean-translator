import { test } from "node:test";
import assert from "node:assert/strict";
import { translateText } from "../src/translate.js";

test("translateText (Google) 请求并返回译文", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [[["你好", "안녕", null, null]], null, "ko"],
  });

  const result = await translateText(" 안녕 ", null, null, fakeFetch);
  assert.equal(result, "你好");
});

test("translateText 对空白文本直接返回空串", async () => {
  const fakeFetch = async () => { throw new Error("should not be called"); };
  assert.equal(await translateText("   ", null, null, fakeFetch), "");
});

test("translateText (Google) 在 429 时退避重试，最终成功", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 429 };
    return { ok: true, status: 200, json: async () => [[["团战", "한타", null, null]], null, "ko"] };
  };

  const result = await translateText("한타", null, null, fakeFetch);
  assert.equal(result, "团战");
  assert.equal(calls, 3);
});

test("translateText (Google) 连续 3 次 429 后抛错", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(() => translateText("안녕", null, null, fakeFetch), /HTTP 429/);
});

test("translateText (Google) 非重试错误立即抛出", async () => {
  const fakeFetch = async () => ({ ok: false, status: 400 });
  await assert.rejects(() => translateText("안녕", null, null, fakeFetch), /HTTP 400/);
});

test("translateText 应用术语库占位符", async () => {
  const fakeFetch = async (_url, opts) => {
    const body = opts ? JSON.parse(opts.body) : null;
    const input = body?.text?.[0] ?? "";
    // 校验 placeholder 进入了翻译请求
    assert.ok(input.includes("<ykt0/>"), "placeholder should appear in request");
    return {
      ok: true,
      json: async () => ({
        translations: [{ text: `团队 <ykt0/> 开始了` }],
      }),
    };
  };

  const glossaryMap = new Map([["한타", "团战"]]);
  const result = await translateText("팀 한타 시작", "fake-key", glossaryMap, fakeFetch);
  assert.equal(result, "团队 团战 开始了");
});

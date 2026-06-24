import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTranslateUrl, parseTranslateResponse, translateText } from "../src/translate.js";

test("buildTranslateUrl 带上源语言、目标语言、编码后的文本", () => {
  const url = buildTranslateUrl("안녕하세요", "ko", "zh-CN");
  assert.ok(url.startsWith("https://translate.googleapis.com/translate_a/single?"));
  assert.ok(url.includes("sl=ko"));
  assert.ok(url.includes("tl=zh-CN"));
  assert.ok(url.includes("q=" + encodeURIComponent("안녕하세요")));
});

test("parseTranslateResponse 拼接所有译文分段", () => {
  const data = [[["大家好", "안녕하세요", null, null], ["，今天", "，오늘", null, null]], null, "ko"];
  assert.equal(parseTranslateResponse(data), "大家好，今天");
});

test("parseTranslateResponse 对畸形数据抛出明确错误", () => {
  assert.throws(() => parseTranslateResponse(null), /Invalid translate response/);
  assert.throws(() => parseTranslateResponse([]), /Invalid translate response/);
  assert.throws(() => parseTranslateResponse([[[]]]), /did not contain text/);
});

test("translateText 请求 URL 并返回解析后的译文", async () => {
  const requestedUrls = [];
  const fakeFetch = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      json: async () => [[["你好", "안녕", null, null]], null, "ko"],
    };
  };

  const result = await translateText(" 안녕 ", fakeFetch);
  assert.equal(result, "你好");
  assert.ok(requestedUrls[0].includes("q=" + encodeURIComponent("안녕")));
});

test("translateText 对空白文本直接返回空串", async () => {
  const fakeFetch = async () => {
    throw new Error("fetch should not be called");
  };

  assert.equal(await translateText("   ", fakeFetch), "");
});

test("translateText 在响应非 ok 时抛错", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(() => translateText("안녕", fakeFetch), /HTTP 429/);
});

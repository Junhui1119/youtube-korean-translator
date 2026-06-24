import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTranslateUrl, parseTranslateResponse } from "../src/translate.js";

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

test("parseTranslateResponse 对畸形数据返回空串", () => {
  assert.equal(parseTranslateResponse(null), "");
  assert.equal(parseTranslateResponse([]), "");
});

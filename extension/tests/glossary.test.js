import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGlossaryCSV,
  applyGlossaryPlaceholders,
  restoreGlossaryPlaceholders,
} from "../src/glossary.js";

test("parseGlossaryCSV 正确解析词条", () => {
  const csv = `korean,chinese,category,note
# 注释行
한타,团战,LOL,
궁,大招,通用游戏,`;
  const map = parseGlossaryCSV(csv);
  assert.equal(map.get("한타"), "团战");
  assert.equal(map.get("궁"), "大招");
  assert.equal(map.size, 2);
});

test("parseGlossaryCSV 忽略注释行和空行", () => {
  const csv = `# comment\n\n한타,团战\n`;
  const map = parseGlossaryCSV(csv);
  assert.equal(map.size, 1);
});

test("parseGlossaryCSV 处理含逗号的引号字段", () => {
  const csv = `"한타,교전",团战/开团\n`;
  const map = parseGlossaryCSV(csv);
  assert.equal(map.get("한타,교전"), "团战/开团");
});

test("applyGlossaryPlaceholders 替换命中词条", () => {
  const map = new Map([["한타", "团战"]]);
  const { processed, entries } = applyGlossaryPlaceholders("팀 한타 시작", map);
  assert.ok(processed.includes("<ykt0/>"));
  assert.ok(!processed.includes("한타"));
  assert.equal(entries[0].chinese, "团战");
});

test("applyGlossaryPlaceholders 未命中词条时原样返回", () => {
  const map = new Map([["궁", "大招"]]);
  const { processed, entries } = applyGlossaryPlaceholders("안녕하세요", map);
  assert.equal(processed, "안녕하세요");
  assert.equal(entries.length, 0);
});

test("restoreGlossaryPlaceholders 还原占位符", () => {
  const entries = [{ tagId: 0, chinese: "团战" }];
  assert.equal(restoreGlossaryPlaceholders("团队 <ykt0/> 开始", entries), "团队 团战 开始");
});

test("restoreGlossaryPlaceholders 兼容翻译引擎对标签的细微改写", () => {
  const entries = [{ tagId: 0, chinese: "团战" }];
  // 引擎在标签内加了空格
  assert.equal(restoreGlossaryPlaceholders("团队 <ykt0 /> 开始", entries), "团队 团战 开始");
});

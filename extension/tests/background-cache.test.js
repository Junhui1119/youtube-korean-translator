import { test } from "node:test";
import assert from "node:assert/strict";

// 独立测试 cache 上限逻辑（不依赖 Chrome API）
function makeCacheWithCap(cap) {
  const cache = new Map();
  function cacheSet(key, value) {
    if (cache.size >= cap) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, value);
  }
  return { cache, cacheSet };
}

test("cache 写入超过上限时淘汰最旧条目", () => {
  const { cache, cacheSet } = makeCacheWithCap(3);
  cacheSet("a", 1);
  cacheSet("b", 2);
  cacheSet("c", 3);
  cacheSet("d", 4); // 触发淘汰 "a"

  assert.equal(cache.size, 3);
  assert.ok(!cache.has("a"), "最旧条目应被淘汰");
  assert.ok(cache.has("d"));
});

test("cache 未超上限时不淘汰", () => {
  const { cache, cacheSet } = makeCacheWithCap(200);
  for (let i = 0; i < 199; i++) cacheSet(`key${i}`, i);
  assert.equal(cache.size, 199);
  assert.ok(cache.has("key0"));
});

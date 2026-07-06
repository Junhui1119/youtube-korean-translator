import { test } from "node:test";
import assert from "node:assert/strict";

function installChromeMock({ storageDelayMs, enabled, deeplApiKey = "" }) {
  let messageListener;

  globalThis.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      onMessage: {
        addListener(fn) {
          messageListener = fn;
        },
      },
    },
    storage: {
      local: {
        get(_defaults, callback) {
          setTimeout(() => callback({ enabled, deeplApiKey }), storageDelayMs);
        },
      },
      onChanged: {
        addListener() {},
      },
    },
  };

  return {
    sendMessage(message) {
      return new Promise((resolve) => {
        messageListener(message, {}, resolve);
      });
    },
  };
}

async function importFreshBackground() {
  return import(`../background.js?case=${Math.random()}`);
}

test("GET_ENABLED arriving before storage resolves still reports the real stored value", async () => {
  globalThis.fetch = async () => {
    throw new Error("network disabled in test");
  };
  const chromeApi = installChromeMock({ storageDelayMs: 20, enabled: false });
  await importFreshBackground();

  const response = await chromeApi.sendMessage({ type: "GET_ENABLED" });

  assert.equal(response.enabled, false);
});

test("TRANSLATE_TEXT arriving before storage resolves does not translate while really disabled", async () => {
  globalThis.fetch = async () => {
    throw new Error("network disabled in test");
  };
  const chromeApi = installChromeMock({ storageDelayMs: 20, enabled: false });
  await importFreshBackground();

  const response = await chromeApi.sendMessage({ type: "TRANSLATE_TEXT", text: "안녕" });

  assert.equal(response.ok, false);
  assert.equal(response.error, "Extension disabled");
});

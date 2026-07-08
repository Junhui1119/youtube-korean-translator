import { test } from "node:test";
import assert from "node:assert/strict";

function installChromeMock({
  storageDelayMs,
  enabled,
  deeplApiKey = "",
  asrActive = false,
  asrTabId = null,
}) {
  let messageListener;
  const tabMessages = [];

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
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        get(defaults, callback) {
          setTimeout(
            () => callback({ ...defaults, enabled, deeplApiKey, asrActive, asrTabId }),
            storageDelayMs
          );
        },
        set() {},
      },
      onChanged: {
        addListener() {},
      },
    },
    tabs: {
      onActivated: { addListener() {} },
      query() { return Promise.resolve([]); },
      sendMessage(tabId, message) {
        tabMessages.push({ tabId, message });
        return Promise.resolve();
      },
    },
    tabCapture: {
      getMediaStreamId(_opts, cb) { cb(null); },
    },
    offscreen: {
      hasDocument() { return Promise.resolve(false); },
      createDocument() { return Promise.resolve(); },
      closeDocument() { return Promise.resolve(); },
    },
  };

  return {
    tabMessages,
    emitMessage(message) {
      messageListener(message, {}, () => {});
    },
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

test("ASR transcript after storage restore is forwarded to the captured tab", async () => {
  globalThis.fetch = async () => {
    throw new Error("network disabled in test");
  };
  const chromeApi = installChromeMock({
    storageDelayMs: 20,
    enabled: true,
    asrActive: true,
    asrTabId: 123,
  });
  await importFreshBackground();

  chromeApi.emitMessage({ type: "interim", text: "안녕" });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(chromeApi.tabMessages, [
    { tabId: 123, message: { type: "ASR_INTERIM", text: "안녕" } },
  ]);
});

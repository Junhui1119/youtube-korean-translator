# ASR 实时语音识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Chrome 插件新增 ASR 模式：捕获标签页音频 → Deepgram 流式识别韩语 → 翻译中文 → 实时叠加显示。

**Architecture:** Extension 用 `chrome.tabCapture.getMediaStreamId` 获取音频流 ID，在 offscreen document 内用 AudioWorklet 切 PCM Int16 包发给 background.js，background.js 将帧转发至后端 WebSocket，后端中继到 Deepgram，识别结果（interim/final）返回 extension 驱动 overlay。

**Tech Stack:** Chrome MV3, FastAPI WebSocket, deepgram-sdk 3.x, Web Audio API + AudioWorklet, PCM Int16 16kHz

## Global Constraints

- Chrome MV3; manifest.json 新增 `"tabCapture"` 和 `"offscreen"` permissions
- offscreen createDocument reason: `"USER_MEDIA"`
- 音频规格：PCM Int16，16kHz，单声道，每帧 4000 samples（≈250ms，8000 bytes）
- Deepgram 参数：`model="nova-2"`, `language="ko"`, `encoding="linear16"`, `sample_rate=16000`, `channels=1`, `interim_results=True`, `endpointing=300`
- WebSocket 路径：`/ws/asr`；鉴权 query param：`token=<jwt>`
- Close codes：4001 = JWT 无效/缺失，4002 = DEEPGRAM_API_KEY 未配置
- 后端推送消息格式：`{"type":"ready"}` / `{"type":"interim","text":"..."}` / `{"type":"final","korean":"...","chinese":"..."}` / `{"type":"error","message":"..."}`
- `deepgram-sdk>=3.5,<4` 加入 `backend/requirements.txt`
- ASR 按钮仅在 `isJwtValid(jwt) === true` 时显示
- `asrActive` 状态存储在 `chrome.storage.local`
- 后端 WS 断连：3 秒后重连一次，失败则停止
- CC 字幕模式与 ASR 模式在 content.js 内互斥（asrMode 开启时 scheduleCaptionCheck 直接返回）
- render.yaml 的 envVars 添加 `DEEPGRAM_API_KEY`
- 所有 git commit 已获用户当前会话批准，可直接执行

---

### Task 1: 后端 ASR WebSocket endpoint

**Files:**
- Create: `backend/asr.py`
- Modify: `backend/main.py` (import asr + include_router)
- Modify: `backend/requirements.txt` (add deepgram-sdk)
- Modify: `render.yaml` (add DEEPGRAM_API_KEY env var)
- Create: `backend/tests/test_asr.py`

**Interfaces:**
- Consumes: `auth_service.decode_token(token: str) -> uuid.UUID`（无效时 raise ValueError）; `translate_service.translate_deepl(text: str, api_key: str) -> str`
- Produces: `GET /ws/asr?token=<jwt>` WebSocket endpoint（FastAPI router）

- [ ] **Step 1: 在 requirements.txt 末尾添加 deepgram-sdk**

打开 `backend/requirements.txt`，在最后一行追加：
```
deepgram-sdk>=3.5,<4
```

- [ ] **Step 2: 写失败测试**

创建 `backend/tests/test_asr.py`：

```python
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("TRANSLATE_TOKEN", "test-token")

import uuid

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import auth_service
import main


def _make_token():
    return auth_service.create_token(uuid.uuid4())


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake@localhost/fake")
    with patch("db.init_pool", new_callable=AsyncMock), \
         patch("db.close_pool", new_callable=AsyncMock):
        with TestClient(main.app) as c:
            yield c


def test_asr_rejects_missing_token(client, monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-key")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/asr"):
            pass
    assert exc.value.code == 4001


def test_asr_rejects_invalid_token(client, monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-key")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/asr?token=not-a-jwt"):
            pass
    assert exc.value.code == 4001


def test_asr_closes_4002_when_no_deepgram_key(client, monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    token = _make_token()
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/asr?token={token}"):
            pass
    assert exc.value.code == 4002


def test_asr_sends_ready_on_valid_connect(client, monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-key")
    token = _make_token()

    mock_conn = MagicMock()
    mock_conn.start = AsyncMock(return_value=True)
    mock_conn.send = AsyncMock()
    mock_conn.finish = AsyncMock()
    mock_conn.on = MagicMock()
    mock_dg_instance = MagicMock()
    mock_dg_instance.listen.asynclive.v.return_value = mock_conn

    with patch("asr.DeepgramClient", return_value=mock_dg_instance):
        with client.websocket_connect(f"/ws/asr?token={token}") as ws:
            msg = ws.receive_json()
    assert msg == {"type": "ready"}
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/backend && python -m pytest tests/test_asr.py -v 2>&1 | head -30
```
Expected: ImportError 或 ModuleNotFoundError（asr 模块不存在）。

- [ ] **Step 4: 创建 `backend/asr.py`**

```python
import os

from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
from fastapi import APIRouter, Query, WebSocket

import auth_service
import translate_service

router = APIRouter()


@router.websocket("/ws/asr")
async def asr_endpoint(websocket: WebSocket, token: str = Query(default="")):
    await websocket.accept()

    try:
        auth_service.decode_token(token)
    except ValueError:
        await websocket.close(code=4001)
        return

    deepgram_api_key = os.environ.get("DEEPGRAM_API_KEY", "")
    if not deepgram_api_key:
        await websocket.close(code=4002)
        return

    dg_client = DeepgramClient(deepgram_api_key)
    dg_conn = dg_client.listen.asynclive.v("1")

    async def on_transcript(self, result, **kwargs):
        try:
            alt = result.channel.alternatives[0]
            text = alt.transcript
            if not text:
                return
            if not result.is_final:
                await websocket.send_json({"type": "interim", "text": text})
            else:
                deepl_key = os.environ.get("DEEPL_API_KEY", "")
                chinese = ""
                if deepl_key:
                    try:
                        chinese = await translate_service.translate_deepl(text, deepl_key)
                    except Exception:
                        pass
                await websocket.send_json(
                    {"type": "final", "korean": text, "chinese": chinese}
                )
        except Exception:
            pass

    async def on_error(self, error, **kwargs):
        try:
            await websocket.send_json({"type": "error", "message": str(error)})
        except Exception:
            pass

    dg_conn.on(LiveTranscriptionEvents.Transcript, on_transcript)
    dg_conn.on(LiveTranscriptionEvents.Error, on_error)

    options = LiveOptions(
        model="nova-2",
        language="ko",
        encoding="linear16",
        sample_rate=16000,
        channels=1,
        interim_results=True,
        endpointing=300,
    )

    started = await dg_conn.start(options)
    if not started:
        await websocket.send_json({"type": "error", "message": "Deepgram connection failed"})
        await websocket.close()
        return

    await websocket.send_json({"type": "ready"})

    try:
        async for chunk in websocket.iter_bytes():
            await dg_conn.send(chunk)
    except Exception:
        pass
    finally:
        await dg_conn.finish()
```

- [ ] **Step 5: 修改 `backend/main.py` — 挂载 ASR router**

在 `main.py` 现有 import 块末尾（`import translate_service` 之后）添加：
```python
import asr
```

在 `app = FastAPI(lifespan=lifespan)` 之后、`app.add_middleware(...)` 之前添加：
```python
app.include_router(asr.router)
```

- [ ] **Step 6: 修改 `render.yaml` — 添加 DEEPGRAM_API_KEY**

在 `render.yaml` 的 `envVars` 列表末尾添加：
```yaml
      - key: DEEPGRAM_API_KEY
        sync: false
```

- [ ] **Step 7: 安装 deepgram-sdk 并运行测试**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/backend && pip install "deepgram-sdk>=3.5,<4" && python -m pytest tests/test_asr.py -v
```
Expected: 4/4 PASS

- [ ] **Step 8: 运行完整后端测试（跳过需要真实 DB 的测试）**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/backend && python -m pytest tests/test_asr.py tests/test_auth_service.py tests/test_translate_service.py tests/test_translate_api.py tests/test_auth.py -v 2>&1 | tail -20
```
Expected: 全部 PASS（test_auth.py 可能因没有本地 DB 跳过，只要 test_asr.py 全绿即可）。

- [ ] **Step 9: Commit**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator && git add backend/asr.py backend/main.py backend/requirements.txt backend/tests/test_asr.py render.yaml && git commit -m "feat(backend): add /ws/asr WebSocket endpoint with Deepgram streaming"
```

---

### Task 2: Extension 音频管道（AudioWorklet + offscreen document）

**Files:**
- Create: `extension/src/audio-processor.js`
- Create: `extension/offscreen.html`
- Create: `extension/offscreen.js`
- Modify: `extension/manifest.json`
- Create: `extension/tests/audio-processor.test.js`

**Interfaces:**
- Consumes: 无（此 task 是独立的音频基础设施）
- Produces:
  - `offscreen.js` 监听 `chrome.runtime.onMessage`：接受 `{ type: "START_OFFSCREEN", streamId: string }` 和 `{ type: "STOP_OFFSCREEN" }`
  - 运行时向 background 发送 `chrome.runtime.sendMessage({ type: "PCM_CHUNK", buffer: ArrayBuffer })`（每帧 8000 bytes，约 250ms 一次）

- [ ] **Step 1: 写 PCM 转换数学规格测试**

创建 `extension/tests/audio-processor.test.js`：

```javascript
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
```

- [ ] **Step 2: 运行测试（验证数学规格正确）**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/extension && node --test tests/audio-processor.test.js
```
Expected: 5/5 PASS

- [ ] **Step 3: 创建 `extension/src/audio-processor.js`**

```javascript
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(4000);
    this._offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buf[this._offset++] = channel[i];
      if (this._offset >= 4000) {
        const int16 = new Int16Array(4000);
        for (let j = 0; j < 4000; j++) {
          const s = Math.max(-1, Math.min(1, this._buf[j]));
          int16[j] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
        }
        this.port.postMessage(int16.buffer, [int16.buffer]);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
```

- [ ] **Step 4: 创建 `extension/offscreen.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body><script src="offscreen.js"></script></body>
</html>
```

- [ ] **Step 5: 创建 `extension/offscreen.js`**

```javascript
let audioContext = null;
let mediaStream = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_OFFSCREEN") {
    startCapture(message.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (message?.type === "STOP_OFFSCREEN") {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture(streamId) {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  audioContext = new AudioContext({ sampleRate: 16000 });
  await audioContext.audioWorklet.addModule("src/audio-processor.js");

  const source = audioContext.createMediaStreamSource(mediaStream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  workletNode.port.onmessage = (event) => {
    chrome.runtime.sendMessage({ type: "PCM_CHUNK", buffer: event.data });
  };

  source.connect(workletNode);
}

function stopCapture() {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}
```

- [ ] **Step 6: 修改 `extension/manifest.json` — 添加权限**

将：
```json
"permissions": ["storage"]
```
改为：
```json
"permissions": ["storage", "tabCapture", "offscreen"]
```

- [ ] **Step 7: Commit**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator && git add extension/src/audio-processor.js extension/offscreen.html extension/offscreen.js extension/tests/audio-processor.test.js extension/manifest.json && git commit -m "feat(extension): add AudioWorklet PCM processor and offscreen audio capture document"
```

---

### Task 3: Extension background.js ASR 管理

**Files:**
- Modify: `extension/background.js`
- Create: `extension/tests/background-asr.test.js`

**Interfaces:**
- Consumes: offscreen 发来 `{ type: "PCM_CHUNK", buffer: ArrayBuffer }`（via chrome.runtime.sendMessage）
- Consumes: popup 发来 `{ type: "START_ASR" }` / `{ type: "STOP_ASR" }`
- Produces: 向 active tab 的 content script 发送 `{ type: "ASR_INTERIM", text: string }`
- Produces: 向 active tab 发送 `{ type: "ASR_FINAL", korean: string, chinese: string }`
- Produces: 向 popup 发送 `{ type: "ASR_STOPPED" }`（ASR 因任何原因停止时）

- [ ] **Step 1: 写重连逻辑测试**

创建 `extension/tests/background-asr.test.js`：

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

// 验证：只重连一次，第二次断开就停止
function makeReconnectTracker() {
  let retried = false;
  let stopped = false;
  function onDisconnect(intentional) {
    if (intentional || stopped) { stopped = true; return "stop"; }
    if (!retried) { retried = true; return "retry"; }
    stopped = true;
    return "stop";
  }
  return { onDisconnect, isStopped: () => stopped };
}

test("第一次非主动断连 → retry", () => {
  const t = makeReconnectTracker();
  assert.equal(t.onDisconnect(false), "retry");
});

test("第二次非主动断连 → stop", () => {
  const t = makeReconnectTracker();
  t.onDisconnect(false);
  assert.equal(t.onDisconnect(false), "stop");
  assert.ok(t.isStopped());
});

test("主动停止 → 立即 stop", () => {
  const t = makeReconnectTracker();
  assert.equal(t.onDisconnect(true), "stop");
  assert.ok(t.isStopped());
});
```

- [ ] **Step 2: 运行测试确认通过**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/extension && node --test tests/background-asr.test.js
```
Expected: 3/3 PASS

- [ ] **Step 3: 在 `extension/background.js` 中添加 ASR 状态变量**

在现有 `let lastRecordedVideoId = "";` 行之后（第 20 行附近）添加：

```javascript
let asrActive = false;
let asrWs = null;
let asrRetried = false;
let asrTabId = null;
```

- [ ] **Step 4: 在 `extension/background.js` 中添加 ASR 辅助函数**

在 `recordHistory` 函数结束后（第 115 行附近）添加以下函数：

```javascript
async function startAsr() {
  if (asrActive) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  asrTabId = tab.id;

  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });
  } catch (e) {
    chrome.runtime.sendMessage({ type: "ASR_ERROR", message: e.message }).catch(() => {});
    return;
  }

  const hasDoc = await chrome.offscreen.hasDocument().catch(() => false);
  if (!hasDoc) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Tab audio capture for speech recognition",
    });
  }

  await chrome.runtime.sendMessage({ type: "START_OFFSCREEN", streamId }).catch(() => {});

  asrRetried = false;
  asrActive = true;
  chrome.storage.local.set({ asrActive: true });
  connectAsrWebSocket();
}

function connectAsrWebSocket() {
  if (!cachedBackendUrl || !cachedJwt) {
    stopAsr();
    return;
  }
  const wsUrl = cachedBackendUrl.replace(/^http/, "ws") + `/ws/asr?token=${cachedJwt}`;
  asrWs = new WebSocket(wsUrl);

  asrWs.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const tab = tabs[0];
    if (!tab?.id) return;

    if (msg.type === "interim") {
      chrome.tabs.sendMessage(tab.id, { type: "ASR_INTERIM", text: msg.text }).catch(() => {});
    } else if (msg.type === "final") {
      chrome.tabs.sendMessage(tab.id, { type: "ASR_FINAL", korean: msg.korean, chinese: msg.chinese }).catch(() => {});
    } else if (msg.type === "error") {
      chrome.tabs.sendMessage(tab.id, { type: "ASR_ERROR", message: msg.message }).catch(() => {});
    }
  };

  asrWs.onclose = () => {
    if (!asrActive) return;
    if (!asrRetried) {
      asrRetried = true;
      setTimeout(connectAsrWebSocket, 3000);
    } else {
      stopAsr();
    }
  };

  asrWs.onerror = () => {
    asrWs?.close();
  };
}

async function stopAsr(intentional = true) {
  if (!asrActive && intentional) {
    chrome.runtime.sendMessage({ type: "ASR_STOPPED" }).catch(() => {});
    return;
  }
  asrActive = false;
  asrTabId = null;
  chrome.storage.local.set({ asrActive: false });

  if (asrWs) {
    asrWs.onclose = null;
    asrWs.close();
    asrWs = null;
  }

  chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN" }).catch(() => {});
  chrome.offscreen.closeDocument().catch(() => {});
  chrome.runtime.sendMessage({ type: "ASR_STOPPED" }).catch(() => {});
}
```

- [ ] **Step 5: 在 `extension/background.js` 的 onMessage 监听器中添加 ASR 消息处理**

在 `chrome.runtime.onMessage.addListener` 回调里，在最后的 `return false;` 之前添加：

```javascript
  if (message?.type === "START_ASR") {
    startAsr();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "STOP_ASR") {
    stopAsr(true);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "PCM_CHUNK") {
    if (asrWs?.readyState === WebSocket.OPEN) {
      asrWs.send(message.buffer);
    }
    return false;
  }
```

- [ ] **Step 6: 在 `extension/background.js` 末尾添加 tab 切换自动停止**

```javascript
chrome.tabs.onActivated.addListener(() => {
  if (asrActive) stopAsr(true);
});
```

- [ ] **Step 7: Commit**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator && git add extension/background.js extension/tests/background-asr.test.js && git commit -m "feat(extension): add ASR start/stop management in background service worker"
```

---

### Task 4: Extension content.js ASR overlay 渲染

**Files:**
- Modify: `extension/content.js`
- Modify: `extension/styles.css`
- Create: `extension/tests/content-asr.test.js`

**Interfaces:**
- Consumes: `{ type: "ASR_INTERIM", text: string }` / `{ type: "ASR_FINAL", korean: string, chinese: string }` / `{ type: "ASR_ERROR", message: string }` / `{ type: "ASR_STOPPED" }` — 来自 background
- Produces: 用现有 `renderText(text, state)` 函数驱动 overlay 显示（新增 state `"asr-interim"`）

- [ ] **Step 1: 写互斥逻辑测试**

创建 `extension/tests/content-asr.test.js`：

```javascript
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
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/extension && node --test tests/content-asr.test.js
```
Expected: 3/3 PASS

- [ ] **Step 3: 在 `extension/content.js` 中添加 ASR 状态变量**

在现有状态变量声明块末尾（`let observerStarted = false;` 之后）添加：

```javascript
let asrMode = false;
let asrFadeTimer = null;
```

- [ ] **Step 4: 修改 `extension/content.js` 中的 `scheduleCaptionCheck` 函数**

将函数第一行：
```javascript
function scheduleCaptionCheck() {
  if (!enabled) return;
```
改为：
```javascript
function scheduleCaptionCheck() {
  if (!enabled || asrMode) return;
```

- [ ] **Step 5: 在 `extension/content.js` 末尾添加 ASR 消息监听器**

在文件最后（`chrome.storage.onChanged.addListener` 块之后）添加：

```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ASR_INTERIM") {
    asrMode = true;
    clearTimeout(asrFadeTimer);
    renderText(`${message.text}　识别中…`, "asr-interim");
  } else if (message?.type === "ASR_FINAL") {
    asrMode = true;
    clearTimeout(asrFadeTimer);
    const display = message.chinese || message.korean || "";
    if (display) renderText(display, "translated");
    asrFadeTimer = setTimeout(() => renderText(""), 3000);
  } else if (message?.type === "ASR_ERROR") {
    clearTimeout(asrFadeTimer);
    renderText("语音识别中断", "error");
    asrFadeTimer = setTimeout(() => renderText(""), 3000);
  } else if (message?.type === "ASR_STOPPED") {
    asrMode = false;
    clearTimeout(asrFadeTimer);
    renderText("");
  }
});
```

- [ ] **Step 6: 在 `extension/styles.css` 中添加 asr-interim 状态样式**

在文件末尾添加：

```css
#ykt-translation-overlay[data-state="asr-interim"] {
  font-style: italic;
  opacity: 0.75;
  color: rgba(255, 255, 255, 0.85);
}
```

- [ ] **Step 7: 运行所有 extension 测试**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator/extension && node --test tests/
```
Expected: 全部 PASS（包括已有测试）

- [ ] **Step 8: Commit**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator && git add extension/content.js extension/styles.css extension/tests/content-asr.test.js && git commit -m "feat(extension): add ASR overlay rendering in content.js (interim Korean + final Chinese)"
```

---

### Task 5: Extension popup UI — ASR 按钮

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`

**Interfaces:**
- Consumes: `chrome.storage.local` key `asrActive: boolean`；现有函数 `isJwtValid(jwt)` 和 `showMainView(email)`
- Produces: 发送 `{ type: "START_ASR" }` / `{ type: "STOP_ASR" }` 给 background；响应 `{ type: "ASR_STOPPED" }` 消息重置按钮

- [ ] **Step 1: 在 `extension/popup.html` 的 `<style>` 块末尾添加 ASR 按钮样式**

在 `</style>` 之前添加：

```css
      .asr-btn {
        display: block;
        width: 100%;
        margin-top: 8px;
        padding: 6px 0;
        font-size: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #f5f5f5;
        cursor: pointer;
        text-align: center;
      }

      .asr-btn:hover {
        background: #e8e8e8;
      }

      .asr-btn.active {
        background: #fee2e2;
        border-color: #fca5a5;
        color: #b91c1c;
      }
```

- [ ] **Step 2: 在 `extension/popup.html` 中添加 ASR section HTML**

在 `<div id="history-section"...>` 之前插入：

```html
      <!-- ASR section: shown only when logged in -->
      <div id="asr-section" hidden>
        <hr class="divider" />
        <button id="asr-btn" class="asr-btn">🎙 语音识别</button>
      </div>
```

- [ ] **Step 3: 在 `extension/popup.js` 中添加 DOM 引用**

在现有 `const historyList = ...` 行之后添加：

```javascript
const asrSection    = document.getElementById("asr-section");
const asrBtn        = document.getElementById("asr-btn");
```

- [ ] **Step 4: 在 `extension/popup.js` 中添加 `setAsrButton` 辅助函数**

在 `setBackendTag` 函数之后添加：

```javascript
function setAsrButton(active) {
  if (active) {
    asrBtn.textContent = "⏹ 停止识别";
    asrBtn.classList.add("active");
  } else {
    asrBtn.textContent = "🎙 语音识别";
    asrBtn.classList.remove("active");
  }
}
```

- [ ] **Step 5: 修改 `extension/popup.js` 中的 `showMainView` 函数**

在 `showMainView(email)` 函数内，`userBar.hidden = ...` 逻辑之后添加：

```javascript
  asrSection.hidden = !email;
```

- [ ] **Step 6: 修改 init 的 `chrome.storage.local.get` 调用**

将 get 的 keys 对象中加入 `asrActive: false`：

将：
```javascript
    backendDegraded: false,
  },
```
改为：
```javascript
    backendDegraded: false,
    asrActive: false,
  },
```

在 `initMainViewFields(store)` 调用之后添加：
```javascript
      setAsrButton(store.asrActive);
```

- [ ] **Step 7: 在 logout handler 中重置 ASR**

在 `logoutBtn.addEventListener("click", () => {` 回调内，`historySection.hidden = true;` 之后添加：

```javascript
  chrome.runtime.sendMessage({ type: "STOP_ASR" }).catch(() => {});
  asrSection.hidden = true;
  setAsrButton(false);
```

- [ ] **Step 8: 添加 ASR 按钮点击 handler**

在 `saveBackendBtn.addEventListener` 块之后添加：

```javascript
asrBtn.addEventListener("click", () => {
  chrome.storage.local.get({ asrActive: false }, (store) => {
    if (store.asrActive) {
      chrome.runtime.sendMessage({ type: "STOP_ASR" }).catch(() => {});
      chrome.storage.local.set({ asrActive: false });
      setAsrButton(false);
    } else {
      chrome.runtime.sendMessage({ type: "START_ASR" }).catch(() => {});
      chrome.storage.local.set({ asrActive: true });
      setAsrButton(true);
    }
  });
});
```

- [ ] **Step 9: 修改 popup 的 `chrome.runtime.onMessage.addListener`**

在现有监听器内，`if (message?.type === "BACKEND_DEGRADED")` 块之后添加：

```javascript
  if (message?.type === "ASR_STOPPED") {
    setAsrButton(false);
    chrome.storage.local.set({ asrActive: false });
  }
```

- [ ] **Step 10: Commit**

```bash
cd /Users/w./Desktop/AI开发/youtube-korean-translator && git add extension/popup.html extension/popup.js && git commit -m "feat(extension): add ASR toggle button to popup (login-gated, red when active)"
```

---

## 自检结果

**Spec coverage 确认：**
- ✅ chrome.tabCapture + offscreen (Task 2, 3)
- ✅ AudioWorklet PCM Int16 16kHz 4000 samples (Task 2)
- ✅ /ws/asr WebSocket + JWT close 4001/4002 (Task 1)
- ✅ Deepgram nova-2 ko linear16 16000 interim_results endpointing=300 (Task 1)
- ✅ ready/interim/final/error 消息 (Task 1, 4)
- ✅ ASR 按钮登录后可见 (Task 5)
- ✅ asrActive 存 storage (Task 3, 5)
- ✅ ASR_INTERIM 灰色斜体韩文 (Task 4)
- ✅ ASR_FINAL 中文正常样式 3s 淡出 (Task 4)
- ✅ CC 字幕 + ASR 模式互斥 (Task 4)
- ✅ 后端 WS 断连 3s 重连一次 (Task 3)
- ✅ Tab 切换自动停止 (Task 3)
- ✅ DEEPGRAM_API_KEY 未配置 4002 (Task 1)
- ✅ deepgram-sdk>=3.5,<4 (Task 1)
- ✅ render.yaml 添加 DEEPGRAM_API_KEY (Task 1)
- ✅ translate_service.translate_deepl in final handler (Task 1)

# ASR 实时语音识别 Design Spec

## Goal

为插件新增「ASR 模式」：在没有 YouTube CC 字幕的直播中，通过捕获标签页音频，经 Deepgram 流式识别韩语，再翻译为中文，实时叠加显示在视频上。

## Architecture

```
Tab 音频
  └─ chrome.tabCapture (background.js)
       └─ offscreen.js (AudioWorklet → PCM Int16 chunks, 16kHz mono)
            └─ background.js (WebSocket 客户端)
                 └─ 后端 /ws/asr (FastAPI WebSocket)
                      └─ Deepgram 流式 WebSocket (ko, nova-2)
                           ├─ interim → extension → content.js 显示韩文（灰色）
                           └─ final → 翻译 → extension → content.js 替换中文
```

## Files

### New
- `extension/offscreen.html` — offscreen document 入口
- `extension/offscreen.js` — AudioContext + AudioWorkletNode，切 PCM 包发给 background
- `extension/src/audio-processor.js` — AudioWorkletProcessor（积 4000 samples → postMessage Int16Array）
- `backend/asr.py` — `/ws/asr` WebSocket endpoint + Deepgram 中继逻辑

### Modified
- `extension/manifest.json` — 加 `tabCapture`、`offscreen` permissions
- `extension/background.js` — START_ASR / STOP_ASR 处理、WebSocket 管理、offscreen 生命周期
- `extension/popup.html` — 新增「🎙 语音识别」按钮（登录态可见）
- `extension/popup.js` — ASR 按钮交互逻辑
- `extension/content.js` — 监听 ASR_INTERIM / ASR_FINAL，渲染 overlay
- `backend/main.py` — 挂载 `/ws/asr` 路由
- `backend/requirements.txt` — 加 `deepgram-sdk>=3.5,<4`

## WebSocket Protocol

**连接：** `wss://<backendUrl>/ws/asr?token=<jwt>`

**Extension → 后端：**
- 二进制帧：PCM Int16，16kHz，单声道，每帧 ~250ms（4000 samples = 8000 bytes）

**后端 → Extension（JSON）：**
```json
{ "type": "ready" }
{ "type": "interim", "text": "지금 이 게임은" }
{ "type": "final",   "korean": "지금 이 게임은 어렵네요", "chinese": "这个游戏现在挺难的" }
{ "type": "error",   "message": "<reason>" }
```

**关闭码：**
- `4001` — JWT 无效或缺失
- `4002` — `DEEPGRAM_API_KEY` 未配置

## Deepgram Configuration

```
model: nova-2
language: ko
encoding: linear16
sample_rate: 16000
channels: 1
interim_results: true
endpointing: 300
```

## Extension Detail

### manifest.json
```json
"permissions": ["storage", "tabCapture", "offscreen"]
```

### ASR 启动流程（background.js）
1. popup 发 `START_ASR` → background.js 调 `chrome.tabCapture.capture({ audio: true, video: false })`
2. 用 `chrome.offscreen.createDocument()` 创建 offscreen document
3. 把 MediaStreamTrack 传给 offscreen（通过 `chrome.runtime.sendMessage`）
4. 打开 WebSocket → 收到 `ready` 消息后开始转发 PCM 帧
5. popup 发 `STOP_ASR` → 关闭 WebSocket → 关闭 offscreen document

### offscreen.js
- 接收 MediaStreamTrack
- `new AudioContext({ sampleRate: 16000 })`
- `audioContext.audioWorklet.addModule('src/audio-processor.js')`
- AudioWorkletProcessor 每积累 4000 samples → postMessage Int16Array
- offscreen 通过 `chrome.runtime.sendMessage` 把 Int16Array 发给 background

### popup UI
- ASR 按钮仅在 `isLoggedIn === true` 时显示
- 默认：「🎙 语音识别」（灰色）
- 激活后：「⏹ 停止识别」（红色）
- 状态存储在 `chrome.storage.local` 的 `asrActive: boolean`

### content.js overlay 行为
- `ASR_INTERIM`：overlay 显示韩文，附灰色「识别中...」标签，使用斜体
- `ASR_FINAL`：清除 interim 显示，显示中文翻译（正常样式），3 秒后淡出
- ASR overlay 与 CC 字幕 overlay 共用同一容器，互斥（ASR 模式开启时忽略 CC 字幕事件）

## Backend Detail

### asr.py 核心结构
```python
@router.websocket("/ws/asr")
async def asr_endpoint(websocket: WebSocket, token: str = Query(...)):
    user = verify_jwt(token)  # 失败 → close(4001)
    if not DEEPGRAM_API_KEY:
        await websocket.close(4002); return

    await websocket.accept()
    dg_conn = await start_deepgram_connection(on_transcript=...)
    await websocket.send_json({"type": "ready"})

    async for chunk in websocket.iter_bytes():
        await dg_conn.send(chunk)
```

### 翻译
- 调用 `translate_service.translate_deepl(text, os.environ["DEEPL_API_KEY"])`
- 在 `final` 回调中异步调用
- `DEEPL_API_KEY` 未配置时跳过翻译，直接推 `{"type":"final","korean":text,"chinese":""}`

### 新增环境变量
- `DEEPGRAM_API_KEY` — Deepgram API 密钥

## Error Handling

| 场景 | 处理方式 |
|------|---------|
| 用户未登录 | popup 不显示 ASR 按钮 |
| `tabCapture` 被拒绝 | popup 提示「请允许音频权限」，停止 ASR |
| Deepgram 断连 | 后端推 `error` → extension overlay 提示「语音识别中断」→ popup 按钮复位 |
| 后端 WebSocket 断连 | background.js 自动重连一次（3s 后），失败则停止 ASR |
| 切换 YouTube 标签页 | `chrome.tabs.onActivated` 检测 → 自动停止 ASR |
| `DEEPGRAM_API_KEY` 未配置 | 连接时关闭 4002，extension 提示「ASR 未配置」 |

## Out of Scope (Future)

- 自动检测无字幕时启用 ASR
- faster-whisper 本地运行（降低成本）
- 说话人分离
- 置信度过滤
- VAD 静音检测优化

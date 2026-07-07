# 夜间工作日志 — ASR 实时语音识别功能

**任务：** 实现 ASR 功能（5个Task）
**分支：** feature/asr-realtime

---

## 进度总览

| Task | 状态 | Commits |
|------|------|---------|
| Task 1: 后端 /ws/asr WebSocket endpoint | ✅ 完成 | aa9178b |
| Task 2: Extension AudioWorklet + offscreen | ✅ 完成 | cad2e21 |
| Task 3: background.js ASR 管理 | ✅ 完成 | 9545fe0 |
| Task 4: content.js ASR overlay 渲染 | ✅ 完成 | cd55137 |
| Task 5: popup UI ASR 按钮 | ✅ 完成 | 553352b |
| 最终代码审查 + 修复 | ✅ 完成 | 785f37c |

---

## 工作记录

### [Task 1] 后端 ASR WebSocket endpoint
- ✅ `backend/asr.py` — Deepgram 流式 WebSocket 中继
- ✅ `backend/main.py` — 挂载 `/ws/asr` router
- ✅ `backend/requirements.txt` — 加 `deepgram-sdk>=3.5,<4`
- ✅ `render.yaml` — 加 `DEEPGRAM_API_KEY` env var
- ✅ `backend/tests/test_asr.py` — 4/4 测试通过
- **问题修复：** 原测试 `with pytest.raises: pass` 不触发 WebSocketDisconnect，改为 `ws.receive_json()` 模式

### [Task 2] Extension 音频管道
- ✅ `extension/src/audio-processor.js` — AudioWorkletProcessor，4000 samples → Int16
- ✅ `extension/offscreen.html` + `offscreen.js` — getUserMedia + AudioWorklet 切片
- ✅ `extension/manifest.json` — 加 `tabCapture`、`offscreen` 权限
- ✅ `extension/tests/audio-processor.test.js` — 5/5 测试通过

### [Task 3] background.js ASR 管理
- ✅ ASR 状态变量（asrActive/asrWs/asrRetried/asrTabId）
- ✅ `startAsr()` — tabCapture → offscreen document → WebSocket
- ✅ `connectAsrWebSocket()` — 重连逻辑（最多一次，3s 延迟）
- ✅ `stopAsr()` — 清理 WS、offscreen、通知 popup
- ✅ START_ASR / STOP_ASR / PCM_CHUNK 消息处理
- ✅ chrome.tabs.onActivated 自动停止 ASR
- ✅ `extension/tests/background-asr.test.js` — 3/3 通过
- ✅ `background-settings-race.test.js` mock 补充 chrome.tabs / tabCapture / offscreen

### [Task 4] content.js ASR overlay 渲染
- ✅ `asrMode` / `asrFadeTimer` 状态变量
- ✅ `scheduleCaptionCheck` 互斥（asrMode 时直接返回）
- ✅ ASR_INTERIM / ASR_FINAL / ASR_ERROR / ASR_STOPPED 消息监听
- ✅ `extension/styles.css` — 加 `asr-interim` 斜体灰色样式
- ✅ `extension/tests/content-asr.test.js` — 3/3 通过

### [Task 5] popup UI ASR 按钮
- ✅ `popup.html` — ASR section HTML + CSS 样式（绿/红切换）
- ✅ `popup.js` — `setAsrButton()` 辅助函数
- ✅ `showMainView` 登录后显示 ASR section
- ✅ 初始化时读取 `asrActive` 状态
- ✅ 退出登录自动停止 ASR
- ✅ ASR 按钮点击发送 START_ASR / STOP_ASR
- ✅ 响应 ASR_STOPPED 重置按钮状态
- **全套测试 35/35 PASS**

---

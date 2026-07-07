let audioContext = null;
let mediaStream = null;
let asrWs = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_OFFSCREEN") {
    startCapture(message.streamId, message.wsUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (message?.type === "STOP_OFFSCREEN") {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture(streamId, wsUrl) {
  // Open WebSocket directly — avoids JSON serialization of ArrayBuffer via sendMessage
  asrWs = new WebSocket(wsUrl);
  asrWs.binaryType = "arraybuffer";

  asrWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {}
  };

  asrWs.onclose = (e) => {
    chrome.runtime.sendMessage({ type: "WS_CLOSED", code: e.code, reason: e.reason }).catch(() => {});
  };

  asrWs.onerror = () => {
    asrWs?.close();
  };

  // Capture tab audio
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

  // Keep tab audio audible for the user
  source.connect(audioContext.destination);
  // Branch to worklet for PCM processing
  source.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    if (asrWs?.readyState === WebSocket.OPEN) {
      asrWs.send(event.data); // Direct binary send — no serialization
    }
  };
}

function stopCapture() {
  if (asrWs) {
    asrWs.onclose = null; // Suppress WS_CLOSED on intentional stop
    asrWs.close();
    asrWs = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

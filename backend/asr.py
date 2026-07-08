import logging
import os

import httpx
from fastapi import APIRouter, Query, WebSocket

import auth_service
import translate_service

logger = logging.getLogger(__name__)
router = APIRouter()


async def _translate_fast(text: str) -> str:
    url = "https://translate.googleapis.com/translate_a/single"
    params = {"client": "gtx", "sl": "ko", "tl": "zh-CN", "dt": "t", "q": text}
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        return "".join(item[0] for item in data[0] if item[0])


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

    try:
        from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
    except ImportError as e:
        await websocket.send_json({"type": "error", "message": f"Deepgram SDK not available: {e}"})
        await websocket.close()
        return

    try:
        dg_client = DeepgramClient(deepgram_api_key)
        dg_conn = dg_client.listen.asynclive.v("1")
    except Exception as e:
        logger.exception("deepgram client init exception: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": f"Deepgram init failed: {e}"})
            await websocket.close()
        except Exception:
            pass
        return

    logger.info("deepgram init success")

    async def on_transcript(self, result, **kwargs):
        try:
            alt = result.channel.alternatives[0]
            text = alt.transcript
            logger.info("transcript callback: is_final=%s text=%r", result.is_final, (text or "")[:60])
            if not text:
                return
            if not result.is_final:
                await websocket.send_json({"type": "interim", "text": text})
            else:
                await websocket.send_json({"type": "final", "korean": text, "chinese": ""})
                try:
                    chinese = await _translate_fast(text)
                    await websocket.send_json({"type": "final", "korean": text, "chinese": chinese})
                except Exception:
                    pass
        except Exception:
            pass

    async def on_error(self, error, **kwargs):
        try:
            await websocket.send_json({"type": "error", "message": str(error)})
        except Exception:
            pass

    try:
        dg_conn.on(LiveTranscriptionEvents.Transcript, on_transcript)
        dg_conn.on(LiveTranscriptionEvents.Error, on_error)
        options = LiveOptions(
            model="nova-2",
            language="ko",
            encoding="linear16",
            sample_rate=16000,
            channels=1,
            interim_results=True,
            endpointing=150,
        )
    except Exception as e:
        logger.exception("deepgram setup exception: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": f"Deepgram setup failed: {e}"})
            await websocket.close()
        except Exception:
            pass
        return

    logger.info("deepgram start begin")
    try:
        started = await dg_conn.start(options)
    except Exception as e:
        logger.exception("deepgram start exception: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": f"Deepgram start exception: {e}"})
            await websocket.close()
        except Exception:
            pass
        return

    if not started:
        logger.warning("deepgram start fail: returned False")
        await websocket.send_json({"type": "error", "message": "Deepgram connection failed"})
        await websocket.close()
        return

    logger.info("deepgram start success")
    await websocket.send_json({"type": "ready"})

    chunk_count = 0
    try:
        async for chunk in websocket.iter_bytes():
            chunk_count += 1
            if chunk_count == 1:
                logger.info("first audio chunk received len=%d", len(chunk))
            elif chunk_count % 50 == 0:
                logger.info("audio chunk #%d", chunk_count)
            try:
                await dg_conn.send(chunk)
                if chunk_count == 1:
                    logger.info("first chunk sent to deepgram")
            except Exception as e:
                logger.exception("dg_conn.send exception: %s", e)
                break
    except Exception as e:
        logger.exception("websocket.iter_bytes exception: %s", e)
    finally:
        await dg_conn.finish()

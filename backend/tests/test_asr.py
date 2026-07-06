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
    with client.websocket_connect("/ws/asr") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4001


def test_asr_rejects_invalid_token(client, monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-key")
    with client.websocket_connect("/ws/asr?token=not-a-jwt") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4001


def test_asr_closes_4002_when_no_deepgram_key(client, monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    token = _make_token()
    with client.websocket_connect(f"/ws/asr?token={token}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
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

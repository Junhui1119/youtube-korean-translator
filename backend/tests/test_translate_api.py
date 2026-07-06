import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from main import app

VALID_TOKEN = "test-secret-token"


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("TRANSLATE_TOKEN", VALID_TOKEN)
    monkeypatch.setenv("DEEPL_API_KEY", "fake-deepl-key")


@pytest.fixture
async def client():
    with patch("db.init_pool", new=AsyncMock()), patch("db.close_pool", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac


async def test_translate_success(client):
    with patch("translate_service.translate_deepl", new=AsyncMock(return_value="你好")):
        resp = await client.post(
            "/api/translate",
            json={"text": "안녕하세요"},
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["translated"] == "你好"
    assert data["engine"] == "deepl"
    assert isinstance(data["latency_ms"], int)


async def test_translate_wrong_token(client):
    resp = await client.post(
        "/api/translate",
        json={"text": "안녕"},
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert resp.status_code == 401


async def test_translate_missing_auth_header(client):
    resp = await client.post("/api/translate", json={"text": "안녕"})
    assert resp.status_code == 422


async def test_translate_empty_text(client):
    resp = await client.post(
        "/api/translate",
        json={"text": ""},
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
    )
    assert resp.status_code == 422


async def test_translate_deepl_failure_returns_502(client):
    with patch(
        "translate_service.translate_deepl",
        new=AsyncMock(side_effect=RuntimeError("DeepL HTTP 429")),
    ):
        resp = await client.post(
            "/api/translate",
            json={"text": "안녕"},
            headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        )
    assert resp.status_code == 502

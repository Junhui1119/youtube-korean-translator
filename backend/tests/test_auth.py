import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("TRANSLATE_TOKEN", "test-token")

import auth_service
import db
import main


@pytest.fixture(autouse=True)
def jwt_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret")


@pytest.fixture
async def client(pool):
    """Real test-DB client: patches lifespan DB calls but provides real pool."""
    db._pool = pool
    with patch("db.init_pool", new=AsyncMock()), patch("db.close_pool", new=AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=main.app), base_url="http://test"
        ) as ac:
            yield ac
    db._pool = None


async def test_register_success(client):
    resp = await client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "token" in data
    assert data["email"] == "new@example.com"
    # token must be decodable
    assert auth_service.decode_token(data["token"]) is not None


async def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "password123"}
    await client.post("/api/auth/register", json=payload)
    resp = await client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409


async def test_register_short_password(client):
    resp = await client.post(
        "/api/auth/register", json={"email": "short@example.com", "password": "abc"}
    )
    assert resp.status_code == 422


async def test_login_success(client):
    await client.post(
        "/api/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    assert "token" in resp.json()


async def test_login_wrong_password(client):
    await client.post(
        "/api/auth/register",
        json={"email": "wp@example.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "wp@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


async def test_login_unknown_email(client):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "noexist@example.com", "password": "password123"},
    )
    assert resp.status_code == 401


async def test_history_with_valid_jwt(client):
    reg = await client.post(
        "/api/auth/register",
        json={"email": "hist@example.com", "password": "password123"},
    )
    token = reg.json()["token"]
    resp = await client.get(
        "/api/history", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_history_invalid_jwt_returns_401(client):
    resp = await client.get(
        "/api/history", headers={"Authorization": "Bearer invalid-token"}
    )
    assert resp.status_code == 401


async def test_history_missing_auth_returns_401(client):
    resp = await client.get("/api/history")
    assert resp.status_code == 401


async def test_login_empty_password_hash_returns_401(client):
    # Simulate a legacy user inserted without going through /register
    async with db._pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (email, password_hash) VALUES ($1, '')",
            "legacy@example.com",
        )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "legacy@example.com", "password": "anything"},
    )
    assert resp.status_code == 401

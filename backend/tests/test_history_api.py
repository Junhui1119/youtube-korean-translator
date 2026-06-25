import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import db
import main


@pytest_asyncio.fixture
async def client(pool, user_id):
    db._pool = pool
    main.app.dependency_overrides[main.get_current_user_id] = lambda: user_id
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    main.app.dependency_overrides.clear()
    db._pool = None


async def test_post_then_get_history(client):
    r = await client.post(
        "/api/history",
        json={"video_id": "abc12345678", "title": "标题A", "channel": "频道A"},
    )
    assert r.status_code == 204

    r = await client.get("/api/history")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["video_id"] == "abc12345678"
    assert data[0]["title"] == "标题A"
    assert data[0]["last_position"] == 0


async def test_get_history_pagination_param(client):
    for i in range(3):
        await client.post(
            "/api/history", json={"video_id": f"vid{i:08d}", "title": f"T{i}"}
        )
    r = await client.get("/api/history", params={"limit": 1, "offset": 0})
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_invalid_user_id_header_rejected():
    assert db._pool is None
    # 不覆盖鉴权依赖，传非法 X-User-Id 应 400
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/history", headers={"X-User-Id": "not-a-uuid"})
    assert r.status_code == 400


async def test_get_history_rejects_negative_offset(client):
    r = await client.get("/api/history", params={"offset": -1})
    assert r.status_code == 422


async def test_get_history_rejects_limit_over_max(client):
    r = await client.get("/api/history", params={"limit": 100000000})
    assert r.status_code == 422

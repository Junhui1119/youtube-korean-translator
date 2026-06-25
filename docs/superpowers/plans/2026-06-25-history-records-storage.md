# history_records 存储层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为后端实现 `history_records` 数据层与 API，落地「只存视频级元数据 + upsert 去重 + 每用户 200 条硬上限」的存储策略，使 Supabase 免费额度永不被撑爆。

**Architecture:** 在现有 hello-world FastAPI 上首次引入数据库层：用 asyncpg 连接池访问 PostgreSQL；schema 用一份 `schema.sql`（含最小 `users` 表 + `history_records` 表）；仓储层封装 `record_watch`（upsert + 超限裁剪）与 `list_history`（倒序分页）；两个 FastAPI 端点暴露写入和列表。

**Tech Stack:** Python 3.13、FastAPI、asyncpg、PostgreSQL 16、pytest + pytest-asyncio + httpx。

## Global Constraints

- 数据库：PostgreSQL，目标托管 Supabase 免费版（约 500MB）。
- **只存视频级元数据，不存任何字幕正文。** `history_records` 不得出现存韩文/中文字幕文本的列。
- 去重键：`UNIQUE (user_id, video_id)`，重看走 upsert 更新而非新增。
- 每用户硬上限：`HISTORY_CAP = 200`。
- 排序/裁剪一律按 `(watched_at DESC, id DESC)`，`id` 作为时间相同的稳定二级键。
- 缩略图不入库（由前端用 `video_id` 推导），本计划不含前端。
- 真实鉴权（JWT）与 Web 控制台 UI 不在本计划内；端点临时用 `X-User-Id` 请求头标识用户，并在代码中明确标注「待替换」。

## Prerequisites（执行前一次性准备）

需要一个本地测试用 PostgreSQL。推荐用 Docker：

```bash
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ykt_test \
  --name ykt-pg postgres:16
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ykt_test"
```

所有任务的测试都假定 `TEST_DATABASE_URL` 已导出且该库可连接。

## File Structure

- `backend/db.py`（新建）— asyncpg 连接池的初始化/关闭/获取。单一职责：连接生命周期。
- `backend/schema.sql`（新建）— 建表 DDL（最小 `users` + `history_records` + 索引）。
- `backend/history_repo.py`（新建）— 历史记录仓储：`record_watch`、`list_history`。纯数据访问，无 HTTP 概念。
- `backend/main.py`（修改）— 接入 lifespan 启停连接池，新增 `POST /api/history`、`GET /api/history` 与临时鉴权依赖。
- `backend/requirements.txt`（修改）— 运行期依赖加 asyncpg、python-dotenv。
- `backend/requirements-dev.txt`（新建）— 测试依赖。
- `backend/pytest.ini`（新建）— pytest 配置（asyncio 自动模式 + import 路径）。
- `backend/.env.example`（新建）— `DATABASE_URL` / `TEST_DATABASE_URL` 样例。
- `backend/tests/conftest.py`（新建）— 测试夹具：连接池、建表、清表、测试用户。
- `backend/tests/test_history_repo.py`（新建）— 仓储层测试。
- `backend/tests/test_history_api.py`（新建）— 端点测试。

---

### Task 1: 数据库连接层与依赖

**Files:**
- Create: `backend/db.py`
- Modify: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`
- Create: `backend/pytest.ini`
- Create: `backend/.env.example`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Consumes: 环境变量 `DATABASE_URL`（应用）/ `TEST_DATABASE_URL`（测试）。
- Produces:
  - `async init_pool() -> asyncpg.Pool` — 创建并缓存全局连接池。
  - `async close_pool() -> None` — 关闭并清空全局连接池。
  - `get_pool() -> asyncpg.Pool` — 返回已初始化的连接池，未初始化则抛 `RuntimeError`。
  - 测试夹具 `pool`（`asyncpg.Pool`，已建表+清表）、`user_id`（`uuid.UUID`，库中已存在的测试用户）。
  - 模块内可写全局：`db._pool`（测试通过直接赋值注入连接池）。

- [ ] **Step 1: 添加依赖文件**

修改 `backend/requirements.txt` 为：

```
fastapi>=0.115,<1
uvicorn[standard]>=0.34,<1
asyncpg>=0.30,<1
python-dotenv>=1,<2
```

新建 `backend/requirements-dev.txt`：

```
-r requirements.txt
pytest>=8,<9
pytest-asyncio>=0.24,<1
httpx>=0.27,<1
```

新建 `backend/pytest.ini`：

```ini
[pytest]
asyncio_mode = auto
pythonpath = .
testpaths = tests
```

新建 `backend/.env.example`：

```
# 应用运行时连接的数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ykt
# 测试连接的数据库（pytest 使用）
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ykt_test
```

安装：

```bash
cd backend && pip install -r requirements-dev.txt
```

- [ ] **Step 2: 写连接层 `backend/db.py`**

```python
import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """创建并缓存全局连接池（幂等）。"""
    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    """关闭并清空全局连接池。"""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """返回已初始化的连接池。"""
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool
```

- [ ] **Step 3: 写测试夹具 `backend/tests/conftest.py`**

```python
import os
import uuid
from pathlib import Path

import asyncpg
import pytest_asyncio

TEST_DSN = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/ykt_test",
)
SCHEMA = Path(__file__).resolve().parent.parent / "schema.sql"


@pytest_asyncio.fixture
async def pool():
    p = await asyncpg.create_pool(TEST_DSN, min_size=1, max_size=5)
    async with p.acquire() as conn:
        if SCHEMA.exists():
            await conn.execute(SCHEMA.read_text())
            await conn.execute(
                "TRUNCATE history_records, users RESTART IDENTITY CASCADE"
            )
    yield p
    await p.close()


@pytest_asyncio.fixture
async def user_id(pool):
    async with pool.acquire() as conn:
        uid = await conn.fetchval(
            "INSERT INTO users (email) VALUES ($1) RETURNING id",
            f"{uuid.uuid4()}@test.local",
        )
    return uid
```

> 说明：`schema.sql` 在 Task 2 才创建，所以此处用 `if SCHEMA.exists()` 守卫，使本任务的 `test_db` 能先跑起来（夹具仅建池，不依赖表）。

- [ ] **Step 4: 写失败测试 `backend/tests/test_db.py`**

```python
import db


async def test_pool_executes_select_one(pool):
    db._pool = pool
    try:
        async with db.get_pool().acquire() as conn:
            assert await conn.fetchval("SELECT 1") == 1
    finally:
        db._pool = None


async def test_get_pool_uninitialized_raises():
    db._pool = None
    try:
        import pytest

        with pytest.raises(RuntimeError):
            db.get_pool()
    finally:
        db._pool = None
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd backend && pytest tests/test_db.py -v`
Expected: 2 passed（需 `TEST_DATABASE_URL` 可连接）。

- [ ] **Step 6: 提交**

```bash
git add backend/db.py backend/requirements.txt backend/requirements-dev.txt \
  backend/pytest.ini backend/.env.example backend/tests/conftest.py backend/tests/test_db.py
git commit -m "feat(backend): add asyncpg connection pool layer + test fixtures"
```

---

### Task 2: 数据库 Schema

**Files:**
- Create: `backend/schema.sql`
- Test: `backend/tests/test_schema.py`

**Interfaces:**
- Consumes: Task 1 的 `pool` 夹具（会自动 apply `schema.sql`）。
- Produces: 表 `users(id uuid, email text, created_at timestamptz)`、表 `history_records(id bigserial, user_id uuid, video_id text, title text, channel text, watched_at timestamptz, last_position int)`、唯一约束 `(user_id, video_id)`、索引 `idx_history_user_watched`。

- [ ] **Step 1: 写失败测试 `backend/tests/test_schema.py`**

```python
async def test_history_records_columns(pool):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'history_records'
            """
        )
    cols = {r["column_name"] for r in rows}
    assert cols == {
        "id",
        "user_id",
        "video_id",
        "title",
        "channel",
        "watched_at",
        "last_position",
    }


async def test_unique_user_video(pool):
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE tablename = 'history_records'
                AND indexdef ILIKE '%UNIQUE%(user_id, video_id)%'
            )
            """
        )
    assert exists is True
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && pytest tests/test_schema.py -v`
Expected: FAIL（`relation "history_records" does not exist` 或 schema 未应用）。

- [ ] **Step 3: 写 `backend/schema.sql`**

```sql
-- gen_random_uuid() 所需（PG13+ 已内置；保留扩展以兼容）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 最小 users 表：仅满足外键约束与测试。完整账号体系（密码/Token）由独立的鉴权计划实现。
CREATE TABLE IF NOT EXISTS users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 翻译历史：只存视频级元数据，绝不存字幕正文。
CREATE TABLE IF NOT EXISTS history_records (
  id            bigserial    PRIMARY KEY,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id      text         NOT NULL,            -- YouTube 视频ID（11字符）
  title         text         NOT NULL,            -- 视频标题
  channel       text,                             -- 频道名（可选）
  watched_at    timestamptz  NOT NULL DEFAULT now(),  -- 最近一次观看时间
  last_position int          NOT NULL DEFAULT 0,  -- 上次看到第几秒
  UNIQUE (user_id, video_id)                      -- 去重：每用户每视频一行
);

-- 缩略图不入库，前端用 video_id 拼 img.youtube.com/vi/{id}/mqdefault.jpg

-- 列表查询 + 超限裁剪都按 (watched_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_history_user_watched
  ON history_records (user_id, watched_at DESC, id DESC);
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && pytest tests/test_schema.py -v`
Expected: 2 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/schema.sql backend/tests/test_schema.py
git commit -m "feat(backend): add history_records + minimal users schema"
```

---

### Task 3: 仓储层 — `record_watch`（upsert + 200 上限裁剪）

**Files:**
- Create: `backend/history_repo.py`
- Test: `backend/tests/test_history_repo.py`

**Interfaces:**
- Consumes: `asyncpg.Pool`（来自 `db.get_pool()` 或测试 `pool` 夹具）；`user_id: uuid.UUID`。
- Produces:
  - `HISTORY_CAP = 200`
  - `async record_watch(pool, user_id, video_id, title, channel=None, last_position=0) -> None`
    - 新视频 → 插入并把该用户裁剪到至多 `HISTORY_CAP` 行（删最旧）。
    - 已存在 → 更新 `watched_at=now()`、`last_position`、`title`、`channel`，不新增、不裁剪。

- [ ] **Step 1: 写失败测试 `backend/tests/test_history_repo.py`**

```python
import history_repo


async def _count(pool, user_id):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT count(*) FROM history_records WHERE user_id = $1", user_id
        )


async def test_record_watch_inserts_new(pool, user_id):
    await history_repo.record_watch(pool, user_id, "abc12345678", "标题A", "频道A", 10)
    assert await _count(pool, user_id) == 1
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT video_id, title, channel, last_position "
            "FROM history_records WHERE user_id = $1",
            user_id,
        )
    assert row["video_id"] == "abc12345678"
    assert row["title"] == "标题A"
    assert row["channel"] == "频道A"
    assert row["last_position"] == 10


async def test_record_watch_dedup_updates_not_inserts(pool, user_id):
    await history_repo.record_watch(pool, user_id, "vid00000001", "旧标题", None, 5)
    await history_repo.record_watch(pool, user_id, "vid00000001", "新标题", None, 99)
    assert await _count(pool, user_id) == 1
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT title, last_position FROM history_records WHERE user_id = $1",
            user_id,
        )
    assert row["title"] == "新标题"
    assert row["last_position"] == 99


async def test_record_watch_caps_at_200_dropping_oldest(pool, user_id):
    for i in range(201):
        await history_repo.record_watch(pool, user_id, f"vid{i:08d}", f"标题{i}", None, 0)
    assert await _count(pool, user_id) == 200
    async with pool.acquire() as conn:
        # 最旧的（第一个插入的 vid00000000）应被裁掉
        oldest = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM history_records "
            "WHERE user_id = $1 AND video_id = $2)",
            user_id,
            "vid00000000",
        )
        # 最新的应保留
        newest = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM history_records "
            "WHERE user_id = $1 AND video_id = $2)",
            user_id,
            "vid00000200",
        )
    assert oldest is False
    assert newest is True
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && pytest tests/test_history_repo.py -v`
Expected: FAIL（`ModuleNotFoundError: history_repo` 或 `record_watch` 不存在）。

- [ ] **Step 3: 写 `backend/history_repo.py`**

```python
import asyncpg

HISTORY_CAP = 200

_UPSERT_SQL = """
INSERT INTO history_records (user_id, video_id, title, channel, last_position)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, video_id)
DO UPDATE SET watched_at    = now(),
              last_position = EXCLUDED.last_position,
              title         = EXCLUDED.title,
              channel       = EXCLUDED.channel
RETURNING (xmax = 0) AS inserted
"""

# (xmax = 0) 为 Postgres 惯用法：INSERT 时为 true，DO UPDATE 时为 false。

_TRIM_SQL = """
DELETE FROM history_records
WHERE user_id = $1
  AND id NOT IN (
    SELECT id FROM history_records
    WHERE user_id = $1
    ORDER BY watched_at DESC, id DESC
    LIMIT $2
  )
"""


async def record_watch(
    pool: asyncpg.Pool,
    user_id,
    video_id: str,
    title: str,
    channel: str | None = None,
    last_position: int = 0,
) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                _UPSERT_SQL, user_id, video_id, title, channel, last_position
            )
            if row["inserted"]:
                await conn.execute(_TRIM_SQL, user_id, HISTORY_CAP)
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && pytest tests/test_history_repo.py -v`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/history_repo.py backend/tests/test_history_repo.py
git commit -m "feat(backend): record_watch with upsert dedup + 200-row cap"
```

---

### Task 4: 仓储层 — `list_history`（倒序分页）

**Files:**
- Modify: `backend/history_repo.py`
- Modify: `backend/tests/test_history_repo.py`

**Interfaces:**
- Consumes: `asyncpg.Pool`；`user_id: uuid.UUID`。
- Produces:
  - `async list_history(pool, user_id, limit=50, offset=0) -> list[dict]`
    - 返回字段 `id, video_id, title, channel, watched_at, last_position`，按 `(watched_at DESC, id DESC)` 排序，支持 `limit/offset` 分页。

- [ ] **Step 1: 追加失败测试到 `backend/tests/test_history_repo.py`**

```python
async def test_list_history_orders_newest_first(pool, user_id):
    await history_repo.record_watch(pool, user_id, "vid00000001", "第一个", None, 0)
    await history_repo.record_watch(pool, user_id, "vid00000002", "第二个", None, 0)
    await history_repo.record_watch(pool, user_id, "vid00000003", "第三个", None, 0)
    items = await history_repo.list_history(pool, user_id)
    assert [it["video_id"] for it in items] == [
        "vid00000003",
        "vid00000002",
        "vid00000001",
    ]
    assert set(items[0].keys()) == {
        "id",
        "video_id",
        "title",
        "channel",
        "watched_at",
        "last_position",
    }


async def test_list_history_pagination(pool, user_id):
    for i in range(5):
        await history_repo.record_watch(pool, user_id, f"vid{i:08d}", f"T{i}", None, 0)
    page = await history_repo.list_history(pool, user_id, limit=2, offset=2)
    assert len(page) == 2
    # 全列表 newest-first 为 vid04,vid03,vid02,vid01,vid00 → offset2/limit2 → vid02,vid01
    assert [it["video_id"] for it in page] == ["vid00000002", "vid00000001"]
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && pytest tests/test_history_repo.py -k list_history -v`
Expected: FAIL（`list_history` 不存在）。

- [ ] **Step 3: 在 `backend/history_repo.py` 末尾追加实现**

```python
_LIST_SQL = """
SELECT id, video_id, title, channel, watched_at, last_position
FROM history_records
WHERE user_id = $1
ORDER BY watched_at DESC, id DESC
LIMIT $2 OFFSET $3
"""


async def list_history(
    pool: asyncpg.Pool,
    user_id,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(_LIST_SQL, user_id, limit, offset)
    return [dict(r) for r in rows]
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && pytest tests/test_history_repo.py -v`
Expected: 5 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/history_repo.py backend/tests/test_history_repo.py
git commit -m "feat(backend): list_history with newest-first pagination"
```

---

### Task 5: API 端点 + 连接池启停

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_history_api.py`

**Interfaces:**
- Consumes: `db.init_pool/close_pool/get_pool`、`history_repo.record_watch/list_history`。
- Produces:
  - `POST /api/history`（请求体 `RecordWatchRequest`，返回 204）。
  - `GET /api/history?limit=&offset=`（返回 `list[HistoryItem]`）。
  - 临时鉴权依赖 `get_current_user_id(x_user_id: str = Header(...)) -> uuid.UUID`（**待替换为真实 JWT 鉴权**）。
  - FastAPI `lifespan`：启动 `init_pool`，关闭 `close_pool`。

- [ ] **Step 1: 写失败测试 `backend/tests/test_history_api.py`**

```python
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
    # 不覆盖鉴权依赖，传非法 X-User-Id 应 400
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/history", headers={"X-User-Id": "not-a-uuid"})
    assert r.status_code == 400
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && pytest tests/test_history_api.py -v`
Expected: FAIL（`main.get_current_user_id` / 端点不存在）。

- [ ] **Step 3: 改写 `backend/main.py`**

```python
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

import db
import history_repo


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    yield
    await db.close_pool()


app = FastAPI(lifespan=lifespan)


@app.get("/api/hello")
def hello():
    return {"msg": "hello"}


class RecordWatchRequest(BaseModel):
    video_id: str
    title: str
    channel: str | None = None
    last_position: int = 0


class HistoryItem(BaseModel):
    id: int
    video_id: str
    title: str
    channel: str | None
    watched_at: datetime
    last_position: int


# 临时鉴权：用 X-User-Id 头标识用户。**待替换为真实 JWT 鉴权（独立的账号体系计划）。**
def get_current_user_id(x_user_id: str = Header(...)) -> uuid.UUID:
    try:
        return uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid user id")


@app.post("/api/history", status_code=204)
async def post_history(
    body: RecordWatchRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Response:
    await history_repo.record_watch(
        db.get_pool(),
        user_id,
        body.video_id,
        body.title,
        body.channel,
        body.last_position,
    )
    return Response(status_code=204)


@app.get("/api/history", response_model=list[HistoryItem])
async def get_history(
    user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    return await history_repo.list_history(db.get_pool(), user_id, limit, offset)
```

- [ ] **Step 4: 运行全部后端测试，确认通过**

Run: `cd backend && pytest -v`
Expected: 全部 passed（test_db 2 + test_schema 2 + test_history_repo 5 + test_history_api 3）。

- [ ] **Step 5: 更新 README 并提交**

在 `backend/README.md` 末尾追加：

````markdown
## 历史记录 API（需 PostgreSQL）

设置 `DATABASE_URL` 后启动；首次需在目标库执行 `schema.sql` 建表：

```bash
psql "$DATABASE_URL" -f schema.sql
```

- `POST /api/history`：记录一次观看（body: `video_id, title, channel?, last_position?`），upsert 去重，每用户最多保留 200 条。
- `GET /api/history?limit=&offset=`：按最近观看倒序返回历史列表。

> 临时用 `X-User-Id` 请求头标识用户，后续由真实鉴权替换。运行测试需 `TEST_DATABASE_URL`，详见计划文档 Prerequisites。
````

```bash
git add backend/main.py backend/tests/test_history_api.py backend/README.md
git commit -m "feat(backend): history record/list endpoints + pool lifespan"
```

---

## Self-Review

**Spec coverage（对照 `2026-06-25-history-records-storage-design.md`）：**

- §3 表结构（含索引、UNIQUE、不存缩略图）→ Task 2 ✅
- §4.1 只存视频级元数据 → schema 无字幕列（Global Constraints + Task 2）✅
- §4.2 upsert 去重 → Task 3 `record_watch` + `test_record_watch_dedup` ✅
- §4.3 缩略图不入库 → schema 注释 + README 说明（前端推导，前端不在本计划）✅
- §4.4 每用户 200 上限删最旧 → Task 3 `_TRIM_SQL` + `test_record_watch_caps_at_200` ✅
- §4 写入逻辑「仅新插入时裁剪」→ Task 3 `(xmax = 0)` 分支 ✅
- §5 额度结论 → 由 200 上限测试保证有界 ✅
- 列表回看（视频列表 + 继续观看 last_position）→ Task 4 + Task 5 ✅
- §6 非目标（不存字幕/不导出/不做时长统计）→ 未引入相关字段或端点 ✅

**未覆盖（有意，属独立计划）：** 真实账号/JWT 鉴权、Web 控制台历史列表 UI、Supabase 生产部署与迁移工具。已在计划开头 Scope 与 Global Constraints 标注。

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码与可运行命令。

**Type consistency：** `record_watch` / `list_history` 签名在 Task 3/4/5 一致；`HISTORY_CAP=200`、排序键 `(watched_at DESC, id DESC)`、返回字段集合在仓储测试与 API 测试间一致；`get_current_user_id` 命名在 main 与 api 测试一致。

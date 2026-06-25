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

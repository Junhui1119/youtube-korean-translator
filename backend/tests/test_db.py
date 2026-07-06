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

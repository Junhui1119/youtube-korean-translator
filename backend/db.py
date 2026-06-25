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

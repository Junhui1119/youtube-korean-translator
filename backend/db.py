import os
import ssl
from urllib.parse import urlparse, urlunparse

import asyncpg

_pool: asyncpg.Pool | None = None


def _clean_dsn(dsn: str):
    """Strip query params asyncpg can't handle; return (clean_dsn, ssl_ctx)."""
    parsed = urlparse(dsn)
    clean = urlunparse(parsed._replace(query=""))
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return clean, ctx


async def init_pool() -> asyncpg.Pool:
    """创建并缓存全局连接池（幂等）。"""
    global _pool
    if _pool is None:
        dsn, ssl_ctx = _clean_dsn(os.environ["DATABASE_URL"])
        _pool = await asyncpg.create_pool(dsn, ssl=ssl_ctx, min_size=1, max_size=5)
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

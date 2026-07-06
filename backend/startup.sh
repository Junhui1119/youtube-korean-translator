#!/bin/bash
set -e

echo "[startup] Applying schema (idempotent)..."
python - <<'PYEOF'
import asyncio, asyncpg, os, ssl
from urllib.parse import urlparse, urlunparse

def clean_dsn(dsn):
    parsed = urlparse(dsn)
    clean = urlunparse(parsed._replace(query=""))
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return clean, ctx

async def main():
    dsn, ssl_ctx = clean_dsn(os.environ["DATABASE_URL"])
    conn = await asyncpg.connect(dsn, ssl=ssl_ctx)
    with open("schema.sql") as f:
        await conn.execute(f.read())
    await conn.close()
    print("[startup] Schema OK.")

asyncio.run(main())
PYEOF

echo "[startup] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

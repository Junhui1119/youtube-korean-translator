#!/bin/bash
set -e

echo "[startup] Applying schema (idempotent)..."
python - <<'PYEOF'
import asyncio, asyncpg, os

async def main():
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    with open("schema.sql") as f:
        await conn.execute(f.read())
    await conn.close()
    print("[startup] Schema OK.")

asyncio.run(main())
PYEOF

echo "[startup] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

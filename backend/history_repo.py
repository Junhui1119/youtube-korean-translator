import asyncpg
import uuid

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
WITH keep AS (
    SELECT id FROM history_records
    WHERE user_id = $1
    ORDER BY watched_at DESC, id DESC
    LIMIT $2
)
DELETE FROM history_records
WHERE user_id = $1
  AND id NOT IN (SELECT id FROM keep)
"""


async def record_watch(
    pool: asyncpg.Pool,
    user_id: uuid.UUID,
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

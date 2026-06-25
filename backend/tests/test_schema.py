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

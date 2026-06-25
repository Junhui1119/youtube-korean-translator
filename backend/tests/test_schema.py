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
        rows = await conn.fetch(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_name = kcu.table_name
            WHERE tc.table_name = 'history_records'
              AND tc.constraint_type = 'UNIQUE'
            ORDER BY kcu.ordinal_position
            """
        )
    cols = [r["column_name"] for r in rows]
    assert cols == ["user_id", "video_id"]

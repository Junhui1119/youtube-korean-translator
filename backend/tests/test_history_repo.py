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

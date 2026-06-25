# history_records 存储策略设计

- 日期：2026-06-25
- 状态：已确认，待评审
- 关联文档：[PRD v1.1](2026-06-25-youtube-korean-translator-prd.md)、[设计文档 v1](2026-06-24-youtube-korean-translator-design.md)
- 阶段：**后续阶段（账号体系）**，不属于 v1。v1 仍为纯前端、零后端、零存储。

---

## 1. 问题

`history_records` 表用于存储用户的翻译历史。最初担心：如果逐条存储每个用户看过的每句字幕，数据量会过大，Supabase 免费额度（数据库约 500MB）不够用。

**量级验证（逐句存储方案）：**

- 单条字幕（韩文 + 中文 + 时间戳 + 视频ID）≈ 150–250 字节。
- 一场 2 小时直播 ≈ 2000–3000 条字幕 ≈ 0.5–0.7MB。
- 约 **800 场直播**即撑满免费额度——几十个活跃用户几周内到顶。

结论：**逐句存储不可行。**

## 2. 关键洞察

存储成本只来自「历史持久化」，与「实时翻译」无关。实时翻译本身用完即丢、不写库、零成本；只有「事后回看」才需要持久化。

经确认，用户对「历史回看」的需求是：**「有一个看过的视频列表，能知道自己看过哪些视频并再点回去」**——即**视频级元数据**，而非逐句字幕。这使最贵的部分（字幕正文）完全不需要存储。

## 3. 表结构

```sql
CREATE TABLE history_records (
  id            bigserial    PRIMARY KEY,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id      text         NOT NULL,            -- YouTube 视频ID（11字符）
  title         text         NOT NULL,            -- 视频标题
  channel       text,                             -- 频道名（可选）
  watched_at    timestamptz  NOT NULL DEFAULT now(),  -- 最近一次观看时间
  last_position int          NOT NULL DEFAULT 0,  -- 上次看到第几秒（继续观看）
  UNIQUE (user_id, video_id)
);

CREATE INDEX idx_history_user_watched ON history_records (user_id, watched_at DESC);
```

- 缩略图**不入库**，前端用 `video_id` 拼 URL（`https://img.youtube.com/vi/{video_id}/mqdefault.jpg`）。
- 列表查询走 `idx_history_user_watched`，按 `watched_at` 倒序分页。

## 4. 存储控制措施

按重要性排列：

1. **只存视频级元数据，不存字幕正文** —— 省掉 ~99% 数据量，是方案成立的根本。
2. **去重 + upsert** —— `(user_id, video_id)` 唯一约束。重看同一视频时更新 `watched_at` 和 `last_position`，不新增行。行数受「看过多少个不同视频」约束，而非「看了多少次」。
3. **不存可推导数据** —— 缩略图由 `video_id` 推导，不入库。
4. **每用户硬上限 200 条** —— 插入新视频且该用户已有 200 条时，删除其最旧一条（按 `watched_at` 升序）。保证单用户存储有硬上限，整体额度永不无限增长。

### upsert + 200 上限的写入逻辑

记录一次观看时：

1. 对 `(user_id, video_id)` 执行 upsert：
   - 已存在 → 更新 `watched_at = now()`、`last_position`。
   - 不存在 → 插入新行（视为新视频）。
2. **仅当步骤 1 是新插入时**，检查该用户行数；若 `> 200`，删除该用户 `watched_at` 最旧的多余行，使其回到 200。

> 实现可选：应用层（FastAPI 写入后跑一次清理）或数据库触发器。推荐**应用层**——逻辑显式、易测试、易调上限。

PostgreSQL upsert 示例：

```sql
INSERT INTO history_records (user_id, video_id, title, channel, last_position)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, video_id)
DO UPDATE SET watched_at = now(),
              last_position = EXCLUDED.last_position,
              title = EXCLUDED.title;
```

新插入后的裁剪：

```sql
DELETE FROM history_records
WHERE user_id = $1
  AND id NOT IN (
    SELECT id FROM history_records
    WHERE user_id = $1
    ORDER BY watched_at DESC
    LIMIT 200
  );
```

## 5. 额度结论

- 单用户上限：200 条 × ~250 字节 ≈ **50KB/人**。
- 即使 **1 万用户**全部存满 ≈ **500MB**，且因 200 封顶，**存储不会随观看次数无限增长**。
- 对比逐句存储（800 场即爆），数据量降低约**两到三个数量级**。

Supabase 免费额度对该设计完全够用。

## 6. 非目标

- ❌ 逐句字幕持久化 / 完整字幕回看（数据量不可控，明确不做）。
- ❌ 导出/分享整场字幕。
- ❌ 观看时长精细统计（仅记最近观看时间与上次位置）。
- 以上若未来需要，另开设计；当前阶段不纳入。

-- gen_random_uuid() 所需（PG13+ 已内置；保留扩展以兼容）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 最小 users 表：仅满足外键约束与测试。完整账号体系（密码/Token）由独立的鉴权计划实现。
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        UNIQUE NOT NULL,
  password_hash text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';

-- 翻译历史：只存视频级元数据，绝不存字幕正文。
CREATE TABLE IF NOT EXISTS history_records (
  id            bigserial    PRIMARY KEY,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id      text         NOT NULL,            -- YouTube 视频ID（11字符）
  title         text         NOT NULL,            -- 视频标题
  channel       text,                             -- 频道名（可选）
  watched_at    timestamptz  NOT NULL DEFAULT now(),  -- 最近一次观看时间
  last_position int          NOT NULL DEFAULT 0,  -- 上次看到第几秒
  UNIQUE (user_id, video_id)                      -- 去重：每用户每视频一行
);

-- 缩略图不入库，前端用 video_id 拼 img.youtube.com/vi/{id}/mqdefault.jpg

-- 列表查询 + 超限裁剪都按 (watched_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_history_user_watched
  ON history_records (user_id, watched_at DESC, id DESC);

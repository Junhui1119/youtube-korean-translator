# backend

最小 FastAPI 服务（W1 hello-world），后续会扩展为完整后端（WebSocket / AI 对接 / API 路由）。

## 运行

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

访问 <http://127.0.0.1:8000/api/hello> → 返回 `{"msg": "hello"}`

也可用 uv 一行启动（无需手动建虚拟环境）：

```bash
uv run --with fastapi --with 'uvicorn[standard]' uvicorn main:app --reload
```

## 历史记录 API（需 PostgreSQL）

设置 `DATABASE_URL` 后启动；首次需在目标库执行 `schema.sql` 建表：

```bash
psql "$DATABASE_URL" -f schema.sql
```

- `POST /api/history`：记录一次观看（body: `video_id, title, channel?, last_position?`），upsert 去重，每用户最多保留 200 条。
- `GET /api/history?limit=&offset=`：按最近观看倒序返回历史列表。

> 临时用 `X-User-Id` 请求头标识用户，后续由真实鉴权替换。运行测试需 `TEST_DATABASE_URL`，详见计划文档 Prerequisites。

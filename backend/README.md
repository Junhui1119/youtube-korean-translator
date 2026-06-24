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

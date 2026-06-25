import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

import db
import history_repo


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    yield
    await db.close_pool()


app = FastAPI(lifespan=lifespan)


@app.get("/api/hello")
def hello():
    return {"msg": "hello"}


class RecordWatchRequest(BaseModel):
    video_id: str
    title: str
    channel: str | None = None
    last_position: int = 0


class HistoryItem(BaseModel):
    id: int
    video_id: str
    title: str
    channel: str | None
    watched_at: datetime
    last_position: int


# 临时鉴权：用 X-User-Id 头标识用户。**待替换为真实 JWT 鉴权（独立的账号体系计划）。**
def get_current_user_id(x_user_id: str = Header(...)) -> uuid.UUID:
    try:
        return uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid user id")


@app.post("/api/history", status_code=204)
async def post_history(
    body: RecordWatchRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Response:
    await history_repo.record_watch(
        db.get_pool(),
        user_id,
        body.video_id,
        body.title,
        body.channel,
        body.last_position,
    )
    return Response(status_code=204)


@app.get("/api/history", response_model=list[HistoryItem])
async def get_history(
    user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    return await history_repo.list_history(db.get_pool(), user_id, limit, offset)

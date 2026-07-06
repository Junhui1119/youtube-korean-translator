import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator

import db
import history_repo
from middleware import log_translate_request
import translate_service


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
    video_id: str = Field(min_length=1, max_length=11)
    title: str = Field(min_length=1, max_length=500)
    channel: str | None = Field(default=None, max_length=200)
    last_position: int = Field(default=0, ge=0)

    @field_validator("video_id")
    @classmethod
    def video_id_alphanumeric(cls, v: str) -> str:
        if not v.replace("-", "").replace("_", "").isalnum():
            raise ValueError("video_id must be alphanumeric with - and _ only")
        return v


class HistoryItem(BaseModel):
    id: int
    video_id: str
    title: str
    channel: str | None
    watched_at: datetime
    last_position: int


def verify_translate_token(authorization: str = Header(...)) -> None:
    expected = os.environ.get("TRANSLATE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=500, detail="TRANSLATE_TOKEN not configured")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(status_code=401, detail="invalid token")


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    engine: Literal["deepl"] = "deepl"


class TranslateResponse(BaseModel):
    translated: str
    engine: str
    latency_ms: int


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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await history_repo.list_history(db.get_pool(), user_id, limit, offset)


@app.post("/api/translate", response_model=TranslateResponse)
async def post_translate(
    body: TranslateRequest,
    _: None = Depends(verify_translate_token),
) -> TranslateResponse:
    deepl_key = os.environ.get("DEEPL_API_KEY", "")
    if not deepl_key:
        raise HTTPException(status_code=500, detail="DEEPL_API_KEY not configured")

    t0 = time.monotonic()
    try:
        translated = await translate_service.translate_deepl(body.text, deepl_key)
        latency_ms = round((time.monotonic() - t0) * 1000)
        log_translate_request(body.engine, len(body.text), latency_ms, "ok")
        return TranslateResponse(translated=translated, engine=body.engine, latency_ms=latency_ms)
    except RuntimeError as e:
        latency_ms = round((time.monotonic() - t0) * 1000)
        log_translate_request(body.engine, len(body.text), latency_ms, "error", str(e))
        raise HTTPException(status_code=502, detail=str(e))

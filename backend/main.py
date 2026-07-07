import hmac
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

import asyncpg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator

import auth_service
import db
import history_repo
from middleware import log_translate_request
import translate_service
import asr


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    yield
    await db.close_pool()


app = FastAPI(lifespan=lifespan)
app.include_router(asr.router)


@app.get("/api/hello")
def hello():
    return {"msg": "hello", "asr_routes": [r.path for r in asr.router.routes]}


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


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("invalid email format")
        return v.lower().strip()


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str


def verify_translate_token(authorization: str = Header(...)) -> None:
    expected = os.environ.get("TRANSLATE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=500, detail="TRANSLATE_TOKEN not configured")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="invalid token")


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    engine: Literal["deepl"] = "deepl"


class TranslateResponse(BaseModel):
    translated: str
    engine: str
    latency_ms: int


def verify_jwt(authorization: str | None = Header(default=None)) -> uuid.UUID:
    if not authorization:
        raise HTTPException(status_code=401, detail="invalid token")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="invalid token")
    try:
        return auth_service.decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid token")


@app.post("/api/history", status_code=204)
async def post_history(
    body: RecordWatchRequest,
    user_id: uuid.UUID = Depends(verify_jwt),
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
    user_id: uuid.UUID = Depends(verify_jwt),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await history_repo.list_history(db.get_pool(), user_id, limit, offset)


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
async def register(body: AuthRequest) -> AuthResponse:
    pool = db.get_pool()
    password_hash = auth_service.hash_password(body.password)
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
                body.email,
                password_hash,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="email already registered")
    token = auth_service.create_token(row["id"])
    return AuthResponse(token=token, user_id=str(row["id"]), email=body.email)


_DUMMY_HASH = auth_service.hash_password("dummy-placeholder-never-matches")


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: AuthRequest) -> AuthResponse:
    pool = db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE email = $1", body.email
        )
    stored_hash = row["password_hash"] if row and row["password_hash"] else _DUMMY_HASH
    if not row or not auth_service.verify_password(body.password, stored_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    token = auth_service.create_token(row["id"])
    return AuthResponse(token=token, user_id=str(row["id"]), email=body.email)


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

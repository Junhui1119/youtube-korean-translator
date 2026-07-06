import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_ALGORITHM = "HS256"
_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _pwd_context.verify(password, hashed)


def create_token(user_id: uuid.UUID) -> str:
    secret = os.environ["JWT_SECRET"]
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=_EXPIRE_DAYS),
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def decode_token(token: str) -> uuid.UUID:
    secret = os.environ["JWT_SECRET"]
    try:
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
        return uuid.UUID(payload["sub"])
    except Exception:
        raise ValueError("invalid token")

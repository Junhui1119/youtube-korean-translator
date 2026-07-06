import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import pytest

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
import auth_service


def test_hash_and_verify_password():
    hashed = auth_service.hash_password("mypassword123")
    assert hashed != "mypassword123"
    assert auth_service.verify_password("mypassword123", hashed)
    assert not auth_service.verify_password("wrongpassword", hashed)


def test_create_and_decode_token():
    user_id = uuid.uuid4()
    token = auth_service.create_token(user_id)
    assert isinstance(token, str)
    assert auth_service.decode_token(token) == user_id


def test_decode_invalid_token_raises():
    with pytest.raises(ValueError, match="invalid token"):
        auth_service.decode_token("not.a.valid.token")


def test_decode_expired_token_raises():
    payload = {
        "sub": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) - timedelta(days=1),
    }
    token = pyjwt.encode(payload, "test-jwt-secret", algorithm="HS256")
    with pytest.raises(ValueError, match="invalid token"):
        auth_service.decode_token(token)


def test_decode_wrong_secret_raises():
    user_id = uuid.uuid4()
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    token = pyjwt.encode(payload, "wrong-secret", algorithm="HS256")
    with pytest.raises(ValueError, match="invalid token"):
        auth_service.decode_token(token)

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import Settings
from app.domain.models.user import UserRole

ALGORITHM = "HS256"
# New hashes use Argon2id. Existing bcrypt hashes are upgraded after successful login.
password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$reHtxPfoUQhUOEtZMafPDA$LdBgI6gXebNXMhNuHhyegn4CTx3TrH6TqA6qqrnOH/Y"
)


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    try:
        return password_hash.verify_and_update(plain_password, hashed_password)
    except (UnknownHashError, ValueError):
        return False, None


def get_signing_key(settings: Settings) -> str:
    key = settings.secret_key.get_secret_value()
    if len(key.encode("utf-8")) < 32:
        raise RuntimeError("Configure SECRET_KEY with at least 32 random bytes before using JWTs.")
    return key


def create_access_token(
    subject: str | UUID,
    expires_delta: timedelta | None = None,
    *,
    settings: Settings | None = None,
    role: UserRole | str = UserRole.USER,
) -> str:
    configured = settings or Settings()
    lifetime = (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=configured.access_token_expire_minutes)
    )
    if lifetime <= timedelta(0):
        raise ValueError("Access token lifetime must be positive.")
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(UUID(str(subject))),
        "iat": now,
        "exp": now + lifetime,
        "iss": configured.jwt_issuer,
        "aud": configured.jwt_audience,
        "jti": str(uuid4()),
        "token_type": "access",
        "role": UserRole(role).value,
        "csrf": secrets.token_urlsafe(32),
    }
    return jwt.encode(claims, get_signing_key(configured), algorithm=ALGORITHM)


def decode_access_token(token: str, *, settings: Settings | None = None) -> dict[str, Any]:
    configured = settings or Settings()
    claims = jwt.decode(
        token,
        get_signing_key(configured),
        algorithms=[ALGORITHM],
        issuer=configured.jwt_issuer,
        audience=configured.jwt_audience,
        options={"require": ["sub", "iat", "exp", "iss", "aud", "jti", "token_type", "role", "csrf"]},
    )
    if claims["token_type"] != "access":
        raise jwt.InvalidTokenError("Expected an access token.")
    try:
        UUID(claims["sub"])
        UUID(claims["jti"])
        UserRole(claims["role"])
    except (ValueError, TypeError, AttributeError):
        raise jwt.InvalidTokenError("Invalid token identifiers.") from None
    if not isinstance(claims["csrf"], str) or len(claims["csrf"]) < 32:
        raise jwt.InvalidTokenError("Invalid CSRF claim.")
    return claims

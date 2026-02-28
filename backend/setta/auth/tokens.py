import base64
import binascii
import hmac
import json
import secrets
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ValidationError


class BootstrapTokenPayload(BaseModel):
    sessionId: str
    exp: int
    nonce: str


class AuthCookiePayload(BaseModel):
    sessionId: str
    exp: int


class LaunchIntentTokenPayload(BaseModel):
    sessionId: str
    exp: int
    nonce: str
    purpose: Literal["launch_intent"] = "launch_intent"


class NonceTracker:
    def __init__(self) -> None:
        self._consumed: dict[str, dict[str, int]] = {}

    def is_consumed(self, session_id: str, nonce: str, now: int) -> bool:
        self._prune_session(session_id, now)
        if session_id not in self._consumed:
            return False
        return nonce in self._consumed[session_id]

    def consume(self, session_id: str, nonce: str, exp: int, now: int) -> None:
        self._prune_session(session_id, now)
        if session_id not in self._consumed:
            self._consumed[session_id] = {}
        self._consumed[session_id][nonce] = exp

    def _prune_session(self, session_id: str, now: int) -> None:
        consumed = self._consumed.get(session_id)
        if not consumed:
            return
        expired = [nonce for nonce, exp in consumed.items() if exp <= now]
        for nonce in expired:
            del consumed[nonce]
        if not consumed:
            self._consumed.pop(session_id, None)


class BootstrapTokenManager:
    def __init__(
        self, ttl_seconds: int, nonce_tracker: NonceTracker | None = None
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._nonce_tracker = nonce_tracker or NonceTracker()

    def mint(self, session_id: str, secret: bytes, now: datetime | None = None) -> str:
        issued_at = now or datetime.now(timezone.utc)
        exp = int(issued_at.timestamp()) + self._ttl_seconds
        payload = BootstrapTokenPayload(
            sessionId=session_id,
            exp=exp,
            nonce=secrets.token_urlsafe(16),
        )
        payload_bytes = self._encode_payload(payload)
        signature = self._sign(payload_bytes, secret)
        return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"

    def consume(
        self, token: str, secret: bytes, now: datetime | None = None
    ) -> BootstrapTokenPayload:
        effective_now = now or datetime.now(timezone.utc)
        payload = self._validate(token, secret, effective_now)
        timestamp = int(effective_now.timestamp())
        if self._nonce_tracker.is_consumed(payload.sessionId, payload.nonce, timestamp):
            raise ValueError("Token has already been consumed")
        self._nonce_tracker.consume(
            payload.sessionId, payload.nonce, payload.exp, timestamp
        )
        return payload

    def _validate(
        self, token: str, secret: bytes, now: datetime | None = None
    ) -> BootstrapTokenPayload:
        payload, signature = self._decode_token(token)
        expected = self._sign(self._encode_payload(payload), secret)
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature")
        if self._is_expired(payload, now):
            raise ValueError("Token has expired")
        return payload

    def _decode_token(self, token: str) -> tuple[BootstrapTokenPayload, bytes]:
        payload_obj, signature = _decode_token_parts(token)
        try:
            payload = BootstrapTokenPayload.model_validate(payload_obj)
        except ValidationError as exc:
            raise ValueError("Invalid token payload") from exc
        return payload, signature

    def _encode_payload(self, payload: BootstrapTokenPayload) -> bytes:
        return _encode_payload(payload)

    def _sign(self, payload: bytes, secret: bytes) -> bytes:
        return _sign(payload, secret)

    def _is_expired(self, payload: BootstrapTokenPayload, now: datetime | None) -> bool:
        timestamp = int((now or datetime.now(timezone.utc)).timestamp())
        return timestamp >= payload.exp


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(data + padding)
    except binascii.Error as exc:
        raise ValueError("Invalid token encoding") from exc


class AuthCookieManager:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl_seconds = ttl_seconds

    def mint(self, session_id: str, secret: bytes, now: datetime | None = None) -> str:
        issued_at = now or datetime.now(timezone.utc)
        exp = int(issued_at.timestamp()) + self._ttl_seconds
        payload = AuthCookiePayload(sessionId=session_id, exp=exp)
        payload_bytes = _encode_payload(payload)
        signature = _sign(payload_bytes, secret)
        return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"

    def validate(
        self, token: str, secret: bytes, now: datetime | None = None
    ) -> AuthCookiePayload:
        payload, signature = self._decode_token(token)
        expected = _sign(_encode_payload(payload), secret)
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature")
        if self._is_expired(payload, now):
            raise ValueError("Token has expired")
        return payload

    def _decode_token(self, token: str) -> tuple[AuthCookiePayload, bytes]:
        payload_obj, signature = _decode_token_parts(token)
        try:
            payload = AuthCookiePayload.model_validate(payload_obj)
        except ValidationError as exc:
            raise ValueError("Invalid token payload") from exc
        return payload, signature

    def _is_expired(self, payload: AuthCookiePayload, now: datetime | None) -> bool:
        timestamp = int((now or datetime.now(timezone.utc)).timestamp())
        return timestamp >= payload.exp


class LaunchIntentTokenManager:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl_seconds = ttl_seconds

    def mint(
        self, session_id: str, secret: bytes, now: datetime | None = None
    ) -> tuple[str, int]:
        issued_at = now or datetime.now(timezone.utc)
        exp = int(issued_at.timestamp()) + self._ttl_seconds
        payload = LaunchIntentTokenPayload(
            sessionId=session_id,
            exp=exp,
            nonce=secrets.token_urlsafe(16),
            purpose="launch_intent",
        )
        payload_bytes = _encode_payload(payload)
        signature = _sign(payload_bytes, secret)
        token = f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"
        return token, exp

    def validate(
        self, token: str, secret: bytes, now: datetime | None = None
    ) -> LaunchIntentTokenPayload:
        payload_obj, signature = _decode_token_parts(token)
        try:
            payload = LaunchIntentTokenPayload.model_validate(payload_obj)
        except ValidationError as exc:
            raise ValueError("Invalid token payload") from exc
        expected = _sign(_encode_payload(payload), secret)
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature")
        timestamp = int((now or datetime.now(timezone.utc)).timestamp())
        if timestamp >= payload.exp:
            raise ValueError("Token has expired")
        return payload


def _encode_payload(payload: BaseModel) -> bytes:
    raw = payload.model_dump(mode="json")
    encoded = json.dumps(raw, separators=(",", ":"), sort_keys=True)
    return encoded.encode("utf-8")


def _sign(payload: bytes, secret: bytes) -> bytes:
    return hmac.new(secret, payload, "sha256").digest()


def _decode_token_parts(token: str) -> tuple[dict, bytes]:
    parts = token.split(".")
    if len(parts) != 2:
        raise ValueError("Invalid token format")
    payload_bytes = _b64url_decode(parts[0])
    signature = _b64url_decode(parts[1])
    payload_obj = json.loads(payload_bytes)
    if not isinstance(payload_obj, dict):
        raise ValueError("Invalid token payload")
    return payload_obj, signature

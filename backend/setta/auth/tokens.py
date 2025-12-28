import base64
import hmac
import json
import secrets
from datetime import datetime, timezone

from pydantic import BaseModel


class BootstrapTokenPayload(BaseModel):
    sessionId: str
    exp: int
    nonce: str


class NonceTracker:
    def __init__(self) -> None:
        self._consumed: dict[str, set[str]] = {}

    def is_consumed(self, session_id: str, nonce: str) -> bool:
        if session_id not in self._consumed:
            return False
        return nonce in self._consumed[session_id]

    def consume(self, session_id: str, nonce: str) -> None:
        if session_id not in self._consumed:
            self._consumed[session_id] = set()
        self._consumed[session_id].add(nonce)


class BootstrapTokenManager:
    def __init__(
        self, ttl_seconds: int, nonce_tracker: NonceTracker | None = None
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._nonce_tracker = nonce_tracker or NonceTracker()

    def mint(
        self, session_id: str, secret: bytes, now: datetime | None = None
    ) -> str:
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
        payload = self._validate(token, secret, now)
        if self._nonce_tracker.is_consumed(payload.sessionId, payload.nonce):
            raise ValueError("Token has already been consumed")
        self._nonce_tracker.consume(payload.sessionId, payload.nonce)
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
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("Invalid token format")
        payload_bytes = _b64url_decode(parts[0])
        signature = _b64url_decode(parts[1])
        payload_obj = json.loads(payload_bytes)
        payload = BootstrapTokenPayload.model_validate(payload_obj)
        return payload, signature

    def _encode_payload(self, payload: BootstrapTokenPayload) -> bytes:
        raw = payload.model_dump(mode="json")
        encoded = json.dumps(raw, separators=(",", ":"), sort_keys=True)
        return encoded.encode("utf-8")

    def _sign(self, payload: bytes, secret: bytes) -> bytes:
        return hmac.new(secret, payload, "sha256").digest()

    def _is_expired(
        self, payload: BootstrapTokenPayload, now: datetime | None
    ) -> bool:
        timestamp = int((now or datetime.now(timezone.utc)).timestamp())
        return timestamp >= payload.exp


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)

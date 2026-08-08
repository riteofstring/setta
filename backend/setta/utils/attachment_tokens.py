import base64
import binascii
import hmac
import json
from datetime import datetime, timezone

from pydantic import BaseModel, ValidationError


class AttachmentTokenPayload(BaseModel):
    artifactId: str
    exp: int
    projectConfigId: str | None = None
    shareSessionId: str | None = None


class AttachmentTokenManager:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl_seconds = ttl_seconds

    def mint(
        self,
        *,
        artifact_id: str,
        secret: bytes,
        project_config_id: str | None = None,
        share_session_id: str | None = None,
        now: datetime | None = None,
    ) -> str:
        issued_at = now or datetime.now(timezone.utc)
        exp = int(issued_at.timestamp()) + self._ttl_seconds
        payload = AttachmentTokenPayload(
            artifactId=artifact_id,
            exp=exp,
            projectConfigId=project_config_id,
            shareSessionId=share_session_id,
        )
        payload_bytes = _encode_payload(payload)
        signature = _sign(payload_bytes, secret)
        return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"

    def validate(
        self,
        token: str,
        *,
        secret: bytes,
        now: datetime | None = None,
    ) -> AttachmentTokenPayload:
        payload, signature = _decode_token(token)
        expected = _sign(_encode_payload(payload), secret)
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid attachment token signature")
        if _is_expired(payload, now):
            raise ValueError("Attachment token has expired")
        return payload


def _is_expired(payload: AttachmentTokenPayload, now: datetime | None) -> bool:
    timestamp = int((now or datetime.now(timezone.utc)).timestamp())
    return timestamp >= payload.exp


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(data + padding)
    except binascii.Error as exc:
        raise ValueError("Invalid attachment token encoding") from exc


def _encode_payload(payload: BaseModel) -> bytes:
    raw = payload.model_dump(mode="json")
    encoded = json.dumps(raw, separators=(",", ":"), sort_keys=True)
    return encoded.encode("utf-8")


def _decode_token(token: str) -> tuple[AttachmentTokenPayload, bytes]:
    parts = token.split(".")
    if len(parts) != 2:
        raise ValueError("Invalid attachment token format")
    payload_bytes = _b64url_decode(parts[0])
    signature = _b64url_decode(parts[1])
    payload_obj = json.loads(payload_bytes)
    if not isinstance(payload_obj, dict):
        raise ValueError("Invalid attachment token payload")
    try:
        payload = AttachmentTokenPayload.model_validate(payload_obj)
    except ValidationError as exc:
        raise ValueError("Invalid attachment token payload") from exc
    return payload, signature


def _sign(payload: bytes, secret: bytes) -> bytes:
    return hmac.new(secret, payload, "sha256").digest()

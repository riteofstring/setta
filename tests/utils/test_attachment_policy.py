import pytest
from fastapi import HTTPException, status

from setta.utils.attachment_policy import (
    enforce_upload_policy,
    get_attachment_policy,
    resolve_attachment_policy_scope,
)
from setta.utils.constants import C


def test_get_attachment_policy_normalizes_mime_prefixes(monkeypatch) -> None:
    monkeypatch.setattr(
        C,
        "CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES",
        [" image/", "", 42, "text/ "],
    )
    policy = get_attachment_policy("chat")
    assert policy.allowed_mime_prefixes == ["image/", "text/"]


def test_resolve_attachment_policy_scope_defaults_to_dropzone_stateful() -> None:
    assert resolve_attachment_policy_scope("generic") == "dropzone_stateful"
    assert resolve_attachment_policy_scope(None) == "dropzone_stateful"


def test_enforce_upload_policy_rejects_oversize() -> None:
    policy = get_attachment_policy("chat")
    with pytest.raises(HTTPException) as exc_info:
        enforce_upload_policy(
            file_size=policy.max_file_bytes + 1,
            mime_type="application/octet-stream",
            scope="chat",
            label="file.bin",
        )
    assert exc_info.value.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


def test_enforce_upload_policy_rejects_disallowed_mime(monkeypatch) -> None:
    monkeypatch.setattr(C, "CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES", ["image/"])
    policy = get_attachment_policy("chat")
    with pytest.raises(HTTPException) as exc_info:
        enforce_upload_policy(
            file_size=policy.max_file_bytes,
            mime_type="text/plain",
            scope="chat",
            label="notes.txt",
        )
    assert exc_info.value.status_code == status.HTTP_415_UNSUPPORTED_MEDIA_TYPE

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status

from setta.utils.constants import C

AttachmentPolicyScope = Literal["chat", "dropzone_stateful", "dropzone_stateless"]
DropzonePolicyMode = Literal["stateful", "stateless"]


@dataclass(frozen=True)
class AttachmentPolicy:
    scope: AttachmentPolicyScope
    max_files: int | None
    max_file_bytes: int
    max_total_bytes: int | None
    max_file_label: str
    max_total_label: str | None
    allowed_mime_prefixes: list[str]


def resolve_dropzone_scope(
    dropzone_mode: DropzonePolicyMode | None,
) -> AttachmentPolicyScope:
    if dropzone_mode == "stateless":
        return "dropzone_stateless"
    return "dropzone_stateful"


def resolve_attachment_policy_scope(upload_scope: str | None) -> AttachmentPolicyScope:
    if upload_scope == "chat":
        return "chat"
    return "dropzone_stateful"


def _normalize_max_files(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 0:
        return None
    return value


def _normalize_mime_prefixes(prefixes: list[str]) -> list[str]:
    normalized: list[str] = []
    for prefix in prefixes:
        if not isinstance(prefix, str):
            continue
        trimmed = prefix.strip()
        if trimmed:
            normalized.append(trimmed)
    return normalized


def _is_mime_allowed(mime_type: str, prefixes: list[str]) -> bool:
    if not prefixes:
        return True
    return any(mime_type.startswith(prefix) for prefix in prefixes)


def get_attachment_policy(
    scope: AttachmentPolicyScope,
    *,
    dropzone_mode: DropzonePolicyMode | None = None,
) -> AttachmentPolicy:
    if dropzone_mode is not None:
        if scope == "chat":
            raise ValueError("dropzone_mode is only valid for dropzone scopes.")
        scope = resolve_dropzone_scope(dropzone_mode)
    if scope == "chat":
        return AttachmentPolicy(
            scope=scope,
            max_files=_normalize_max_files(C.CHAT_ATTACHMENTS_MAX_FILES),
            max_file_bytes=C.CHAT_ATTACHMENTS_MAX_FILE_BYTES,
            max_total_bytes=None,
            max_file_label=C.CHAT_ATTACHMENTS_MAX_FILE_LABEL,
            max_total_label=None,
            allowed_mime_prefixes=_normalize_mime_prefixes(
                C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES
            ),
        )
    if scope == "dropzone_stateless":
        return AttachmentPolicy(
            scope=scope,
            max_files=None,
            max_file_bytes=C.DROPZONE_STATELESS_MAX_FILE_BYTES,
            max_total_bytes=C.DROPZONE_STATELESS_MAX_TOTAL_BYTES,
            max_file_label=C.DROPZONE_STATELESS_MAX_FILE_LABEL,
            max_total_label=C.DROPZONE_STATELESS_MAX_TOTAL_LABEL,
            allowed_mime_prefixes=_normalize_mime_prefixes(
                C.DROPZONE_ALLOWED_MIME_PREFIXES
            ),
        )
    return AttachmentPolicy(
        scope="dropzone_stateful",
        max_files=None,
        max_file_bytes=C.DROPZONE_STATEFUL_MAX_FILE_BYTES,
        max_total_bytes=None,
        max_file_label=C.DROPZONE_STATEFUL_MAX_FILE_LABEL,
        max_total_label=None,
        allowed_mime_prefixes=_normalize_mime_prefixes(
            C.DROPZONE_ALLOWED_MIME_PREFIXES
        ),
    )


def enforce_upload_policy(
    *,
    file_size: int,
    mime_type: str,
    scope: AttachmentPolicyScope,
    label: str,
) -> None:
    policy = get_attachment_policy(scope)
    if file_size > policy.max_file_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {policy.max_file_label} limit: {label}",
        )
    if not _is_mime_allowed(mime_type, policy.allowed_mime_prefixes):
        allowed_label = ", ".join(policy.allowed_mime_prefixes)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Attachment type {mime_type} is not allowed for {label}. "
                f"Allowed prefixes: {allowed_label}."
            ),
        )

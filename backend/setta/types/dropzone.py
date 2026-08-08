import json
from collections.abc import Callable
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationError


class DropzoneFileAttachment(BaseModel):
    kind: Literal["file"] = "file"
    id: str
    name: str
    mimeType: str | None = None
    size: int | None = None


class DropzoneTextAttachment(BaseModel):
    kind: Literal["text"] = "text"
    id: str
    name: str
    text: str


DropzoneAttachment = Annotated[
    DropzoneFileAttachment | DropzoneTextAttachment,
    Field(discriminator="kind"),
]


class DropzoneStoredValue(BaseModel):
    attachments: list[DropzoneAttachment] = Field(default_factory=list)


def parse_dropzone_value(value: str) -> DropzoneStoredValue | None:
    if value == "":
        return None
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        return DropzoneStoredValue.model_validate(payload)
    except ValidationError:
        return None


def dropzone_payload_to_value(payload: DropzoneStoredValue) -> str:
    if not payload.attachments:
        return ""
    data = payload.model_dump(exclude_none=True)
    return json.dumps(data, separators=(",", ":"))


def dropzone_value_to_attachments(
    value: str,
) -> list[dict[str, object]] | None:
    payload = parse_dropzone_value(value)
    if payload is None:
        return None
    data = payload.model_dump(exclude_none=True)
    attachments = data.get("attachments")
    if not isinstance(attachments, list):
        return None
    return attachments


def normalize_dropzone_value(value: str, max_attachments: int | None) -> str:
    payload = parse_dropzone_value(value)
    if payload is None:
        return value
    if not payload.attachments:
        return ""
    if max_attachments is None:
        return value
    if max_attachments <= 0:
        return value
    if len(payload.attachments) <= max_attachments:
        return value
    payload = payload.model_copy(
        update={"attachments": payload.attachments[:max_attachments]}
    )
    return dropzone_payload_to_value(payload)


def rewrite_dropzone_attachment_paths(
    value: str, resolve_artifact_path: Callable[[str], str]
) -> str:
    payload = parse_dropzone_value(value)
    if payload is None:
        return value
    if not payload.attachments:
        return ""
    updated: list[DropzoneAttachment] = []
    changed = False
    for attachment in payload.attachments:
        if isinstance(attachment, DropzoneFileAttachment):
            new_id = resolve_artifact_path(attachment.id)
            if new_id != attachment.id:
                attachment = attachment.model_copy(update={"id": new_id})
                changed = True
        updated.append(attachment)
    if not changed:
        return value
    payload = payload.model_copy(update={"attachments": updated})
    return dropzone_payload_to_value(payload)

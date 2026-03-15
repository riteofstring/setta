import json
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

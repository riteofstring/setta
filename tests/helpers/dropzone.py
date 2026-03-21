import json

from setta.types.dropzone import parse_dropzone_value


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
    if not payload.attachments:
        return ""
    data = payload.model_dump(exclude_none=True)
    return json.dumps(data, separators=(",", ":"))

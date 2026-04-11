"""Redaction and size-limiting helpers for logging."""

import json
from collections.abc import Mapping, Sequence
from functools import lru_cache
from typing import Annotated, Any, get_args, get_origin, get_type_hints

from pydantic import BaseModel, SecretBytes, SecretStr

REDACTED_VALUE = "<redacted>"


class Sensitive:
    """Marker for Pydantic fields that should be redacted when logging."""


def sanitize_for_logging_context(
    value: object,
    *,
    max_depth: int = 4,
    max_string_len: int = 200,
    max_collection_items: int = 25,
) -> object:
    """Return a JSON-serializable/loggable representation of `value`.

    - Redacts fields annotated with `Annotated[..., Sensitive()]` in Pydantic models.
    - Summarizes large collections.
    - Truncates long strings.
    """

    return _sanitize(
        value,
        max_depth=max_depth,
        max_string_len=max_string_len,
        max_collection_items=max_collection_items,
    )


def to_compact_json(value: object) -> str:
    return json.dumps(
        value,
        separators=(",", ":"),
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )


def _sanitize(
    value: object,
    *,
    max_depth: int,
    max_string_len: int,
    max_collection_items: int,
) -> object:
    if max_depth <= 0:
        return "<max-depth>"

    if value is None:
        return None
    if isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        normalized = value.replace("\n", "\\n").replace("\r", "\\r")
        if len(normalized) <= max_string_len:
            return normalized
        over = len(normalized) - max_string_len
        return f"{normalized[:max_string_len]}...(+{over})"

    if isinstance(value, (SecretStr, SecretBytes)):
        return REDACTED_VALUE

    if isinstance(value, BaseModel):
        return _sanitize_pydantic_model(
            value,
            max_depth=max_depth - 1,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )

    if isinstance(value, Mapping):
        return _sanitize_mapping(
            value,
            max_depth=max_depth - 1,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )

    if isinstance(value, (list, tuple, set, frozenset)):
        return _sanitize_sequence(
            list(value),
            max_depth=max_depth - 1,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )

    if isinstance(value, (bytes, bytearray)):
        return f"bytes(len={len(value)})"

    if isinstance(value, Exception):
        return repr(value)

    return _sanitize(
        str(value),
        max_depth=max_depth - 1,
        max_string_len=max_string_len,
        max_collection_items=max_collection_items,
    )


def _sanitize_sequence(
    values: Sequence[object],
    *,
    max_depth: int,
    max_string_len: int,
    max_collection_items: int,
) -> object:
    if len(values) <= max_collection_items:
        return [
            _sanitize(
                item,
                max_depth=max_depth,
                max_string_len=max_string_len,
                max_collection_items=max_collection_items,
            )
            for item in values
        ]

    sample = [
        _sanitize(
            item,
            max_depth=max_depth,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )
        for item in values[:max_collection_items]
    ]
    return {"len": len(values), "sample": sample, "truncated": True}


def _sanitize_mapping(
    values: Mapping[object, object],
    *,
    max_depth: int,
    max_string_len: int,
    max_collection_items: int,
) -> object:
    result: dict[str, object] = {}
    items = list(values.items())
    truncated = False
    if len(items) > max_collection_items:
        items = items[:max_collection_items]
        truncated = True

    for key, val in items:
        key_str = str(key)
        result[key_str] = _sanitize(
            val,
            max_depth=max_depth,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )

    if truncated:
        result["__truncated__"] = True
        result["__len__"] = len(values)
    return result


def _sanitize_pydantic_model(
    model: BaseModel,
    *,
    max_depth: int,
    max_string_len: int,
    max_collection_items: int,
) -> object:
    redacted_fields = _get_sensitive_fields(model.__class__)
    raw = model.model_dump()
    result: dict[str, object] = {}
    for field_name, field_value in raw.items():
        if field_name in redacted_fields:
            result[field_name] = REDACTED_VALUE
            continue
        result[field_name] = _sanitize(
            field_value,
            max_depth=max_depth,
            max_string_len=max_string_len,
            max_collection_items=max_collection_items,
        )
    return result


@lru_cache(maxsize=512)
def _get_sensitive_fields(model_cls: type[BaseModel]) -> frozenset[str]:
    hints = get_type_hints(model_cls, include_extras=True)
    sensitive_fields = {
        field_name
        for field_name, hint in hints.items()
        if _is_sensitive_annotation(hint)
    }
    return frozenset(sensitive_fields)


def _is_sensitive_annotation(annotation: Any) -> bool:
    if get_origin(annotation) is not Annotated:
        return False
    for meta in get_args(annotation)[1:]:
        if meta is Sensitive:
            return True
        if isinstance(meta, Sensitive):
            return True
    return False

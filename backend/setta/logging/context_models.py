"""Utilities for serializing Pydantic models into logging context metadata."""

import re
from typing import Any

from pydantic import BaseModel
from pydantic.fields import FieldInfo

from setta.logging.context import LoggingContextInput

__all__ = ["SensitiveLoggingField", "serialize_logging_models"]


class SensitiveLoggingField:
    """Marker for Annotated fields that should be hidden from logs."""

    __slots__ = ("setta_sensitive",)

    def __init__(self) -> None:
        self.setta_sensitive = True


def serialize_logging_models(*models: BaseModel) -> dict[str, LoggingContextInput]:
    """Return a flattened mapping of sanitized model fields suitable for logging."""

    if not models:
        return {}

    aggregated: dict[str, LoggingContextInput] = {}
    prefix_counts: dict[str, int] = {}
    for model in models:
        prefix = _model_prefix(model)
        count = prefix_counts.get(prefix, 0) + 1
        prefix_counts[prefix] = count
        suffix = "" if count == 1 else f"_{count}"
        aggregated.update(_serialize_model_context(model, prefix, suffix))
    return aggregated


def _model_prefix(model: BaseModel) -> str:
    name = model.__class__.__name__
    if not name:
        return "model"
    snake = _CAMEL_TO_SNAKE_PATTERN.sub("_", name).lower()
    return snake or "model"


def _serialize_model_context(
    model: BaseModel,
    prefix: str,
    suffix: str,
) -> dict[str, LoggingContextInput]:
    context: dict[str, LoggingContextInput] = {}
    data = model.model_dump()
    fields = model.__class__.model_fields
    for field_name, value in data.items():
        field_info = fields.get(field_name)
        if _field_is_sensitive(field_info):
            continue
        normalized = _normalize_context_value(value)
        if normalized is None:
            continue
        key = f"{prefix}{suffix}_{field_name}"
        context[key] = normalized
    return context


def _field_is_sensitive(field_info: FieldInfo | None) -> bool:
    if field_info is None:
        return False
    extra = field_info.json_schema_extra or {}
    if extra.get(_SENSITIVE_FIELD_FLAG):
        return True
    metadata = getattr(field_info, "metadata", ())
    for entry in metadata or ():
        if getattr(entry, "setta_sensitive", False):
            return True
    return False


def _normalize_context_value(value: Any) -> LoggingContextInput:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


_CAMEL_TO_SNAKE_PATTERN = re.compile("(?<!^)(?=[A-Z])")
_SENSITIVE_FIELD_FLAG = "setta_sensitive"

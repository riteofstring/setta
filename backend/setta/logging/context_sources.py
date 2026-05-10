"""Helpers for deriving Setta logging context metadata from runtime objects."""

from collections.abc import Mapping

from setta.logging.context import LoggingContextInput

LoggingContextMapping = Mapping[str, LoggingContextInput]

__all__ = [
    "LoggingContextMapping",
    "build_background_task_context",
]


def build_background_task_context(
    *,
    label: str,
    project_config_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return context for background jobs or asyncio tasks."""

    context: dict[str, LoggingContextInput] = {
        "task": label,
    }
    if project_config_id:
        context["project_config_id"] = project_config_id
    if request_id:
        context["request_id"] = request_id
    if websocket_id:
        context["websocket_id"] = websocket_id
    _merge_extra_values(context, extra_values)
    return context


def _merge_extra_values(
    context: dict[str, LoggingContextInput],
    extra_values: LoggingContextMapping | None,
) -> None:
    if not extra_values:
        return
    for key, value in extra_values.items():
        if value is None:
            context.pop(key, None)
            continue
        context[key] = value

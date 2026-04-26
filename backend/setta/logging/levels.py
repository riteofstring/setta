"""Utilities for resolving log levels from configuration inputs."""

import logging
import os

LogLevelInput = str | int


def resolve_log_level(
    *,
    level_override: LogLevelInput | None,
    env_var: str,
    default_level: LogLevelInput,
) -> int:
    candidates: tuple[LogLevelInput | None, ...]
    env_value = os.environ.get(env_var) if env_var else None
    candidates = (level_override, env_value, default_level)
    for candidate in candidates:
        if candidate is None:
            continue
        try:
            return parse_log_level(candidate)
        except ValueError:
            continue
    raise ValueError("logging configuration could not determine a log level")


def parse_log_level(value: LogLevelInput) -> int:
    if isinstance(value, int):
        return value
    normalized = value.strip()
    if not normalized:
        raise ValueError("log level string is empty")

    try:
        return int(normalized)
    except ValueError:
        named_level = getattr(logging, normalized.upper(), None)
        if isinstance(named_level, int):
            return named_level
    raise ValueError(f"invalid log level {value!r}")

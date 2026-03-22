"""Centralized logging bootstrap for Python helper processes."""

import logging
import logging.config
import os
from pathlib import Path
from typing import Any, Literal, MutableMapping

from setta.logging.levels import LogLevelInput, resolve_log_level

DictConfigMapping = MutableMapping[str, Any]

DEFAULT_LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(setta_context)s | %(message)s"
)
_ENV_DEFAULT = "SETTA_LOG_LEVEL"
_LISTENER_ENV_DEFAULT = "SETTA_LISTENER_LOG_LEVEL"
_SETTA_LOGGING_CONFIGURED = False
_LAST_LEVEL = logging.WARNING

__all__ = [
    "configure_logging",
    "configure_listener_logging",
]


def configure_logging(
    *,
    default_level: LogLevelInput = "INFO",
    level_override: LogLevelInput | None = None,
    env_var: str = _ENV_DEFAULT,
    stream: Literal["stdout", "stderr"] = "stdout",
    log_file: str | os.PathLike[str] | None = None,
    force: bool = False,
) -> int:
    """Configure logging for Python helper entry points."""

    global _SETTA_LOGGING_CONFIGURED
    global _LAST_LEVEL

    if _SETTA_LOGGING_CONFIGURED and not force:
        return _LAST_LEVEL

    resolved_level = resolve_log_level(
        level_override=level_override,
        env_var=env_var,
        default_level=default_level,
    )

    handler_names: list[str] = ["console"]
    stream_target = _stream_target(stream)
    handlers: dict[str, dict[str, Any]] = {
        "console": {
            "class": "logging.StreamHandler",
            "stream": stream_target,
            "formatter": "default",
            "filters": ["setta_context", "suppress_cancelled"],
        },
    }

    if log_file is not None:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handlers["file"] = {
            "class": "logging.FileHandler",
            "filename": str(log_path),
            "encoding": "utf-8",
            "formatter": "default",
            "filters": ["setta_context", "suppress_cancelled"],
        }
        handler_names.append("file")

    formatter_config = {
        "default": {
            "format": DEFAULT_LOG_FORMAT,
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    }

    config: DictConfigMapping = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": formatter_config,
        "filters": {
            "setta_context": {
                "()": "setta.logging.context.LoggingContextFilter",
            },
            "suppress_cancelled": {
                "()": "setta.logging.filters.SuppressCancelledErrorFilter",
            },
        },
        "handlers": handlers,
        "root": {
            "level": resolved_level,
            "handlers": list(handler_names),
        },
    }

    logging.config.dictConfig(config)
    _SETTA_LOGGING_CONFIGURED = True
    _LAST_LEVEL = resolved_level
    return resolved_level


def configure_listener_logging(
    *,
    default_level: LogLevelInput = "INFO",
    level_override: LogLevelInput | None = None,
    env_var: str = _LISTENER_ENV_DEFAULT,
    stream: Literal["stdout", "stderr"] = "stdout",
    log_file: str | os.PathLike[str] | None = None,
    force: bool = False,
) -> int:
    """Configure logging for external listener scripts."""

    return configure_logging(
        default_level=default_level,
        level_override=level_override,
        env_var=env_var,
        stream=stream,
        log_file=log_file,
        force=force,
    )


def _stream_target(stream: Literal["stdout", "stderr"]) -> str:
    if stream == "stderr":
        return "ext://sys.stderr"
    return "ext://sys.stdout"

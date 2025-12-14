"""Centralized logging bootstrap for backend and listener processes."""

import logging
import logging.config
import os
from pathlib import Path
from typing import Any, Literal, MutableMapping

LogLevelInput = str | int
DictConfigMapping = MutableMapping[str, Any]

DEFAULT_LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(setta_context)s | %(message)s"
)
ACCESS_LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(setta_context)s | %(message)s"
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
    include_access_logger: bool = True,
    force: bool = False,
) -> int:
    """Configure logging for backend entry points."""

    global _SETTA_LOGGING_CONFIGURED
    global _LAST_LEVEL

    if _SETTA_LOGGING_CONFIGURED and not force:
        return _LAST_LEVEL

    resolved_level = _resolve_log_level(
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
            "filters": ["setta_context"],
        },
        "uvicorn_access": {
            "class": "logging.StreamHandler",
            "stream": stream_target,
            "formatter": "access",
            "filters": ["setta_context"],
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
            "filters": ["setta_context"],
        }
        handler_names.append("file")

    formatter_config = {
        "default": {
            "format": DEFAULT_LOG_FORMAT,
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "access": {
            "format": ACCESS_LOG_FORMAT,
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    }

    root_handlers = list(handler_names)
    loggers_config: dict[str, dict[str, Any]] = {
        "uvicorn": {
            "level": _level_name(resolved_level),
            "handlers": list(root_handlers),
            "propagate": False,
        },
        "uvicorn.error": {
            "level": _level_name(resolved_level),
            "handlers": list(root_handlers),
            "propagate": False,
        },
    }
    if include_access_logger:
        loggers_config["uvicorn.access"] = {
            "level": "INFO",
            "handlers": ["uvicorn_access"],
            "propagate": False,
        }

    config: DictConfigMapping = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": formatter_config,
        "filters": {
            "setta_context": {
                "()": "setta.logging.context.LoggingContextFilter",
            },
        },
        "handlers": handlers,
        "root": {
            "level": resolved_level,
            "handlers": list(root_handlers),
        },
        "loggers": loggers_config,
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
        include_access_logger=False,
        force=force,
    )


def _stream_target(stream: Literal["stdout", "stderr"]) -> str:
    if stream == "stderr":
        return "ext://sys.stderr"
    return "ext://sys.stdout"


def _resolve_log_level(
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
            return _parse_log_level(candidate)
        except ValueError:
            continue
    raise ValueError("logging configuration could not determine a log level")


def _parse_log_level(value: LogLevelInput) -> int:
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


def _level_name(level: int) -> str:
    return logging.getLevelName(level)

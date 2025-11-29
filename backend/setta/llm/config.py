"""Helpers for persisting the LiteLLM configuration file."""

import json
from pathlib import Path
from typing import Any

from setta.types.llm_config import AllLLMConfigs
from setta.utils.constants import C


def load_litellm_config(
    config_path: Path | None = None,
) -> AllLLMConfigs:
    """Load and validate ``setta_files/llm_config.json``."""

    raw = _read_config(config_path)
    if not raw:
        return AllLLMConfigs()
    return AllLLMConfigs.model_validate(raw)


def save_litellm_config(
    config: AllLLMConfigs,
    config_path: Path | None = None,
) -> None:
    """Persist the LiteLLM configuration, writing canonical JSON."""
    path = _resolve_path(config_path)
    path.write_text(
        config.model_dump_json(indent=2, exclude_unset=True) + "\n",
    )


def _read_config(config_path: Path | None) -> dict[str, Any]:
    path = _resolve_path(config_path)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    return raw


def _resolve_path(config_path: Path | None) -> Path:
    if config_path:
        path = config_path
    else:
        path = Path(C.SETTA_FILES_FOLDER) / C.LLM_CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

import json
from pathlib import Path
from typing import Any, NotRequired, TypedDict

from setta.utils.constants import C

CONFIG_FILENAME = "llm_config.json"


class LiteLLMConfig(TypedDict):
    model: NotRequired[str]
    custom_llm_provider: NotRequired[str]
    api_base: NotRequired[str]
    api_key_env: NotRequired[str]
    other_params: NotRequired[dict[str, Any]]


def load_litellm_config(
    config_path: Path | None = None,
) -> LiteLLMConfig:
    raw = _read_config(config_path)
    config = LiteLLMConfig(**raw)
    return config


def save_litellm_config(
    config: LiteLLMConfig,
    config_path: Path | None = None,
) -> None:
    path = _resolve_path(config_path)
    path.write_text(json.dumps(config, indent=2))


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
        path = Path(C.SETTA_FILES_FOLDER) / CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

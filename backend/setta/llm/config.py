from dataclasses import dataclass, field, asdict
import json
from pathlib import Path
from typing import Any

from setta.utils.constants import C


CONFIG_FILENAME = "llm_config.json"


@dataclass(slots=True)
class LiteLLMConfig:
    model: str = "gpt-4o-mini"
    provider: str | None = None
    base_url: str | None = None
    api_key_env: str | None = "OPENAI_API_KEY"
    params: dict[str, Any] = field(default_factory=dict)


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
    path.write_text(json.dumps(asdict(config), indent=2))


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

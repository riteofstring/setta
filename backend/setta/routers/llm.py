from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from fastapi import HTTPException, Query
from pydantic import BaseModel, Field

from setta.llm.config import save_litellm_config
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.ai import APIKeys
from setta.types.llm_config import LiteLLMConfig
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.routes import Route
from setta.utils.constants import CWD

router = SettaAPIRouter()


class APIKeysResponse(BaseModel):
    filepath: str
    apiKeys: APIKeys = Field(default_factory=dict)


class UpdateAPIKeysRequest(BaseModel):
    filepath: str = ".env"
    apiKeys: APIKeys = Field(default_factory=dict)


@router.get(Route.LLM_CONFIG)
def route_get_llm_config(state: AppStateFromRequest) -> LiteLLMConfig:
    return state.chat_manager.config


@router.post(Route.LLM_CONFIG)
def route_set_llm_config(
    config: LiteLLMConfig,
    state: AppStateFromRequest,
) -> LiteLLMConfig:
    save_litellm_config(config)
    state.chat_manager.update_config(config)
    return config


@router.get(Route.LLM_API_KEYS)
def route_get_llm_api_keys(
    state: AppStateFromRequest,
    filepath: str = Query(".env"),
) -> APIKeysResponse:
    path = _resolve_env_path(filepath)
    env_vars = _read_env_file(path)
    filtered = _filter_env_vars_for_config(env_vars, state.chat_manager.config)
    return APIKeysResponse(filepath=str(path), apiKeys=filtered)


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    state: AppStateFromRequest,
) -> APIKeysResponse:
    path = _resolve_env_path(payload.filepath)
    try:
        env_vars = _read_env_file(path)
        mutated = False
        for key, value in payload.apiKeys.items():
            normalized_key = key.strip()
            normalized_value = value.strip()
            if not normalized_key:
                continue
            if normalized_value:
                previous = env_vars.get(normalized_key)
                env_vars[normalized_key] = normalized_value
                mutated = mutated or previous != normalized_value
            else:
                if normalized_key in env_vars:
                    env_vars.pop(normalized_key)
                    mutated = True
        if mutated:
            _write_env_file(path, env_vars)
            load_dotenv(dotenv_path=path, override=True)
        notification = SettaNotification(message="Saved LLM API keys")
        await state.wmh_frontend_sender.broadcast_notification(notification)
    except Exception as exc:
        notification = SettaNotification(
            message="Error saving LLM API keys",
            type=SettaNotificationType.error,
        )
        await state.wmh_frontend_sender.broadcast_notification(notification)
        raise HTTPException(
            status_code=500, detail="Failed to save LLM API keys"
        ) from exc
    filtered = _filter_env_vars_for_config(env_vars, state.chat_manager.config)
    return APIKeysResponse(filepath=str(path), apiKeys=filtered)


def _resolve_env_path(filepath: str | None) -> Path:
    raw = Path(filepath or ".env")
    if not raw.is_absolute():
        raw = (CWD / raw).resolve()
    return raw


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    env_vars = dotenv_values(str(path))
    return {key: value for key, value in env_vars.items() if value is not None}


def _write_env_file(path: Path, env_vars: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{key}={value}" for key, value in env_vars.items()]
    content = "\n".join(lines)
    if content:
        content += "\n"
    path.write_text(content)


def _collect_config_api_key_names(config: LiteLLMConfig) -> set[str]:
    keys: set[str] = set()
    for provider in config.providers.values():
        if provider.api_key_env:
            keys.add(provider.api_key_env)
    return keys


def _filter_env_vars_for_config(
    env_vars: dict[str, str],
    config: LiteLLMConfig,
) -> APIKeys:
    desired = _collect_config_api_key_names(config)
    filtered: APIKeys = {}
    for key in desired:
        value = env_vars.get(key)
        if value is not None:
            filtered[key] = value
    return filtered

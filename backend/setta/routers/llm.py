from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.api_keys import (
    read_env_file,
    reload_process_env,
    resolve_env_path,
    write_env_file,
)
from setta.llm.config import save_llm_config
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.ai import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.routes import Route
from setta.utils.constants import C

router = SettaAPIRouter()


class UpdateAPIKeysRequest(BaseModel):
    filepath: str = C.DOT_ENV_FILENAME
    apiKeys: APIKeys = Field(default_factory=dict)


@router.get(Route.LLM_CONFIG)
def route_get_llm_config(state: AppStateFromRequest) -> AllLLMConfigs:
    return state.chat_manager.config


@router.post(Route.LLM_CONFIG)
def route_set_llm_config(
    config: AllLLMConfigs,
    state: AppStateFromRequest,
) -> AllLLMConfigs:
    save_llm_config(config)
    state.chat_manager.update_config(config)
    return state.chat_manager.config


@router.get(Route.LLM_API_KEYS)
def route_get_llm_api_keys(
    state: AppStateFromRequest,
) -> APIKeys:
    return state.chat_manager.api_keys


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    state: AppStateFromRequest,
) -> APIKeys:
    path = resolve_env_path(payload.filepath)
    try:
        env_vars = read_env_file(path)
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
            write_env_file(path, env_vars)
            reload_process_env(path)
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
    state.chat_manager.update_api_keys(env_vars)
    return state.chat_manager.api_keys

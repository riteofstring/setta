from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.config import save_llm_config
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

router = SettaAPIRouter()


class UpdateAPIKeysRequest(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)


@router.get(Route.LLM_CONFIG)
def route_get_llm_config(state: AppStateFromRequest) -> AllLLMConfigs:
    return state.chat_manager.config


@router.post(Route.LLM_CONFIG)
def route_set_llm_config(
    config: AllLLMConfigs,
    state: AppStateFromRequest,
) -> AllLLMConfigs:
    save_llm_config(config, state.dbe)
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
    try:
        env_vars = state.dbe.read_dot_env()
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
            state.dbe.write_dot_env(env_vars)
            state.dbe.reload_dot_env()
        await state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
            "Saved LLM API keys",
            severity=SettaBackendLogEventSeverity.info,
        )
        state.chat_manager.update_api_keys(env_vars)
        return state.chat_manager.api_keys
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to save LLM API keys"
        ) from exc

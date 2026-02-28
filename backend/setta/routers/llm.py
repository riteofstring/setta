from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.config import save_llm_config
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

router = SettaAPIRouter()


class UpdateAPIKeysRequest(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)


@router.get(Route.LLM_CONFIG)
async def route_get_llm_config(
    ctx: RuntimeContextFromRequest,
) -> AllLLMConfigs:
    await ctx.enforce_llm_allowed()
    return ctx.state.agent_runner.config


@router.post(Route.LLM_CONFIG)
async def route_set_llm_config(
    config: AllLLMConfigs,
    ctx: RuntimeContextFromRequest,
) -> AllLLMConfigs:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM configs.")
    save_llm_config(config, ctx.state.dbe)
    ctx.state.agent_runner.update_config(config)
    return ctx.state.agent_runner.config


@router.get(Route.LLM_API_KEYS)
async def route_get_llm_api_keys(
    ctx: RuntimeContextFromRequest,
) -> APIKeys:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading LLM API keys.")
    return ctx.state.agent_runner.api_keys


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    ctx: RuntimeContextFromRequest,
) -> APIKeys:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM API keys.")
    try:
        env_vars = ctx.state.dbe.read_dot_env()
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
            ctx.state.dbe.write_dot_env(env_vars)
            ctx.state.dbe.reload_dot_env()
        await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
            "Saved LLM API keys",
            severity=SettaBackendLogEventSeverity.info,
        )
        ctx.state.agent_runner.update_api_keys(env_vars)
        return ctx.state.agent_runner.api_keys
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to save LLM API keys"
        ) from exc

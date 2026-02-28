from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.api_keys import (
    read_managed_api_keys,
    write_managed_api_keys,
)
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
    return read_managed_api_keys(ctx.state.dbe)


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    ctx: RuntimeContextFromRequest,
) -> APIKeys:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM API keys.")
    try:
        updated = write_managed_api_keys(ctx.state.dbe, payload.apiKeys)
        await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
            "Saved LLM API keys",
            severity=SettaBackendLogEventSeverity.info,
        )
        ctx.state.agent_runner.update_api_keys(updated)
        return updated
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to save LLM API keys"
        ) from exc

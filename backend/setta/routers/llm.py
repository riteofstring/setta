from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    read_managed_api_keys_with_status,
    write_managed_api_keys_with_expected_revision,
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
    expectedRevision: int = Field(ge=0)


class ManagedAPIKeysResponse(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)
    revision: int = Field(ge=0)


class ManagedAPIKeysErrorResponse(BaseModel):
    errorCode: str
    message: str
    revision: int = Field(ge=0)


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
) -> ManagedAPIKeysResponse:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading LLM API keys.")
    read_result = read_managed_api_keys_with_status(ctx.state.dbe)
    if read_result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE:
        error_payload = ManagedAPIKeysErrorResponse(
            errorCode=MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
            message=read_result.error or "Managed API key store is unavailable.",
            revision=0,
        )
        raise HTTPException(
            status_code=503, detail=error_payload.model_dump(mode="json")
        )
    if read_result.corrupt:
        error_payload = ManagedAPIKeysErrorResponse(
            errorCode=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            message=read_result.error or "Managed API key store is corrupt.",
            revision=0,
        )
        raise HTTPException(
            status_code=409, detail=error_payload.model_dump(mode="json")
        )
    return ManagedAPIKeysResponse(
        apiKeys=read_result.api_keys,
        revision=read_result.revision,
    )


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    ctx: RuntimeContextFromRequest,
) -> ManagedAPIKeysResponse:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM API keys.")
    write_attempt = write_managed_api_keys_with_expected_revision(
        ctx.state.dbe,
        payload.apiKeys,
        expected_revision=payload.expectedRevision,
    )
    if write_attempt.status == "corrupt_store":
        error_payload = ManagedAPIKeysErrorResponse(
            errorCode=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            message=write_attempt.error or "Managed API key store is corrupt.",
            revision=0,
        )
        raise HTTPException(
            status_code=409, detail=error_payload.model_dump(mode="json")
        )
    if write_attempt.status == "store_unavailable":
        error_payload = ManagedAPIKeysErrorResponse(
            errorCode=MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
            message=write_attempt.error or "Managed API key store is unavailable.",
            revision=0,
        )
        raise HTTPException(
            status_code=503, detail=error_payload.model_dump(mode="json")
        )
    if write_attempt.status == "revision_conflict":
        error_payload = ManagedAPIKeysErrorResponse(
            errorCode=MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
            message=write_attempt.error or "Managed API key store revision conflict.",
            revision=write_attempt.revision,
        )
        raise HTTPException(
            status_code=409, detail=error_payload.model_dump(mode="json")
        )
    if write_attempt.status != "success":
        raise HTTPException(status_code=500, detail="Failed to save LLM API keys")
    updated_payload = ManagedAPIKeysResponse(
        apiKeys=write_attempt.api_keys,
        revision=write_attempt.revision,
    )
    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "Saved LLM API keys",
        severity=SettaBackendLogEventSeverity.info,
    )
    ctx.state.agent_runner.update_api_keys(write_attempt.api_keys)
    return updated_payload

from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.agentic.store import (
    list_agent_runs,
    load_agent_profiles,
    load_agent_run,
    save_agent_profiles,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.agentic import AgentProfile, AgentRun
from setta.types.id import ID
from setta.types.routes import Route

router = SettaAPIRouter()


class CreateAgentProfileRequest(BaseModel):
    name: str
    description: str = ""
    systemPrompt: str = ""
    llmConfigId: str | None = None
    toolAllowlist: list[str] = Field(default_factory=list)
    memoryScope: str | None = None


class UpdateAgentProfileRequest(BaseModel):
    profile: AgentProfile


class GetAgentProfileRequest(BaseModel):
    profileId: ID


class DeleteAgentProfileRequest(BaseModel):
    profileId: ID


class StartAgentRunRequest(BaseModel):
    profileId: ID
    inputs: dict[str, Any] | None = None


class StopAgentRunRequest(BaseModel):
    runId: ID


class GetAgentRunRequest(BaseModel):
    runId: ID


@router.get(Route.GET_AGENT_PROFILES)
async def route_get_agent_profiles(
    ctx: RuntimeContextFromRequest,
) -> list[AgentProfile]:
    await ctx.enforce_llm_allowed()
    return load_agent_profiles(ctx.state.dbe)


@router.post(Route.GET_AGENT_PROFILE)
async def route_get_agent_profile(
    x: GetAgentProfileRequest, ctx: RuntimeContextFromRequest
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    profiles = load_agent_profiles(ctx.state.dbe)
    for profile in profiles:
        if profile.id == x.profileId:
            return profile
    raise HTTPException(status_code=404, detail="Agent profile not found")


@router.post(Route.CREATE_AGENT_PROFILE)
async def route_create_agent_profile(
    x: CreateAgentProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow creating agent profiles.")
    profiles = load_agent_profiles(ctx.state.dbe)
    profile = AgentProfile(
        name=x.name,
        description=x.description,
        systemPrompt=x.systemPrompt,
        llmConfigId=x.llmConfigId,
        toolAllowlist=x.toolAllowlist,
        memoryScope=x.memoryScope,
    )
    profiles.append(profile)
    save_agent_profiles(ctx.state.dbe, profiles)
    return profile


@router.post(Route.UPDATE_AGENT_PROFILE)
async def route_update_agent_profile(
    x: UpdateAgentProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating agent profiles.")
    profiles = load_agent_profiles(ctx.state.dbe)
    for idx, profile in enumerate(profiles):
        if profile.id == x.profile.id:
            profiles[idx] = x.profile
            save_agent_profiles(ctx.state.dbe, profiles)
            return x.profile
    raise HTTPException(status_code=404, detail="Agent profile not found")


@router.post(Route.DELETE_AGENT_PROFILE)
async def route_delete_agent_profile(
    x: DeleteAgentProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow deleting agent profiles.")
    profiles = load_agent_profiles(ctx.state.dbe)
    for idx, profile in enumerate(profiles):
        if profile.id == x.profileId:
            profiles.pop(idx)
            save_agent_profiles(ctx.state.dbe, profiles)
            return None
    raise HTTPException(status_code=404, detail="Agent profile not found")


@router.post(Route.START_AGENT_RUN)
async def route_start_agent_run(
    x: StartAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    if ctx.state.agent_runner.disabled:
        raise HTTPException(status_code=503, detail="Agent runner is not available")
    profiles = load_agent_profiles(ctx.state.dbe)
    for profile in profiles:
        if profile.id == x.profileId:
            return ctx.state.agent_runner.start_run(profile, x.inputs)
    raise HTTPException(status_code=404, detail="Agent profile not found")


@router.post(Route.STOP_AGENT_RUN)
async def route_stop_agent_run(
    x: StopAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    if ctx.state.agent_runner.disabled:
        raise HTTPException(status_code=503, detail="Agent runner is not available")
    try:
        return await ctx.state.agent_runner.stop_run(x.runId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(Route.GET_AGENT_RUN)
async def route_get_agent_run(
    x: GetAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    run = load_agent_run(ctx.state.dbe, x.runId)
    if run is None:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


@router.get(Route.GET_AGENT_RUNS)
async def route_get_agent_runs(
    ctx: RuntimeContextFromRequest,
) -> list[AgentRun]:
    await ctx.enforce_llm_allowed()
    return list_agent_runs(ctx.state.dbe)

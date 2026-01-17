from fastapi import HTTPException
from pydantic import BaseModel

from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    PromptTemplate,
    RunEvent,
    RunEventType,
)
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.routes import Route

router = SettaAPIRouter()


class CreateAgentProfileRequest(BaseModel):
    profile: AgentProfile


class UpdateAgentProfileRequest(BaseModel):
    profile: AgentProfile


class StartAgentRunRequest(BaseModel):
    agentProfileId: ID
    inputs: JSONValue | None = None
    llmConfigId: str | None = None


class CreatePromptTemplateRequest(BaseModel):
    prompt: PromptTemplate


class UpdatePromptTemplateRequest(BaseModel):
    prompt: PromptTemplate


def _find_agent_profile(profiles: list[AgentProfile], profile_id: ID) -> AgentProfile:
    for profile in profiles:
        if profile.id == profile_id:
            return profile
    raise HTTPException(
        status_code=404,
        detail=f"Agent profile not found: {profile_id}",
    )


def _refresh_agentic_watcher(ctx: RuntimeContextFromRequest) -> None:
    if ctx.state.agentic_watcher:
        ctx.state.agentic_watcher.refresh()


@router.get(Route.AGENT_PROFILES)
async def route_list_agent_profiles(
    ctx: RuntimeContextFromRequest,
) -> list[AgentProfile]:
    await ctx.enforce_llm_allowed()
    return ctx.state.dbe.read_agent_profiles()


@router.get(Route.AGENT_PROFILE)
async def route_get_agent_profile(
    profileId: ID,
    ctx: RuntimeContextFromRequest,
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    profiles = ctx.state.dbe.read_agent_profiles()
    return _find_agent_profile(profiles, profileId)


@router.post(Route.AGENT_PROFILES)
async def route_create_agent_profile(
    x: CreateAgentProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating agent profiles.")
    profiles = ctx.state.dbe.read_agent_profiles()
    for profile in profiles:
        if profile.id == x.profile.id:
            raise HTTPException(
                status_code=409,
                detail=f"Agent profile already exists: {x.profile.id}",
            )
    profiles.append(x.profile)
    ctx.state.dbe.write_agent_profiles(profiles)
    return x.profile


@router.post(Route.UPDATE_AGENT_PROFILE)
async def route_update_agent_profile(
    profileId: ID,
    x: UpdateAgentProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating agent profiles.")
    profiles = ctx.state.dbe.read_agent_profiles()
    updated = x.profile.model_copy(update={"id": profileId})
    for idx, profile in enumerate(profiles):
        if profile.id == profileId:
            profiles[idx] = updated
            ctx.state.dbe.write_agent_profiles(profiles)
            return updated
    raise HTTPException(
        status_code=404,
        detail=f"Agent profile not found: {profileId}",
    )


@router.post(Route.DELETE_AGENT_PROFILE)
async def route_delete_agent_profile(
    profileId: ID,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating agent profiles.")
    profiles = ctx.state.dbe.read_agent_profiles()
    remaining: list[AgentProfile] = []
    deleted = False
    for profile in profiles:
        if profile.id == profileId:
            deleted = True
            continue
        remaining.append(profile)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Agent profile not found: {profileId}",
        )
    ctx.state.dbe.write_agent_profiles(remaining)


@router.get(Route.AGENT_RUNS)
async def route_list_agent_runs(
    ctx: RuntimeContextFromRequest,
    agentProfileId: ID | None = None,
) -> list[AgentRun]:
    await ctx.enforce_llm_allowed()
    runs = ctx.state.dbe.read_agent_runs()
    if agentProfileId is None:
        return runs
    return [run for run in runs if run.agentProfileId == agentProfileId]


@router.get(Route.AGENT_RUN)
async def route_get_agent_run(
    runId: ID,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    run = ctx.state.dbe.read_agent_run(runId)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Agent run not found: {runId}")
    return run


@router.post(Route.AGENT_RUNS)
async def route_start_agent_run(
    x: StartAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    profiles = ctx.state.dbe.read_agent_profiles()
    profile = _find_agent_profile(profiles, x.agentProfileId)
    llm_config_id = x.llmConfigId or profile.llmConfigId
    run = AgentRun(
        agentProfileId=profile.id,
        llmConfigId=llm_config_id,
        inputs=x.inputs,
        status=AgentRunStatus.queued,
        events=[
            RunEvent(
                type=RunEventType.status,
                status=AgentRunStatus.queued,
            )
        ],
    )
    ctx.state.dbe.write_agent_run(run)
    ctx.state.agent_runner.start_run(
        run=run,
        profile=profile,
        inputs=x.inputs,
        llm_config_id=llm_config_id,
        share_session_id=ctx.share_session_id,
    )
    return run


@router.post(Route.STOP_AGENT_RUN)
async def route_stop_agent_run(
    runId: ID,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating agent runs.")
    if ctx.state.dbe.read_agent_run(runId) is None:
        raise HTTPException(status_code=404, detail=f"Agent run not found: {runId}")
    run = await ctx.state.agent_runner.stop_run(runId)
    return run


@router.get(Route.PROMPT_ASSETS)
async def route_list_prompt_assets(
    ctx: RuntimeContextFromRequest,
) -> list[PromptTemplate]:
    await ctx.enforce_llm_allowed()
    return ctx.state.dbe.read_prompts()


@router.get(Route.PROMPT_ASSET)
async def route_get_prompt_asset(
    promptId: ID,
    ctx: RuntimeContextFromRequest,
) -> PromptTemplate:
    await ctx.enforce_llm_allowed()
    prompt = ctx.state.dbe.read_prompt(promptId)
    if prompt is None:
        raise HTTPException(status_code=404, detail=f"Prompt not found: {promptId}")
    return prompt


@router.post(Route.PROMPT_ASSETS)
async def route_create_prompt_asset(
    x: CreatePromptTemplateRequest,
    ctx: RuntimeContextFromRequest,
) -> PromptTemplate:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating prompts.")
    if ctx.state.dbe.read_prompt(x.prompt.id) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Prompt already exists: {x.prompt.id}",
        )
    ctx.state.dbe.write_prompt(x.prompt)
    _refresh_agentic_watcher(ctx)
    return x.prompt


@router.post(Route.UPDATE_PROMPT_ASSET)
async def route_update_prompt_asset(
    promptId: ID,
    x: UpdatePromptTemplateRequest,
    ctx: RuntimeContextFromRequest,
) -> PromptTemplate:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating prompts.")
    if ctx.state.dbe.read_prompt(promptId) is None:
        raise HTTPException(status_code=404, detail=f"Prompt not found: {promptId}")
    updated = x.prompt.model_copy(update={"id": promptId})
    ctx.state.dbe.write_prompt(updated)
    _refresh_agentic_watcher(ctx)
    return updated


@router.post(Route.DELETE_PROMPT_ASSET)
async def route_delete_prompt_asset(
    promptId: ID,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating prompts.")
    if ctx.state.dbe.read_prompt(promptId) is None:
        raise HTTPException(status_code=404, detail=f"Prompt not found: {promptId}")
    ctx.state.dbe.delete_prompt(promptId)
    _refresh_agentic_watcher(ctx)

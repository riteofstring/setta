from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.external_agent_preflight import (
    build_external_agent_preflight_status,
)
from setta.agentic.store import (
    delete_prompt_template,
    list_agent_runs,
    list_prompt_templates,
    load_agent_profiles,
    load_agent_run,
    load_engine_configs,
    load_external_agent_configs,
    load_prompt_template,
    require_agent_profile,
    require_engine_config,
    require_external_agent_config,
    save_agent_profiles,
    save_engine_configs,
    save_external_agent_configs,
    save_prompt_template,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    EngineConfig,
    EngineConfigDefaults,
    EngineType,
    SettaLlmEngineConfig,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentPreflightStatus,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.prompt import PromptFormat, PromptTemplate
from setta.types.routes import Route

router = SettaAPIRouter()


class CreateAgentProfileRequest(BaseModel):
    name: str
    description: str = ""
    systemPrompt: str = ""
    engineConfigId: ID | None = None
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


class StartExternalAgentRunRequest(BaseModel):
    engineConfigId: ID
    profileId: ID | None = None
    inputs: dict[str, Any] | None = None


class StopExternalAgentRunRequest(BaseModel):
    runId: ID


class RespondExternalAgentApprovalRequest(BaseModel):
    approvalId: str
    approved: bool


class CreatePromptTemplateRequest(BaseModel):
    name: str
    description: str = ""
    template: str
    format: PromptFormat = PromptFormat.Jinja
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class UpdatePromptTemplateRequest(BaseModel):
    template: PromptTemplate


class GetPromptTemplateRequest(BaseModel):
    templateId: ID


class DeletePromptTemplateRequest(BaseModel):
    templateId: ID


class CreateExternalAgentConfigRequest(BaseModel):
    name: str
    description: str = ""
    toolType: ExternalAgentToolType
    runMode: ExternalAgentRunMode
    commandPath: str | None = None
    baseUrl: str | None = None
    defaultModel: str | None = None
    sandboxPolicy: str | None = None
    approvalPolicy: str | None = None
    envVarWhitelist: list[str] = Field(default_factory=list)
    workingDirStrategy: ExternalAgentWorkingDirStrategy = (
        ExternalAgentWorkingDirStrategy.project_root
    )
    workingDir: str | None = None


class UpdateExternalAgentConfigRequest(BaseModel):
    config: ExternalAgentConfig


class GetExternalAgentConfigRequest(BaseModel):
    configId: ID


class DeleteExternalAgentConfigRequest(BaseModel):
    configId: ID


class CreateEngineConfigRequest(BaseModel):
    name: str
    engineType: EngineType
    settaLlmConfig: SettaLlmEngineConfig | None = None
    externalAgentConfigId: ID | None = None
    defaults: EngineConfigDefaults = Field(default_factory=EngineConfigDefaults)


class UpdateEngineConfigRequest(BaseModel):
    config: EngineConfig


class GetEngineConfigRequest(BaseModel):
    configId: ID


class DeleteEngineConfigRequest(BaseModel):
    configId: ID


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
        engineConfigId=x.engineConfigId,
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
    try:
        profile = require_agent_profile(ctx.state.dbe, x.profileId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if profile.engineConfigId is None:
        raise HTTPException(status_code=400, detail="Agent profile missing engine")
    resolved = resolve_engine_config(
        ctx.state.dbe, ctx.state.agent_runner.config, profile.engineConfigId
    )
    if resolved.engine_config.engineType == EngineType.setta_llm:
        if ctx.state.agent_runner.disabled:
            raise HTTPException(status_code=503, detail="Agent runner is not available")
        return ctx.state.agent_runner.start_run(profile, x.inputs)
    if resolved.engine_config.engineType == EngineType.external_agent:
        runner = ctx.state.external_agent_runner
        if runner.disabled:
            raise HTTPException(
                status_code=503, detail="External agent runner is not available"
            )
        external_config = resolved.external_agent_config
        if external_config is None:
            raise HTTPException(
                status_code=500, detail="External agent config not found"
            )
        status = build_external_agent_preflight_status(ctx.state.dbe, external_config)
        if not status.available:
            issues = "; ".join(status.issues) if status.issues else "preflight failed"
            raise HTTPException(
                status_code=503,
                detail=f"External agent config is not available: {issues}",
            )
        if (
            profile.toolAllowlist
            and external_config.toolType != ExternalAgentToolType.claude_code
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Tool allowlists are only supported for Claude Code external runs. "
                    "Remove toolAllowlist or choose a Claude Code config."
                ),
            )
        return runner.start_run(
            resolved.engine_config.id,
            external_config,
            profile,
            x.inputs,
        )
    raise HTTPException(status_code=400, detail="Unsupported engine config")


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


@router.post(Route.START_EXTERNAL_AGENT_RUN)
async def route_start_external_agent_run(
    x: StartExternalAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.external_agent_runner
    if runner.disabled:
        raise HTTPException(
            status_code=503, detail="External agent runner is not available"
        )
    try:
        engine_config = require_engine_config(ctx.state.dbe, x.engineConfigId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if engine_config.engineType != EngineType.external_agent:
        raise HTTPException(status_code=400, detail="Engine config is not external")
    external_config_id = engine_config.externalAgentConfigId
    if external_config_id is None:
        raise HTTPException(status_code=500, detail="External agent config not found")
    try:
        config = require_external_agent_config(ctx.state.dbe, external_config_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    status = build_external_agent_preflight_status(ctx.state.dbe, config)
    if not status.available:
        issues = "; ".join(status.issues) if status.issues else "preflight failed"
        raise HTTPException(
            status_code=503,
            detail=f"External agent config is not available: {issues}",
        )
    profile = None
    if x.profileId is not None:
        try:
            profile = require_agent_profile(ctx.state.dbe, x.profileId)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    if (
        profile is not None
        and profile.toolAllowlist
        and config.toolType != ExternalAgentToolType.claude_code
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Tool allowlists are only supported for Claude Code external runs. "
                "Remove toolAllowlist or choose a Claude Code config."
            ),
        )
    return runner.start_run(x.engineConfigId, config, profile, x.inputs)


@router.post(Route.STOP_EXTERNAL_AGENT_RUN)
async def route_stop_external_agent_run(
    x: StopExternalAgentRunRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.external_agent_runner
    if runner.disabled:
        raise HTTPException(
            status_code=503, detail="External agent runner is not available"
        )
    try:
        return await runner.stop_run(x.runId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(Route.RESPOND_EXTERNAL_AGENT_APPROVAL)
async def route_respond_external_agent_approval(
    x: RespondExternalAgentApprovalRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.external_agent_runner
    if runner.disabled:
        raise HTTPException(
            status_code=503, detail="External agent runner is not available"
        )
    try:
        await runner.respond_to_approval(x.approvalId, x.approved)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return None


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


@router.get(Route.GET_PROMPT_TEMPLATES)
async def route_get_prompt_templates(
    ctx: RuntimeContextFromRequest,
) -> list[PromptTemplate]:
    await ctx.enforce_llm_allowed()
    return list_prompt_templates(ctx.state.dbe)


@router.post(Route.GET_PROMPT_TEMPLATE)
async def route_get_prompt_template(
    x: GetPromptTemplateRequest, ctx: RuntimeContextFromRequest
) -> PromptTemplate:
    await ctx.enforce_llm_allowed()
    template = load_prompt_template(ctx.state.dbe, x.templateId)
    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


@router.post(Route.CREATE_PROMPT_TEMPLATE)
async def route_create_prompt_template(
    x: CreatePromptTemplateRequest,
    ctx: RuntimeContextFromRequest,
) -> PromptTemplate:
    ctx.require_ide_mode("Share mode does not allow creating prompt templates.")
    await ctx.enforce_llm_allowed()
    template = PromptTemplate(
        name=x.name,
        description=x.description,
        template=x.template,
        format=x.format,
        inputSchema=x.inputSchema,
        metadata=x.metadata,
    )
    save_prompt_template(ctx.state.dbe, template)
    if ctx.state.prompt_template_watcher:
        ctx.state.prompt_template_watcher.refresh()
    await ctx.state.wmh_frontend_sender.broadcast_prompt_templates_update(
        list_prompt_templates(ctx.state.dbe)
    )
    return template


@router.post(Route.UPDATE_PROMPT_TEMPLATE)
async def route_update_prompt_template(
    x: UpdatePromptTemplateRequest,
    ctx: RuntimeContextFromRequest,
) -> PromptTemplate:
    ctx.require_ide_mode("Share mode does not allow updating prompt templates.")
    await ctx.enforce_llm_allowed()
    existing = load_prompt_template(ctx.state.dbe, x.template.id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    save_prompt_template(ctx.state.dbe, x.template)
    if ctx.state.prompt_template_watcher:
        ctx.state.prompt_template_watcher.refresh()
    await ctx.state.wmh_frontend_sender.broadcast_prompt_templates_update(
        list_prompt_templates(ctx.state.dbe)
    )
    return x.template


@router.post(Route.DELETE_PROMPT_TEMPLATE)
async def route_delete_prompt_template(
    x: DeletePromptTemplateRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    ctx.require_ide_mode("Share mode does not allow deleting prompt templates.")
    await ctx.enforce_llm_allowed()
    existing = load_prompt_template(ctx.state.dbe, x.templateId)
    if existing is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    delete_prompt_template(ctx.state.dbe, x.templateId)
    if ctx.state.prompt_template_watcher:
        ctx.state.prompt_template_watcher.refresh()
    await ctx.state.wmh_frontend_sender.broadcast_prompt_templates_update(
        list_prompt_templates(ctx.state.dbe)
    )
    return None


@router.get(Route.GET_EXTERNAL_AGENT_CONFIGS)
async def route_get_external_agent_configs(
    ctx: RuntimeContextFromRequest,
) -> list[ExternalAgentConfig]:
    await ctx.enforce_llm_allowed()
    return load_external_agent_configs(ctx.state.dbe)


@router.post(Route.GET_EXTERNAL_AGENT_CONFIG)
async def route_get_external_agent_config(
    x: GetExternalAgentConfigRequest, ctx: RuntimeContextFromRequest
) -> ExternalAgentConfig:
    await ctx.enforce_llm_allowed()
    configs = load_external_agent_configs(ctx.state.dbe)
    for config in configs:
        if config.id == x.configId:
            return config
    raise HTTPException(status_code=404, detail="External agent config not found")


@router.get(Route.GET_EXTERNAL_AGENT_HEALTH)
async def route_get_external_agent_health(
    ctx: RuntimeContextFromRequest,
) -> list[ExternalAgentPreflightStatus]:
    await ctx.enforce_llm_allowed()
    configs = load_external_agent_configs(ctx.state.dbe)
    return [
        build_external_agent_preflight_status(ctx.state.dbe, config)
        for config in configs
    ]


@router.post(Route.CREATE_EXTERNAL_AGENT_CONFIG)
async def route_create_external_agent_config(
    x: CreateExternalAgentConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> ExternalAgentConfig:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow creating external agent configs.")
    configs = load_external_agent_configs(ctx.state.dbe)
    config = ExternalAgentConfig(
        name=x.name,
        description=x.description,
        toolType=x.toolType,
        runMode=x.runMode,
        commandPath=x.commandPath,
        baseUrl=x.baseUrl,
        defaultModel=x.defaultModel,
        sandboxPolicy=x.sandboxPolicy,
        approvalPolicy=x.approvalPolicy,
        envVarWhitelist=x.envVarWhitelist,
        workingDirStrategy=x.workingDirStrategy,
        workingDir=x.workingDir,
    )
    configs.append(config)
    save_external_agent_configs(ctx.state.dbe, configs)
    await ctx.state.wmh_frontend_sender.broadcast_external_agent_configs_update(configs)
    return config


@router.post(Route.UPDATE_EXTERNAL_AGENT_CONFIG)
async def route_update_external_agent_config(
    x: UpdateExternalAgentConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> ExternalAgentConfig:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating external agent configs.")
    configs = load_external_agent_configs(ctx.state.dbe)
    for idx, config in enumerate(configs):
        if config.id == x.config.id:
            configs[idx] = x.config
            save_external_agent_configs(ctx.state.dbe, configs)
            await ctx.state.wmh_frontend_sender.broadcast_external_agent_configs_update(
                configs
            )
            return x.config
    raise HTTPException(status_code=404, detail="External agent config not found")


@router.post(Route.DELETE_EXTERNAL_AGENT_CONFIG)
async def route_delete_external_agent_config(
    x: DeleteExternalAgentConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow deleting external agent configs.")
    configs = load_external_agent_configs(ctx.state.dbe)
    for idx, config in enumerate(configs):
        if config.id == x.configId:
            configs.pop(idx)
            save_external_agent_configs(ctx.state.dbe, configs)
            await ctx.state.wmh_frontend_sender.broadcast_external_agent_configs_update(
                configs
            )
            return None
    raise HTTPException(status_code=404, detail="External agent config not found")


@router.get(Route.GET_ENGINE_CONFIGS)
async def route_get_engine_configs(
    ctx: RuntimeContextFromRequest,
) -> list[EngineConfig]:
    await ctx.enforce_llm_allowed()
    return load_engine_configs(ctx.state.dbe)


@router.post(Route.GET_ENGINE_CONFIG)
async def route_get_engine_config(
    x: GetEngineConfigRequest, ctx: RuntimeContextFromRequest
) -> EngineConfig:
    await ctx.enforce_llm_allowed()
    configs = load_engine_configs(ctx.state.dbe)
    for config in configs:
        if config.id == x.configId:
            return config
    raise HTTPException(status_code=404, detail="Engine config not found")


@router.post(Route.CREATE_ENGINE_CONFIG)
async def route_create_engine_config(
    x: CreateEngineConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> EngineConfig:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow creating engine configs.")
    configs = load_engine_configs(ctx.state.dbe)
    config = EngineConfig(
        name=x.name,
        engineType=x.engineType,
        settaLlmConfig=x.settaLlmConfig,
        externalAgentConfigId=x.externalAgentConfigId,
        defaults=x.defaults,
    )
    configs.append(config)
    save_engine_configs(ctx.state.dbe, configs)
    await ctx.state.wmh_frontend_sender.broadcast_engine_configs_update(configs)
    return config


@router.post(Route.UPDATE_ENGINE_CONFIG)
async def route_update_engine_config(
    x: UpdateEngineConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> EngineConfig:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating engine configs.")
    configs = load_engine_configs(ctx.state.dbe)
    for idx, config in enumerate(configs):
        if config.id == x.config.id:
            configs[idx] = x.config
            save_engine_configs(ctx.state.dbe, configs)
            await ctx.state.wmh_frontend_sender.broadcast_engine_configs_update(configs)
            return x.config
    raise HTTPException(status_code=404, detail="Engine config not found")


@router.post(Route.DELETE_ENGINE_CONFIG)
async def route_delete_engine_config(
    x: DeleteEngineConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow deleting engine configs.")
    configs = load_engine_configs(ctx.state.dbe)
    for idx, config in enumerate(configs):
        if config.id == x.configId:
            configs.pop(idx)
            save_engine_configs(ctx.state.dbe, configs)
            await ctx.state.wmh_frontend_sender.broadcast_engine_configs_update(configs)
            return None
    raise HTTPException(status_code=404, detail="Engine config not found")

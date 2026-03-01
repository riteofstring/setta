from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.agentic.agentic_summary_status import (
    build_agentic_summary_cache_status_for_chat_section,
)
from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.external_agent_defaults import (
    build_default_claude_settings_block,
    build_default_opencode_settings_block,
)
from setta.agentic.external_agent_preflight import (
    build_external_agent_preflight_status,
)
from setta.agentic.external_agent_settings import (
    build_codex_settings_file,
    build_opencode_settings_file,
    write_claude_settings_file,
)
from setta.agentic.external_tool_allowlist import build_external_tool_allowlist
from setta.agentic.store import (
    delete_prompt_template,
    list_agent_runs,
    list_prompt_templates,
    load_agent_profiles,
    load_agent_run,
    load_engine_configs,
    load_external_agent_configs,
    load_prompt_template,
    load_transcription_profiles,
    require_agent_profile,
    save_agent_profiles,
    save_engine_configs,
    save_external_agent_configs,
    save_prompt_template,
    save_transcription_profiles,
)
from setta.llm.transcription_capabilities import supports_realtime_transcription
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaFullRuntimeAPIRouter
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    EngineConfig,
    EngineConfigDefaults,
    EngineType,
    RunChainSpec,
    TranscriptionProfile,
    TranscriptionTransportMode,
)
from setta.types.agentic_observability import AgenticSummaryCacheStatus
from setta.types.external_agents import (
    ClaudeSettingsSource,
    ExternalAgentConfig,
    ExternalAgentPreflightStatus,
    ExternalAgentRunMode,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.prompt import PromptFormat, PromptTemplate
from setta.types.routes import Route
from setta.utils.constants import C

router = SettaFullRuntimeAPIRouter()


class CreateAgentProfileRequest(BaseModel):
    name: str
    description: str = ""
    systemPrompt: str = ""
    enableBackgroundSummaryFill: bool = False
    enableLlmChatTitles: bool = False
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


class StartRunChainRequest(BaseModel):
    spec: RunChainSpec
    inputs: dict[str, Any] | None = None


class StopRunChainRequest(BaseModel):
    runId: ID


class GetAgentRunRequest(BaseModel):
    runId: ID


class GetAgenticSummaryCacheStatusRequest(BaseModel):
    projectConfigId: ID
    chatSectionId: ID


class StopExternalAgentRunRequest(BaseModel):
    runId: ID


class RespondExternalAgentApprovalRequest(BaseModel):
    approvalId: str
    approved: bool


class RespondExternalAgentQuestionRequest(BaseModel):
    toolCallId: str
    answers: dict[str, str]


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
    pluginAdapterId: str | None = None
    runMode: ExternalAgentRunMode
    commandPath: str | None = None
    baseUrl: str | None = None
    defaultModel: str | None = None
    sandboxPolicy: str | None = None
    approvalPolicy: str | None = None
    settingsMode: ExternalAgentSettingsMode = ExternalAgentSettingsMode.managed_local
    settingsSources: list[ClaudeSettingsSource] | None = None
    settingsFilePath: str | None = None
    settingsAllowSettaEdits: bool = True
    settingsManagedBlock: ExternalAgentSettingsManagedBlock | None = None
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
    settaLlmConfigId: str | None = None
    externalAgentConfigId: ID | None = None
    defaults: EngineConfigDefaults = Field(default_factory=EngineConfigDefaults)


class UpdateEngineConfigRequest(BaseModel):
    config: EngineConfig


class GetEngineConfigRequest(BaseModel):
    configId: ID


class DeleteEngineConfigRequest(BaseModel):
    configId: ID


class CreateTranscriptionProfileRequest(BaseModel):
    name: str
    transcriptionLlmConfigId: str
    transportMode: TranscriptionTransportMode
    chunkMs: int = Field(ge=200, le=10_000)
    language: str | None = None


class UpdateTranscriptionProfileRequest(BaseModel):
    profile: TranscriptionProfile


class DeleteTranscriptionProfileRequest(BaseModel):
    profileId: ID


def _get_plugin_external_agent_adapters(
    ctx: RuntimeContextFromRequest,
) -> list[PluginRegisteredExternalAgentAdapter]:
    return ctx.state.external_agent_runner.get_plugin_external_agent_adapters()


def _require_valid_transcription_llm_config_id(
    ctx: RuntimeContextFromRequest,
    transcription_llm_config_id: str,
) -> tuple[str, LLMConfig]:
    normalized_config_id = transcription_llm_config_id.strip()
    if not normalized_config_id:
        raise HTTPException(
            status_code=400,
            detail="Transcription profile requires a transcription LLM config id.",
        )
    try:
        llm_config = ctx.state.agent_runner.config.resolve_config(normalized_config_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Transcription profile references unknown transcription "
                f"LLM config '{normalized_config_id}'."
            ),
        ) from exc
    return normalized_config_id, llm_config


def _resolve_transcription_profile_realtime_support(
    ctx: RuntimeContextFromRequest,
    *,
    profile: TranscriptionProfile,
) -> bool:
    transcription_llm_config_id = profile.transcriptionLlmConfigId.strip()
    if not transcription_llm_config_id:
        return False
    try:
        llm_config = ctx.state.agent_runner.config.resolve_config(
            transcription_llm_config_id
        )
    except ValueError:
        return False
    return supports_realtime_transcription(llm_config)


def _attach_transcription_profile_capabilities(
    ctx: RuntimeContextFromRequest,
    *,
    profile: TranscriptionProfile,
) -> TranscriptionProfile:
    return profile.model_copy(
        update={
            "supportsRealtimeTranscription": _resolve_transcription_profile_realtime_support(
                ctx,
                profile=profile,
            )
        }
    )


def _attach_transcription_profiles_capabilities(
    ctx: RuntimeContextFromRequest,
    *,
    profiles: list[TranscriptionProfile],
) -> list[TranscriptionProfile]:
    return [
        _attach_transcription_profile_capabilities(ctx, profile=profile)
        for profile in profiles
    ]


def _require_valid_transcription_transport_mode(
    transport_mode: TranscriptionTransportMode,
    llm_config: LLMConfig,
) -> None:
    if transport_mode != TranscriptionTransportMode.realtime:
        return
    if supports_realtime_transcription(llm_config):
        return
    raise HTTPException(
        status_code=400,
        detail="Realtime transcription is unavailable for this provider/model.",
    )


def _validate_plugin_external_agent_selection(
    ctx: RuntimeContextFromRequest,
    *,
    tool_type: ExternalAgentToolType,
    plugin_adapter_id: str | None,
    run_mode: ExternalAgentRunMode,
) -> PluginRegisteredExternalAgentAdapter | None:
    if tool_type != ExternalAgentToolType.plugin:
        if plugin_adapter_id is not None and plugin_adapter_id.strip() != "":
            raise HTTPException(
                status_code=400,
                detail="pluginAdapterId is only supported for plugin toolType.",
            )
        return None
    normalized_adapter_id = (plugin_adapter_id or "").strip()
    if normalized_adapter_id == "":
        raise HTTPException(
            status_code=400,
            detail="pluginAdapterId is required when toolType is plugin.",
        )
    plugin_adapter = ctx.state.external_agent_runner.get_plugin_external_agent_adapter(
        normalized_adapter_id
    )
    if plugin_adapter is None:
        raise HTTPException(
            status_code=400,
            detail=f"Plugin external agent adapter not found: {normalized_adapter_id}",
        )
    if run_mode.value not in plugin_adapter.runModes:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Run mode {run_mode.value} is not supported by {normalized_adapter_id}"
            ),
        )
    return plugin_adapter


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
        enableBackgroundSummaryFill=x.enableBackgroundSummaryFill,
        enableLlmChatTitles=x.enableLlmChatTitles,
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
        status = build_external_agent_preflight_status(
            ctx.state.dbe,
            external_config,
            plugin_external_agent_adapters=_get_plugin_external_agent_adapters(ctx),
        )
        if not status.available:
            issues = "; ".join(status.issues) if status.issues else "preflight failed"
            raise HTTPException(
                status_code=503,
                detail=f"External agent config is not available: {issues}",
            )
        if profile.toolAllowlist:
            _, error = build_external_tool_allowlist(
                profile.toolAllowlist,
                server_id=SETTA_MCP_SERVER_ID,
            )
            if error:
                raise HTTPException(status_code=400, detail=error)
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


@router.post(Route.START_RUN_CHAIN)
async def route_start_run_chain(
    x: StartRunChainRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.run_chain_runner
    if runner.disabled:
        raise HTTPException(status_code=503, detail="Run chain runner is not available")
    return runner.start_run(x.spec, x.inputs)


@router.post(Route.STOP_RUN_CHAIN)
async def route_stop_run_chain(
    x: StopRunChainRequest,
    ctx: RuntimeContextFromRequest,
) -> AgentRun:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.run_chain_runner
    if runner.disabled:
        raise HTTPException(status_code=503, detail="Run chain runner is not available")
    try:
        return await runner.stop_run(x.runId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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


@router.post(Route.RESPOND_EXTERNAL_AGENT_QUESTION)
async def route_respond_external_agent_question(
    x: RespondExternalAgentQuestionRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    runner = ctx.state.external_agent_runner
    if runner.disabled:
        raise HTTPException(
            status_code=503, detail="External agent runner is not available"
        )
    try:
        await runner.respond_to_question(x.toolCallId, x.answers)
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


@router.post(Route.GET_AGENTIC_SUMMARY_CACHE_STATUS)
async def route_get_agentic_summary_cache_status(
    x: GetAgenticSummaryCacheStatusRequest,
    ctx: RuntimeContextFromRequest,
) -> AgenticSummaryCacheStatus:
    await ctx.enforce_llm_allowed()
    manager = ctx.state.project_manager_switcher.get(
        x.projectConfigId,
        share_session_id=ctx.share_session_id,
    )
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        x.projectConfigId,
    )
    return build_agentic_summary_cache_status_for_chat_section(
        ctx.state.dbe,
        project_state,
        project_config_id=x.projectConfigId,
        chat_section_id=x.chatSectionId,
    )


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
    plugin_external_agent_adapters = _get_plugin_external_agent_adapters(ctx)
    return [
        build_external_agent_preflight_status(
            ctx.state.dbe,
            config,
            plugin_external_agent_adapters=plugin_external_agent_adapters,
        )
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
    plugin_adapter = _validate_plugin_external_agent_selection(
        ctx,
        tool_type=x.toolType,
        plugin_adapter_id=x.pluginAdapterId,
        run_mode=x.runMode,
    )
    env_var_whitelist = sorted(
        {name.strip() for name in x.envVarWhitelist if name.strip()}
    )

    approval_policy = x.approvalPolicy
    sandbox_policy = x.sandboxPolicy
    if x.toolType == ExternalAgentToolType.codex:
        if approval_policy is None:
            approval_policy = "on-failure"
        if sandbox_policy is None:
            sandbox_policy = "workspace-write"
    settings_block = x.settingsManagedBlock
    if settings_block is None:
        if x.toolType == ExternalAgentToolType.claude_code:
            settings_block = build_default_claude_settings_block()
        elif x.toolType == ExternalAgentToolType.opencode:
            settings_block = build_default_opencode_settings_block()
    config = ExternalAgentConfig(
        name=x.name,
        description=x.description,
        toolType=x.toolType,
        pluginAdapterId=(
            plugin_adapter.adapterId if plugin_adapter is not None else None
        ),
        runMode=x.runMode,
        commandPath=x.commandPath,
        baseUrl=x.baseUrl,
        defaultModel=x.defaultModel,
        sandboxPolicy=sandbox_policy,
        approvalPolicy=approval_policy,
        settingsMode=x.settingsMode,
        settingsSources=x.settingsSources,
        settingsFilePath=x.settingsFilePath,
        settingsAllowSettaEdits=x.settingsAllowSettaEdits,
        settingsManagedBlock=settings_block,
        envVarWhitelist=env_var_whitelist,
        workingDirStrategy=x.workingDirStrategy,
        workingDir=x.workingDir,
    )
    configs.append(config)
    save_external_agent_configs(ctx.state.dbe, configs)
    if config.toolType == ExternalAgentToolType.claude_code:
        write_claude_settings_file(
            config,
            project_root=ctx.state.dbe.path.parent,
        )
    elif config.toolType == ExternalAgentToolType.codex:
        build_codex_settings_file(
            ctx.state.dbe,
            config,
            allowlist=None,
            mcp_url=f"{C.BACKEND}/mcp",
            auth_headers=None,
            system_prompt=None,
            project_root=ctx.state.dbe.path.parent,
        )
    elif config.toolType == ExternalAgentToolType.opencode:
        build_opencode_settings_file(
            ctx.state.dbe,
            config,
            allowlist=None,
            mcp_url=f"{C.BACKEND}/mcp",
            auth_headers=None,
        )
    await ctx.state.wmh_frontend_sender.broadcast_external_agent_configs_update(configs)
    return config


@router.post(Route.UPDATE_EXTERNAL_AGENT_CONFIG)
async def route_update_external_agent_config(
    x: UpdateExternalAgentConfigRequest,
    ctx: RuntimeContextFromRequest,
) -> ExternalAgentConfig:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating external agent configs.")
    plugin_adapter = _validate_plugin_external_agent_selection(
        ctx,
        tool_type=x.config.toolType,
        plugin_adapter_id=x.config.pluginAdapterId,
        run_mode=x.config.runMode,
    )
    env_var_whitelist = sorted(
        {name.strip() for name in x.config.envVarWhitelist if name.strip()}
    )
    updated_config = x.config.model_copy(
        update={
            "pluginAdapterId": (
                plugin_adapter.adapterId if plugin_adapter is not None else None
            ),
            "envVarWhitelist": env_var_whitelist,
            "defaultModel": x.config.defaultModel,
        }
    )
    configs = load_external_agent_configs(ctx.state.dbe)
    for idx, config in enumerate(configs):
        if config.id == updated_config.id:
            configs[idx] = updated_config
            save_external_agent_configs(ctx.state.dbe, configs)
            await ctx.state.wmh_frontend_sender.broadcast_external_agent_configs_update(
                configs
            )
            return updated_config
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
        settaLlmConfigId=x.settaLlmConfigId,
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


@router.get(Route.GET_TRANSCRIPTION_PROFILES)
async def route_get_transcription_profiles(
    ctx: RuntimeContextFromRequest,
) -> list[TranscriptionProfile]:
    await ctx.enforce_llm_allowed()
    profiles = load_transcription_profiles(ctx.state.dbe)
    return _attach_transcription_profiles_capabilities(ctx, profiles=profiles)


@router.post(Route.CREATE_TRANSCRIPTION_PROFILE)
async def route_create_transcription_profile(
    x: CreateTranscriptionProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> TranscriptionProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow creating transcription profiles.")
    transcription_llm_config_id, llm_config = (
        _require_valid_transcription_llm_config_id(ctx, x.transcriptionLlmConfigId)
    )
    _require_valid_transcription_transport_mode(x.transportMode, llm_config)
    profiles = load_transcription_profiles(ctx.state.dbe)
    profile = TranscriptionProfile(
        name=x.name,
        transcriptionLlmConfigId=transcription_llm_config_id,
        transportMode=x.transportMode,
        chunkMs=x.chunkMs,
        supportsRealtimeTranscription=supports_realtime_transcription(llm_config),
        language=x.language,
    )
    profiles.append(profile)
    profiles = _attach_transcription_profiles_capabilities(ctx, profiles=profiles)
    save_transcription_profiles(ctx.state.dbe, profiles)
    await ctx.state.wmh_frontend_sender.broadcast_transcription_profiles_update(
        profiles
    )
    for saved_profile in profiles:
        if saved_profile.id == profile.id:
            return saved_profile
    raise RuntimeError("Created transcription profile missing from saved profiles.")


@router.post(Route.UPDATE_TRANSCRIPTION_PROFILE)
async def route_update_transcription_profile(
    x: UpdateTranscriptionProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> TranscriptionProfile:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating transcription profiles.")
    transcription_llm_config_id, llm_config = (
        _require_valid_transcription_llm_config_id(
            ctx, x.profile.transcriptionLlmConfigId
        )
    )
    _require_valid_transcription_transport_mode(x.profile.transportMode, llm_config)
    profiles = load_transcription_profiles(ctx.state.dbe)
    next_profile = x.profile.model_copy(
        update={
            "transcriptionLlmConfigId": transcription_llm_config_id,
            "supportsRealtimeTranscription": supports_realtime_transcription(
                llm_config
            ),
        }
    )
    for idx, profile in enumerate(profiles):
        if profile.id == next_profile.id:
            profiles[idx] = next_profile
            profiles = _attach_transcription_profiles_capabilities(
                ctx,
                profiles=profiles,
            )
            save_transcription_profiles(ctx.state.dbe, profiles)
            await ctx.state.wmh_frontend_sender.broadcast_transcription_profiles_update(
                profiles
            )
            for saved_profile in profiles:
                if saved_profile.id == next_profile.id:
                    return saved_profile
            raise RuntimeError(
                "Updated transcription profile missing from saved profiles."
            )
    raise HTTPException(status_code=404, detail="Transcription profile not found")


@router.post(Route.DELETE_TRANSCRIPTION_PROFILE)
async def route_delete_transcription_profile(
    x: DeleteTranscriptionProfileRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow deleting transcription profiles.")
    profiles = load_transcription_profiles(ctx.state.dbe)
    for idx, profile in enumerate(profiles):
        if profile.id == x.profileId:
            profiles.pop(idx)
            save_transcription_profiles(ctx.state.dbe, profiles)
            await ctx.state.wmh_frontend_sender.broadcast_transcription_profiles_update(
                profiles
            )
            return None
    raise HTTPException(status_code=404, detail="Transcription profile not found")

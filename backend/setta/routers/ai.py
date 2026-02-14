from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_engine_config_id,
    get_run_project_config_id,
    get_run_sort_key,
)
from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.external_agent_preflight import (
    build_external_agent_preflight_status,
)
from setta.agentic.external_tool_allowlist import build_external_tool_allowlist
from setta.agentic.store import (
    list_agent_runs_by_metadata,
    require_agent_profile,
)
from setta.database.utils import create_new_id
from setta.llm.capabilities_config import (
    get_global_capability_defaults,
    get_project_chat_capability_policy,
    resolve_capability_policy,
    set_project_chat_capability_policy,
)
from setta.llm.skills_catalog import (
    get_skills_catalog,
    load_skill_prompt_blocks_from_catalog,
)
from setta.logging.project_id_route import require_project_context
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineType,
)
from setta.types.capabilities import CapabilityMode
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.routes import Route
from setta.types.section_impls import ChatSectionImpl
from setta.types.websocket import AIFollowToolArgumentsUpdateContent

router = SettaProjectContextAPIRouter()


def _get_llm_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    return list_agent_runs_by_metadata(
        dbe,
        run_type=LLM_CHAT_RUN_TYPE,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )


def _get_external_agent_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    return list_agent_runs_by_metadata(
        dbe,
        run_type=EXTERNAL_AGENT_RUN_TYPE,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )


def _select_latest_run(runs: list[AgentRun]) -> AgentRun | None:
    if not runs:
        return None
    return max(runs, key=get_run_sort_key)


def _ensure_external_chat_id_compatible(
    *,
    dbe,
    chat_id: ID | None,
    engine_config_id: ID,
    project_config_id: ID,
) -> None:
    if chat_id is None:
        return
    llm_runs = _get_llm_chat_runs(dbe=dbe, chat_id=chat_id)
    if llm_runs:
        raise HTTPException(
            status_code=409,
            detail="Chat engine mismatch; start a new chat.",
        )
    external_runs = _get_external_agent_chat_runs(dbe=dbe, chat_id=chat_id)
    if not external_runs:
        return
    for run in external_runs:
        existing_engine = get_run_engine_config_id(run)
        if existing_engine != engine_config_id:
            raise HTTPException(
                status_code=409,
                detail="Chat engine mismatch; start a new chat.",
            )
        existing_project = get_run_project_config_id(run)
        if existing_project != project_config_id:
            raise HTTPException(
                status_code=409,
                detail="Chat project config mismatch; start a new chat.",
            )


def _get_prior_messages_for_engine(
    *,
    dbe,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
) -> list[BaseChatMessageUnion]:
    if engine_type == EngineType.external_agent:
        external_runs = _get_external_agent_chat_runs(
            dbe=dbe,
            chat_id=chat_id,
            project_config_id=project_config_id,
        )
        latest_run = _select_latest_run(external_runs)
        if latest_run is None:
            llm_runs = _get_llm_chat_runs(
                dbe=dbe,
                chat_id=chat_id,
                project_config_id=project_config_id,
            )
            latest_run = _select_latest_run(llm_runs)
    else:
        llm_runs = _get_llm_chat_runs(
            dbe=dbe,
            chat_id=chat_id,
            project_config_id=project_config_id,
        )
        latest_run = _select_latest_run(llm_runs)
    if latest_run is None:
        return []
    return build_chat_state_from_run(latest_run).messages


def _get_latest_run_for_engine(
    *,
    dbe,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
) -> AgentRun | None:
    if engine_type == EngineType.external_agent:
        external_runs = _get_external_agent_chat_runs(
            dbe=dbe,
            chat_id=chat_id,
            project_config_id=project_config_id,
        )
        return _select_latest_run(external_runs)
    llm_runs = _get_llm_chat_runs(
        dbe=dbe,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )
    return _select_latest_run(llm_runs)


def _build_inputs_messages(
    *,
    prior_messages: list[BaseChatMessageUnion],
    message: BaseChatMessageUnionWithDiscriminator,
) -> list[BaseChatMessageUnion]:
    existing_ids = {entry.id for entry in prior_messages}
    if message.id in existing_ids:
        return list(prior_messages)
    return list(prior_messages) + [message]


def _build_branch_messages(
    *,
    prior_messages: list[BaseChatMessageUnion],
    edited_message: BaseChatMessageUnionWithDiscriminator,
    branch_from_message_id: ID,
) -> list[BaseChatMessageUnion]:
    for index, message in enumerate(prior_messages):
        if message.id != branch_from_message_id:
            continue
        updated_message = edited_message.model_copy(
            update={"id": branch_from_message_id}
        )
        return [*prior_messages[:index], updated_message]
    raise KeyError(f"Message {branch_from_message_id} not found in chat history")


def _has_message_id(
    messages: list[BaseChatMessageUnion],
    message_id: ID,
) -> bool:
    return any(message.id == message_id for message in messages)


def _get_run_input_messages(run: AgentRun | None) -> list[BaseChatMessageUnion]:
    if run is None:
        return []
    inputs = run.inputs
    if not inputs:
        return []
    raw_messages = inputs.get("messages")
    if not isinstance(raw_messages, list):
        return []
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


def _resolve_branch_root_chat_id(
    *,
    parent_run: AgentRun | None,
    parent_chat_id: ID,
) -> ID:
    if parent_run and parent_run.inputs:
        raw_root = parent_run.inputs.get("branchRootChatId")
        if isinstance(raw_root, str) and raw_root:
            return ID(raw_root)
        raw_parent = parent_run.inputs.get("branchParentChatId")
        if isinstance(raw_parent, str) and raw_parent:
            return ID(raw_parent)
    return parent_chat_id


def _append_prompt_blocks(base_prompt: str, extra_prompts: list[str]) -> str:
    prompt = base_prompt.strip()
    for extra in extra_prompts:
        normalized = extra.strip()
        if not normalized:
            continue
        if prompt:
            prompt = f"{prompt}\n\n{normalized}"
        else:
            prompt = normalized
    return prompt


def _build_enabled_skills_prompt(skill_blocks: list[str]) -> str | None:
    if not skill_blocks:
        return None
    content = "\n\n".join(skill_blocks).strip()
    if not content:
        return None
    return "## Enabled Skills\nApply the following skills for this chat.\n\n" + content


def _resolve_override_skill_ids(
    override_skill_ids: list[ID] | None,
    known_skill_ids: set[str],
) -> list[str] | None:
    if override_skill_ids is None:
        return None
    deduped_skill_ids: list[str] = []
    seen_skill_ids: set[str] = set()
    for skill_id in override_skill_ids:
        skill_id_str = str(skill_id)
        if skill_id_str not in known_skill_ids:
            raise KeyError(f"Skill '{skill_id_str}' not found")
        if skill_id_str in seen_skill_ids:
            continue
        seen_skill_ids.add(skill_id_str)
        deduped_skill_ids.append(skill_id_str)
    return deduped_skill_ids


def _resolve_capabilities_for_request(
    *,
    dbe,
    llm_config,
    project_config_id: ID,
    section_id: ID | None,
    policy_chat_id: ID | None,
    override_skill_ids: list[ID] | None,
) -> tuple[list[str], list[str] | None, str | None]:
    catalog = get_skills_catalog(dbe)
    known_skill_ids = {entry.id for entry in catalog.skills}
    known_mcp_server_ids = set(llm_config.mcpServers.keys())
    defaults = get_global_capability_defaults(dbe)

    if section_id is not None:
        project_state_backend = dbe.read_project_required()
        project_state = convert_backend_to_single_config(
            project_state_backend,
            project_config_id,
        )
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        )
        policy = section_impl.capabilityPolicy
    else:
        policy = get_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=policy_chat_id,
        )

    enabled_skill_ids, enabled_mcp_server_ids = resolve_capability_policy(
        policy,
        defaults=defaults,
        known_skill_ids=known_skill_ids,
        known_mcp_server_ids=known_mcp_server_ids,
    )
    # Empty MCP selections should not disable MCP by accident when the policy is
    # inherit/custom. Keep explicit empty override only for disabled mode.
    enabled_mcp_server_ids_override: list[str] | None
    if enabled_mcp_server_ids:
        enabled_mcp_server_ids_override = enabled_mcp_server_ids
    elif policy.mode == CapabilityMode.disabled:
        enabled_mcp_server_ids_override = []
    else:
        enabled_mcp_server_ids_override = None
    resolved_override_skill_ids = _resolve_override_skill_ids(
        override_skill_ids,
        known_skill_ids,
    )
    if resolved_override_skill_ids is not None:
        enabled_skill_ids = resolved_override_skill_ids
    skill_blocks = load_skill_prompt_blocks_from_catalog(catalog, enabled_skill_ids)
    skills_prompt = _build_enabled_skills_prompt(skill_blocks)
    return enabled_skill_ids, enabled_mcp_server_ids_override, skills_prompt


class GetLLMResponseRequest(BaseModel):
    chatId: ID | None
    message: BaseChatMessageUnionWithDiscriminator
    engineConfigId: ID
    agentProfileId: ID | None = None
    thinking: bool
    projectConfigId: ID
    sectionId: ID | None = None
    allowUnscoped: bool = False
    branchParentChatId: ID | None = None
    branchFromMessageId: ID | None = None
    overrideSkillIds: list[ID] | None = Field(
        default=None,
        description=(
            "Optional one-shot skill override for this request. "
            "When provided, project/section skill policy is ignored for skills."
        ),
    )
    appSpecStreamingEnabled: bool = Field(
        default=False,
        description=(
            "Whether the UI is configured to stream app spec patches for live preview."
        ),
    )


class GetLLMChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetLLMChatRequestResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    llmConfig: LLMConfig


class GetExternalAgentChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetExternalAgentChatResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    toolCallArguments: dict[str, str] = Field(default_factory=dict)


class StopLLMChatRequest(BaseModel):
    chatId: ID


class GetAIFollowSnapshotRequest(BaseModel):
    projectConfigId: ID


@router.post(Route.GET_LLM_RESPONSE)
@require_project_context()
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    ctx: RuntimeContextFromRequest,
) -> str | None:
    await ctx.enforce_llm_allowed()
    if x.sectionId is None and not x.allowUnscoped:
        raise HTTPException(
            status_code=400,
            detail="sectionId is required unless allowUnscoped is true.",
        )
    if x.sectionId is not None and x.allowUnscoped:
        raise HTTPException(
            status_code=400,
            detail="allowUnscoped requires sectionId to be omitted.",
        )
    is_branch_request = (
        x.branchParentChatId is not None or x.branchFromMessageId is not None
    )
    if is_branch_request:
        if x.branchParentChatId is None or x.branchFromMessageId is None:
            raise HTTPException(
                status_code=400,
                detail="Branch edits require branchParentChatId and branchFromMessageId.",
            )
        chat_id = create_new_id()
    else:
        chat_id = x.chatId or create_new_id()
    resolved = resolve_engine_config(
        ctx.state.dbe, ctx.state.agent_runner.config, x.engineConfigId
    )
    prior_messages: list[BaseChatMessageUnion] = []
    parent_run: AgentRun | None = None
    if is_branch_request:
        parent_run = _get_latest_run_for_engine(
            dbe=ctx.state.dbe,
            engine_type=resolved.engine_config.engineType,
            chat_id=x.branchParentChatId,
            project_config_id=x.projectConfigId,
        )
        if parent_run is not None:
            prior_messages = build_chat_state_from_run(parent_run).messages
            if not _has_message_id(prior_messages, x.branchFromMessageId):
                prior_messages = _get_run_input_messages(parent_run)
        try:
            combined_messages = _build_branch_messages(
                prior_messages=prior_messages,
                edited_message=x.message,
                branch_from_message_id=x.branchFromMessageId,
            )
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail=(f"Message {x.branchFromMessageId} not found in chat history"),
            ) from exc
    else:
        if x.chatId is not None:
            prior_messages = _get_prior_messages_for_engine(
                dbe=ctx.state.dbe,
                engine_type=resolved.engine_config.engineType,
                chat_id=chat_id,
                project_config_id=x.projectConfigId,
            )
        combined_messages = _build_inputs_messages(
            prior_messages=prior_messages,
            message=x.message,
        )
    profile: AgentProfile | None = None
    if x.agentProfileId is not None:
        try:
            profile = require_agent_profile(ctx.state.dbe, x.agentProfileId)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    capability_policy_chat_id = x.branchParentChatId if is_branch_request else x.chatId
    try:
        enabled_skill_ids, enabled_mcp_server_ids, skills_prompt = (
            _resolve_capabilities_for_request(
                dbe=ctx.state.dbe,
                llm_config=ctx.state.agent_runner.config,
                project_config_id=x.projectConfigId,
                section_id=x.sectionId,
                policy_chat_id=capability_policy_chat_id,
                override_skill_ids=x.overrideSkillIds,
            )
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if x.sectionId is None and capability_policy_chat_id != chat_id:
        seed_policy = get_project_chat_capability_policy(
            ctx.state.dbe,
            project_config_id=x.projectConfigId,
            chat_id=capability_policy_chat_id,
        )
        set_project_chat_capability_policy(
            ctx.state.dbe,
            project_config_id=x.projectConfigId,
            chat_id=chat_id,
            policy=seed_policy,
        )

    app_generation_mode_prompt: str | None = None
    if x.appSpecStreamingEnabled:
        app_generation_mode_prompt = (
            "## App spec generation mode\n"
            "- streamingPreview: enabled\n"
            "- If you are generating/updating the App spec (json-render):\n"
            "  - Use `setta__stream_app_definition` and stream patches into its `patches` string arg.\n"
            "  - For updates, omit `baseAppSpec` to patch the currently stored app spec (or pass `baseAppSpec` explicitly).\n"
        )
    if resolved.engine_config.engineType == EngineType.setta_llm:
        if ctx.state.agent_runner.disabled:
            raise HTTPException(status_code=503, detail="Agent runner is not available")
        if profile is None:
            profile = AgentProfile(
                name="Managed chat",
                description="",
                systemPrompt="",
                engineConfigId=x.engineConfigId,
            )
        combined_system_prompt = _append_prompt_blocks(
            profile.systemPrompt or "",
            [
                app_generation_mode_prompt or "",
                skills_prompt or "",
            ],
        )
        profile = profile.model_copy(
            update={
                "engineConfigId": x.engineConfigId,
                "systemPrompt": combined_system_prompt,
            }
        )
        inputs = {
            "chatId": str(chat_id),
            "projectConfigId": str(x.projectConfigId),
            "thinking": x.thinking,
            "engineConfigId": str(x.engineConfigId),
            "runType": LLM_CHAT_RUN_TYPE,
            "messages": [
                message.model_dump(mode="json") for message in combined_messages
            ],
            "enabledSkillIds": enabled_skill_ids,
        }
        if enabled_mcp_server_ids is not None:
            inputs["enabledMcpServerIds"] = enabled_mcp_server_ids
        if is_branch_request:
            branch_root_chat_id = _resolve_branch_root_chat_id(
                parent_run=parent_run,
                parent_chat_id=x.branchParentChatId,
            )
            inputs["branchParentChatId"] = str(x.branchParentChatId)
            inputs["branchFromMessageId"] = str(x.branchFromMessageId)
            inputs["branchRootChatId"] = str(branch_root_chat_id)
            inputs["branchCreatedAt"] = int(
                datetime.now(timezone.utc).timestamp() * 1000
            )
        if x.sectionId is not None:
            inputs["sectionId"] = str(x.sectionId)
        if x.allowUnscoped:
            inputs["allowUnscoped"] = True
        ctx.state.agent_runner.start_run(profile, inputs)
        return chat_id
    if resolved.engine_config.engineType == EngineType.external_agent:
        runner = ctx.state.external_agent_runner
        if runner.disabled:
            raise HTTPException(
                status_code=503, detail="External agent runner is not available"
            )
        _ensure_external_chat_id_compatible(
            dbe=ctx.state.dbe,
            chat_id=x.branchParentChatId if is_branch_request else x.chatId,
            engine_config_id=x.engineConfigId,
            project_config_id=x.projectConfigId,
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
        if profile is not None and profile.toolAllowlist:
            _, error = build_external_tool_allowlist(
                profile.toolAllowlist,
                server_id=SETTA_MCP_SERVER_ID,
            )
            if error:
                raise HTTPException(status_code=400, detail=error)
        if skills_prompt:
            if profile is None:
                profile = AgentProfile(
                    name="External chat",
                    description="",
                    systemPrompt=skills_prompt,
                    engineConfigId=x.engineConfigId,
                )
            else:
                profile = profile.model_copy(
                    update={
                        "systemPrompt": _append_prompt_blocks(
                            profile.systemPrompt or "",
                            [skills_prompt],
                        )
                    }
                )
        inputs = {
            "chatId": str(chat_id),
            "projectConfigId": str(x.projectConfigId),
            "thinking": x.thinking,
            "engineConfigId": str(x.engineConfigId),
            "messages": [
                message.model_dump(mode="json") for message in combined_messages
            ],
            "enabledSkillIds": enabled_skill_ids,
        }
        if enabled_mcp_server_ids is not None:
            inputs["enabledMcpServerIds"] = enabled_mcp_server_ids
        if is_branch_request:
            branch_root_chat_id = _resolve_branch_root_chat_id(
                parent_run=parent_run,
                parent_chat_id=x.branchParentChatId,
            )
            inputs["branchParentChatId"] = str(x.branchParentChatId)
            inputs["branchFromMessageId"] = str(x.branchFromMessageId)
            inputs["branchRootChatId"] = str(branch_root_chat_id)
            inputs["branchCreatedAt"] = int(
                datetime.now(timezone.utc).timestamp() * 1000
            )
        if x.sectionId is not None:
            inputs["sectionId"] = str(x.sectionId)
        if x.allowUnscoped:
            inputs["allowUnscoped"] = True
        try:
            runner.start_run(x.engineConfigId, external_config, profile, inputs)
        except KeyError as exc:
            raise HTTPException(
                status_code=409,
                detail="Chat engine mismatch; start a new chat.",
            ) from exc
        return chat_id
    raise HTTPException(status_code=400, detail="Unsupported engine config")
    return chat_id


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(dbe=ctx.state.dbe, chat_id=x.chatId)
    running_runs = [run for run in runs if run.status == AgentRunStatus.running]
    latest_run = _select_latest_run(running_runs)
    if latest_run is None:
        return None
    await ctx.state.agent_runner.stop_run(latest_run.id)
    return None


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetLLMChatRequestResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    state = build_chat_state_from_run(latest_run)
    if latest_run.status == AgentRunStatus.running:
        live_state = ctx.state.agent_runner.get_live_chat_state(latest_run.id)
        if live_state is not None:
            state = live_state
    engine_config_id = get_run_engine_config_id(latest_run)
    if not engine_config_id:
        raise HTTPException(status_code=500, detail="Chat engine config not found")
    resolved = resolve_engine_config(
        ctx.state.dbe, ctx.state.agent_runner.config, engine_config_id
    )
    if resolved.engine_config.engineType != EngineType.setta_llm:
        raise HTTPException(status_code=500, detail="Chat engine is not internal")
    if resolved.llm_config is None:
        raise HTTPException(status_code=500, detail="Chat LLM config not found")
    return GetLLMChatRequestResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        llmConfig=resolved.llm_config,
    )


@router.post(Route.GET_EXTERNAL_AGENT_CHAT)
async def route_get_external_agent_chat(
    x: GetExternalAgentChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetExternalAgentChatResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_external_agent_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    state = build_chat_state_from_run(latest_run)
    if latest_run.status == AgentRunStatus.running:
        runner = getattr(ctx.state, "external_agent_runner", None)
        if runner is not None and not runner.disabled:
            live_state = runner.get_live_chat_state(latest_run.id)
            if live_state is not None:
                state = live_state
    return GetExternalAgentChatResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        toolCallArguments=state.toolCallArguments,
    )


@router.post(Route.GET_AI_FOLLOW_SNAPSHOT)
@require_project_context()
async def route_get_ai_follow_snapshot(
    x: GetAIFollowSnapshotRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    await ctx.enforce_llm_allowed()
    snapshot = ctx.state.agent_runner.get_ai_follow_snapshot(x.projectConfigId)
    external_runner = ctx.state.external_agent_runner
    if external_runner and not external_runner.disabled:
        snapshot.extend(external_runner.get_ai_follow_snapshot(x.projectConfigId))
    return snapshot

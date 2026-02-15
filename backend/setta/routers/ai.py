from datetime import datetime, timezone
from typing import Literal

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
from setta.logging.project_id_route import require_project_context
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.routers.app_generation_limits import (
    MAX_REFERENCE_IMAGE_NOTES_CHARS,
    MAX_REFERENCE_IMAGE_URL_CHARS,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineType,
)
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.routes import Route
from setta.types.websocket import AIFollowToolArgumentsUpdateContent

router = SettaProjectContextAPIRouter()

AppGenerationMode = Literal[
    "json_render",
    "json_render_with_image",
    "prompt_builder",
    "mcp_server",
]


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
) -> list[AgentRun]:
    if chat_id is None:
        return []
    llm_runs = _get_llm_chat_runs(dbe=dbe, chat_id=chat_id)
    if llm_runs:
        raise HTTPException(
            status_code=409,
            detail="Chat engine mismatch; start a new chat.",
        )
    external_runs = _get_external_agent_chat_runs(dbe=dbe, chat_id=chat_id)
    if not external_runs:
        return []
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
    return external_runs


def _get_prior_messages_for_engine(
    *,
    dbe,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
    external_runs: list[AgentRun] | None = None,
) -> list[BaseChatMessageUnion]:
    if engine_type == EngineType.external_agent:
        if external_runs is None:
            raise ValueError(
                "external_runs is required when loading prior messages for external-agent chats."
            )
        latest_run = _select_latest_run(external_runs)
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


def _build_app_generation_mode_prompt(
    *,
    mode: AppGenerationMode | None,
    app_spec_streaming_enabled: bool,
    reference_image_url: str | None,
    reference_image_notes: str | None,
) -> str | None:
    if mode is None:
        return None

    lines = [
        "## App spec generation mode",
        f"- mode: {mode or 'unspecified'}",
        (
            "- streamingPreview: enabled"
            if app_spec_streaming_enabled
            else "- streamingPreview: disabled"
        ),
    ]

    if mode in (None, "json_render", "json_render_with_image", "prompt_builder"):
        lines.extend(
            [
                "- If you are generating/updating the App spec (json-render):",
                "  - Use catalog-compatible components only.",
                "  - Persist via Setta app tools.",
            ]
        )
        if app_spec_streaming_enabled:
            lines.extend(
                [
                    "  - Use `setta__stream_app_definition` and stream patches into its `patches` string arg.",
                    "  - For updates, omit `baseAppSpec` to patch the currently stored app spec (or pass `baseAppSpec` explicitly).",
                ]
            )
        else:
            lines.extend(
                [
                    "  - Prefer `setta__set_app_definition` with the full UITree appSpec payload.",
                    "  - Optionally call `setta__validate_app_definition` first and fix errors before persisting.",
                ]
            )

    if mode == "json_render_with_image":
        lines.extend(
            [
                "- Prioritize reference-image fidelity in this order: layout structure, spacing rhythm, typography scale, then color intent.",
                "- If exact parity is impossible with catalog constraints, preserve hierarchy and explain the closest approximation.",
            ]
        )

    if mode == "prompt_builder":
        lines.extend(
            [
                "- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
            ]
        )

    if mode == "mcp_server":
        lines.extend(
            [
                "- MCP-server flow: use MCP tools as the source of truth for design artifacts when available.",
                "- For Figma-oriented requests, support both paths:",
                "  - Pull an existing Figma design into a JSON-render appSpec.",
                "  - Generate/update in Figma first, then pull the resulting design back into Setta.",
            ]
        )
        if app_spec_streaming_enabled:
            lines.append(
                "- After MCP design retrieval, persist into Setta via `setta__stream_app_definition`."
            )
        else:
            lines.append(
                "- After MCP design retrieval, persist into Setta via `setta__set_app_definition`."
            )

    if mode == "json_render_with_image" and reference_image_url:
        lines.extend(
            [
                f"- Reference image URL: {reference_image_url}",
                "- Use this image as layout/style guidance when composing the app spec.",
            ]
        )
        if reference_image_notes:
            lines.append(f"- Reference image notes: {reference_image_notes}")

    return "\n".join(lines)


def _merge_app_generation_system_prompt(
    *,
    existing_system_prompt: str,
    app_generation_mode_prompt: str | None,
) -> str:
    if app_generation_mode_prompt is None:
        return existing_system_prompt
    normalized_existing_prompt = existing_system_prompt.strip()
    normalized_mode_prompt = app_generation_mode_prompt.strip()
    if normalized_existing_prompt:
        return f"{normalized_existing_prompt}\n\n{normalized_mode_prompt}"
    return normalized_mode_prompt


def _build_chat_profile_with_app_generation_mode(
    *,
    profile: AgentProfile | None,
    engine_config_id: ID,
    app_generation_mode_prompt: str | None,
    default_name: str,
    require_profile: bool,
) -> AgentProfile | None:
    if profile is None and (require_profile or app_generation_mode_prompt is not None):
        profile = AgentProfile(
            name=default_name,
            description="",
            systemPrompt="",
            engineConfigId=engine_config_id,
        )
    if profile is None:
        return None
    combined_system_prompt = _merge_app_generation_system_prompt(
        existing_system_prompt=profile.systemPrompt or "",
        app_generation_mode_prompt=app_generation_mode_prompt,
    )
    return profile.model_copy(
        update={
            "engineConfigId": engine_config_id,
            "systemPrompt": combined_system_prompt,
        }
    )


def _normalize_reference_image_inputs(
    *,
    reference_image_url: str | None,
    reference_image_notes: str | None,
) -> tuple[str | None, str | None]:
    normalized_url = (
        reference_image_url.strip() if isinstance(reference_image_url, str) else ""
    )
    normalized_notes = (
        reference_image_notes.strip() if isinstance(reference_image_notes, str) else ""
    )
    if len(normalized_url) > MAX_REFERENCE_IMAGE_URL_CHARS:
        raise HTTPException(
            status_code=400,
            detail="appGenerationReferenceImageUrl is too large. Reduce it or omit it.",
        )
    if len(normalized_notes) > MAX_REFERENCE_IMAGE_NOTES_CHARS:
        raise HTTPException(
            status_code=400,
            detail="appGenerationReferenceImageNotes is too large. Reduce it or omit it.",
        )
    return (
        normalized_url if normalized_url else None,
        normalized_notes if normalized_notes else None,
    )


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
    appSpecStreamingEnabled: bool = Field(
        default=False,
        description=(
            "Whether the UI is configured to stream app spec patches for live preview."
        ),
    )
    appGenerationMode: AppGenerationMode | None = Field(
        default=None,
        description="Optional app generation mode selected in the UI.",
    )
    appGenerationReferenceImageUrl: str | None = Field(
        default=None,
        description="Optional reference image URL for app generation fidelity.",
    )
    appGenerationReferenceImageNotes: str | None = Field(
        default=None,
        description="Optional notes describing reference-image fidelity goals.",
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
    external_runs_for_chat_id: list[AgentRun] | None = None
    if resolved.engine_config.engineType == EngineType.external_agent:
        external_runs_for_chat_id = _ensure_external_chat_id_compatible(
            dbe=ctx.state.dbe,
            chat_id=x.branchParentChatId if is_branch_request else x.chatId,
            engine_config_id=x.engineConfigId,
            project_config_id=x.projectConfigId,
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
            if (
                resolved.engine_config.engineType == EngineType.external_agent
                and external_runs_for_chat_id is None
            ):
                raise RuntimeError(
                    "Expected prefetched external runs before loading external-agent chat history."
                )
            prior_messages = _get_prior_messages_for_engine(
                dbe=ctx.state.dbe,
                engine_type=resolved.engine_config.engineType,
                chat_id=chat_id,
                project_config_id=x.projectConfigId,
                external_runs=external_runs_for_chat_id,
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

    resolved_mode = x.appGenerationMode
    normalized_reference_image_url, normalized_reference_image_notes = (
        _normalize_reference_image_inputs(
            reference_image_url=x.appGenerationReferenceImageUrl,
            reference_image_notes=x.appGenerationReferenceImageNotes,
        )
    )
    if resolved_mode == "json_render_with_image":
        reference_image_url = normalized_reference_image_url
        reference_image_notes = normalized_reference_image_notes
    else:
        reference_image_url, reference_image_notes = (None, None)
    app_generation_mode_prompt = _build_app_generation_mode_prompt(
        mode=resolved_mode,
        app_spec_streaming_enabled=x.appSpecStreamingEnabled,
        reference_image_url=reference_image_url,
        reference_image_notes=reference_image_notes,
    )
    if resolved.engine_config.engineType == EngineType.setta_llm:
        if ctx.state.agent_runner.disabled:
            raise HTTPException(status_code=503, detail="Agent runner is not available")
        profile = _build_chat_profile_with_app_generation_mode(
            profile=profile,
            engine_config_id=x.engineConfigId,
            app_generation_mode_prompt=app_generation_mode_prompt,
            default_name="Managed chat",
            require_profile=True,
        )
        if profile is None:
            raise HTTPException(status_code=500, detail="Managed profile not found")
        inputs = {
            "chatId": str(chat_id),
            "projectConfigId": str(x.projectConfigId),
            "thinking": x.thinking,
            "engineConfigId": str(x.engineConfigId),
            "runType": LLM_CHAT_RUN_TYPE,
            "messages": [
                message.model_dump(mode="json") for message in combined_messages
            ],
        }
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
        external_config = resolved.external_agent_config
        if external_config is None:
            raise HTTPException(
                status_code=500, detail="External agent config not found"
            )
        plugin_external_agent_adapters = runner.get_plugin_external_agent_adapters()
        status = build_external_agent_preflight_status(
            ctx.state.dbe,
            external_config,
            plugin_external_agent_adapters=plugin_external_agent_adapters,
        )
        if not status.available:
            issues = "; ".join(status.issues) if status.issues else "preflight failed"
            raise HTTPException(
                status_code=503,
                detail=f"External agent config is not available: {issues}",
            )
        profile = _build_chat_profile_with_app_generation_mode(
            profile=profile,
            engine_config_id=x.engineConfigId,
            app_generation_mode_prompt=app_generation_mode_prompt,
            default_name="External chat",
            require_profile=False,
        )
        if profile is not None and profile.toolAllowlist:
            _, error = build_external_tool_allowlist(
                profile.toolAllowlist,
                server_id=SETTA_MCP_SERVER_ID,
            )
            if error:
                raise HTTPException(status_code=400, detail=error)
        inputs = {
            "chatId": str(chat_id),
            "projectConfigId": str(x.projectConfigId),
            "thinking": x.thinking,
            "engineConfigId": str(x.engineConfigId),
            "messages": [
                message.model_dump(mode="json") for message in combined_messages
            ],
        }
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
        runner = ctx.state.external_agent_runner
        if not runner.disabled:
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

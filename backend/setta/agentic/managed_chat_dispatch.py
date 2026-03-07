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
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.external_tool_allowlist import build_external_tool_allowlist
from setta.agentic.store import (
    list_agent_runs_by_metadata,
    require_agent_profile,
)
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.frontend_affinity_token import (
    FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE,
    parse_frontend_affinity_token,
)
from setta.llm.agent_runner import AgentRunner
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.agentic import AgentProfile, AgentRun, EngineType
from setta.types.external_agents import ExternalAgentToolType
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatPermissionMode

AppGenerationMode = Literal[
    "json_render",
    "json_render_with_image",
    "prompt_builder",
    "mcp_server",
]

_REQUIRED_ERROR_CHECK_PROMPT = (
    "## Required completion gate for create/scaffold work\n"
    "- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n"
    "- Report check outcomes explicitly as pass/fail before any completion claim.\n"
    "- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)
MAX_REFERENCE_IMAGE_URL_CHARS = 4096
MAX_REFERENCE_IMAGE_NOTES_CHARS = 100_000


def require_frontend_affinity_token(value: str | None) -> str | None:
    try:
        return parse_frontend_affinity_token(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE,
        ) from exc


class ManagedChatDispatchRequestBase(BaseModel, extra="forbid"):
    chatId: ID | None
    continueFromChatId: ID | None = None
    message: BaseChatMessageUnionWithDiscriminator
    engineConfigId: ID
    agentProfileId: ID | None = None
    thinking: bool
    projectConfigId: ID
    sectionId: ID | None = None
    frontendAffinityToken: str | None = None
    allowUnscoped: bool = False
    branchParentChatId: ID | None = None
    branchFromMessageId: ID | None = None
    appSpecStreamingEnabled: bool = Field(
        default=False,
        description=(
            "Whether the UI is configured to stream app spec patches for live preview."
        ),
    )
    permissionMode: ChatPermissionMode
    searchEnabled: bool
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


class ManagedChatDispatchRequest(ManagedChatDispatchRequestBase):
    extraRunInputs: dict[str, object] = Field(
        default_factory=dict,
        description="Internal-only additional run input fields appended to the child run.",
    )


class ManagedChatDispatchResponse(BaseModel, extra="forbid"):
    chatId: ID
    runId: ID
    engineType: EngineType
    sectionId: ID | None = None


def _get_extra_run_inputs(x: ManagedChatDispatchRequestBase) -> dict[str, object]:
    raw_extra_run_inputs = getattr(x, "extraRunInputs", {})
    if not isinstance(raw_extra_run_inputs, dict):
        raise TypeError("Managed chat dispatch extraRunInputs must be a dict.")
    return raw_extra_run_inputs


def _combine_prompt_sections(*sections: str | None) -> str:
    parts: list[str] = []
    for section in sections:
        if section is None:
            continue
        stripped = section.strip()
        if not stripped:
            continue
        parts.append(stripped)
    return "\n\n".join(parts).strip()


def _build_execution_policy_prompt(
    permission_mode: ChatPermissionMode,
    search_enabled: bool,
) -> str:
    lines = [
        "## Runtime execution settings",
        f"- permissionMode: {permission_mode.value}",
        f"- searchEnabled: {'true' if search_enabled else 'false'}",
    ]
    if not search_enabled:
        lines.append(
            "- Search is disabled for this run. Do not rely on search tools; use existing context and local tools only."
        )
    return "\n".join(lines)


def _resolve_external_approval_policy_override(
    permission_mode: ChatPermissionMode,
    tool_type: ExternalAgentToolType,
) -> str | None:
    if permission_mode == ChatPermissionMode.config_toml_custom:
        return None
    if tool_type == ExternalAgentToolType.claude_code:
        if permission_mode == ChatPermissionMode.minimal:
            return "default"
        if permission_mode == ChatPermissionMode.yolo:
            return "bypassPermissions"
        return None
    if tool_type == ExternalAgentToolType.opencode:
        if permission_mode == ChatPermissionMode.minimal:
            return "ask"
        if permission_mode == ChatPermissionMode.yolo:
            return "allow"
        return None
    if permission_mode == ChatPermissionMode.minimal:
        return "on-request"
    if permission_mode == ChatPermissionMode.yolo:
        return "never"
    return None


def _resolve_external_sandbox_policy_override(
    permission_mode: ChatPermissionMode,
    tool_type: ExternalAgentToolType,
) -> str | None:
    if permission_mode == ChatPermissionMode.config_toml_custom:
        return None
    if tool_type != ExternalAgentToolType.codex:
        return None
    if permission_mode == ChatPermissionMode.minimal:
        return "workspace-write"
    if permission_mode == ChatPermissionMode.yolo:
        return "danger-full-access"
    return None


def _apply_external_reasoning_defaults(
    *,
    inputs: dict[str, object],
    tool_type: ExternalAgentToolType,
    thinking: bool,
) -> None:
    if tool_type != ExternalAgentToolType.codex:
        return
    if "effort" not in inputs:
        inputs["effort"] = "high" if thinking else "low"
    if "summary" not in inputs:
        inputs["summary"] = "auto" if thinking else "none"


def _merge_extra_run_inputs(
    inputs: dict[str, object],
    extra_run_inputs: dict[str, object],
) -> dict[str, object]:
    if not extra_run_inputs:
        return inputs
    collisions = sorted(key for key in extra_run_inputs if key in inputs)
    if collisions:
        raise ValueError(
            "Managed chat dispatch extraRunInputs collided with reserved inputs: "
            + ", ".join(collisions)
        )
    merged = dict(inputs)
    merged.update(extra_run_inputs)
    return merged


def _get_llm_chat_runs(
    *,
    dbe: DBE,
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
    dbe: DBE,
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
    dbe: DBE,
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
    dbe: DBE,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
    external_runs: list[AgentRun] | None = None,
) -> list[BaseChatMessageUnion]:
    if engine_type == EngineType.external_agent:
        if external_runs is None:
            external_runs = _get_external_agent_chat_runs(
                dbe=dbe,
                chat_id=chat_id,
                project_config_id=project_config_id,
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


def _get_prior_messages_for_seed_chat(
    *,
    dbe: DBE,
    chat_id: ID,
    project_config_id: ID | None,
) -> list[BaseChatMessageUnion]:
    runs = list_agent_runs_by_metadata(
        dbe,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        raise KeyError(f"Continuation source chat {chat_id} not found.")
    return build_chat_state_from_run(latest_run).messages


def _get_latest_run_for_engine(
    *,
    dbe: DBE,
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

    if mode in ("json_render", "json_render_with_image", "prompt_builder"):
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


class ManagedChatDispatcher:
    def __init__(
        self,
        *,
        dbe: DBE,
        agent_runner: AgentRunner,
        external_agent_runner: ExternalAgentRunner,
    ) -> None:
        self.dbe = dbe
        self.agent_runner = agent_runner
        self.external_agent_runner = external_agent_runner

    def dispatch(
        self,
        x: ManagedChatDispatchRequestBase,
        *,
        project_state: ProjectStateSingleConfig | None = None,
    ) -> ManagedChatDispatchResponse:
        extra_run_inputs = _get_extra_run_inputs(x)
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
        if is_branch_request and x.continueFromChatId is not None:
            raise HTTPException(
                status_code=400,
                detail="continueFromChatId cannot be used with branch edits.",
            )
        if x.chatId is not None and x.continueFromChatId is not None:
            raise HTTPException(
                status_code=400,
                detail="continueFromChatId requires chatId to be omitted.",
            )
        if is_branch_request:
            if x.branchParentChatId is None or x.branchFromMessageId is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Branch edits require branchParentChatId and branchFromMessageId."
                    ),
                )
            chat_id = create_new_id()
        else:
            chat_id = x.chatId or create_new_id()
        resolved = resolve_engine_config(
            self.dbe, self.agent_runner.config, x.engineConfigId
        )
        external_runs_for_chat_id: list[AgentRun] | None = None
        if resolved.engine_config.engineType == EngineType.external_agent:
            external_runs_for_chat_id = _ensure_external_chat_id_compatible(
                dbe=self.dbe,
                chat_id=x.branchParentChatId if is_branch_request else x.chatId,
                engine_config_id=x.engineConfigId,
                project_config_id=x.projectConfigId,
            )
        prior_messages: list[BaseChatMessageUnion] = []
        parent_run: AgentRun | None = None
        if is_branch_request:
            parent_run = _get_latest_run_for_engine(
                dbe=self.dbe,
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
                    detail=(
                        f"Message {x.branchFromMessageId} not found in chat history"
                    ),
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
                    dbe=self.dbe,
                    engine_type=resolved.engine_config.engineType,
                    chat_id=chat_id,
                    project_config_id=x.projectConfigId,
                    external_runs=external_runs_for_chat_id,
                )
            elif x.continueFromChatId is not None:
                try:
                    prior_messages = _get_prior_messages_for_seed_chat(
                        dbe=self.dbe,
                        chat_id=x.continueFromChatId,
                        project_config_id=x.projectConfigId,
                    )
                except KeyError as exc:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "message": (
                                f"Continuation source chat {x.continueFromChatId} not found."
                            ),
                            "errorCode": "source_chat_not_found",
                        },
                    ) from exc
            combined_messages = _build_inputs_messages(
                prior_messages=prior_messages,
                message=x.message,
            )
        profile: AgentProfile | None = None
        if x.agentProfileId is not None:
            try:
                profile = require_agent_profile(self.dbe, x.agentProfileId)
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
        execution_policy_prompt = _build_execution_policy_prompt(
            x.permissionMode,
            x.searchEnabled,
        )
        normalized_frontend_affinity_token = require_frontend_affinity_token(
            x.frontendAffinityToken
        )
        if resolved.engine_config.engineType == EngineType.setta_llm:
            if self.agent_runner.disabled:
                raise HTTPException(
                    status_code=503, detail="Agent runner is not available"
                )
            if profile is None:
                profile = AgentProfile(
                    name="Managed chat",
                    description="",
                    systemPrompt="",
                    engineConfigId=x.engineConfigId,
                )
            combined_system_prompt = _combine_prompt_sections(
                profile.systemPrompt or "",
                app_generation_mode_prompt,
                execution_policy_prompt,
                _REQUIRED_ERROR_CHECK_PROMPT,
            )
            profile = profile.model_copy(
                update={
                    "engineConfigId": x.engineConfigId,
                    "systemPrompt": combined_system_prompt,
                }
            )
            inputs: dict[str, object] = {
                "chatId": str(chat_id),
                "projectConfigId": str(x.projectConfigId),
                "thinking": x.thinking,
                "engineConfigId": str(x.engineConfigId),
                "runType": LLM_CHAT_RUN_TYPE,
                "permissionMode": x.permissionMode.value,
                "searchEnabled": x.searchEnabled,
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
            if normalized_frontend_affinity_token is not None:
                inputs["frontendAffinityToken"] = normalized_frontend_affinity_token
            inputs = _merge_extra_run_inputs(inputs, extra_run_inputs)
            run = self.agent_runner.start_run(
                profile,
                inputs,
                project_state=project_state,
            )
            return ManagedChatDispatchResponse(
                chatId=chat_id,
                runId=run.id,
                engineType=resolved.engine_config.engineType,
                sectionId=x.sectionId,
            )
        if resolved.engine_config.engineType == EngineType.external_agent:
            runner = self.external_agent_runner
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
                self.dbe,
                external_config,
                plugin_external_agent_adapters=plugin_external_agent_adapters,
            )
            if not status.available:
                issues = (
                    "; ".join(status.issues) if status.issues else "preflight failed"
                )
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
                "permissionMode": x.permissionMode.value,
                "searchEnabled": x.searchEnabled,
                "messages": [
                    message.model_dump(mode="json") for message in combined_messages
                ],
            }
            _apply_external_reasoning_defaults(
                inputs=inputs,
                tool_type=external_config.toolType,
                thinking=x.thinking,
            )
            approval_policy_override = _resolve_external_approval_policy_override(
                x.permissionMode,
                external_config.toolType,
            )
            if approval_policy_override is not None:
                inputs["approvalPolicy"] = approval_policy_override
            sandbox_policy_override = _resolve_external_sandbox_policy_override(
                x.permissionMode,
                external_config.toolType,
            )
            if sandbox_policy_override is not None:
                inputs["sandboxPolicy"] = sandbox_policy_override
            inputs["systemPrompt"] = _combine_prompt_sections(
                execution_policy_prompt,
                _REQUIRED_ERROR_CHECK_PROMPT,
            )
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
            if normalized_frontend_affinity_token is not None:
                inputs["frontendAffinityToken"] = normalized_frontend_affinity_token
            inputs = _merge_extra_run_inputs(inputs, extra_run_inputs)
            try:
                run = runner.start_run(
                    x.engineConfigId, external_config, profile, inputs
                )
            except KeyError as exc:
                raise HTTPException(
                    status_code=409,
                    detail="Chat engine mismatch; start a new chat.",
                ) from exc
            return ManagedChatDispatchResponse(
                chatId=chat_id,
                runId=run.id,
                engineType=resolved.engine_config.engineType,
                sectionId=x.sectionId,
            )
        raise HTTPException(status_code=400, detail="Unsupported engine config")

from typing import Any

from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent

from setta.agentic.agentic_scope import resolve_agentic_scope
from setta.agentic.chat_continuity import get_prior_messages_for_chat_engine
from setta.agentic.chat_view import (
    build_chat_state_from_run,
)
from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.store import require_agent_profile
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import SetChatSectionChatIdRequest
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.external_agents import ExternalAgentToolType
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.section_impls import ChatPermissionMode, ChatSectionImpl

LINKED_CHAT_TOOL_NAME = "invoke_linked_chat"
MAX_LINKED_CHAT_INVOCATION_DEPTH = 1
MAX_LINKED_CHAT_RESULT_CHARS = 4_000
_REQUIRED_ERROR_CHECK_PROMPT = (
    "## Required completion gate for create/scaffold work\n"
    "- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n"
    "- Report check outcomes explicitly as pass/fail before any completion claim.\n"
    "- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)


async def invoke_linked_chat(
    *,
    target_section_id: ID,
    prompt: str,
    ctx: Context,
) -> CallToolResult:
    normalized_prompt = prompt.strip()
    if normalized_prompt == "":
        return _build_error_result(
            target_section_id=target_section_id,
            reason="empty_prompt",
            message="Linked chat invocation requires a non-empty prompt.",
        )
    agentic_context = ctx.fastmcp._resolve_agentic_context(ctx)
    if agentic_context is None or agentic_context.section_id is None:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="missing_section_context",
            message=(
                "Linked chat invocation requires a section-scoped agentic context."
            ),
        )

    share_session_id = ctx.fastmcp._resolve_share_session_id(ctx)
    manager = ctx.fastmcp.state.project_manager_switcher.get(
        agentic_context.project_config_id,
        share_session_id=share_session_id,
    )
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        agentic_context.project_config_id,
    )
    caller_scope = resolve_agentic_scope(project_state, agentic_context.section_id)
    if target_section_id not in caller_scope.peer_chat_section_ids:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="not_linked",
            message=(
                f"Chat section {target_section_id} is not a direct linked chat target for "
                f"{agentic_context.section_id}."
            ),
        )
    if agentic_context.linked_chat_invocation_depth >= MAX_LINKED_CHAT_INVOCATION_DEPTH:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="max_depth_exceeded",
            message=(
                "Linked chat recursion depth exceeded. Direct chat-to-chat invocation "
                "is limited to one nested hop."
            ),
        )
    invocation_chain = agentic_context.linked_chat_invocation_chain_section_ids + (
        agentic_context.section_id,
    )
    if target_section_id in invocation_chain:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="cycle_detected",
            message=(
                f"Linked chat invocation would create a cycle involving {target_section_id}."
            ),
        )

    try:
        target_section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        )
    except KeyError:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="missing_target",
            message=f"Linked chat target {target_section_id} does not exist.",
        )
    target_label = _get_chat_section_label(project_state, target_section_id)
    if not target_section_impl.managed:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="unsupported_scriptable_target",
            message=(
                f"Linked chat '{target_label}' is scriptable-only. "
                "Chat-to-chat invocation requires a managed chat section with a server-side engine."
            ),
        )

    selected_profile: AgentProfile | None = None
    try:
        if target_section_impl.agentProfileId is not None:
            selected_profile = require_agent_profile(
                ctx.fastmcp.state.dbe,
                target_section_impl.agentProfileId,
            )
    except KeyError as exc:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="missing_agent_profile",
            message=str(exc),
        )
    effective_engine_config_id = target_section_impl.engineConfigId or (
        selected_profile.engineConfigId if selected_profile is not None else None
    )
    if effective_engine_config_id is None:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="missing_engine_config",
            message=(
                f"Linked chat '{target_label}' does not have a resolved engine config."
            ),
        )

    try:
        resolved_engine = resolve_engine_config(
            ctx.fastmcp.state.dbe,
            ctx.fastmcp.state.agent_runner.config,
            effective_engine_config_id,
        )
    except (KeyError, ValueError) as exc:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="invalid_engine_config",
            message=str(exc),
        )
    chat_id = target_section_impl.chatId or create_new_id()
    try:
        prior_messages = get_prior_messages_for_chat_engine(
            dbe=ctx.fastmcp.state.dbe,
            engine_type=resolved_engine.engine_config.engineType,
            chat_id=chat_id,
            project_config_id=agentic_context.project_config_id,
            engine_config_id=effective_engine_config_id,
        )
    except ValueError as exc:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="chat_history_conflict",
            message=str(exc),
        )
    combined_messages = list(prior_messages)
    combined_messages.append(
        UserChatMessage(content=[MessageTextContent(text=normalized_prompt)])
    )
    execution_policy_prompt = _build_execution_policy_prompt(
        target_section_impl.permissionMode,
        target_section_impl.searchEnabled,
    )
    linked_chat_inputs: dict[str, Any] = {
        "chatId": str(chat_id),
        "projectConfigId": str(agentic_context.project_config_id),
        "sectionId": str(target_section_id),
        "thinking": target_section_impl.thinking,
        "engineConfigId": str(effective_engine_config_id),
        "permissionMode": target_section_impl.permissionMode.value,
        "searchEnabled": target_section_impl.searchEnabled,
        "messages": [message.model_dump(mode="json") for message in combined_messages],
        "linkedChatInvocationDepth": agentic_context.linked_chat_invocation_depth + 1,
        "linkedChatInvocationChainSectionIds": [
            str(section_id) for section_id in invocation_chain
        ],
    }

    completed_run: AgentRun
    if resolved_engine.engine_config.engineType == EngineType.setta_llm:
        runner = ctx.fastmcp.state.agent_runner
        if runner.disabled:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="runner_unavailable",
                message="Agent runner is not available for linked chat invocation.",
            )
        profile = selected_profile
        if profile is None:
            profile = AgentProfile(
                name=f"Linked chat {target_label}",
                description="",
                systemPrompt="",
                engineConfigId=effective_engine_config_id,
            )
        combined_system_prompt = _combine_prompt_sections(
            profile.systemPrompt or "",
            execution_policy_prompt,
            _REQUIRED_ERROR_CHECK_PROMPT,
        )
        linked_profile = profile.model_copy(
            update={
                "engineConfigId": effective_engine_config_id,
                "systemPrompt": combined_system_prompt,
            }
        )
        try:
            completed_run = await runner.run_sub_agent(
                linked_profile,
                linked_chat_inputs,
            )
        except (KeyError, ValueError) as exc:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="run_start_failed",
                message=str(exc),
            )
    elif resolved_engine.engine_config.engineType == EngineType.external_agent:
        runner = ctx.fastmcp.state.external_agent_runner
        if runner.disabled:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="runner_unavailable",
                message=(
                    "External agent runner is not available for linked chat invocation."
                ),
            )
        external_config = resolved_engine.external_agent_config
        if external_config is None:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="missing_external_config",
                message=(
                    f"Linked chat '{target_label}' is missing its external agent configuration."
                ),
            )
        _apply_external_reasoning_defaults(
            inputs=linked_chat_inputs,
            tool_type=external_config.toolType,
            thinking=target_section_impl.thinking,
        )
        approval_policy_override = _resolve_external_approval_policy_override(
            target_section_impl.permissionMode,
            external_config.toolType,
        )
        if approval_policy_override is not None:
            linked_chat_inputs["approvalPolicy"] = approval_policy_override
        sandbox_policy_override = _resolve_external_sandbox_policy_override(
            target_section_impl.permissionMode,
            external_config.toolType,
        )
        if sandbox_policy_override is not None:
            linked_chat_inputs["sandboxPolicy"] = sandbox_policy_override
        linked_chat_inputs["systemPrompt"] = _combine_prompt_sections(
            execution_policy_prompt,
            _REQUIRED_ERROR_CHECK_PROMPT,
        )
        try:
            run = runner.start_run(
                effective_engine_config_id,
                external_config,
                selected_profile,
                linked_chat_inputs,
            )
        except (KeyError, ValueError) as exc:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="run_start_failed",
                message=str(exc),
            )
        await manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=agentic_context.project_config_id,
                sectionId=target_section_id,
                chatId=chat_id,
            )
        )
        completed_run = await runner.wait_for_run(run.id)
    else:
        return _build_error_result(
            target_section_id=target_section_id,
            reason="unsupported_engine_type",
            message=(
                f"Linked chat '{target_label}' uses unsupported engine type "
                f"{resolved_engine.engine_config.engineType}."
            ),
        )

    if resolved_engine.engine_config.engineType == EngineType.setta_llm:
        await manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=agentic_context.project_config_id,
                sectionId=target_section_id,
                chatId=chat_id,
            )
        )
    return _build_success_result(
        target_label=target_label,
        target_section_id=target_section_id,
        chat_id=chat_id,
        run=completed_run,
        invocation_depth=agentic_context.linked_chat_invocation_depth + 1,
    )


def _build_success_result(
    *,
    target_label: str,
    target_section_id: ID,
    chat_id: ID,
    run: AgentRun,
    invocation_depth: int,
) -> CallToolResult:
    assistant_text = _extract_latest_assistant_text(run)
    bounded_text = assistant_text[:MAX_LINKED_CHAT_RESULT_CHARS].strip()
    truncated = len(assistant_text) > len(bounded_text)
    if truncated:
        bounded_text = f"{bounded_text}..."
    if not bounded_text:
        bounded_text = (
            f"Linked chat '{target_label}' finished with status {run.status.value}."
        )
    message = f"Linked chat '{target_label}' replied:\n{bounded_text}"
    is_error = run.status != AgentRunStatus.completed
    if is_error:
        message = (
            f"Linked chat '{target_label}' did not complete successfully "
            f"({run.status.value}).\n{bounded_text}"
        )
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent={
            "targetSectionId": target_section_id,
            "chatId": chat_id,
            "runId": run.id,
            "status": run.status.value,
            "assistantText": bounded_text,
            "truncated": truncated,
            "invocationDepth": invocation_depth,
        },
        isError=is_error,
    )


def _build_error_result(
    *,
    target_section_id: ID,
    reason: str,
    message: str,
) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent={
            "targetSectionId": target_section_id,
            "reason": reason,
            "message": message,
        },
        isError=True,
    )


def _extract_latest_assistant_text(run: AgentRun) -> str:
    messages = build_chat_state_from_run(run).messages
    for message in reversed(messages):
        if message.role != "assistant":
            continue
        text_parts = [
            block.text.strip()
            for block in message.content
            if isinstance(block, MessageTextContent) and block.text.strip()
        ]
        if text_parts:
            return "\n\n".join(text_parts).strip()
    return ""


def _get_chat_section_label(project_state: Any, section_id: ID) -> str:
    section = project_state.sections[section_id]
    display_name = (section.displayName or "").strip()
    if display_name:
        return display_name
    if section.name:
        return section.name
    return str(section_id)


def _combine_prompt_sections(*sections: str | None) -> str:
    parts: list[str] = []
    for section in sections:
        if section is None:
            continue
        stripped = section.strip()
        if stripped:
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

from typing import Any, Awaitable, Callable

from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent

from setta.agentic.chat_continuity import get_prior_messages_for_chat_engine
from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
)
from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.store import require_engine_config
from setta.mcp.run_start_authorization import (
    commit_pending_mcp_run_start,
    rollback_pending_mcp_run_start,
)
from setta.project_state.linked_chat_admission import LinkedChatAdmissionError
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.external_agents import ExternalAgentToolType
from setta.types.id import ID
from setta.types.section_impls import ChatPermissionMode

MAX_LINKED_CHAT_INVOCATION_DEPTH = 1
MAX_LINKED_CHAT_RESULT_CHARS = 4_000
_REQUIRED_ERROR_CHECK_PROMPT = (
    "## Required completion gate for create/scaffold work\n"
    "- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n"
    "- Report check outcomes explicitly as pass/fail before any completion claim.\n"
    "- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)


class _LinkedChatRunStartError(Exception):
    pass


async def _persist_linked_chat_section_binding(
    manager: Any,
    project_config_id: ID,
    section_id: ID,
    chat_id: ID,
) -> None:
    await manager.persist_linked_chat_section_binding(
        project_config_id,
        section_id,
        chat_id,
    )


async def _mark_linked_chat_section_run_started(
    manager: Any,
    project_config_id: ID,
    section_id: ID,
    chat_id: ID,
) -> None:
    await manager.mark_linked_chat_section_run_started(
        project_config_id,
        section_id,
        chat_id,
    )


async def _release_linked_chat_section_start_failure(
    manager: Any,
    project_config_id: ID,
    section_id: ID,
    chat_id: ID,
) -> None:
    await manager.release_linked_chat_section_start_failure(
        project_config_id,
        section_id,
        chat_id,
    )


async def _complete_linked_chat_section_invocation(
    manager: Any,
    project_config_id: ID,
    section_id: ID,
    chat_id: ID,
) -> None:
    await manager.complete_linked_chat_section_invocation(
        project_config_id,
        section_id,
        chat_id,
    )


async def _rollback_failed_linked_chat_run_start(
    *,
    ctx: Context,
    manager: Any,
    project_config_id: ID,
    target_section_id: ID,
    chat_id: ID,
) -> None:
    await _release_linked_chat_section_start_failure(
        manager,
        project_config_id,
        target_section_id,
        chat_id,
    )
    await rollback_pending_mcp_run_start(ctx)


async def _start_linked_chat_run(
    *,
    ctx: Context,
    manager: Any,
    project_config_id: ID,
    target_section_id: ID,
    chat_id: ID,
    start_run: Callable[[], AgentRun],
    wait_for_run: Callable[[ID], Awaitable[AgentRun]],
) -> AgentRun:
    try:
        run = start_run()
        await _mark_linked_chat_section_run_started(
            manager,
            project_config_id,
            target_section_id,
            chat_id,
        )
    except Exception as exc:
        await _rollback_failed_linked_chat_run_start(
            ctx=ctx,
            manager=manager,
            project_config_id=project_config_id,
            target_section_id=target_section_id,
            chat_id=chat_id,
        )
        raise _LinkedChatRunStartError(str(exc)) from exc
    commit_pending_mcp_run_start(ctx)

    try:
        return await wait_for_run(run.id)
    finally:
        await _complete_linked_chat_section_invocation(
            manager,
            project_config_id,
            target_section_id,
            chat_id,
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

    share_session_id = ctx.fastmcp._resolve_share_session_id(ctx)
    manager = ctx.fastmcp.state.project_manager_switcher.get(
        agentic_context.project_config_id,
        share_session_id=share_session_id,
    )
    try:
        admission = await manager.admit_linked_chat_section_invocation(
            agentic_context.project_config_id,
            agentic_context.section_id,
            target_section_id,
        )
    except LinkedChatAdmissionError as exc:
        await rollback_pending_mcp_run_start(ctx)
        return _build_error_result(
            target_section_id=target_section_id,
            reason=exc.reason,
            message=exc.message,
        )
    except KeyError as exc:
        await rollback_pending_mcp_run_start(ctx)
        return _build_error_result(
            target_section_id=target_section_id,
            reason="missing_agent_profile",
            message=str(exc),
        )
    target_label = admission.target_label
    chat_id = admission.chat_id

    async def _build_post_admission_error_result(
        *,
        reason: str,
        message: str,
    ) -> CallToolResult:
        await _release_linked_chat_section_start_failure(
            manager,
            agentic_context.project_config_id,
            target_section_id,
            chat_id,
        )
        await rollback_pending_mcp_run_start(ctx)
        return _build_error_result(
            target_section_id=target_section_id,
            reason=reason,
            message=message,
        )

    try:
        engine_config = require_engine_config(
            ctx.fastmcp.state.dbe,
            admission.effective_engine_config_id,
        )
    except KeyError as exc:
        return await _build_post_admission_error_result(
            reason="invalid_engine_config",
            message=str(exc),
        )
    if engine_config.engineType == EngineType.external_agent:
        external_config_id = engine_config.externalAgentConfigId
        if external_config_id is None:
            return await _build_post_admission_error_result(
                reason="missing_external_config",
                message=(
                    f"Linked chat '{target_label}' is missing its external agent configuration."
                ),
            )
    try:
        resolved_engine = resolve_engine_config(
            ctx.fastmcp.state.dbe,
            ctx.fastmcp.state.agent_runner.config,
            admission.effective_engine_config_id,
        )
    except KeyError as exc:
        reason = (
            "missing_external_config"
            if engine_config.engineType == EngineType.external_agent
            else "invalid_engine_config"
        )
        message = (
            f"Linked chat '{target_label}' is missing its external agent configuration."
            if reason == "missing_external_config"
            else str(exc)
        )
        return await _build_post_admission_error_result(
            reason=reason,
            message=message,
        )
    except ValueError as exc:
        return await _build_post_admission_error_result(
            reason="invalid_engine_config",
            message=str(exc),
        )
    if resolved_engine.engine_config.engineType == EngineType.setta_llm:
        runner = ctx.fastmcp.state.agent_runner
        if runner.disabled:
            return await _build_post_admission_error_result(
                reason="runner_unavailable",
                message="Agent runner is not available for linked chat invocation.",
            )
    elif resolved_engine.engine_config.engineType == EngineType.external_agent:
        runner = ctx.fastmcp.state.external_agent_runner
        if runner.disabled:
            return await _build_post_admission_error_result(
                reason="runner_unavailable",
                message=(
                    "External agent runner is not available for linked chat invocation."
                ),
            )
        external_config = resolved_engine.external_agent_config
        if external_config is None:
            return await _build_post_admission_error_result(
                reason="missing_external_config",
                message=(
                    f"Linked chat '{target_label}' is missing its external agent configuration."
                ),
            )
    else:
        return await _build_post_admission_error_result(
            reason="unsupported_engine_type",
            message=(
                f"Linked chat '{target_label}' uses unsupported engine type "
                f"{resolved_engine.engine_config.engineType}."
            ),
        )

    try:
        prior_messages = get_prior_messages_for_chat_engine(
            dbe=ctx.fastmcp.state.dbe,
            engine_type=resolved_engine.engine_config.engineType,
            chat_id=chat_id,
            project_config_id=agentic_context.project_config_id,
            engine_config_id=admission.effective_engine_config_id,
        )
    except ValueError as exc:
        await _release_linked_chat_section_start_failure(
            manager,
            agentic_context.project_config_id,
            target_section_id,
            chat_id,
        )
        await rollback_pending_mcp_run_start(ctx)
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
        admission.permission_mode,
        admission.search_enabled,
    )
    linked_chat_inputs: dict[str, Any] = {
        "chatId": str(chat_id),
        "projectConfigId": str(agentic_context.project_config_id),
        "sectionId": str(target_section_id),
        "thinking": admission.thinking,
        "engineConfigId": str(admission.effective_engine_config_id),
        "permissionMode": admission.permission_mode.value,
        "searchEnabled": admission.search_enabled,
        "messages": [message.model_dump(mode="json") for message in combined_messages],
        "linkedChatInvocationDepth": agentic_context.linked_chat_invocation_depth + 1,
        "linkedChatInvocationChainSectionIds": [
            str(section_id) for section_id in invocation_chain
        ],
    }
    if agentic_context.frontend_affinity_token is not None:
        linked_chat_inputs["frontendAffinityToken"] = (
            agentic_context.frontend_affinity_token
        )

    try:
        await _persist_linked_chat_section_binding(
            manager,
            agentic_context.project_config_id,
            target_section_id,
            chat_id,
        )
    except Exception as exc:
        await _release_linked_chat_section_start_failure(
            manager,
            agentic_context.project_config_id,
            target_section_id,
            chat_id,
        )
        await rollback_pending_mcp_run_start(ctx)
        return _build_error_result(
            target_section_id=target_section_id,
            reason="binding_start_failed",
            message=str(exc),
        )

    completed_run: AgentRun
    if resolved_engine.engine_config.engineType == EngineType.setta_llm:
        profile = admission.selected_profile
        if profile is None:
            profile = AgentProfile(
                name=f"Linked chat {target_label}",
                description="",
                systemPrompt="",
                engineConfigId=admission.effective_engine_config_id,
            )
        combined_system_prompt = _combine_prompt_sections(
            profile.systemPrompt or "",
            execution_policy_prompt,
            _REQUIRED_ERROR_CHECK_PROMPT,
        )
        linked_profile = profile.model_copy(
            update={
                "engineConfigId": admission.effective_engine_config_id,
                "systemPrompt": combined_system_prompt,
            }
        )
        linked_chat_inputs["runType"] = LLM_CHAT_RUN_TYPE
        try:
            completed_run = await _start_linked_chat_run(
                ctx=ctx,
                manager=manager,
                project_config_id=agentic_context.project_config_id,
                target_section_id=target_section_id,
                chat_id=chat_id,
                start_run=lambda: runner.start_run(
                    linked_profile,
                    linked_chat_inputs,
                    emit_stream=False,
                    emit_ai_follow=False,
                ),
                wait_for_run=runner.wait_for_run,
            )
        except _LinkedChatRunStartError as exc:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="run_start_failed",
                message=str(exc),
            )
    elif resolved_engine.engine_config.engineType == EngineType.external_agent:
        _apply_external_reasoning_defaults(
            inputs=linked_chat_inputs,
            tool_type=external_config.toolType,
            thinking=admission.thinking,
        )
        approval_policy_override = _resolve_external_approval_policy_override(
            admission.permission_mode,
            external_config.toolType,
        )
        if approval_policy_override is not None:
            linked_chat_inputs["approvalPolicy"] = approval_policy_override
        sandbox_policy_override = _resolve_external_sandbox_policy_override(
            admission.permission_mode,
            external_config.toolType,
        )
        if sandbox_policy_override is not None:
            linked_chat_inputs["sandboxPolicy"] = sandbox_policy_override
        linked_chat_inputs["systemPrompt"] = _combine_prompt_sections(
            execution_policy_prompt,
            _REQUIRED_ERROR_CHECK_PROMPT,
        )
        try:
            completed_run = await _start_linked_chat_run(
                ctx=ctx,
                manager=manager,
                project_config_id=agentic_context.project_config_id,
                target_section_id=target_section_id,
                chat_id=chat_id,
                start_run=lambda: runner.start_run(
                    admission.effective_engine_config_id,
                    external_config,
                    admission.selected_profile,
                    linked_chat_inputs,
                ),
                wait_for_run=runner.wait_for_run,
            )
        except _LinkedChatRunStartError as exc:
            return _build_error_result(
                target_section_id=target_section_id,
                reason="run_start_failed",
                message=str(exc),
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
    truncated = len(assistant_text) > MAX_LINKED_CHAT_RESULT_CHARS
    bounded_text = assistant_text[:MAX_LINKED_CHAT_RESULT_CHARS].strip()
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

import contextlib
import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    query,
)
from claude_agent_sdk.types import StreamEvent
from mcp.types import TextContent

from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
    ExternalAgentStreamEvent,
)
from setta.agentic.external_adapters.prompt_utils import build_prompt_from_inputs
from setta.agentic.external_agent_settings import resolve_claude_setting_sources
from setta.database.utils import create_new_id
from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatRole,
    MessageTextContent,
    MessageThinkingContent,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType
from setta.types.generated.chat_messages import BaseChatMessageTypeAdapter

logger = logging.getLogger(__name__)


def _patch_claude_sdk_query_close() -> None:
    try:
        from claude_agent_sdk._internal.query import Query
    except Exception:
        return
    if getattr(Query, "_setta_close_patched", False):
        return
    original_close = Query.close

    async def _patched_close(self) -> None:
        try:
            await original_close(self)
        finally:
            for attr in ("_message_send", "_message_receive"):
                stream = getattr(self, attr, None)
                if stream is None:
                    continue
                with contextlib.suppress(Exception):
                    await stream.aclose()

    Query.close = _patched_close  # type: ignore[assignment]
    Query._setta_close_patched = True


_patch_claude_sdk_query_close()

_QUEUE_KIND_MESSAGE = "sdk_message"
_QUEUE_KIND_RAW = "raw_event"
_QUEUE_KIND_ERROR = "error"
_QUEUE_KIND_DONE = "done"

_MAX_CLI_STDERR_LINES = 200

_PERMISSION_MODE_VALUES = {
    "default",
    "acceptEdits",
    "bypassPermissions",
    "plan",
}
_PERMISSION_MODE_ALIASES = {
    "allow": "bypassPermissions",
    "auto": "bypassPermissions",
    "bypass": "bypassPermissions",
    "ask": "default",
    "deny": "default",
    "block": "default",
}

_DEFAULT_THINKING_BUDGET = 1024


@dataclass
class _ApprovalDecision:
    approved: bool
    updated_input: dict[str, Any] | None


@dataclass
class _PendingApproval:
    future: asyncio.Future[_ApprovalDecision]
    tool_name: str | None
    tool_input: dict[str, Any] | None


class ClaudeSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.claude_code
    supported_run_modes = {ExternalAgentRunMode.sdk}

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        pending_approvals: dict[str, _PendingApproval] = {}
        tool_use_names: dict[str, str] = {}
        stderr_lines: list[str] = []
        close_prompt_event = asyncio.Event()
        options = _build_options(context, pending_approvals, queue, stderr_lines)
        session_id = _extract_session_id(context.inputs) or str(context.run.id)
        task = asyncio.create_task(
            _run_query(prompt, options, queue, session_id, close_prompt_event)
        )
        handle = ExternalAgentRunHandle(
            run_id=context.run.id,
            metadata={
                "queue": queue,
                "task": task,
                "pending_approvals": pending_approvals,
                "tool_use_names": tool_use_names,
                "stderr_lines": stderr_lines,
                "close_prompt_event": close_prompt_event,
            },
        )
        handle.session_id = session_id
        return handle

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        queue = handle.metadata.get("queue")
        if not isinstance(queue, asyncio.Queue):
            return
        parser = _ClaudeSdkEventParser()
        saw_partial = False
        tool_use_names = handle.metadata.get("tool_use_names")
        if not isinstance(tool_use_names, dict):
            tool_use_names = {}
            handle.metadata["tool_use_names"] = tool_use_names
        seen_tool_results = handle.metadata.get("seen_tool_results")
        if not isinstance(seen_tool_results, set):
            seen_tool_results = set()
            handle.metadata["seen_tool_results"] = seen_tool_results
        log_budget = 5
        total_events = 0
        while True:
            kind, payload = await queue.get()
            total_events += 1
            if log_budget > 0:
                log_budget -= 1
                logger.info(
                    "Claude SDK queue event (run_id=%s) kind=%s payload=%s",
                    handle.run_id,
                    kind,
                    _describe_sdk_message(payload),
                )
            if kind == _QUEUE_KIND_DONE:
                logger.info(
                    "Claude SDK queue done (run_id=%s, total_events=%s)",
                    handle.run_id,
                    total_events,
                )
                break
            if kind == _QUEUE_KIND_ERROR:
                logger.error(
                    "Claude SDK queue error (run_id=%s): %s",
                    handle.run_id,
                    payload,
                )
                raise payload
            if kind == _QUEUE_KIND_RAW:
                if isinstance(payload, dict):
                    yield ExternalAgentStreamEvent(raw=payload)
                continue
            if kind != _QUEUE_KIND_MESSAGE:
                continue

            message = payload
            if isinstance(message, StreamEvent):
                saw_partial = True
                stream_payload = _build_stream_event_payload(message)
                if stream_payload is None:
                    continue
                _maybe_set_session_id(handle, stream_payload)
                for event in parser.handle(stream_payload):
                    yield event
                continue

            _maybe_set_session_id_from_message(handle, message)

            if isinstance(message, UserMessage):
                for event in _build_tool_result_events(
                    message, tool_use_names, seen_tool_results
                ):
                    yield event
                continue

            if isinstance(message, AssistantMessage):
                if saw_partial:
                    continue
                assistant_payload = _build_assistant_payload(message, tool_use_names)
                for event in parser.handle(
                    {"type": "assistant", "message": assistant_payload}
                ):
                    yield event
                continue

            if saw_partial:
                continue

            if isinstance(message, (SystemMessage, ResultMessage)):
                continue

        handle.return_code = 0

    async def cancel_run(self, handle: ExternalAgentRunHandle) -> None:
        task = handle.metadata.get("task")
        if isinstance(task, asyncio.Task) and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("Claude SDK background task failed during cancel")
        pending = handle.metadata.get("pending_approvals")
        if isinstance(pending, dict):
            for state in pending.values():
                if isinstance(state, _PendingApproval) and not state.future.done():
                    state.future.cancel()

    async def send_approval_response(
        self, handle: ExternalAgentRunHandle, approval_id: str, approved: bool
    ) -> None:
        pending = _pop_pending_approval(handle, approval_id)
        if pending is None:
            raise KeyError(f"Claude SDK approval {approval_id} not found")
        if pending.future.done():
            return
        pending.future.set_result(
            _ApprovalDecision(approved=approved, updated_input=None)
        )

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        pending = _pop_pending_approval(handle, tool_call_id)
        if pending is None:
            raise KeyError(f"Claude SDK tool response {tool_call_id} not found")
        updated_input = _extract_updated_input(payload)
        answers = _extract_answers(payload)
        if updated_input is None and answers and pending.tool_name == "AskUserQuestion":
            base_input = (
                pending.tool_input if isinstance(pending.tool_input, dict) else {}
            )
            updated_input = {**base_input, "answers": answers}
        approved = updated_input is not None
        if pending.future.done():
            return
        pending.future.set_result(
            _ApprovalDecision(approved=approved, updated_input=updated_input)
        )

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        prompt = _extract_latest_user_prompt(context.inputs)
        if prompt:
            return f"{prompt}\n"
        return build_prompt_from_inputs("", context.inputs)


async def _run_query(
    prompt: str,
    options: ClaudeAgentOptions,
    queue: asyncio.Queue[tuple[str, Any]],
    session_id: str | None,
    close_prompt_event: asyncio.Event,
) -> None:
    message_count = 0
    logger.info("Claude SDK query starting (session_id=%s)", session_id)
    try:
        prompt_stream = _build_prompt_stream(prompt, session_id, close_prompt_event)
        async for message in query(prompt=prompt_stream, options=options):
            message_count += 1
            if message_count <= 3:
                logger.debug(
                    "Claude SDK query message (session_id=%s): %s",
                    session_id,
                    _describe_sdk_message(message),
                )
            if isinstance(message, ResultMessage):
                close_prompt_event.set()
            await queue.put((_QUEUE_KIND_MESSAGE, message))
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        await queue.put((_QUEUE_KIND_ERROR, exc))
    finally:
        logger.info(
            "Claude SDK query finished (session_id=%s, message_count=%s)",
            session_id,
            message_count,
        )
        try:
            queue.put_nowait((_QUEUE_KIND_DONE, None))
        except Exception:
            pass


async def _build_prompt_stream(
    prompt: str, session_id: str | None, close_prompt_event: asyncio.Event
) -> AsyncIterator[dict[str, Any]]:
    payload: dict[str, Any] = {
        "type": "user",
        "message": {"role": "user", "content": prompt},
        "parent_tool_use_id": None,
    }
    if session_id:
        payload["session_id"] = session_id
    yield payload
    await close_prompt_event.wait()


def _describe_sdk_message(message: Any) -> str:
    if isinstance(message, dict):
        message_type = message.get("type")
        if isinstance(message_type, str) and message_type:
            return f"dict({message_type})"
        return "dict"
    if isinstance(message, StreamEvent):
        raw_event = getattr(message, "event", None) or getattr(
            message, "stream_event", None
        )
        event_type: str | None = None
        if isinstance(raw_event, dict):
            event_type = raw_event.get("type")
        else:
            raw_type = getattr(raw_event, "type", None)
            if isinstance(raw_type, str):
                event_type = raw_type
            elif raw_type is not None:
                event_type = str(raw_type)
        if event_type:
            return f"StreamEvent({event_type})"
        return "StreamEvent"
    return type(message).__name__


def _summarize_mcp_servers(mcp_servers: dict[str, Any] | None) -> str:
    if not mcp_servers:
        return "none"
    names = [str(name) for name in mcp_servers.keys()]
    names.sort()
    return ",".join(names)


def _build_options(
    context: ExternalAgentRunContext,
    pending_approvals: dict[str, _PendingApproval],
    queue: asyncio.Queue[tuple[str, Any]],
    stderr_lines: list[str] | None,
) -> ClaudeAgentOptions:
    inputs = context.inputs or {}
    options: dict[str, Any] = {
        "system_prompt": _build_system_prompt_payload(context.system_prompt),
        "include_partial_messages": True,
        "cwd": str(context.working_dir),
        "env": dict(context.env),
    }
    if "ANTHROPIC_API_KEY" not in context.env:
        logger.warning(
            "Claude SDK env missing ANTHROPIC_API_KEY (run_id=%s)", context.run.id
        )
    if context.config.commandPath:
        options["cli_path"] = context.config.commandPath
    allowed_tools = _extract_allowed_tools(context)
    if allowed_tools:
        options["allowed_tools"] = allowed_tools
    model = _extract_model(context)
    if model:
        options["model"] = model
    max_turns = _normalize_max_turns(inputs.get("maxTurns") or inputs.get("max_turns"))
    if max_turns is not None:
        options["max_turns"] = max_turns
    thinking_budget = _extract_thinking_budget(inputs)
    if thinking_budget is not None:
        options["max_thinking_tokens"] = thinking_budget
    resume = _extract_session_id(inputs)
    if resume:
        options["resume"] = resume
    sandbox = _build_sandbox_options(context.config.sandboxPolicy)
    if sandbox is not None:
        options["sandbox"] = sandbox
    mcp_config = _extract_mcp_config(inputs)
    mcp_servers = _load_mcp_servers(mcp_config) if mcp_config else None
    if mcp_servers:
        options["mcp_servers"] = mcp_servers
    elif mcp_config:
        logger.warning(
            "Claude SDK mcpConfig did not load servers (run_id=%s, path=%s)",
            context.run.id,
            mcp_config,
        )
    setting_sources = resolve_claude_setting_sources(context.config)
    if setting_sources:
        options["setting_sources"] = setting_sources

    permission_mode = _resolve_permission_mode(context.config.approvalPolicy)
    if permission_mode:
        options["permission_mode"] = permission_mode
    decision_policy = _resolve_decision_policy(context.config.approvalPolicy)

    def _log_cli_stderr(line: str) -> None:
        logger.warning("Claude CLI stderr (run_id=%s): %s", context.run.id, line)
        if stderr_lines is None:
            return
        stderr_lines.append(line)
        if len(stderr_lines) > _MAX_CLI_STDERR_LINES:
            del stderr_lines[: len(stderr_lines) - _MAX_CLI_STDERR_LINES]

    async def can_use_tool(
        tool_name: str,
        tool_input: dict[str, Any],
        tool_context: Any = None,
    ) -> PermissionResultAllow | PermissionResultDeny:
        normalized_tool_name = (
            tool_name if isinstance(tool_name, str) else str(tool_name)
        )
        normalized_tool_input = tool_input if isinstance(tool_input, dict) else {}
        if decision_policy == "allow":
            return PermissionResultAllow(
                behavior="allow",
                updated_input=normalized_tool_input,
            )
        if decision_policy == "deny":
            return PermissionResultDeny(
                behavior="deny",
                message="Denied by approval policy.",
                interrupt=False,
            )

        approval_id = str(create_new_id())
        tool_type = None
        if tool_context is not None:
            tool_type = getattr(tool_context, "tool_type", None) or getattr(
                tool_context, "toolType", None
            )
        approval_payload = {
            "type": "approval_request",
            "approvalId": approval_id,
            "runId": str(context.run.id),
            "tool": normalized_tool_name,
            "input": normalized_tool_input,
            "toolName": normalized_tool_name,
            "toolType": tool_type,
        }
        await queue.put((_QUEUE_KIND_RAW, approval_payload))
        future = asyncio.get_running_loop().create_future()
        pending_approvals[approval_id] = _PendingApproval(
            future=future,
            tool_name=normalized_tool_name,
            tool_input=normalized_tool_input,
        )
        decision = await future
        pending_approvals.pop(approval_id, None)
        if decision.approved:
            updated_input = decision.updated_input or normalized_tool_input
            return PermissionResultAllow(
                behavior="allow",
                updated_input=updated_input,
            )
        return PermissionResultDeny(
            behavior="deny",
            message="User denied permission for this tool.",
            interrupt=False,
        )

    options["can_use_tool"] = can_use_tool
    options["stderr"] = _log_cli_stderr
    options["extra_args"] = {"debug-to-stderr": None}
    logger.info(
        "Claude SDK options (run_id=%s) model=%s cli_path=%s cwd=%s "
        "permission_mode=%s decision_policy=%s mcp_servers=%s "
        "allowed_tools=%s max_turns=%s thinking_budget=%s env_has_api_key=%s",
        context.run.id,
        model,
        options.get("cli_path"),
        options.get("cwd"),
        permission_mode,
        decision_policy,
        _summarize_mcp_servers(mcp_servers),
        len(allowed_tools) if allowed_tools else 0,
        max_turns,
        thinking_budget,
        "ANTHROPIC_API_KEY" in context.env,
    )
    logger.debug(
        "Claude SDK env keys (run_id=%s): %s",
        context.run.id,
        sorted(context.env.keys()),
    )
    return ClaudeAgentOptions(**options)


def _pop_pending_approval(
    handle: ExternalAgentRunHandle, approval_id: str
) -> _PendingApproval | None:
    pending = handle.metadata.get("pending_approvals")
    if not isinstance(pending, dict):
        return None
    entry = pending.pop(approval_id, None)
    if isinstance(entry, _PendingApproval):
        return entry
    if entry is not None:
        pending[approval_id] = entry
    return None


def _build_stream_event_payload(message: StreamEvent) -> dict[str, Any] | None:
    raw_event = getattr(message, "event", None)
    if raw_event is None:
        raw_event = getattr(message, "stream_event", None)
    if raw_event is None:
        return None
    if isinstance(raw_event, dict):
        event_payload = raw_event
    elif hasattr(raw_event, "model_dump"):
        event_payload = raw_event.model_dump()
    elif hasattr(raw_event, "dict"):
        event_payload = raw_event.dict()
    elif hasattr(raw_event, "__dict__"):
        event_payload = raw_event.__dict__
    else:
        return None
    return {"type": "stream_event", "event": event_payload}


def _maybe_set_session_id(
    handle: ExternalAgentRunHandle, payload: dict[str, Any]
) -> None:
    session_id = _extract_session_id_from_event(payload)
    if session_id:
        handle.session_id = session_id


def _maybe_set_session_id_from_message(
    handle: ExternalAgentRunHandle, message: Any
) -> None:
    if message is None:
        return
    for key in ("session_id", "sessionId", "session", "resume"):
        value = getattr(message, key, None)
        if isinstance(value, str) and value:
            handle.session_id = value
            return
    data = getattr(message, "data", None)
    if isinstance(data, dict):
        session = data.get("session_id") or data.get("sessionId")
        if isinstance(session, str) and session:
            handle.session_id = session


def _build_assistant_payload(
    message: AssistantMessage, tool_use_names: dict[str, str]
) -> dict[str, Any]:
    message_id = _extract_message_id_from_sdk(message)
    content_entries: list[dict[str, Any]] = []
    content = getattr(message, "content", None)
    if isinstance(content, str):
        content_entries.append({"type": "text", "text": content})
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, TextBlock):
                content_entries.append({"type": "text", "text": block.text})
            elif isinstance(block, ThinkingBlock):
                thinking_value = (
                    block.thinking if isinstance(block.thinking, str) else ""
                )
                entry: dict[str, Any] = {
                    "type": "thinking",
                    "thinking": thinking_value,
                }
                if getattr(block, "summary", None):
                    entry["summary"] = block.summary
                if getattr(block, "signature", None):
                    entry["signature"] = block.signature
                content_entries.append(entry)
            elif isinstance(block, ToolUseBlock):
                tool_use_id = getattr(block, "id", None) or getattr(
                    block, "tool_use_id", None
                )
                tool_name = getattr(block, "name", None)
                if isinstance(tool_use_id, str) and isinstance(tool_name, str):
                    tool_use_names[tool_use_id] = tool_name
                content_entries.append(
                    {
                        "type": "tool_use",
                        "id": tool_use_id,
                        "name": tool_name,
                        "input": getattr(block, "input", None),
                    }
                )
    return {"id": message_id, "content": content_entries}


def _build_tool_result_events(
    message: UserMessage,
    tool_use_names: dict[str, str],
    seen_tool_results: set[str],
) -> list[ExternalAgentStreamEvent]:
    events: list[ExternalAgentStreamEvent] = []
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return events
    for block in content:
        if not isinstance(block, ToolResultBlock):
            continue
        tool_use_id = getattr(block, "tool_use_id", None) or getattr(
            block, "toolUseId", None
        )
        if not isinstance(tool_use_id, str) or not tool_use_id:
            continue
        if tool_use_id in seen_tool_results:
            continue
        seen_tool_results.add(tool_use_id)
        tool_name = tool_use_names.get(tool_use_id)
        if tool_name is None:
            tool_name = getattr(block, "tool_name", None) or getattr(
                block, "name", None
            )
        text = _extract_tool_result_text(getattr(block, "content", None))
        tool_message = ToolChatMessage(
            tool_call_id=tool_use_id,
            tool_name=tool_name if isinstance(tool_name, str) else None,
            content=[TextContent(type="text", text=text)] if text else [],
            result=text if text else None,
            is_error=bool(getattr(block, "is_error", False)),
        )
        events.append(
            ExternalAgentStreamEvent(
                raw={"type": "tool_result", "toolCallId": tool_use_id},
                stream_chunk=ToolResultEvent(result=tool_message),
            )
        )
    return events


def _extract_updated_input(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    updated_input = payload.get("updatedInput")
    if isinstance(updated_input, dict):
        return updated_input
    inner = payload.get("payload")
    if isinstance(inner, dict) and isinstance(inner.get("updatedInput"), dict):
        return inner.get("updatedInput")
    return None


def _extract_answers(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    answers = payload.get("answers")
    if isinstance(answers, dict):
        return answers
    inner = payload.get("payload")
    if isinstance(inner, dict):
        nested = inner.get("answers")
        if isinstance(nested, dict):
            return nested
    return None


@dataclass
class _ToolCallBuffer:
    name: str | None = None
    arguments: str = ""
    saw_delta: bool = False
    seeded_from_input: bool = False


@dataclass
class _ToolResultBuffer:
    tool_use_id: str
    text: str = ""
    is_error: bool = False


class _ClaudeSdkEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None
        self._current_message_id: str | None = None
        self._block_types_by_index: dict[int, str] = {}
        self._tool_use_ids_by_index: dict[int, str] = {}
        self._tool_result_ids_by_index: dict[int, str] = {}
        self._tool_call_buffers: dict[str, _ToolCallBuffer] = {}
        self._tool_result_buffers: dict[str, _ToolResultBuffer] = {}
        self._finalized_message_ids: set[str] = set()
        self._saw_partial_assistant = False

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        event_type = payload.get("type")
        if event_type == "stream_event":
            self._saw_partial_assistant = True
            stream_event = payload.get("event") or payload.get("stream_event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "partial_assistant":
            self._saw_partial_assistant = True
            stream_event = payload.get("stream_event") or payload.get("event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "raw_message_stream_event":
            if self._saw_partial_assistant:
                return [ExternalAgentStreamEvent(raw=payload)]
            stream_event = payload.get("stream_event") or payload.get("event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "assistant":
            if self._saw_partial_assistant:
                return [ExternalAgentStreamEvent(raw=payload)]
            message_payload = payload.get("message")
            if isinstance(message_payload, dict):
                return self._emit_full_message(message_payload, payload)
        if event_type == "result" and self._saw_partial_assistant:
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        return self._emit_text_delta(payload, delta_text, event_type)

    def _get_or_create_message(
        self, payload: dict[str, Any]
    ) -> tuple[AssistantChatMessage, bool]:
        message_id = _extract_message_id(payload)
        if message_id and message_id in self._messages:
            self._last_message_id = message_id
            return self._messages[message_id], False
        if not message_id and self._last_message_id:
            return self._messages[self._last_message_id], False
        message = AssistantChatMessage(
            id=message_id or create_new_id(),
            content=[],
        )
        self._messages[message.id] = message
        self._last_message_id = message.id
        return message, True

    def _handle_stream_event(
        self, stream_event: Any, raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        if not isinstance(stream_event, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        event_type = stream_event.get("type")
        if event_type == "message_start":
            return self._handle_message_start(stream_event, raw_payload)
        if event_type == "content_block_start":
            return self._handle_content_block_start(stream_event, raw_payload)
        if event_type == "content_block_delta":
            return self._handle_content_block_delta(stream_event, raw_payload)
        if event_type == "content_block_stop":
            return self._handle_content_block_stop(stream_event, raw_payload)
        if event_type == "message_delta":
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        if event_type == "message_stop":
            return self._handle_message_stop(stream_event, raw_payload)
        return [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_message_start(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_payload = stream_event.get("message")
        if not isinstance(message_payload, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        message = _build_assistant_message(message_payload)
        self._messages[message.id] = message
        self._current_message_id = message.id
        self._last_message_id = message.id
        self._block_types_by_index.clear()
        self._tool_use_ids_by_index.clear()
        self._tool_result_ids_by_index.clear()
        return [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStartEvent(message=message),
            )
        ]

    def _handle_content_block_start(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        content_block = stream_event.get("content_block")
        if not isinstance(index, int) or not isinstance(content_block, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = content_block.get("type")
        if not isinstance(block_type, str):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._block_types_by_index[index] = block_type
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "text":
            text = content_block.get("text")
            if isinstance(text, str) and text:
                self._append_text(message, index, text)
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=text)],
                        ),
                    )
                )
        elif block_type == "thinking":
            thinking = content_block.get("thinking")
            signature = content_block.get("signature")
            summary = _extract_thinking_summary(content_block)
            has_payload = False
            if isinstance(thinking, str) and thinking:
                has_payload = True
            if summary is not None:
                has_payload = True
            if isinstance(signature, str):
                has_payload = True
            if has_payload:
                self._append_thinking(
                    message,
                    index,
                    thinking if isinstance(thinking, str) else "",
                    summary,
                    signature if isinstance(signature, str) else None,
                )
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[
                                MessageThinkingDelta(
                                    index=index,
                                    thinking=thinking
                                    if isinstance(thinking, str)
                                    else "",
                                    summary=summary,
                                    signature=signature
                                    if isinstance(signature, str)
                                    else None,
                                )
                            ],
                        ),
                    )
                )
        elif block_type == "tool_use":
            tool_use_id = content_block.get("id")
            tool_name = content_block.get("name")
            if isinstance(tool_use_id, str) and tool_use_id:
                self._tool_use_ids_by_index[index] = tool_use_id
                buffer = self._tool_call_buffers.setdefault(
                    tool_use_id, _ToolCallBuffer()
                )
                if isinstance(tool_name, str) and tool_name:
                    buffer.name = tool_name
                input_payload = content_block.get("input")
                if input_payload is not None:
                    serialized = _safe_json_dump(input_payload)
                    if serialized and serialized != "{}":
                        buffer.arguments = serialized
                        buffer.seeded_from_input = True
                        events.append(
                            ExternalAgentStreamEvent(
                                raw=raw_payload,
                                stream_chunk=ToolCallDeltaEvent(
                                    message_id=message.id,
                                    tool_call_id=tool_use_id,
                                    arguments_delta=serialized,
                                    tool_name=buffer.name,
                                ),
                            )
                        )
        elif block_type == "tool_result":
            tool_use_id = content_block.get("tool_use_id")
            if isinstance(tool_use_id, str) and tool_use_id:
                self._tool_result_ids_by_index[index] = tool_use_id
                buffer = self._tool_result_buffers.setdefault(
                    tool_use_id, _ToolResultBuffer(tool_use_id=tool_use_id)
                )
                buffer.is_error = bool(content_block.get("is_error", False))
                text = _extract_tool_result_text(content_block.get("content"))
                if text:
                    buffer.text += text
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_content_block_delta(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        delta = stream_event.get("delta")
        if not isinstance(index, int) or not isinstance(delta, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = self._block_types_by_index.get(index)
        delta_type = delta.get("type")
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "text" and delta_type == "text_delta":
            text = delta.get("text")
            if isinstance(text, str) and text:
                self._append_text(message, index, text)
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=text)],
                        ),
                    )
                )
        elif block_type == "thinking":
            if delta_type == "thinking_delta":
                thinking = delta.get("thinking")
                summary = _extract_thinking_summary(delta)
                if (isinstance(thinking, str) and thinking) or summary is not None:
                    self._append_thinking(
                        message,
                        index,
                        thinking if isinstance(thinking, str) else "",
                        summary,
                        None,
                    )
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking=thinking
                                        if isinstance(thinking, str)
                                        else "",
                                        summary=summary,
                                        signature=None,
                                    )
                                ],
                            ),
                        )
                    )
            elif delta_type == "signature_delta":
                signature = delta.get("signature")
                if isinstance(signature, str):
                    self._append_thinking(message, index, "", None, signature)
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking="",
                                        summary=None,
                                        signature=signature,
                                    )
                                ],
                            ),
                        )
                    )
            elif delta_type in ("summary_delta", "thinking_summary_delta"):
                summary = _extract_thinking_summary(delta)
                if summary is not None:
                    self._append_thinking(message, index, "", summary, None)
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking="",
                                        summary=summary,
                                        signature=None,
                                    )
                                ],
                            ),
                        )
                    )
        elif block_type == "tool_use" and delta_type == "input_json_delta":
            tool_use_id = self._tool_use_ids_by_index.get(index)
            partial_json = delta.get("partial_json")
            if tool_use_id and isinstance(partial_json, str) and partial_json != "":
                buffer = self._tool_call_buffers.setdefault(
                    tool_use_id, _ToolCallBuffer()
                )
                if not buffer.saw_delta:
                    buffer.saw_delta = True
                    if buffer.seeded_from_input:
                        buffer.arguments = ""
                        buffer.seeded_from_input = False
                buffer.arguments += partial_json
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=ToolCallDeltaEvent(
                            message_id=message.id,
                            tool_call_id=tool_use_id,
                            arguments_delta=partial_json,
                            tool_name=buffer.name,
                        ),
                    )
                )
        elif block_type == "tool_result" and delta_type == "text_delta":
            tool_use_id = self._tool_result_ids_by_index.get(index)
            text = delta.get("text")
            if tool_use_id and isinstance(text, str) and text:
                buffer = self._tool_result_buffers.setdefault(
                    tool_use_id, _ToolResultBuffer(tool_use_id=tool_use_id)
                )
                buffer.text += text
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_content_block_stop(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        if not isinstance(index, int):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = self._block_types_by_index.get(index)
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "tool_use":
            tool_use_id = self._tool_use_ids_by_index.get(index)
            if tool_use_id:
                tool_call = self._finalize_tool_call(tool_use_id)
                if tool_call is not None:
                    self._upsert_tool_call(message, tool_call)
        elif block_type == "tool_result":
            tool_use_id = self._tool_result_ids_by_index.get(index)
            if tool_use_id:
                tool_result = self._finalize_tool_result(tool_use_id)
                if tool_result is not None:
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=ToolResultEvent(result=tool_result),
                        )
                    )
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_message_stop(
        self, _stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        if message.id in self._finalized_message_ids:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._finalized_message_ids.add(message.id)
        self._current_message_id = None
        self._block_types_by_index.clear()
        self._tool_use_ids_by_index.clear()
        self._tool_result_ids_by_index.clear()
        return [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStopEvent(message_id=message.id),
            ),
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageFinalizedEvent(message=message),
            ),
        ]

    def _emit_full_message(
        self, message_payload: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = _build_assistant_message(message_payload)
        if message.id in self._finalized_message_ids:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._messages[message.id] = message
        self._finalized_message_ids.add(message.id)
        events: list[ExternalAgentStreamEvent] = [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStartEvent(
                    message=AssistantChatMessage(id=message.id, content=[])
                ),
            )
        ]
        for index, content in enumerate(message.content):
            if isinstance(content, MessageTextContent) and content.text:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=content.text)],
                        ),
                    )
                )
            elif isinstance(content, MessageThinkingContent):
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[
                                MessageThinkingDelta(
                                    index=index,
                                    thinking=content.thinking,
                                    summary=content.summary,
                                    signature=content.signature,
                                )
                            ],
                        ),
                    )
                )
        for tool_call in message.tool_calls or []:
            serialized = _safe_json_dump(tool_call.function.arguments)
            if serialized:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=ToolCallDeltaEvent(
                            message_id=message.id,
                            tool_call_id=tool_call.id,
                            arguments_delta=serialized,
                            tool_name=tool_call.function.name,
                        ),
                    )
                )
        events.append(
            ExternalAgentStreamEvent(
                raw=raw_payload, stream_chunk=MessageStopEvent(message_id=message.id)
            )
        )
        events.append(
            ExternalAgentStreamEvent(
                raw=raw_payload, stream_chunk=MessageFinalizedEvent(message=message)
            )
        )
        return events

    def _emit_text_delta(
        self, payload: dict[str, Any], delta_text: str, event_type: Any
    ) -> list[ExternalAgentStreamEvent]:
        message, is_new = self._get_or_create_message(payload)
        current_text = _get_message_text(message)
        if delta_text.startswith(current_text):
            delta_text = delta_text[len(current_text) :]
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        _append_message_text(message, delta_text)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[MessageTextDelta(index=0, text=delta_text)],
                ),
            )
        )
        if _is_final_event(event_type, payload):
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStopEvent(message_id=message.id),
                )
            )
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageFinalizedEvent(message=message),
                )
            )
        return events

    def _require_current_message(
        self, raw_payload: dict[str, Any]
    ) -> AssistantChatMessage | None:
        message_id = self._current_message_id or self._last_message_id
        if not message_id:
            return None
        return self._messages.get(message_id)

    def _append_text(
        self, message: AssistantChatMessage, index: int, text: str
    ) -> None:
        block = _ensure_text_block(message.content, index)
        block.text += text

    def _append_thinking(
        self,
        message: AssistantChatMessage,
        index: int,
        thinking: str,
        summary: str | None = None,
        signature: str | None = None,
    ) -> None:
        block = _ensure_thinking_block(message.content, index)
        if thinking:
            block.thinking += thinking
        if summary is not None:
            block.summary = summary
        if signature is not None:
            block.signature = signature

    def _finalize_tool_call(self, tool_use_id: str) -> ToolCall | None:
        buffer = self._tool_call_buffers.get(tool_use_id)
        if buffer is None:
            return None
        name = buffer.name or ""
        return ToolCall(
            id=tool_use_id,
            function=ToolCallFunction(name=name, arguments=buffer.arguments),
        )

    @staticmethod
    def _upsert_tool_call(message: AssistantChatMessage, tool_call: ToolCall) -> None:
        tool_calls = list(message.tool_calls or [])
        for idx, existing in enumerate(tool_calls):
            if existing.id == tool_call.id:
                tool_calls[idx] = tool_call
                message.tool_calls = tool_calls
                return
        tool_calls.append(tool_call)
        message.tool_calls = tool_calls

    def _finalize_tool_result(self, tool_use_id: str) -> ToolChatMessage | None:
        buffer = self._tool_result_buffers.get(tool_use_id)
        if buffer is None:
            return None
        tool_name = None
        tool_buffer = self._tool_call_buffers.get(tool_use_id)
        if tool_buffer and tool_buffer.name:
            tool_name = tool_buffer.name
        return ToolChatMessage(
            tool_call_id=tool_use_id,
            tool_name=tool_name,
            content=[TextContent(type="text", text=buffer.text)] if buffer.text else [],
            result=buffer.text if buffer.text else None,
            is_error=buffer.is_error,
        )


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    raw = payload.get("messageId")
    if isinstance(raw, str) and raw:
        return raw
    message = payload.get("message")
    if isinstance(message, dict):
        raw = message.get("id")
        if isinstance(raw, str) and raw:
            return raw
    raw = payload.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_message_id_from_sdk(message: Any) -> str:
    for key in ("uuid", "id", "message_id", "messageId"):
        value = getattr(message, key, None)
        if isinstance(value, str) and value:
            return value
    return str(create_new_id())


def _extract_delta_text(payload: dict[str, Any]) -> str:
    return _extract_text_from_obj(payload)


def _extract_text_from_obj(obj: Any) -> str:
    if isinstance(obj, str):
        return obj
    if isinstance(obj, TextBlock):
        return obj.text
    if isinstance(obj, dict):
        for key in ("delta", "text", "result", "message", "output"):
            raw = obj.get(key)
            if isinstance(raw, str) and raw:
                return raw
            if isinstance(raw, dict) or isinstance(raw, list):
                nested = _extract_text_from_obj(raw)
                if nested:
                    return nested
        content = obj.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for entry in content:
                text = _extract_text_from_obj(entry)
                if text:
                    parts.append(text)
            return "".join(parts)
    if isinstance(obj, list):
        parts: list[str] = []
        for entry in obj:
            text = _extract_text_from_obj(entry)
            if text:
                parts.append(text)
        return "".join(parts)
    return ""


def _append_message_text(message: AssistantChatMessage, delta: str) -> None:
    if not delta:
        return
    if message.content and isinstance(message.content[0], MessageTextContent):
        message.content[0].text += delta
        return
    message.content.insert(0, MessageTextContent(text=delta))


def _get_message_text(message: AssistantChatMessage) -> str:
    if message.content and isinstance(message.content[0], MessageTextContent):
        return message.content[0].text
    return ""


def _is_final_event(event_type: Any, payload: dict[str, Any]) -> bool:
    if isinstance(event_type, str) and event_type in {
        "result",
        "final",
        "message_stop",
        "complete",
        "done",
    }:
        return True
    if payload.get("final") is True:
        return True
    return False


def _extract_session_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("sessionId") or inputs.get("session_id") or inputs.get("resume")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _build_system_prompt_payload(system_prompt: str) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": "preset", "preset": "claude_code"}
    normalized = system_prompt.strip()
    if normalized:
        payload["append"] = normalized
    return payload


def _extract_session_id_from_event(payload: dict[str, Any]) -> str | None:
    for key in ("session_id", "sessionId"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    return None


def _extract_allowed_tools(context: ExternalAgentRunContext) -> list[str] | None:
    inputs = context.inputs or {}
    raw = inputs.get("allowedTools")
    if isinstance(raw, list):
        tools = [entry for entry in raw if isinstance(entry, str) and entry.strip()]
        if tools:
            return tools
    if context.profile and context.profile.toolAllowlist:
        return list(context.profile.toolAllowlist)
    return None


def _extract_mcp_config(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("mcpConfig")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _load_mcp_servers(path_str: str | None) -> dict[str, Any] | None:
    if not path_str:
        return None
    path = Path(path_str)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    raw = payload.get("mcpServers") or payload.get("mcp_servers")
    if isinstance(raw, dict):
        return raw
    return None


def _extract_latest_user_prompt(inputs: dict[str, Any] | None) -> str:
    if not inputs:
        return ""
    raw_messages = inputs.get("messages")
    latest = ""
    if isinstance(raw_messages, list):
        for raw in reversed(raw_messages):
            try:
                message = BaseChatMessageTypeAdapter.validate_python(raw)
            except Exception:
                continue
            role = getattr(message, "role", None)
            role_value = role.value if hasattr(role, "value") else role
            if role_value != ChatRole.user.value:
                continue
            text = _extract_message_text(message)
            if text:
                latest = text
                break
    if latest:
        return latest
    raw_prompt = inputs.get("prompt")
    if isinstance(raw_prompt, str) and raw_prompt.strip():
        return raw_prompt.strip()
    return ""


def _extract_thinking_budget(inputs: dict[str, Any]) -> int | None:
    thinking_payload = inputs.get("thinking")
    if thinking_payload is False or thinking_payload == "disabled":
        return None
    if thinking_payload is True:
        return _DEFAULT_THINKING_BUDGET
    if isinstance(thinking_payload, dict):
        budget = thinking_payload.get("budget_tokens")
        if budget is None:
            budget = thinking_payload.get("budgetTokens")
        parsed = _parse_optional_int(budget)
        if parsed is not None:
            return parsed
        if thinking_payload.get("type") == "enabled":
            return _DEFAULT_THINKING_BUDGET
    budget = inputs.get("thinkingBudgetTokens")
    if budget is None:
        budget = inputs.get("thinking_budget_tokens")
    return _parse_optional_int(budget)


def _parse_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, str):
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _extract_message_text(message: Any) -> str:
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for entry in content:
        if isinstance(entry, MessageTextContent) and entry.text:
            parts.append(entry.text)
    return "\n".join(parts).strip()


def _build_assistant_message(payload: dict[str, Any]) -> AssistantChatMessage:
    message_id = payload.get("id")
    if not isinstance(message_id, str) or not message_id:
        message_id = create_new_id()
    content_entries: list[Any] = []
    tool_calls: list[ToolCall] = []
    content = payload.get("content")
    if isinstance(content, list):
        for entry in content:
            if not isinstance(entry, dict):
                continue
            entry_type = entry.get("type")
            if entry_type == "text":
                text = entry.get("text")
                if isinstance(text, str):
                    content_entries.append(MessageTextContent(text=text))
            elif entry_type == "thinking":
                thinking = entry.get("thinking")
                signature = entry.get("signature")
                summary = _extract_thinking_summary(entry)
                if isinstance(thinking, str):
                    content_entries.append(
                        MessageThinkingContent(
                            thinking=thinking,
                            summary=summary,
                            signature=signature if isinstance(signature, str) else None,
                        )
                    )
            elif entry_type == "tool_use":
                tool_id = entry.get("id")
                tool_name = entry.get("name")
                if isinstance(tool_id, str) and tool_id:
                    tool_calls.append(
                        ToolCall(
                            id=tool_id,
                            function=ToolCallFunction(
                                name=tool_name if isinstance(tool_name, str) else "",
                                arguments=entry.get("input") or {},
                            ),
                        )
                    )
    message = AssistantChatMessage(id=message_id, content=content_entries)
    if tool_calls:
        message.tool_calls = tool_calls
    return message


def _ensure_text_block(content: list[Any], index: int) -> MessageTextContent:
    while len(content) <= index:
        content.append(MessageTextContent(text=""))
    entry = content[index]
    if isinstance(entry, MessageTextContent):
        return entry
    replacement = MessageTextContent(text="")
    content[index] = replacement
    return replacement


def _ensure_thinking_block(content: list[Any], index: int) -> MessageThinkingContent:
    while len(content) <= index:
        content.append(MessageThinkingContent(thinking="", signature=None))
    entry = content[index]
    if isinstance(entry, MessageThinkingContent):
        return entry
    replacement = MessageThinkingContent(thinking="", signature=None)
    content[index] = replacement
    return replacement


def _safe_json_dump(payload: Any) -> str:
    try:
        return json.dumps(payload)
    except (TypeError, ValueError):
        return ""


def _extract_tool_result_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, TextBlock):
        return payload.text
    if isinstance(payload, dict):
        text = payload.get("text")
        if isinstance(text, str):
            return text
        if "content" in payload:
            return _extract_tool_result_text(payload.get("content"))
    if isinstance(payload, list):
        parts: list[str] = []
        for entry in payload:
            part = _extract_tool_result_text(entry)
            if part:
                parts.append(part)
        return "".join(parts)
    return ""


def _extract_thinking_summary(payload: dict[str, Any]) -> str | None:
    for key in ("summary", "thinking_summary", "summary_text", "reasoning_summary"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _normalize_policy(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed


def _resolve_permission_mode(value: str | None) -> str | None:
    normalized = _normalize_policy(value)
    if not normalized:
        return None
    if normalized in _PERMISSION_MODE_VALUES:
        return normalized
    alias = _PERMISSION_MODE_ALIASES.get(normalized.lower())
    return alias


def _resolve_decision_policy(value: str | None) -> str:
    if not value:
        return "ask"
    normalized = value.lower()
    if "allow" in normalized or "auto" in normalized or "bypass" in normalized:
        return "allow"
    if "deny" in normalized or "block" in normalized:
        return "deny"
    return "ask"


def _normalize_max_turns(value: Any) -> int | None:
    parsed = _parse_optional_int(value)
    if parsed is None:
        return None
    return max(1, parsed)


def _build_sandbox_options(policy: str | None) -> dict[str, Any] | None:
    normalized = _normalize_policy(policy)
    if not normalized:
        return None
    if normalized.startswith("{") or normalized.startswith("["):
        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
    lowered = normalized.lower()
    if lowered in {
        "disabled",
        "off",
        "false",
        "0",
        "dangerously_disable",
        "dangerously-disable",
    }:
        return {"enabled": False}
    if lowered in {
        "allow_unsandboxed_commands",
        "allow-unsandboxed-commands",
        "allow_unsandboxed",
    }:
        return {"enabled": True, "allowUnsandboxedCommands": True}
    if lowered in {"enabled", "on", "true", "sandboxed"}:
        return {"enabled": True}
    return None


def _extract_model(context: ExternalAgentRunContext) -> str | None:
    if context.config.defaultModel:
        return context.config.defaultModel
    inputs = context.inputs or {}
    raw = inputs.get("model")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None

#!/usr/bin/env python3

import asyncio
import contextlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    SystemMessage,
)

try:
    from claude_agent_sdk import StreamEvent as ClaudeStreamEvent
except ImportError:
    try:
        from claude_agent_sdk.types import StreamEvent as ClaudeStreamEvent
    except ImportError:
        ClaudeStreamEvent = None


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


@dataclass
class ApprovalDecision:
    approved: bool
    updated_input: dict[str, Any] | None


@dataclass
class PendingApproval:
    future: asyncio.Future[ApprovalDecision]
    tool_name: str | None
    tool_input: dict[str, Any] | None


STRING_OPTION_FIELDS = (
    ("cwd", "cwd"),
    ("cliPath", "cli_path"),
    ("model", "model"),
    ("resume", "resume"),
    ("permissionMode", "permission_mode"),
)

INT_OPTION_FIELDS = (
    ("maxTurns", "max_turns"),
    ("maxThinkingTokens", "max_thinking_tokens"),
)

JSON_PRIMITIVE_TYPES = (bool, int, float, str)
JSONABLE_METHOD_NAMES = ("model_dump", "dict")
MISSING_JSONABLE_VALUE = object()


def write_event(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def stringify_error(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return exc.__class__.__name__


def log_debug(message: str) -> None:
    print(message, file=sys.stderr)


def coerce_jsonable_container(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): to_jsonable(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(entry) for entry in value]
    return MISSING_JSONABLE_VALUE


def extract_jsonable_object_state(value: Any) -> Any:
    for method_name in JSONABLE_METHOD_NAMES:
        dumper = getattr(value, method_name, None)
        if callable(dumper):
            return dumper()
    object_state = getattr(value, "__dict__", None)
    if object_state is not None:
        return vars(value)
    return MISSING_JSONABLE_VALUE


def to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, JSON_PRIMITIVE_TYPES):
        return value
    container = coerce_jsonable_container(value)
    if container is not MISSING_JSONABLE_VALUE:
        return container
    object_state = extract_jsonable_object_state(value)
    if object_state is not MISSING_JSONABLE_VALUE:
        return to_jsonable(object_state)
    return str(value)


def normalize_tool_name(value: str | None) -> str:
    if not isinstance(value, str):
        return ""
    trimmed = value.strip()
    if not trimmed:
        return ""
    normalized = trimmed
    if normalized.startswith("mcp__"):
        normalized = normalized[len("mcp__") :]
    if normalized.startswith("setta_") and not normalized.startswith("setta__"):
        normalized = "setta__" + normalized[len("setta_") :]
    if not trimmed.startswith("mcp__") and normalized.lower() == "question":
        return "AskUserQuestion"
    return normalized


def parse_non_negative_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < 0:
        return None
    return value


def normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def normalize_passthrough_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    return None


def normalize_string_dict(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    normalized = {
        str(key): str(entry)
        for key, entry in value.items()
        if isinstance(key, str) and entry is not None
    }
    if not normalized:
        return None
    return normalized


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for entry in value:
        stripped = normalize_optional_string(entry)
        if stripped is not None:
            normalized.append(stripped)
    return normalized


def collect_mapped_options(
    payload: dict[str, Any],
    field_specs: tuple[tuple[str, str], ...],
    normalizer: Callable[[Any], Any],
) -> dict[str, Any]:
    options: dict[str, Any] = {}
    for payload_key, option_key in field_specs:
        value = normalizer(payload.get(payload_key))
        if value is not None:
            options[option_key] = value
    return options


def build_system_prompt_payload(value: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "preset",
        "preset": "claude_code",
    }
    system_prompt = normalize_optional_string(value)
    if system_prompt is not None:
        payload["append"] = system_prompt
    return payload


def attach_session_id(event: dict[str, Any], *candidates: Any) -> dict[str, Any]:
    for candidate in candidates:
        session_id = normalize_optional_string(candidate)
        if session_id is None:
            continue
        event["sessionId"] = session_id
        break
    return event


def normalize_usage_payload(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return dict(value)


def first_context_usage_int(
    context_usage: dict[str, Any], *field_names: str, positive_only: bool = False
) -> int | None:
    for field_name in field_names:
        value = parse_non_negative_int(context_usage.get(field_name))
        if value is None:
            continue
        if positive_only and value <= 0:
            continue
        return value
    return None


def apply_usage_value(
    usage: dict[str, Any],
    field_name: str,
    value: int | None,
    *,
    overwrite: bool = True,
) -> None:
    if value is None:
        return
    if overwrite:
        usage[field_name] = value
        return
    usage.setdefault(field_name, value)


def merge_context_usage(
    result_usage: dict[str, Any] | None,
    context_usage: dict[str, Any] | None,
) -> dict[str, Any] | None:
    usage = normalize_usage_payload(result_usage)
    context = normalize_usage_payload(context_usage)
    if context is None:
        return usage
    if usage is None:
        usage = {}

    context_window_tokens = first_context_usage_int(
        context, "rawMaxTokens", "maxTokens", positive_only=True
    )
    effective_window_tokens = first_context_usage_int(
        context, "maxTokens", positive_only=True
    )
    if effective_window_tokens == context_window_tokens:
        effective_window_tokens = None

    apply_usage_value(
        usage, "contextUsedTokens", first_context_usage_int(context, "totalTokens")
    )
    apply_usage_value(usage, "contextWindowTokens", context_window_tokens)
    apply_usage_value(
        usage,
        "effectiveContextWindowTokens",
        effective_window_tokens,
        overwrite=False,
    )
    apply_usage_value(
        usage,
        "autoCompactThresholdTokens",
        first_context_usage_int(context, "autoCompactThreshold", positive_only=True),
        overwrite=False,
    )

    return usage if usage else None


def is_stream_event_message(message: Any) -> bool:
    if ClaudeStreamEvent is not None:
        return isinstance(message, ClaudeStreamEvent)
    return hasattr(message, "event") or hasattr(message, "stream_event")


def normalize_allowed_tool(value: Any) -> str | None:
    normalized = normalize_optional_string(value)
    if normalized is None:
        return None
    if normalized.lower() == "askuserquestion":
        return "question"
    return normalized


def normalize_allowed_tools(raw_tools: list[Any] | None) -> list[str]:
    if not isinstance(raw_tools, list):
        return []
    normalized = [
        value for raw in raw_tools if (value := normalize_allowed_tool(raw)) is not None
    ]
    return list(dict.fromkeys(normalized))


def load_mcp_servers(path_value: str | None) -> dict[str, Any] | None:
    if not isinstance(path_value, str) or not path_value.strip():
        return None
    path = Path(path_value.strip())
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    raw = payload.get("mcpServers")
    if isinstance(raw, dict):
        return raw
    return None


def normalize_stream_event(payload: dict[str, Any]) -> dict[str, Any]:
    content_block = payload.get("content_block")
    if isinstance(content_block, dict) and content_block.get("type") == "tool_use":
        tool_name = normalize_tool_name(content_block.get("name"))
        if tool_name:
            content_block = dict(content_block)
            content_block["name"] = tool_name
            payload = dict(payload)
            payload["content_block"] = content_block
    return payload


def normalize_assistant_content_entry(raw_entry: Any) -> tuple[Any, bool]:
    if not isinstance(raw_entry, dict) or raw_entry.get("type") != "tool_use":
        return raw_entry, False
    tool_name = normalize_tool_name(raw_entry.get("name"))
    if not tool_name or tool_name == raw_entry.get("name"):
        return raw_entry, False
    return {**raw_entry, "name": tool_name}, True


def normalize_assistant_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_content = payload.get("content")
    if not isinstance(raw_content, list):
        return payload
    normalized_entries = [
        normalize_assistant_content_entry(entry) for entry in raw_content
    ]
    changed = any(changed for _, changed in normalized_entries)
    if not changed:
        return payload
    normalized = dict(payload)
    normalized["content"] = [entry for entry, _ in normalized_entries]
    return normalized


def extract_updated_input(payload: dict[str, Any]) -> dict[str, Any] | None:
    updated_input = payload.get("updatedInput")
    if isinstance(updated_input, dict):
        return updated_input
    inner = payload.get("payload")
    if isinstance(inner, dict) and isinstance(inner.get("updatedInput"), dict):
        return inner.get("updatedInput")
    return None


def extract_answers(payload: dict[str, Any]) -> dict[str, Any] | None:
    answers = payload.get("answers")
    if isinstance(answers, dict):
        return answers
    inner = payload.get("payload")
    if isinstance(inner, dict):
        nested = inner.get("answers")
        if isinstance(nested, dict):
            return nested
    return None


async def open_stdin_reader() -> asyncio.StreamReader:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)
    return reader


class ClaudeSidecar:
    def __init__(self, start_payload: dict[str, Any], reader: asyncio.StreamReader):
        self.start_payload = start_payload
        self.reader = reader
        self.pending_approvals: dict[str, PendingApproval] = {}

    async def can_use_tool(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        tool_context: Any = None,
    ) -> PermissionResultAllow | PermissionResultDeny:
        normalized_tool_name = normalize_tool_name(tool_name)
        normalized_tool_input = tool_input if isinstance(tool_input, dict) else {}
        decision_policy = str(self.start_payload.get("decisionPolicy") or "ask")
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

        approval_id = str(uuid4())
        tool_type = None
        if tool_context is not None:
            tool_type = getattr(tool_context, "tool_type", None) or getattr(
                tool_context, "toolType", None
            )
        write_event(
            {
                "type": "approval_request",
                "approvalId": approval_id,
                "tool": normalized_tool_name,
                "toolName": normalized_tool_name,
                "toolType": tool_type,
                "input": to_jsonable(normalized_tool_input),
            }
        )
        future: asyncio.Future[ApprovalDecision] = (
            asyncio.get_running_loop().create_future()
        )
        self.pending_approvals[approval_id] = PendingApproval(
            future=future,
            tool_name=normalized_tool_name,
            tool_input=normalized_tool_input,
        )
        decision = await future
        self.pending_approvals.pop(approval_id, None)
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

    async def read_commands(self) -> None:
        while True:
            raw = await self.reader.readline()
            if not raw:
                break
            line = raw.decode("utf-8").strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                write_event(
                    {
                        "type": "error",
                        "message": f"Failed to decode Claude sidecar command: {exc}",
                    }
                )
                continue
            self.handle_command(payload)

    def build_options(self) -> ClaudeAgentOptions:
        options: dict[str, Any] = {
            "include_partial_messages": True,
            "can_use_tool": self.can_use_tool,
            "extra_args": {"debug-to-stderr": None},
            "stderr": lambda line: print(line, file=sys.stderr),
            "system_prompt": build_system_prompt_payload(
                self.start_payload.get("systemPrompt")
            ),
        }
        options.update(
            collect_mapped_options(
                self.start_payload, STRING_OPTION_FIELDS, normalize_optional_string
            )
        )
        env = normalize_string_dict(self.start_payload.get("env"))
        if env is not None:
            options["env"] = env
        allowed_tools = normalize_allowed_tools(self.start_payload.get("allowedTools"))
        if allowed_tools:
            options["allowed_tools"] = allowed_tools
        options.update(
            collect_mapped_options(
                self.start_payload, INT_OPTION_FIELDS, normalize_passthrough_int
            )
        )
        sandbox = self.start_payload.get("sandbox")
        if isinstance(sandbox, dict):
            options["sandbox"] = sandbox
        normalized_sources = normalize_string_list(
            self.start_payload.get("settingSources")
        )
        if normalized_sources:
            options["setting_sources"] = normalized_sources
        mcp_servers = load_mcp_servers(self.start_payload.get("mcpConfigPath"))
        if mcp_servers:
            options["mcp_servers"] = mcp_servers
        return ClaudeAgentOptions(**options)

    async def read_context_usage(self, client: Any) -> dict[str, Any] | None:
        getter = getattr(client, "get_context_usage", None)
        if not callable(getter):
            return None
        try:
            payload = to_jsonable(await getter())
        except Exception as exc:
            log_debug(
                f"setta: failed to read Claude context usage via SDK: {stringify_error(exc)}"
            )
            return None
        if isinstance(payload, dict):
            return payload
        return None

    def pending_approval_for(
        self, payload: dict[str, Any], id_field: str
    ) -> PendingApproval | None:
        approval_id = str(payload.get(id_field) or "").strip()
        pending = self.pending_approvals.get(approval_id)
        if pending is None or pending.future.done():
            return None
        return pending

    def build_tool_response_input(
        self, payload: dict[str, Any], pending: PendingApproval
    ) -> dict[str, Any] | None:
        updated_input = extract_updated_input(payload)
        if updated_input is not None:
            return updated_input
        answers = extract_answers(payload)
        if not answers or pending.tool_name != "AskUserQuestion":
            return None
        base_input = pending.tool_input if isinstance(pending.tool_input, dict) else {}
        return {**base_input, "answers": answers}

    def handle_command(self, payload: dict[str, Any]) -> None:
        command_type = str(payload.get("type") or "").strip()
        if command_type == "approval_response":
            pending = self.pending_approval_for(payload, "approvalId")
            if pending is None:
                return
            pending.future.set_result(
                ApprovalDecision(
                    approved=bool(payload.get("approved")),
                    updated_input=None,
                )
            )
            return
        if command_type != "tool_response":
            return
        pending = self.pending_approval_for(payload, "toolCallId")
        if pending is None:
            return
        updated_input = self.build_tool_response_input(payload, pending)
        pending.future.set_result(
            ApprovalDecision(
                approved=updated_input is not None,
                updated_input=updated_input,
            )
        )

    def build_stream_event_payload(self, message: Any) -> dict[str, Any] | None:
        payload = to_jsonable(
            getattr(message, "event", None) or getattr(message, "stream_event", None)
        )
        if not isinstance(payload, dict):
            return None
        event = {"type": "stream_event", "event": normalize_stream_event(payload)}
        return attach_session_id(event, getattr(message, "session_id", None))

    def build_assistant_event_payload(
        self, message: AssistantMessage
    ) -> dict[str, Any] | None:
        payload = to_jsonable(message)
        if not isinstance(payload, dict):
            return None
        event = {
            "type": "assistant_message",
            "message": normalize_assistant_payload(payload),
        }
        return attach_session_id(
            event, payload.get("session_id"), payload.get("sessionId")
        )

    def build_system_event_payload(
        self, message: SystemMessage
    ) -> dict[str, Any] | None:
        payload = to_jsonable(message)
        if not isinstance(payload, dict):
            return None
        event = {"type": "system_message", "message": payload}
        return attach_session_id(
            event,
            getattr(message, "session_id", None),
            payload.get("session_id"),
            payload.get("sessionId"),
        )

    async def build_result_event_payload(
        self, message: ResultMessage, client: Any | None
    ) -> dict[str, Any]:
        usage = to_jsonable(getattr(message, "usage", None))
        if not isinstance(usage, dict):
            usage = None
        if client is not None:
            usage = merge_context_usage(usage, await self.read_context_usage(client))
        return {
            "type": "result",
            "sessionId": getattr(message, "session_id", None),
            "isError": bool(getattr(message, "is_error", False)),
            "result": getattr(message, "result", None),
            "usage": usage,
        }

    async def handle_message(self, message: Any, client: Any | None = None) -> None:
        event: dict[str, Any] | None = None
        if is_stream_event_message(message):
            event = self.build_stream_event_payload(message)
        elif isinstance(message, AssistantMessage):
            event = self.build_assistant_event_payload(message)
        elif isinstance(message, SystemMessage):
            event = self.build_system_event_payload(message)
        elif isinstance(message, ResultMessage):
            event = await self.build_result_event_payload(message, client)
        if event is not None:
            write_event(event)

    async def run(self) -> int:
        prompt = str(self.start_payload.get("prompt") or "")
        session_id = self.start_payload.get("resume")
        options = self.build_options()
        command_task = asyncio.create_task(self.read_commands())
        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(
                    prompt=prompt,
                    session_id=session_id or "default",
                )
                async for message in client.receive_response():
                    await self.handle_message(message, client)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            write_event({"type": "error", "message": stringify_error(exc)})
            return 1
        finally:
            for pending in self.pending_approvals.values():
                if pending.future.done():
                    continue
                pending.future.cancel()
            command_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await command_task
        return 0


async def read_start_payload(reader: asyncio.StreamReader) -> dict[str, Any]:
    raw = await reader.readline()
    if not raw:
        raise RuntimeError("Claude sidecar did not receive a start payload.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Claude sidecar start payload is not valid JSON: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Claude sidecar start payload must be a JSON object.")
    if str(payload.get("type") or "").strip() != "start":
        raise RuntimeError(
            "Claude sidecar expected the first payload to be type=start."
        )
    return payload


async def main() -> int:
    reader = await open_stdin_reader()
    try:
        start_payload = await read_start_payload(reader)
    except Exception as exc:
        write_event({"type": "error", "message": stringify_error(exc)})
        return 1
    sidecar = ClaudeSidecar(start_payload, reader)
    return await sidecar.run()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

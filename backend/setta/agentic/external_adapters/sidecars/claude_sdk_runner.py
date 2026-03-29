#!/usr/bin/env python3

import asyncio
import contextlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
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


def to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): to_jsonable(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(entry) for entry in value]
    if hasattr(value, "model_dump"):
        return to_jsonable(value.model_dump())
    if hasattr(value, "dict"):
        return to_jsonable(value.dict())
    if hasattr(value, "__dict__"):
        return to_jsonable(vars(value))
    return str(value)


def normalize_tool_name(value: str | None) -> str:
    if not isinstance(value, str):
        return ""
    trimmed = value.strip()
    if trimmed.lower() == "question":
        return "AskUserQuestion"
    return trimmed


def parse_non_negative_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < 0:
        return None
    return value


def merge_context_usage(
    result_usage: dict[str, Any] | None,
    context_usage: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not isinstance(result_usage, dict):
        result_usage = None
    if not isinstance(context_usage, dict):
        return result_usage

    usage = dict(result_usage) if result_usage is not None else {}

    context_used_tokens = parse_non_negative_int(context_usage.get("totalTokens"))
    if context_used_tokens is not None:
        usage["contextUsedTokens"] = context_used_tokens

    context_window_tokens = parse_non_negative_int(context_usage.get("rawMaxTokens"))
    if context_window_tokens is None or context_window_tokens <= 0:
        context_window_tokens = parse_non_negative_int(context_usage.get("maxTokens"))
    if context_window_tokens is not None and context_window_tokens > 0:
        usage["contextWindowTokens"] = context_window_tokens

    effective_window_tokens = parse_non_negative_int(context_usage.get("maxTokens"))
    if (
        effective_window_tokens is not None
        and effective_window_tokens > 0
        and effective_window_tokens != context_window_tokens
        and "effectiveContextWindowTokens" not in usage
    ):
        usage["effectiveContextWindowTokens"] = effective_window_tokens

    auto_compact_threshold = parse_non_negative_int(
        context_usage.get("autoCompactThreshold")
    )
    if (
        auto_compact_threshold is not None
        and auto_compact_threshold > 0
        and "autoCompactThresholdTokens" not in usage
    ):
        usage["autoCompactThresholdTokens"] = auto_compact_threshold

    return usage if usage else None


def is_stream_event_message(message: Any) -> bool:
    if ClaudeStreamEvent is not None:
        return isinstance(message, ClaudeStreamEvent)
    return hasattr(message, "event") or hasattr(message, "stream_event")


def normalize_allowed_tools(raw_tools: list[Any] | None) -> list[str]:
    if not isinstance(raw_tools, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_tools:
        if not isinstance(raw, str):
            continue
        value = raw.strip()
        if not value:
            continue
        if value.lower() == "askuserquestion":
            value = "question"
        if value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return normalized


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


def normalize_assistant_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_content = payload.get("content")
    if not isinstance(raw_content, list):
        return payload
    content = []
    changed = False
    for raw_entry in raw_content:
        if not isinstance(raw_entry, dict):
            content.append(raw_entry)
            continue
        if raw_entry.get("type") != "tool_use":
            content.append(raw_entry)
            continue
        entry = dict(raw_entry)
        tool_name = normalize_tool_name(entry.get("name"))
        if tool_name and tool_name != entry.get("name"):
            entry["name"] = tool_name
            changed = True
        content.append(entry)
    if not changed:
        return payload
    normalized = dict(payload)
    normalized["content"] = content
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
            command_type = str(payload.get("type") or "").strip()
            if command_type == "approval_response":
                approval_id = str(payload.get("approvalId") or "").strip()
                pending = self.pending_approvals.get(approval_id)
                if pending is None or pending.future.done():
                    continue
                pending.future.set_result(
                    ApprovalDecision(
                        approved=bool(payload.get("approved")),
                        updated_input=None,
                    )
                )
            elif command_type == "tool_response":
                tool_call_id = str(payload.get("toolCallId") or "").strip()
                pending = self.pending_approvals.get(tool_call_id)
                if pending is None or pending.future.done():
                    continue
                updated_input = extract_updated_input(payload)
                answers = extract_answers(payload)
                if (
                    updated_input is None
                    and answers
                    and pending.tool_name == "AskUserQuestion"
                ):
                    base_input = (
                        pending.tool_input
                        if isinstance(pending.tool_input, dict)
                        else {}
                    )
                    updated_input = {**base_input, "answers": answers}
                pending.future.set_result(
                    ApprovalDecision(
                        approved=updated_input is not None,
                        updated_input=updated_input,
                    )
                )

    def build_options(self) -> ClaudeAgentOptions:
        options: dict[str, Any] = {
            "include_partial_messages": True,
            "can_use_tool": self.can_use_tool,
            "extra_args": {"debug-to-stderr": None},
            "stderr": lambda line: print(line, file=sys.stderr),
        }
        system_prompt = str(self.start_payload.get("systemPrompt") or "").strip()
        system_prompt_payload: dict[str, Any] = {
            "type": "preset",
            "preset": "claude_code",
        }
        if system_prompt:
            system_prompt_payload["append"] = system_prompt
        options["system_prompt"] = system_prompt_payload
        cwd = self.start_payload.get("cwd")
        if isinstance(cwd, str) and cwd.strip():
            options["cwd"] = cwd.strip()
        env = self.start_payload.get("env")
        if isinstance(env, dict):
            options["env"] = {
                str(key): str(value)
                for key, value in env.items()
                if isinstance(key, str) and value is not None
            }
        cli_path = self.start_payload.get("cliPath")
        if isinstance(cli_path, str) and cli_path.strip():
            options["cli_path"] = cli_path.strip()
        allowed_tools = normalize_allowed_tools(self.start_payload.get("allowedTools"))
        if allowed_tools:
            options["allowed_tools"] = allowed_tools
        model = self.start_payload.get("model")
        if isinstance(model, str) and model.strip():
            options["model"] = model.strip()
        resume = self.start_payload.get("resume")
        if isinstance(resume, str) and resume.strip():
            options["resume"] = resume.strip()
        permission_mode = self.start_payload.get("permissionMode")
        if isinstance(permission_mode, str) and permission_mode.strip():
            options["permission_mode"] = permission_mode.strip()
        max_turns = self.start_payload.get("maxTurns")
        if isinstance(max_turns, int):
            options["max_turns"] = max_turns
        max_thinking_tokens = self.start_payload.get("maxThinkingTokens")
        if isinstance(max_thinking_tokens, int):
            options["max_thinking_tokens"] = max_thinking_tokens
        sandbox = self.start_payload.get("sandbox")
        if isinstance(sandbox, dict):
            options["sandbox"] = sandbox
        setting_sources = self.start_payload.get("settingSources")
        if isinstance(setting_sources, list):
            normalized_sources = [
                str(entry).strip()
                for entry in setting_sources
                if isinstance(entry, str) and entry.strip()
            ]
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

    async def handle_message(self, message: Any, client: Any | None = None) -> None:
        if is_stream_event_message(message):
            payload = to_jsonable(
                getattr(message, "event", None)
                or getattr(message, "stream_event", None)
            )
            if not isinstance(payload, dict):
                return
            payload = normalize_stream_event(payload)
            event = {"type": "stream_event", "event": payload}
            session_id = getattr(message, "session_id", None)
            if isinstance(session_id, str) and session_id.strip():
                event["sessionId"] = session_id.strip()
            write_event(event)
            return
        if isinstance(message, AssistantMessage):
            payload = to_jsonable(message)
            if not isinstance(payload, dict):
                return
            payload = normalize_assistant_payload(payload)
            event = {"type": "assistant_message", "message": payload}
            session_id = payload.get("session_id") or payload.get("sessionId")
            if isinstance(session_id, str) and session_id.strip():
                event["sessionId"] = session_id.strip()
            write_event(event)
            return
        if isinstance(message, SystemMessage):
            payload = to_jsonable(message)
            if not isinstance(payload, dict):
                return
            event = {"type": "system_message", "message": payload}
            session_id = getattr(message, "session_id", None)
            if not isinstance(session_id, str) or not session_id.strip():
                session_id = payload.get("session_id") or payload.get("sessionId")
            if isinstance(session_id, str) and session_id.strip():
                event["sessionId"] = session_id.strip()
            write_event(event)
            return
        if isinstance(message, ResultMessage):
            usage = to_jsonable(getattr(message, "usage", None))
            if not isinstance(usage, dict):
                usage = None
            if client is not None:
                usage = merge_context_usage(usage, await self.read_context_usage(client))
            payload = {
                "type": "result",
                "sessionId": getattr(message, "session_id", None),
                "isError": bool(getattr(message, "is_error", False)),
                "result": getattr(message, "result", None),
                "usage": usage,
            }
            write_event(payload)
            return

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

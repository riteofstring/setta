import asyncio
import json
from contextlib import suppress
from pathlib import Path
from typing import Any, AsyncIterator

from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
    ExternalAgentStreamEvent,
)
from setta.agentic.external_adapters.prompt_utils import build_prompt_from_inputs
from setta.agentic.external_adapters.stream_utils import (
    iter_stream_lines,
    parse_json_line,
)
from setta.database.utils import create_new_id
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
)
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType

_PLUGIN_ADAPTER_STDERR_MAX_LINES = 200
_PLUGIN_DONE_EXIT_GRACE_SECONDS = 0.25
_PLUGIN_DONE_TERMINATE_TIMEOUT_SECONDS = 0.5


class PluginProcessExternalAgentAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.plugin

    def __init__(
        self,
        *,
        adapter_id: str,
        name: str,
        supported_run_modes: set[ExternalAgentRunMode],
        command: str,
        args: tuple[str, ...],
        default_model: str | None,
    ) -> None:
        self.adapter_id = adapter_id
        self.name = name
        self.supported_run_modes = set(supported_run_modes)
        self.command = command
        self.args = tuple(args)
        self.default_model = default_model

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        command = self._build_command(context)
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=context.env,
        )
        stderr_lines: list[str] = []
        handle = ExternalAgentRunHandle(
            run_id=context.run.id,
            process=process,
            metadata={
                "stderr_lines": stderr_lines,
                "pluginAdapterId": self.adapter_id,
            },
        )
        start_payload = {
            "type": "setta_external_agent_start",
            "adapterId": self.adapter_id,
            "runId": str(context.run.id),
            "runMode": context.config.runMode.value,
            "model": context.config.defaultModel or self.default_model,
            "prompt": build_prompt_from_inputs("", context.inputs),
            "inputs": context.inputs,
            "systemPrompt": context.system_prompt,
            "workingDir": str(context.working_dir),
            "projectConfigId": str(context.project_config_id),
            "chatId": str(context.chat_id),
            "sectionId": str(context.section_id) if context.section_id else None,
        }
        if process.stdin is not None:
            process.stdin.write((json.dumps(start_payload) + "\n").encode("utf-8"))
            await process.stdin.drain()
        return handle

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        process = handle.process
        if process is None or process.stdout is None:
            return
        stderr_task: asyncio.Task[None] | None = None
        stderr_lines = handle.metadata.get("stderr_lines")
        if not isinstance(stderr_lines, list):
            stderr_lines = []
            handle.metadata["stderr_lines"] = stderr_lines
        if process.stderr is not None:
            stderr_task = asyncio.create_task(
                self._stream_stderr(process.stderr, stderr_lines)
            )

        message_id: str | None = None
        message_text_parts: list[str] = []
        message_text_part_is_plain_fallback: list[bool] = []
        done_event_received = False
        async for line in iter_stream_lines(process.stdout):
            if not line:
                continue
            payload = parse_json_line(line)
            if isinstance(payload, dict):
                session_id = payload.get("sessionId")
                if isinstance(session_id, str) and session_id:
                    handle.session_id = session_id
                thread_id = payload.get("threadId")
                if isinstance(thread_id, str) and thread_id:
                    handle.thread_id = thread_id
                event_type = payload.get("type")
                if event_type == "approval_request":
                    yield ExternalAgentStreamEvent(raw=payload)
                    continue
                if event_type == "done":
                    raw_return_code = payload.get("returnCode")
                    if isinstance(raw_return_code, int):
                        handle.return_code = raw_return_code
                    done_event_received = True
                    break
                text = payload.get("text")
                if isinstance(text, str) and text:
                    if message_id is None:
                        message_id = str(create_new_id())
                        start_message = AssistantChatMessage(
                            id=message_id,
                            content=[],
                        )
                        yield ExternalAgentStreamEvent(
                            raw={"type": "message_start", "messageId": message_id},
                            stream_chunk=MessageStartEvent(message=start_message),
                    )
                    message_text_parts.append(text)
                    message_text_part_is_plain_fallback.append(False)
                    yield ExternalAgentStreamEvent(
                        raw={"type": "delta", "messageId": message_id, "text": text},
                        stream_chunk=MessageDeltaEvent(
                            message_id=message_id,
                            content=[MessageTextDelta(index=0, text=text)],
                        ),
                    )
                    continue
                yield ExternalAgentStreamEvent(raw=payload)
                continue

            if message_id is None:
                message_id = str(create_new_id())
                start_message = AssistantChatMessage(
                    id=message_id,
                    content=[],
                )
                yield ExternalAgentStreamEvent(
                    raw={"type": "message_start", "messageId": message_id},
                    stream_chunk=MessageStartEvent(message=start_message),
                )
            message_text_parts.append(line)
            message_text_part_is_plain_fallback.append(True)
            yield ExternalAgentStreamEvent(
                raw={"type": "delta", "messageId": message_id, "text": line},
                stream_chunk=MessageDeltaEvent(
                    message_id=message_id,
                    content=[MessageTextDelta(index=0, text=line)],
                ),
            )

        if message_id is not None:
            assembled_parts: list[str] = []
            for index, message_text_part in enumerate(message_text_parts):
                if (
                    index > 0
                    and message_text_part_is_plain_fallback[index]
                    and message_text_part_is_plain_fallback[index - 1]
                ):
                    assembled_parts.append("\n")
                assembled_parts.append(message_text_part)
            message_text = "".join(assembled_parts)
            yield ExternalAgentStreamEvent(
                raw={"type": "message_stop", "messageId": message_id},
                stream_chunk=MessageStopEvent(message_id=message_id),
            )
            finalized_message = AssistantChatMessage(
                id=message_id,
                content=[MessageTextContent(type="text", text=message_text)],
            )
            yield ExternalAgentStreamEvent(
                raw={"type": "message_finalized", "messageId": message_id},
                stream_chunk=MessageFinalizedEvent(message=finalized_message),
            )

        if done_event_received:
            await self._stop_stderr_stream(stderr_task)
            await self._finalize_after_done(handle)
            return

        if stderr_task is not None:
            await stderr_task
        if handle.return_code is None:
            handle.return_code = await process.wait()

    @staticmethod
    async def _stream_stderr(
        stream: asyncio.StreamReader,
        stderr_lines: list[str],
    ) -> None:
        async for line in iter_stream_lines(stream):
            if not line:
                continue
            stderr_lines.append(line)
            if len(stderr_lines) > _PLUGIN_ADAPTER_STDERR_MAX_LINES:
                del stderr_lines[: len(stderr_lines) - _PLUGIN_ADAPTER_STDERR_MAX_LINES]

    @staticmethod
    async def _stop_stderr_stream(stderr_task: asyncio.Task[None] | None) -> None:
        if stderr_task is None:
            return
        if not stderr_task.done():
            stderr_task.cancel()
        with suppress(asyncio.CancelledError):
            await stderr_task

    @staticmethod
    async def _finalize_after_done(handle: ExternalAgentRunHandle) -> None:
        process = handle.process
        if process is None:
            return
        if process.returncode is None:
            try:
                await asyncio.wait_for(
                    process.wait(),
                    timeout=_PLUGIN_DONE_EXIT_GRACE_SECONDS,
                )
            except asyncio.TimeoutError:
                process.terminate()
                try:
                    await asyncio.wait_for(
                        process.wait(),
                        timeout=_PLUGIN_DONE_TERMINATE_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
        if handle.return_code is None:
            handle.return_code = process.returncode

    async def cancel_run(self, handle: ExternalAgentRunHandle) -> None:
        process = handle.process
        if process is None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()
            await asyncio.wait_for(process.wait(), timeout=5)
        handle.return_code = process.returncode

    async def send_approval_response(
        self, handle: ExternalAgentRunHandle, approval_id: str, approved: bool
    ) -> None:
        process = handle.process
        if process is None or process.stdin is None:
            raise RuntimeError("Plugin adapter process stdin not available")
        payload = {
            "type": "approval_response",
            "approvalId": approval_id,
            "approved": approved,
        }
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        process = handle.process
        if process is None or process.stdin is None:
            raise RuntimeError("Plugin adapter process stdin not available")
        message: dict[str, Any] = {
            "type": "tool_response",
            "toolCallId": tool_call_id,
        }
        if payload:
            message.update(payload)
        process.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
        await process.stdin.drain()

    def _build_command(self, context: ExternalAgentRunContext) -> list[str]:
        command_override = (context.config.commandPath or "").strip()
        command = command_override or self.command
        return [str(Path(command)), *self.args]

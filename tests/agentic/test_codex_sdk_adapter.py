import asyncio
import json
import sys
import unittest
from pathlib import Path

from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.agentic.external_adapters.base import ExternalAgentRunHandle
from setta.agentic.external_adapters.codex_sdk import (
    CodexSdkAdapter,
    _CodexSdkEventParser,
    _extract_thread_id,
    _maybe_set_thread_id,
)
from setta.types.agentic import AgentRun
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageThinkingDelta,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID


class CodexSdkAdapterParserTests(unittest.TestCase):
    def test_item_start_emits_message_start(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle({"type": "item.started", "item": {"id": "msg-1"}})

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageStartEvent)
        if isinstance(chunk, MessageStartEvent):
            self.assertEqual(chunk.message.id, "msg-1")

    def test_item_delta_emits_message_delta(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-2"}})
        events = parser.handle(
            {"type": "item.delta", "item": {"id": "msg-2"}, "delta": "Hello"}
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageDeltaEvent)
        if isinstance(chunk, MessageDeltaEvent):
            self.assertEqual(chunk.message_id, "msg-2")
            self.assertEqual(chunk.content[0].text, "Hello")

    def test_item_complete_emits_stop_and_finalize(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-3"}})
        parser.handle(
            {"type": "item.delta", "item": {"id": "msg-3"}, "delta": "Hi"}
        )
        events = parser.handle({"type": "item.completed", "item": {"id": "msg-3"}})

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageFinalizedEvent)

    def test_item_delta_emits_start_with_content_blocks(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.delta",
                "item": {"id": "msg-4", "content": [{"text": "From content"}]},
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.message_id, "msg-4")
            self.assertEqual(events[1].stream_chunk.content[0].text, "From content")

    def test_item_delta_reads_content_string(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.delta",
                "item": {"id": "msg-5", "content": "Content string"},
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.content[0].text, "Content string")

    def test_item_complete_emits_delta_when_text_in_item(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.completed",
                "item": {"id": "msg-6", "text": "Done"},
            }
        )

        self.assertEqual(len(events), 4)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        self.assertIsInstance(events[2].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[3].stream_chunk, MessageFinalizedEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.content[0].text, "Done")

    def test_reasoning_summary_delta_emits_thinking_delta(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item/started",
                "item": {"id": "reason-1", "type": "reasoning", "summary": []},
            }
        )
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)

        events = parser.handle(
            {
                "type": "item/reasoning/summaryTextDelta",
                "itemId": "reason-1",
                "delta": "Planning steps",
            }
        )
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.summary, "Planning steps")

    def test_reasoning_item_start_emits_summary_and_thinking(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.started",
                "item": {
                    "id": "reason-2",
                    "type": "reasoning",
                    "summary": [{"text": "Summary"}],
                    "content": [{"text": "Plan"}],
                },
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.thinking, "Plan")
                self.assertEqual(delta.summary, "Summary")

    def test_reasoning_item_update_emits_thinking_delta(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.update",
                "item": {
                    "id": "reason-3",
                    "type": "reasoning",
                    "summary": "Summary update",
                    "content": "Thinking update",
                },
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.thinking, "Thinking update")
                self.assertEqual(delta.summary, "Summary update")

    def test_reasoning_text_delta_emits_thinking_delta(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.reasoning.textDelta",
                "itemId": "reason-4",
                "delta": "Idea",
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.thinking, "Idea")

    def test_reasoning_summary_part_added_emits_newline(self) -> None:
        parser = _CodexSdkEventParser()
        events = parser.handle(
            {
                "type": "item.reasoning.summaryPartAdded",
                "itemId": "reason-5",
                "delta": "",
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.summary, "\n")

    def test_build_command_uses_node_path(self) -> None:
        adapter = CodexSdkAdapter()
        config = ExternalAgentConfig(
            name="Codex SDK",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.sdk,
            commandPath="/usr/local/bin/node",
        )
        context = ExternalAgentRunContext(
            run=AgentRun(),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs=None,
            system_prompt="",
            working_dir=Path("."),
            env={},
        )

        command = adapter._build_command(context)

        self.assertEqual(command[0], "/usr/local/bin/node")
        self.assertTrue(command[1].endswith("codex_sdk_runner.mjs"))

    def test_tool_call_event_emits_tool_call_delta(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-10"}})
        events = parser.handle(
            {
                "type": "tool.call",
                "tool_call": {
                    "id": "call-1",
                    "name": "setta__getProjectState",
                    "arguments": {"foo": "bar"},
                },
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolCallDeltaEvent)
        if isinstance(chunk, ToolCallDeltaEvent):
            self.assertEqual(chunk.tool_call_id, "call-1")
            self.assertEqual(chunk.tool_name, "setta__getProjectState")

    def test_tool_call_event_from_nested_payload(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-12"}})
        events = parser.handle(
            {
                "type": "message",
                "message": {
                    "tool_calls": [
                        {
                            "id": "call-3",
                            "name": "Read",
                            "arguments": {"path": "README.md"},
                        }
                    ]
                }
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolCallDeltaEvent)
        if isinstance(chunk, ToolCallDeltaEvent):
            self.assertEqual(chunk.tool_call_id, "call-3")
            self.assertEqual(chunk.tool_name, "Read")
            self.assertEqual(chunk.arguments_delta, '{"path": "README.md"}')

    def test_tool_call_arguments_are_stringified(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-13"}})
        events = parser.handle(
            {
                "type": "tool.call",
                "tool_call": {
                    "id": "call-4",
                    "name": "Tool",
                    "arguments": {"foo": "bar"},
                },
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolCallDeltaEvent)
        if isinstance(chunk, ToolCallDeltaEvent):
            self.assertEqual(chunk.arguments_delta, '{"foo": "bar"}')

    def test_tool_call_dedupes_empty_arguments(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-14"}})

        events_first = parser.handle(
            {
                "type": "tool.call",
                "tool_call": {
                    "id": "call-5",
                    "name": "EmptyArgs",
                    "arguments": "",
                },
            }
        )
        events_second = parser.handle(
            {
                "type": "tool.call",
                "tool_call": {
                    "id": "call-5",
                    "name": "EmptyArgs",
                    "arguments": "",
                },
            }
        )

        self.assertEqual(len(events_first), 1)
        self.assertIsInstance(events_first[0].stream_chunk, ToolCallDeltaEvent)
        self.assertTrue(
            all(event.stream_chunk is None for event in events_second),
            "Expected duplicate empty-argument tool calls to be skipped.",
        )

    def test_tool_result_event_emits_tool_result(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-11"}})
        events = parser.handle(
            {
                "type": "tool.result",
                "tool_call_id": "call-2",
                "name": "setta__getProjectState",
                "result": {"ok": True},
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolResultEvent)

    def test_tool_result_event_preserves_error_flag(self) -> None:
        parser = _CodexSdkEventParser()
        parser.handle({"type": "item.started", "item": {"id": "msg-15"}})
        events = parser.handle(
            {
                "type": "tool.result",
                "tool_call_id": "call-6",
                "name": "Tool",
                "result": "Bad input",
                "is_error": True,
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolResultEvent)
        if isinstance(chunk, ToolResultEvent):
            self.assertTrue(chunk.result.is_error)
            self.assertEqual(chunk.result.result, "Bad input")

    def test_extract_thread_id_from_inputs(self) -> None:
        self.assertEqual(
            _extract_thread_id({"threadId": "thread-1"}), "thread-1"
        )
        self.assertIsNone(_extract_thread_id({"threadId": ""}))
        self.assertIsNone(_extract_thread_id(None))

    def test_thread_started_sets_handle_thread_id(self) -> None:
        handle = ExternalAgentRunHandle(run_id=AgentRun().id)
        _maybe_set_thread_id(
            handle,
            {"type": "thread.started", "thread_id": "thread-2"},
        )
        self.assertEqual(handle.thread_id, "thread-2")

        _maybe_set_thread_id(
            handle,
            {"type": "thread.started", "threadId": "thread-3"},
        )
        self.assertEqual(handle.thread_id, "thread-2")


class CodexSdkAdapterApprovalTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_approval_response_writes_json_line(self) -> None:
        adapter = CodexSdkAdapter()
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import sys; line=sys.stdin.readline(); sys.stdout.write(line); sys.stdout.flush()",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        handle = ExternalAgentRunHandle(run_id=AgentRun().id, process=process)

        await adapter.send_approval_response(handle, "approval-1", True)

        self.assertIsNotNone(process.stdout)
        line = await asyncio.wait_for(process.stdout.readline(), timeout=2)
        payload = json.loads(line.decode("utf-8"))
        self.assertEqual(payload.get("type"), "approval_response")
        self.assertEqual(payload.get("approvalId"), "approval-1")
        self.assertEqual(payload.get("approved"), True)

        if process.stdin is not None:
            process.stdin.close()
        await asyncio.wait_for(process.wait(), timeout=2)

    async def test_send_tool_response_raises(self) -> None:
        adapter = CodexSdkAdapter()
        handle = ExternalAgentRunHandle(run_id=AgentRun().id)

        with self.assertRaises(RuntimeError):
            await adapter.send_tool_response(handle, "call-1", {"value": 1})

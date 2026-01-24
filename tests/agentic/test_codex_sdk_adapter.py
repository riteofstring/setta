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

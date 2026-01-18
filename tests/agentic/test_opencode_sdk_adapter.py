import unittest
from pathlib import Path

from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.agentic.external_adapters.opencode_sdk import (
    OpenCodeSdkAdapter,
    _OpenCodeSdkEventParser,
)
from setta.types.agentic import AgentRun
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID


class OpenCodeSdkAdapterParserTests(unittest.TestCase):
    def test_message_event_emits_full_sequence(self) -> None:
        parser = _OpenCodeSdkEventParser()
        events = parser.handle(
            {"message": {"id": "msg-1", "text": "Hello from OpenCode"}}
        )

        self.assertEqual(len(events), 4)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        self.assertIsInstance(events[2].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[3].stream_chunk, MessageFinalizedEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.message_id, "msg-1")
            self.assertEqual(
                events[1].stream_chunk.content[0].text,
                "Hello from OpenCode",
            )

    def test_build_command_uses_node_path(self) -> None:
        adapter = OpenCodeSdkAdapter()
        config = ExternalAgentConfig(
            name="OpenCode SDK",
            toolType=ExternalAgentToolType.opencode,
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
        self.assertTrue(command[1].endswith("opencode_sdk_runner.mjs"))

    def test_tool_call_event_emits_tool_call_delta(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle({"message": {"id": "msg-10", "text": "Hi"}})
        events = parser.handle(
            {
                "toolCall": {
                    "id": "call-10",
                    "name": "setta__getProjectState",
                    "arguments": {"foo": "bar"},
                }
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolCallDeltaEvent)
        if isinstance(chunk, ToolCallDeltaEvent):
            self.assertEqual(chunk.tool_call_id, "call-10")
            self.assertEqual(chunk.tool_name, "setta__getProjectState")

    def test_tool_result_event_emits_tool_result(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle({"message": {"id": "msg-11", "text": "Hi"}})
        events = parser.handle(
            {
                "tool_call_id": "call-11",
                "name": "setta__getProjectState",
                "result": {"ok": True},
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, ToolResultEvent)

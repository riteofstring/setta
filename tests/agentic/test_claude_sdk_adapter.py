import unittest
from pathlib import Path

from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.agentic.external_adapters.claude_sdk import (
    ClaudeSdkAdapter,
    _ClaudeSdkEventParser,
)
from setta.types.agentic import AgentRun
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID


class ClaudeSdkAdapterParserTests(unittest.TestCase):
    def test_delta_emits_start_and_delta(self) -> None:
        parser = _ClaudeSdkEventParser()
        events = parser.handle(
            {"type": "message_delta", "delta": "Hello", "messageId": "msg-1"}
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.message_id, "msg-1")
            self.assertEqual(events[1].stream_chunk.content[0].text, "Hello")

    def test_final_emits_stop_and_finalize(self) -> None:
        parser = _ClaudeSdkEventParser()
        events = parser.handle(
            {
                "type": "final",
                "delta": "Done",
                "messageId": "msg-2",
                "final": True,
            }
        )

        self.assertEqual(len(events), 4)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        self.assertIsInstance(events[2].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[3].stream_chunk, MessageFinalizedEvent)

    def test_build_command_uses_node_path(self) -> None:
        adapter = ClaudeSdkAdapter()
        config = ExternalAgentConfig(
            name="Claude SDK",
            toolType=ExternalAgentToolType.claude_code,
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
        self.assertTrue(command[1].endswith("claude_sdk_runner.mjs"))

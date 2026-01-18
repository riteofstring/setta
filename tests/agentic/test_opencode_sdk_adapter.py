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

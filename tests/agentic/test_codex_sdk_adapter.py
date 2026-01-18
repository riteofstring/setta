import unittest
from pathlib import Path

from setta.agentic.external_adapters.base import ExternalAgentRunContext
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

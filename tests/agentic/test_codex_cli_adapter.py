import unittest
from pathlib import Path

from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.agentic.external_adapters.codex_cli import (
    CodexCliAdapter,
    _CodexCliEventParser,
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


class CodexCliAdapterParserTests(unittest.TestCase):
    def test_item_start_emits_message_start(self) -> None:
        parser = _CodexCliEventParser()
        events = parser.handle({"type": "item.start", "item": {"id": "msg-1"}})

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageStartEvent)
        if isinstance(chunk, MessageStartEvent):
            self.assertEqual(chunk.message.id, "msg-1")

    def test_item_delta_emits_message_delta(self) -> None:
        parser = _CodexCliEventParser()
        parser.handle({"type": "item.start", "item": {"id": "msg-2"}})
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
        parser = _CodexCliEventParser()
        parser.handle({"type": "item.start", "item": {"id": "msg-3"}})
        parser.handle(
            {"type": "item.delta", "item": {"id": "msg-3"}, "delta": "Hi"}
        )
        events = parser.handle({"type": "item.complete", "item": {"id": "msg-3"}})

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageFinalizedEvent)

    def test_build_command_includes_policy_flags(self) -> None:
        adapter = CodexCliAdapter()
        config = ExternalAgentConfig(
            name="Codex CLI",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.cli,
            commandPath="codex",
            sandboxPolicy="workspace",
            approvalPolicy="never",
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

        self.assertIn("--sandbox", command)
        self.assertIn("workspace", command)
        self.assertIn("--ask-for-approval", command)
        self.assertIn("never", command)

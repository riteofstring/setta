import asyncio
import io
import logging
import os
import sys
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


class OpenCodeSdkAdapterStderrTests(unittest.TestCase):
    def test_flush_stderr_queue_does_not_write_to_stderr(self) -> None:
        read_fd, write_fd = os.pipe()
        os.set_blocking(write_fd, False)
        payload = b"x" * 4096
        while True:
            try:
                os.write(write_fd, payload)
            except BlockingIOError:
                break

        raw_stream = os.fdopen(write_fd, "wb", buffering=0)
        stderr_stream = io.TextIOWrapper(
            raw_stream, encoding="utf-8", write_through=True
        )
        original_stderr = sys.stderr

        logger = logging.getLogger("setta.agentic.external_adapters.opencode_sdk")
        original_handlers = list(logger.handlers)
        original_propagate = logger.propagate

        async def _run_flush() -> bool:
            queue: asyncio.Queue[str] = asyncio.Queue()
            queue.put_nowait("stderr line")
            await OpenCodeSdkAdapter._flush_stderr_queue(queue)
            return queue.empty()

        try:
            sys.stderr = stderr_stream
            logger.handlers = [logging.NullHandler()]
            logger.propagate = False
            queue_drained = asyncio.run(_run_flush())
        finally:
            logger.handlers = original_handlers
            logger.propagate = original_propagate
            sys.stderr = original_stderr
            stderr_stream.close()
            os.close(read_fd)

        self.assertTrue(queue_drained)

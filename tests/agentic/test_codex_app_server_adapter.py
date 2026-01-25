import unittest
from pathlib import Path
from types import SimpleNamespace

from setta.agentic.external_adapters.codex_app_server import (
    CodexAppServerAdapter,
    _CodexAppServerEventParser,
    _build_approval_payload,
    _build_turn_params,
    _map_approval_policy,
)
from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.llm.chat_toolkit.section_sync import apply_stream_delta, build_chat_section_state
from setta.types.agentic import AgentRun
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    SystemChatMessage,
    UserChatMessage,
)
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


class CodexAppServerAdapterParserTests(unittest.TestCase):
    def test_item_start_emits_message_start(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-1", "type": "agentMessage"}},
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageStartEvent)
        if isinstance(chunk, MessageStartEvent):
            self.assertEqual(chunk.message.id, "msg-1")

    def test_agent_message_delta_emits_message_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-2", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/agentMessage/delta",
                "params": {"itemId": "msg-2", "delta": {"text": "Hello"}},
            }
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageDeltaEvent)
        if isinstance(chunk, MessageDeltaEvent):
            self.assertEqual(chunk.message_id, "msg-2")
            self.assertEqual(chunk.content[0].text, "Hello")

    def test_item_completed_emits_stop_and_finalize(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-3", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/completed",
                "params": {"item": {"id": "msg-3", "type": "agentMessage"}},
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageFinalizedEvent)

    def test_item_completed_with_text_emits_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "msg-4",
                        "type": "agentMessage",
                        "text": "Done",
                    }
                },
            }
        )

        self.assertEqual(len(events), 4)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        self.assertIsInstance(events[2].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[3].stream_chunk, MessageFinalizedEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            self.assertEqual(events[1].stream_chunk.content[0].text, "Done")

    def test_item_completed_with_full_text_after_deltas_does_not_duplicate(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/assistantMessage/delta",
                "params": {"itemId": "msg-dup-1", "delta": {"text": "Hello"}},
            }
        )
        parser.handle(
            {
                "method": "item/assistantMessage/delta",
                "params": {"itemId": "msg-dup-1", "delta": {"text": " world"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "msg-dup-1",
                        "type": "assistantMessage",
                        "role": "assistant",
                        "content": [{"text": "Hello world"}],
                    }
                },
            }
        )

        finalized_text = None
        for event in events:
            chunk = event.stream_chunk
            if isinstance(chunk, MessageFinalizedEvent):
                message = chunk.message
                if message.content and isinstance(
                    message.content[0], MessageTextContent
                ):
                    finalized_text = message.content[0].text
                else:
                    finalized_text = ""
                break
        self.assertEqual(finalized_text, "Hello world")

    def test_response_message_id_is_ignored(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/assistantMessage/delta",
                "params": {"itemId": "rs_123", "delta": {"text": "Hello"}},
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsNone(events[0].stream_chunk)

        completion_events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "rs_123",
                        "type": "assistantMessage",
                        "role": "assistant",
                        "content": [{"text": "Hello world"}],
                    }
                },
            }
        )

        self.assertEqual(len(completion_events), 1)
        self.assertIsNone(completion_events[0].stream_chunk)

    def test_item_completed_appends_missing_suffix_after_partial_deltas(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/assistantMessage/delta",
                "params": {"itemId": "msg-dup-2", "delta": {"text": "Hello"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "msg-dup-2",
                        "type": "assistantMessage",
                        "role": "assistant",
                        "content": [{"text": "Hello world"}],
                    }
                },
            }
        )

        finalized_text = None
        for event in events:
            chunk = event.stream_chunk
            if isinstance(chunk, MessageFinalizedEvent):
                message = chunk.message
                if message.content and isinstance(
                    message.content[0], MessageTextContent
                ):
                    finalized_text = message.content[0].text
                else:
                    finalized_text = ""
                break
        self.assertEqual(finalized_text, "Hello world")

    def test_reasoning_summary_delta_emits_thinking_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "reason-1", "type": "reasoning"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/reasoning/summaryTextDelta",
                "params": {"itemId": "reason-1", "delta": "Planning steps"},
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.summary, "Planning steps")

    def test_reasoning_text_delta_emits_thinking_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/reasoning/textDelta",
                "params": {"itemId": "reason-2", "delta": "Idea"},
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
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/reasoning/summaryPartAdded",
                "params": {"itemId": "reason-3", "delta": ""},
            }
        )

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            self.assertIsInstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                self.assertEqual(delta.summary, "\n")

    def test_reasoning_item_start_emits_summary_and_thinking(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/started",
                "params": {
                    "item": {
                        "id": "reason-2",
                        "type": "reasoning",
                        "summary": [{"text": "Summary"}],
                        "content": [{"text": "Plan"}],
                    }
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

    def test_command_execution_item_emits_tool_call_and_result(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-cmd-1", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/started",
                "params": {
                    "item": {
                        "id": "cmd-1",
                        "type": "commandExecution",
                        "command": "ls",
                    }
                },
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolCallDeltaEvent)
        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "cmd-1",
                        "type": "commandExecution",
                        "command": "ls",
                        "status": "completed",
                        "exitCode": 0,
                        "aggregatedOutput": "ok",
                    }
                },
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolResultEvent)

    def test_file_change_item_emits_tool_call_and_result(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-file-1", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/started",
                "params": {
                    "item": {
                        "id": "file-1",
                        "type": "fileChange",
                        "path": "/tmp/file.txt",
                        "diff": "---\n+++",
                    }
                },
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            self.assertEqual(events[0].stream_chunk.tool_name, "file_change")

        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "file-1",
                        "type": "fileChange",
                        "path": "/tmp/file.txt",
                        "diff": "---\n+++",
                        "status": "completed",
                    }
                },
            }
        )
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolResultEvent)

    def test_mcp_tool_call_item_emits_tool_call_and_result(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-mcp-1", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "method": "item/started",
                "params": {
                    "item": {
                        "id": "mcp-1",
                        "type": "mcpToolCall",
                        "server": "setta",
                        "tool": "echo",
                        "arguments": {"text": "ping"},
                    }
                },
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            self.assertEqual(events[0].stream_chunk.tool_name, "mcp__setta__echo")

        events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "mcp-1",
                        "type": "mcpToolCall",
                        "server": "setta",
                        "tool": "echo",
                        "arguments": {"text": "ping"},
                        "result": {"text": "pong"},
                        "status": "completed",
                    }
                },
            }
        )
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolResultEvent)

    def test_response_item_function_call_emits_tool_call_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-call-1", "type": "agentMessage"}},
            }
        )
        events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call-1",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
                },
            }
        )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            self.assertEqual(events[0].stream_chunk.tool_call_id, "call-1")
            self.assertEqual(events[0].stream_chunk.message_id, "msg-call-1")
            self.assertEqual(
                events[0].stream_chunk.tool_name,
                "mcp__setta__create_top_level_section",
            )
            self.assertEqual(
                events[0].stream_chunk.arguments_delta,
                "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
            )

    def test_response_item_function_call_output_emits_tool_result(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call-2",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
                },
            }
        )
        events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call-2",
                    "output": "{\"sectionId\":\"6\"}",
                },
            }
            )

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0].stream_chunk, ToolResultEvent)
        if isinstance(events[0].stream_chunk, ToolResultEvent):
            result = events[0].stream_chunk.result
            self.assertEqual(result.tool_call_id, "call-2")
            self.assertEqual(
                result.tool_name,
                "mcp__setta__create_top_level_section",
            )
            self.assertEqual(
                result.arguments,
                {"projectConfigId": "1", "implType": "Callable"},
            )
            self.assertEqual(result.result, {"sectionId": "6"})

    def test_response_item_function_call_streams_before_output(self) -> None:
        parser = _CodexAppServerEventParser()
        call_events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call-stream-1",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
                },
            }
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, ToolCallDeltaEvent)
                for event in call_events
            )
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, MessageStartEvent)
                for event in call_events
            )
        )
        self.assertTrue(
            all(
                not isinstance(event.stream_chunk, ToolResultEvent)
                for event in call_events
            )
        )
        output_events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call-stream-1",
                    "output": "{\"sectionId\":\"6\"}",
                },
            }
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, ToolResultEvent)
                for event in output_events
            )
        )

    def test_response_item_function_call_output_is_deduped(self) -> None:
        parser = _CodexAppServerEventParser()
        parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call-3",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
                },
            }
        )
        parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call-3",
                    "output": "{\"sectionId\":\"7\"}",
                },
            }
        )
        events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call-3",
                    "output": "{\"sectionId\":\"7\"}",
                },
            }
        )

        self.assertTrue(
            all(
                not isinstance(event.stream_chunk, ToolResultEvent) for event in events
            )
        )

    def test_response_item_function_call_starts_message_for_tool_call(self) -> None:
        parser = _CodexAppServerEventParser()
        initial_events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call-buffer-1",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
                },
            }
        )
        start_events = [
            event.stream_chunk
            for event in initial_events
            if isinstance(event.stream_chunk, MessageStartEvent)
        ]
        tool_events = [
            event.stream_chunk
            for event in initial_events
            if isinstance(event.stream_chunk, ToolCallDeltaEvent)
        ]
        self.assertEqual(len(start_events), 1)
        self.assertEqual(len(tool_events), 1)
        message_id = start_events[0].message.id
        self.assertEqual(tool_events[0].message_id, message_id)
        message_events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"text": "Done"}],
                },
            }
        )
        delta_events = [
            event.stream_chunk
            for event in message_events
            if isinstance(event.stream_chunk, MessageDeltaEvent)
        ]
        finalized_events = [
            event.stream_chunk
            for event in message_events
            if isinstance(event.stream_chunk, MessageFinalizedEvent)
        ]
        self.assertTrue(delta_events)
        self.assertEqual(delta_events[0].message_id, message_id)
        self.assertTrue(finalized_events)
        finalized_message = finalized_events[0].message
        tool_calls = finalized_message.tool_calls or []
        tool_call_ids = {call.id for call in tool_calls}
        self.assertIn("call-buffer-1", tool_call_ids)

    def test_mcp_tool_call_starts_message_without_prior_message(self) -> None:
        parser = _CodexAppServerEventParser()
        start_events = parser.handle(
            {
                "method": "item/started",
                "params": {
                    "item": {
                        "id": "mcp-no-message-1",
                        "type": "mcpToolCall",
                        "server": "setta",
                        "tool": "echo",
                        "arguments": {"text": "ping"},
                    }
                },
            }
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, MessageStartEvent)
                for event in start_events
            )
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, ToolCallDeltaEvent)
                for event in start_events
            )
        )
        completed_events = parser.handle(
            {
                "method": "item/completed",
                "params": {
                    "item": {
                        "id": "mcp-no-message-1",
                        "type": "mcpToolCall",
                        "server": "setta",
                        "tool": "echo",
                        "arguments": {"text": "ping"},
                        "result": {"text": "pong"},
                        "status": "completed",
                    }
                },
            }
        )
        self.assertTrue(
            any(
                isinstance(event.stream_chunk, ToolResultEvent)
                for event in completed_events
            )
        )

    def test_response_item_sequence_attaches_tool_calls_to_message(self) -> None:
        parser = _CodexAppServerEventParser()
        state = build_chat_section_state(messages=[])
        payloads = [
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "name": "mcp__setta__get_latest_project_state_summary",
                    "arguments": "{\"projectConfigId\":\"1\"}",
                    "call_id": "call_summary",
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call_summary",
                    "output": (
                        "[{\"text\":\"{\\n  \\\"projectConfig\\\": {\\n    "
                        "\\\"id\\\": \\\"1\\\"\\n  }\\n}\",\"type\":\"text\"}]"
                    ),
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "name": "mcp__setta__create_top_level_section",
                    "arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Code\"}",
                    "call_id": "call_create",
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call_create",
                    "output": (
                        "[{\"text\":\"{\\n  \\\"sectionId\\\": \\\"6\\\",\\n  "
                        "\\\"panTo\\\": null\\n}\",\"type\":\"text\"}]"
                    ),
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Created five top-level Code sections.",
                        }
                    ],
                },
            },
        ]

        for payload in payloads:
            for event in parser.handle(payload):
                if event.stream_chunk is None:
                    continue
                state = apply_stream_delta(state=state, chunk=event.stream_chunk)

        assistant_messages = [
            message
            for message in state.messages
            if isinstance(message, AssistantChatMessage)
        ]
        self.assertTrue(assistant_messages)
        last_message = assistant_messages[-1]
        tool_calls = last_message.tool_calls or []
        tool_call_ids = {call.id for call in tool_calls}
        self.assertIn("call_summary", tool_call_ids)
        self.assertIn("call_create", tool_call_ids)

    def test_generic_item_types_emit_tool_call_and_result(self) -> None:
        generic_types = [
            "collabToolCall",
            "webSearch",
            "imageView",
            "enteredReviewMode",
            "exitedReviewMode",
            "compacted",
        ]
        for item_type in generic_types:
            parser = _CodexAppServerEventParser()
            parser.handle(
                {
                    "method": "item/started",
                    "params": {
                        "item": {"id": f"msg-{item_type}", "type": "agentMessage"}
                    },
                }
            )
            item_id = f"{item_type}-1"
            events = parser.handle(
                {
                    "method": "item/started",
                    "params": {
                        "item": {
                            "id": item_id,
                            "type": item_type,
                            "input": {"token": item_type},
                        }
                    },
                }
            )

            self.assertEqual(len(events), 1)
            self.assertIsInstance(events[0].stream_chunk, ToolCallDeltaEvent)
            if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
                self.assertEqual(events[0].stream_chunk.tool_name, item_type)

            events = parser.handle(
                {
                    "method": "item/completed",
                    "params": {
                        "item": {
                            "id": item_id,
                            "type": item_type,
                            "input": {"token": item_type},
                            "output": {"status": "ok"},
                            "status": "completed",
                        }
                    },
                }
            )
            self.assertEqual(len(events), 1)
            self.assertIsInstance(events[0].stream_chunk, ToolResultEvent)
            if isinstance(events[0].stream_chunk, ToolResultEvent):
                self.assertEqual(
                    events[0].stream_chunk.result.tool_name,
                    item_type,
                )


class CodexAppServerAdapterPromptTests(unittest.TestCase):
    def test_build_prompt_omits_system_messages(self) -> None:
        adapter = CodexAppServerAdapter()
        config = ExternalAgentConfig(
            name="Codex",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
        )
        messages = [
            SystemChatMessage(content=[MessageTextContent(text="System message")]),
            UserChatMessage(content=[MessageTextContent(text="User request")]),
            AssistantChatMessage(content=[MessageTextContent(text="Assistant reply")]),
        ]
        raw_messages = [message.model_dump(mode="json") for message in messages]
        raw_messages.append(
            {
                "role": "developer",
                "content": [{"type": "text", "text": "Developer note"}],
            }
        )
        inputs = {"messages": raw_messages, "prompt": "Extra prompt."}
        context = ExternalAgentRunContext(
            run=AgentRun(),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs=inputs,
            system_prompt="Ignored",
            working_dir=Path("."),
            env={},
        )

        prompt = adapter._build_prompt(context)

        self.assertIn("User:\nUser request", prompt)
        self.assertIn("Assistant:\nAssistant reply", prompt)
        self.assertIn("Extra prompt.", prompt)
        self.assertNotIn("System message", prompt)
        self.assertNotIn("Developer note", prompt)
        self.assertNotIn("System:\n", prompt)


class CodexAppServerAdapterMappingTests(unittest.TestCase):
    def test_build_turn_params_maps_policy_and_sandbox(self) -> None:
        config = ExternalAgentConfig(
            name="Codex",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
            defaultModel="gpt-5-codex",
            approvalPolicy="on-request",
            sandboxPolicy="workspace-write",
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
        params = _build_turn_params(context, "hello", "thread-1")

        self.assertEqual(params.get("approvalPolicy"), "on-request")
        sandbox_policy = params.get("sandboxPolicy")
        self.assertIsInstance(sandbox_policy, dict)
        if isinstance(sandbox_policy, dict):
            self.assertEqual(sandbox_policy.get("type"), "workspaceWrite")

    def test_map_approval_policy_untrusted(self) -> None:
        self.assertEqual(_map_approval_policy("untrusted"), "untrusted")

    def test_map_approval_policy_on_failure(self) -> None:
        self.assertEqual(_map_approval_policy("on-failure"), "on-failure")

    def test_build_turn_params_rejects_non_object_output_schema(self) -> None:
        config = ExternalAgentConfig(
            name="Codex",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
        )
        context = ExternalAgentRunContext(
            run=AgentRun(),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs={"outputSchema": ["bad"]},
            system_prompt="",
            working_dir=Path("."),
            env={},
        )
        with self.assertRaises(ValueError):
            _build_turn_params(context, "hello", "thread-1")

    def test_build_approval_payload_from_request(self) -> None:
        state = SimpleNamespace(approval_id_map={})
        approval_payload = _build_approval_payload(
            state,
            {
                "id": 42,
                "method": "item/commandExecution/requestApproval",
                "params": {
                    "item": {
                        "type": "commandExecution",
                        "command": "rm -rf /",
                        "parsedCmd": {"cmd": "rm", "args": ["-rf", "/"]},
                    }
                },
            },
        )

        self.assertEqual(approval_payload.get("type"), "approval_request")
        self.assertEqual(approval_payload.get("approvalId"), "42")
        self.assertEqual(approval_payload.get("command"), "rm -rf /")
        self.assertEqual(state.approval_id_map.get("42"), 42)

    def test_build_approval_payload_for_file_change(self) -> None:
        state = SimpleNamespace(approval_id_map={})
        approval_payload = _build_approval_payload(
            state,
            {
                "id": 7,
                "method": "item/fileChange/requestApproval",
                "params": {
                    "item": {
                        "type": "fileChange",
                        "path": "/tmp/file.txt",
                        "diff": "---\n+++",
                    }
                },
            },
        )

        self.assertEqual(approval_payload.get("type"), "approval_request")
        self.assertEqual(approval_payload.get("approvalId"), "7")
        self.assertEqual(approval_payload.get("diff"), "---\n+++")
        input_payload = approval_payload.get("input")
        self.assertIsInstance(input_payload, dict)
        if isinstance(input_payload, dict):
            self.assertEqual(input_payload.get("diff"), "---\n+++")

    def test_build_turn_params_includes_effort_summary_and_schema(self) -> None:
        config = ExternalAgentConfig(
            name="Codex",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
        )
        output_schema = {
            "type": "object",
            "properties": {"status": {"type": "string"}},
            "required": ["status"],
        }
        context = ExternalAgentRunContext(
            run=AgentRun(),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs={
                "effort": "low",
                "summary": "auto",
                "outputSchema": output_schema,
            },
            system_prompt="",
            working_dir=Path("workspace"),
            env={},
        )

        params = _build_turn_params(context, "hello", "thread-1")

        self.assertEqual(params.get("effort"), "low")
        self.assertEqual(params.get("summary"), "auto")
        self.assertEqual(params.get("outputSchema"), output_schema)
        self.assertEqual(params.get("cwd"), str(context.working_dir))

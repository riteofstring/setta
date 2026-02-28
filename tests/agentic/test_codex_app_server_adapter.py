import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from setta.agentic.external_adapters.codex_app_server import (
    CodexAppServerAdapter,
    _MCP_STATUS_REQUEST_TIMEOUT_SECONDS,
    _REQUEST_TIMEOUT_SECONDS,
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


class TestCodexAppServerAdapterParser:
    def test_item_start_emits_message_start(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/started",
                "params": {"item": {"id": "msg-1", "type": "agentMessage"}},
            }
        )

        assert len(events) == 1
        chunk = events[0].stream_chunk
        assert isinstance(chunk, MessageStartEvent)
        if isinstance(chunk, MessageStartEvent):
            assert chunk.message.id == "msg-1"

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

        assert len(events) == 1
        chunk = events[0].stream_chunk
        assert isinstance(chunk, MessageDeltaEvent)
        if isinstance(chunk, MessageDeltaEvent):
            assert chunk.message_id == "msg-2"
            assert chunk.content[0].text == "Hello"

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

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStopEvent)
        assert isinstance(events[1].stream_chunk, MessageFinalizedEvent)

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

        assert len(events) == 4
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        assert isinstance(events[2].stream_chunk, MessageStopEvent)
        assert isinstance(events[3].stream_chunk, MessageFinalizedEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            assert events[1].stream_chunk.content[0].text == "Done"

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
        assert finalized_text == "Hello world"

    def test_response_message_id_is_ignored(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/assistantMessage/delta",
                "params": {"itemId": "rs_123", "delta": {"text": "Hello"}},
            }
        )

        assert len(events) == 1
        assert events[0].stream_chunk is None

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

        assert len(completion_events) == 1
        assert completion_events[0].stream_chunk is None

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
        assert finalized_text == "Hello world"

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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.summary == "Planning steps"

    def test_reasoning_text_delta_emits_thinking_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/reasoning/textDelta",
                "params": {"itemId": "reason-2", "delta": "Idea"},
            }
        )

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.thinking == "Idea"

    def test_reasoning_summary_part_added_emits_newline(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "method": "item/reasoning/summaryPartAdded",
                "params": {"itemId": "reason-3", "delta": ""},
            }
        )

        assert len(events) == 2
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.summary == "\n"

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

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.thinking == "Plan"
                assert delta.summary == "Summary"

    def test_mixed_reasoning_and_text_do_not_clobber(self) -> None:
        parser = _CodexAppServerEventParser()
        events = []
        events.extend(
            parser.handle(
                {
                    "method": "item/assistantMessage/delta",
                    "params": {"itemId": "msg-mixed-1", "delta": {"text": "Hello"}},
                }
            )
        )
        events.extend(
            parser.handle(
                {
                    "method": "item/reasoning/textDelta",
                    "params": {"itemId": "msg-mixed-1", "delta": "Thinking"},
                }
            )
        )
        state = build_chat_section_state(messages=[])
        for event in events:
            chunk = event.stream_chunk
            if chunk is None:
                continue
            state = apply_stream_delta(state=state, chunk=chunk)
        message = next(
            (
                entry
                for entry in state.messages
                if isinstance(entry, AssistantChatMessage)
                and entry.id == "msg-mixed-1"
            ),
            None,
        )
        assert message is not None
        if isinstance(message, AssistantChatMessage):
            content_types = [entry.type for entry in message.content]
            assert "text" in content_types
            assert "thinking" in content_types

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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolResultEvent)

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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            assert events[0].stream_chunk.tool_name == "file_change"

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
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolResultEvent)

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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            assert events[0].stream_chunk.tool_name == "mcp__setta__echo"

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
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolResultEvent)

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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            assert events[0].stream_chunk.tool_call_id == "call-1"
            assert events[0].stream_chunk.message_id == "msg-call-1"
            assert (
                events[0].stream_chunk.tool_name
                == "mcp__setta__create_top_level_section"
            )
            assert (
                events[0].stream_chunk.arguments_delta
                == "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}"
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

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolResultEvent)
        if isinstance(events[0].stream_chunk, ToolResultEvent):
            result = events[0].stream_chunk.result
            assert result.tool_call_id == "call-2"
            assert result.tool_name == "mcp__setta__create_top_level_section"
            assert result.arguments == {"projectConfigId": "1", "implType": "Callable"}
            assert result.result == {"sectionId": "6"}

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
        assert any(
            isinstance(event.stream_chunk, ToolCallDeltaEvent)
            for event in call_events
        )
        assert any(
            isinstance(event.stream_chunk, MessageStartEvent)
            for event in call_events
        )
        assert all(
            not isinstance(event.stream_chunk, ToolResultEvent)
            for event in call_events
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
        assert any(
            isinstance(event.stream_chunk, ToolResultEvent)
            for event in output_events
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

        assert all(
            not isinstance(event.stream_chunk, ToolResultEvent)
            for event in events
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
        assert len(start_events) == 1
        assert len(tool_events) == 1
        message_id = start_events[0].message.id
        assert tool_events[0].message_id == message_id
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
        assert delta_events
        assert delta_events[0].message_id == message_id
        assert finalized_events
        finalized_message = finalized_events[0].message
        tool_calls = finalized_message.tool_calls or []
        tool_call_ids = {call.id for call in tool_calls}
        assert "call-buffer-1" in tool_call_ids

    def test_response_item_reasoning_emits_thinking_delta(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "id": "reason-response-1",
                    "type": "reasoning",
                    "summary": [{"text": "Plan"}],
                    "content": [{"text": "Analyze constraints."}],
                },
            }
        )

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.summary == "Plan"
                assert delta.thinking == "Analyze constraints."

    def test_response_item_reasoning_does_not_fallback_summary_to_text(self) -> None:
        parser = _CodexAppServerEventParser()
        events = parser.handle(
            {
                "type": "response_item",
                "payload": {
                    "id": "reason-response-no-summary",
                    "type": "reasoning",
                    "text": [{"text": "This is body text, not summary."}],
                    "content": [{"text": "Detailed reasoning content."}],
                },
            }
        )

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            delta = events[1].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.summary == ""
                assert delta.thinking == "Detailed reasoning content."

    def test_response_item_message_with_reasoning_content_emits_thinking_and_text(
        self,
    ) -> None:
        parser = _CodexAppServerEventParser()
        state = build_chat_section_state(messages=[])

        payload = {
            "type": "response_item",
            "payload": {
                "id": "msg-response-with-reasoning",
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "reasoning",
                        "summary": [{"text": "Plan"}],
                        "content": [{"text": "Evaluate options."}],
                    },
                    {
                        "type": "output_text",
                        "text": "Build the navigator first.",
                    },
                ],
            },
        }

        for event in parser.handle(payload):
            if event.stream_chunk is None:
                continue
            state = apply_stream_delta(state=state, chunk=event.stream_chunk)

        message = next(
            (
                entry
                for entry in state.messages
                if isinstance(entry, AssistantChatMessage)
                and entry.id == "msg-response-with-reasoning"
            ),
            None,
        )
        assert message is not None
        if isinstance(message, AssistantChatMessage):
            assert len(message.content) == 2
            first = message.content[0]
            second = message.content[1]
            assert first.type == "thinking"
            if first.type == "thinking":
                assert first.summary == "Plan"
                assert first.thinking == "Evaluate options."
            assert second.type == "text"
            if second.type == "text":
                assert second.text == "Build the navigator first."

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
        assert any(
            isinstance(event.stream_chunk, MessageStartEvent)
            for event in start_events
        )
        assert any(
            isinstance(event.stream_chunk, ToolCallDeltaEvent)
            for event in start_events
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
        assert any(
            isinstance(event.stream_chunk, ToolResultEvent)
            for event in completed_events
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
        assert assistant_messages
        last_message = assistant_messages[-1]
        tool_calls = last_message.tool_calls or []
        tool_call_ids = {call.id for call in tool_calls}
        assert "call_summary" in tool_call_ids
        assert "call_create" in tool_call_ids

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

            assert len(events) == 1
            assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
            if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
                assert events[0].stream_chunk.tool_name == item_type

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
            assert len(events) == 1
            assert isinstance(events[0].stream_chunk, ToolResultEvent)
            if isinstance(events[0].stream_chunk, ToolResultEvent):
                assert events[0].stream_chunk.result.tool_name == item_type


class TestCodexAppServerAdapterPrompt:
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

        assert "User:\nUser request" in prompt
        assert "Assistant:\nAssistant reply" in prompt
        assert "Extra prompt." in prompt
        assert "System message" not in prompt
        assert "Developer note" not in prompt
        assert "System:\n" not in prompt


class TestCodexAppServerAdapterMapping:
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

        assert params.get("approvalPolicy") == "on-request"
        sandbox_policy = params.get("sandboxPolicy")
        assert isinstance(sandbox_policy, dict)
        if isinstance(sandbox_policy, dict):
            assert sandbox_policy.get("type") == "workspaceWrite"

    def test_map_approval_policy_untrusted(self) -> None:
        assert _map_approval_policy("untrusted") == "untrusted"

    def test_map_approval_policy_on_failure(self) -> None:
        assert _map_approval_policy("on-failure") == "on-failure"

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
        with pytest.raises(ValueError):
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
                        "command": "rm -rf /tmp/example-dir",
                        "parsedCmd": {
                            "cmd": "rm",
                            "args": ["-rf", "/tmp/example-dir"],
                        },
                    }
                },
            },
        )

        assert approval_payload.get("type") == "approval_request"
        assert approval_payload.get("approvalId") == "42"
        assert approval_payload.get("command") == "rm -rf /tmp/example-dir"
        assert state.approval_id_map.get("42") == 42

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

        assert approval_payload.get("type") == "approval_request"
        assert approval_payload.get("approvalId") == "7"
        assert approval_payload.get("diff") == "---\n+++"
        input_payload = approval_payload.get("input")
        assert isinstance(input_payload, dict)
        if isinstance(input_payload, dict):
            assert input_payload.get("diff") == "---\n+++"

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

        assert params.get("effort") == "low"
        assert params.get("summary") == "auto"
        assert params.get("outputSchema") == output_schema
        assert params.get("cwd") == str(context.working_dir)


class TestCodexAppServerMcpStatusProbe:
    @staticmethod
    def _build_context() -> ExternalAgentRunContext:
        config = ExternalAgentConfig(
            id=ID("codex-config"),
            name="Codex",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
        )
        return ExternalAgentRunContext(
            run=AgentRun(id=ID("run-1"), inputs={"messages": []}),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs={},
            system_prompt="",
            working_dir=Path("."),
            env={},
        )

    @pytest.mark.asyncio
    async def test_start_run_uses_short_timeout_for_mcp_status_probe(self) -> None:
        adapter = CodexAppServerAdapter()
        state = SimpleNamespace(
            process=SimpleNamespace(),
            lock=asyncio.Lock(),
            stderr_lines=[],
            thread_id=None,
        )
        sent_timeouts: dict[str, float] = {}

        async def _ensure_process_state(_context: ExternalAgentRunContext):
            return state

        async def _initialize(_state) -> None:
            return None

        async def _send_request(
            _state,
            method: str,
            _params,
            *,
            timeout_seconds: float = _REQUEST_TIMEOUT_SECONDS,
        ):
            sent_timeouts[method] = timeout_seconds
            if method == "thread/start":
                return {"threadId": "thread-1"}
            if method == "turn/start":
                return {}
            if method == "mcpServerStatus/list":
                return {"servers": [{"id": "setta", "connected": True}]}
            raise AssertionError(f"Unexpected request method: {method}")

        adapter._ensure_process_state = _ensure_process_state
        adapter._initialize = _initialize
        adapter._send_request = _send_request

        handle = await adapter.start_run(self._build_context())

        # Core run startup keeps the standard timeout, while optional MCP status
        # probing is bounded tightly.
        assert sent_timeouts.get("thread/start") == _REQUEST_TIMEOUT_SECONDS
        assert sent_timeouts.get("turn/start") == _REQUEST_TIMEOUT_SECONDS
        assert (
            sent_timeouts.get("mcpServerStatus/list")
            == _MCP_STATUS_REQUEST_TIMEOUT_SECONDS
        )
        assert handle.metadata.get("mcp_server_status_payload") == {
            "servers": [{"id": "setta", "connected": True}]
        }
        state.lock.release()

    @pytest.mark.asyncio
    async def test_start_run_continues_when_mcp_status_probe_fails(self) -> None:
        adapter = CodexAppServerAdapter()
        state = SimpleNamespace(
            process=SimpleNamespace(),
            lock=asyncio.Lock(),
            stderr_lines=[],
            thread_id=None,
        )

        async def _ensure_process_state(_context: ExternalAgentRunContext):
            return state

        async def _initialize(_state) -> None:
            return None

        async def _send_request(
            _state,
            method: str,
            _params,
            *,
            timeout_seconds: float = _REQUEST_TIMEOUT_SECONDS,
        ):
            if method == "thread/start":
                return {"threadId": "thread-1"}
            if method == "turn/start":
                return {}
            if method == "mcpServerStatus/list":
                raise RuntimeError(
                    f"probe timeout {timeout_seconds} for {method}"
                )
            raise AssertionError(f"Unexpected request method: {method}")

        adapter._ensure_process_state = _ensure_process_state
        adapter._initialize = _initialize
        adapter._send_request = _send_request

        handle = await adapter.start_run(self._build_context())

        # Startup should succeed even when the optional status probe fails.
        assert "mcp_server_status_payload" not in handle.metadata
        state.lock.release()

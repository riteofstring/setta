import asyncio
from pathlib import Path

import pytest

from setta.agentic.external_adapters.base import (
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.claude_sdk import (
    ClaudeSdkAdapter,
    _ClaudeSdkEventParser,
    _PendingApproval,
    _build_system_prompt_payload,
)
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


class TestClaudeSdkAdapterParser:
    def test_delta_emits_start_and_delta(self) -> None:
        parser = _ClaudeSdkEventParser()
        events = parser.handle(
            {"type": "message_delta", "delta": "Hello", "messageId": "msg-1"}
        )

        assert len(events) == 2
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        if isinstance(events[1].stream_chunk, MessageDeltaEvent):
            assert events[1].stream_chunk.message_id == "msg-1"
            assert events[1].stream_chunk.content[0].text == "Hello"

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

        assert len(events) == 4
        assert isinstance(events[0].stream_chunk, MessageStartEvent)
        assert isinstance(events[1].stream_chunk, MessageDeltaEvent)
        assert isinstance(events[2].stream_chunk, MessageStopEvent)
        assert isinstance(events[3].stream_chunk, MessageFinalizedEvent)

    def test_stream_event_tool_use_emits_tool_call_delta(self) -> None:
        parser = _ClaudeSdkEventParser()
        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "message_start",
                    "message": {"id": "msg-tool", "content": []},
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageStartEvent)

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "toolu-1",
                        "name": "Read",
                        "input": {"path": "README.md"},
                    },
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            assert events[0].stream_chunk.tool_call_id == "toolu-1"
            assert events[0].stream_chunk.tool_name == "Read"
            assert "README.md" in events[0].stream_chunk.arguments_delta

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": "{\"path\": \"README.md\"}",
                    },
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
        if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
            assert events[0].stream_chunk.tool_call_id == "toolu-1"
            assert "README.md" in events[0].stream_chunk.arguments_delta

    def test_documented_tools_emit_tool_call_and_result(self) -> None:
        tool_names = [
            "AskUserQuestion",
            "Bash",
            "Edit",
            "Glob",
            "Grep",
            "NotebookEdit",
            "Read",
            "Task",
            "TodoWrite",
            "WebFetch",
            "WebSearch",
            "Write",
            "BashOutput",
            "KillBash",
            "ExitPlanMode",
            "ListMcpResources",
            "ReadMcpResource",
        ]
        for idx, tool_name in enumerate(tool_names):
            parser = _ClaudeSdkEventParser()
            message_id = f"msg-{idx}"
            tool_id = f"toolu-{idx}"
            parser.handle(
                {
                    "type": "raw_message_stream_event",
                    "stream_event": {
                        "type": "message_start",
                        "message": {"id": message_id, "content": []},
                    },
                }
            )

            events = parser.handle(
                {
                    "type": "raw_message_stream_event",
                    "stream_event": {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {
                            "type": "tool_use",
                            "id": tool_id,
                            "name": tool_name,
                            "input": {"token": tool_name},
                        },
                    },
                }
            )
            assert len(events) == 1
            assert isinstance(events[0].stream_chunk, ToolCallDeltaEvent)
            if isinstance(events[0].stream_chunk, ToolCallDeltaEvent):
                assert events[0].stream_chunk.tool_call_id == tool_id
                assert events[0].stream_chunk.tool_name == tool_name

            parser.handle(
                {
                    "type": "raw_message_stream_event",
                    "stream_event": {
                        "type": "content_block_start",
                        "index": 1,
                        "content_block": {
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": [{"type": "text", "text": "ok"}],
                        },
                    },
                }
            )

            events = parser.handle(
                {
                    "type": "raw_message_stream_event",
                    "stream_event": {"type": "content_block_stop", "index": 1},
                }
            )
            assert len(events) == 1
            assert isinstance(events[0].stream_chunk, ToolResultEvent)
            if isinstance(events[0].stream_chunk, ToolResultEvent):
                assert events[0].stream_chunk.result.tool_name == tool_name

    def test_tool_result_start_emits_delta(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "message_start",
                    "message": {"id": "msg-tool-result", "content": []},
                },
            }
        )

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_result",
                        "tool_use_id": "toolu-result",
                        "content": [{"type": "text", "text": "partial output"}],
                    },
                },
            }
        )

        raw_event = next(
            (
                event.raw
                for event in events
                if isinstance(event.raw, dict)
                and event.raw.get("type") == "tool_result_delta"
            ),
            None,
        )
        assert isinstance(raw_event, dict)
        assert raw_event.get("toolUseId") == "toolu-result"
        assert raw_event.get("text") == "partial output"

    def test_stream_event_thinking_deltas(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "message_start",
                    "message": {"id": "msg-think", "content": []},
                },
            }
        )

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "thinking",
                        "thinking": "Plan",
                        "summary": "Plan summary",
                        "signature": "sig-1",
                    },
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.thinking == "Plan"
                assert delta.summary == "Plan summary"
                assert delta.signature == "sig-1"

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {
                        "type": "thinking_delta",
                        "thinking": " next",
                        "summary": "Next summary",
                    },
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.thinking == " next"
                assert delta.summary == "Next summary"

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "signature_delta", "signature": "sig-2"},
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.signature == "sig-2"

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "summary_delta", "summary": "Final summary"},
                },
            }
        )
        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageDeltaEvent)
        if isinstance(events[0].stream_chunk, MessageDeltaEvent):
            delta = events[0].stream_chunk.content[0]
            assert isinstance(delta, MessageThinkingDelta)
            if isinstance(delta, MessageThinkingDelta):
                assert delta.summary == "Final summary"

    def test_tool_result_emits_tool_result_event(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "message_start",
                    "message": {"id": "msg-result", "content": []},
                },
            }
        )
        parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "toolu-2",
                        "name": "Bash",
                        "input": {"command": "ls"},
                    },
                },
            }
        )

        parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {
                    "type": "content_block_start",
                    "index": 1,
                    "content_block": {
                        "type": "tool_result",
                        "tool_use_id": "toolu-2",
                        "content": [{"type": "text", "text": "ok"}],
                    },
                },
            }
        )

        events = parser.handle(
            {
                "type": "raw_message_stream_event",
                "stream_event": {"type": "content_block_stop", "index": 1},
            }
        )

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, ToolResultEvent)
        if isinstance(events[0].stream_chunk, ToolResultEvent):
            result = events[0].stream_chunk.result
            assert result.tool_call_id == "toolu-2"
            assert result.tool_name == "Bash"
            assert result.content[0].text == "ok"

    def test_tool_use_delta_overrides_empty_input(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "message_start",
                    "message": {"id": "msg-tool-delta", "content": []},
                },
            }
        )
        parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "toolu-3",
                        "name": "Bash",
                        "input": {},
                    },
                },
            }
        )
        parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": "{\"command\": \"ls\"}",
                    },
                },
            }
        )
        parser.handle(
            {
                "type": "stream_event",
                "event": {"type": "content_block_stop", "index": 0},
            }
        )

        events = parser.handle(
            {"type": "stream_event", "event": {"type": "message_stop"}}
        )
        finalized = next(
            (
                event.stream_chunk
                for event in events
                if isinstance(event.stream_chunk, MessageFinalizedEvent)
            ),
            None,
        )

        assert isinstance(finalized, MessageFinalizedEvent)
        if isinstance(finalized, MessageFinalizedEvent):
            tool_calls = finalized.message.tool_calls or []
            assert len(tool_calls) == 1
            assert tool_calls[0].function.arguments == {"command": "ls"}

    def test_stream_event_message_start_parses_event_key(self) -> None:
        parser = _ClaudeSdkEventParser()
        events = parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "message_start",
                    "message": {"id": "msg-stream", "content": []},
                },
            }
        )

        assert len(events) == 1
        assert isinstance(events[0].stream_chunk, MessageStartEvent)

    def test_assistant_payload_ignored_after_partial_stream(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "message_start",
                    "message": {"id": "msg-partial", "content": []},
                },
            }
        )

        events = parser.handle(
            {
                "type": "assistant",
                "message": {
                    "id": "msg-partial",
                    "content": [{"type": "text", "text": "Hello"}],
                },
            }
        )

        assert len(events) == 1
        assert events[0].stream_chunk is None

    def test_result_payload_ignored_after_partial_stream(self) -> None:
        parser = _ClaudeSdkEventParser()
        parser.handle(
            {
                "type": "stream_event",
                "event": {
                    "type": "message_start",
                    "message": {"id": "msg-partial", "content": []},
                },
            }
        )

        events = parser.handle(
            {
                "type": "result",
                "result": "Hello",
                "final": True,
            }
        )

        assert len(events) == 1
        assert events[0].stream_chunk is None

    def test_build_prompt_uses_latest_user_message(self) -> None:
        adapter = ClaudeSdkAdapter()
        config = ExternalAgentConfig(
            name="Claude SDK",
            toolType=ExternalAgentToolType.claude_code,
            runMode=ExternalAgentRunMode.sdk,
        )
        messages = [
            SystemChatMessage(content=[MessageTextContent(text="System prompt")]),
            AssistantChatMessage(content=[MessageTextContent(text="Earlier reply")]),
            UserChatMessage(content=[MessageTextContent(text="Latest request")]),
        ]
        inputs = {"messages": [message.model_dump(mode="json") for message in messages]}
        context = ExternalAgentRunContext(
            run=AgentRun(),
            config=config,
            profile=None,
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs=inputs,
            system_prompt="System prompt",
            working_dir=Path("."),
            env={},
        )

        prompt = adapter._build_prompt(context)

        assert prompt.strip() == "Latest request"
        assert "System:" not in prompt
        assert "User:" not in prompt

    def test_system_prompt_payload_uses_preset_and_append(self) -> None:
        payload = _build_system_prompt_payload("Use Setta conventions.")

        assert payload.get("preset") == "claude_code"
        assert payload.get("append") == "Use Setta conventions."


class TestClaudeSdkAdapterToolResponse:
    @pytest.mark.asyncio
    async def test_send_tool_response_merges_answers_into_updated_input(self) -> None:
        adapter = ClaudeSdkAdapter()
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        tool_input = {
            "questions": [
                {
                    "header": "Language",
                    "question": "Pick a language",
                    "multiSelect": False,
                    "options": [{"label": "Python"}],
                },
                {
                    "header": "Target",
                    "question": "Pick a target",
                    "multiSelect": False,
                    "options": [{"label": "CLI"}],
                },
            ]
        }
        pending = _PendingApproval(
            future=future,
            tool_name="AskUserQuestion",
            tool_input=tool_input,
        )
        handle = ExternalAgentRunHandle(
            run_id=ID("run-1"),
            metadata={"pending_approvals": {"tool-1": pending}},
        )
        answers = {
            "Pick a language": "Python",
            "Pick a target": "CLI",
        }

        await adapter.send_tool_response(handle, "tool-1", {"answers": answers})

        assert future.done()
        decision = future.result()
        assert decision.approved
        assert isinstance(decision.updated_input, dict)
        assert decision.updated_input.get("answers") == answers
        assert decision.updated_input.get("questions") == tool_input["questions"]
        pending_map = handle.metadata.get("pending_approvals")
        if isinstance(pending_map, dict):
            assert "tool-1" not in pending_map

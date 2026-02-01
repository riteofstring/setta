from setta.agentic.external_adapters.claude_sdk import _ClaudeSdkEventParser
from setta.types.chat_stream_events import ToolResultEvent


def _stream_event(payload: dict) -> dict:
    return {"type": "stream_event", "event": payload}


def test_tool_result_raw_payload_includes_parent_id() -> None:
    parser = _ClaudeSdkEventParser()

    parser.handle(
        _stream_event(
            {
                "type": "message_start",
                "message": {"id": "msg-1", "content": []},
            }
        )
    )
    parser.handle(
        _stream_event(
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {
                    "type": "tool_result",
                    "tool_use_id": "toolu-child",
                    "parent_tool_use_id": "toolu-parent",
                    "content": [{"type": "text", "text": "hello"}],
                },
            }
        )
    )
    events = parser.handle(
        _stream_event({"type": "content_block_stop", "index": 0})
    )

    raw_payloads = [
        event.raw
        for event in events
        if isinstance(event.stream_chunk, ToolResultEvent)
    ]
    assert raw_payloads
    raw = raw_payloads[0]
    assert raw.get("parentToolUseId") == "toolu-parent"
    assert raw.get("parentToolCallId") == "toolu-parent"


def test_stream_event_parent_tool_use_id_propagates() -> None:
    parser = _ClaudeSdkEventParser()
    parser.handle(
        dict(
            _stream_event(
                {
                    "type": "message_start",
                    "message": {"id": "msg-2", "content": []},
                }
            ),
            parentToolUseId="toolu-parent-2",
        )
    )
    parser.handle(
        dict(
            _stream_event(
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_result",
                        "tool_use_id": "toolu-child-2",
                        "content": [{"type": "text", "text": "ok"}],
                    },
                }
            ),
            parentToolUseId="toolu-parent-2",
        )
    )
    events = parser.handle(
        dict(
            _stream_event({"type": "content_block_stop", "index": 0}),
            parentToolUseId="toolu-parent-2",
        )
    )

    raw_payloads = [
        event.raw
        for event in events
        if isinstance(event.stream_chunk, ToolResultEvent)
    ]
    assert raw_payloads
    raw = raw_payloads[0]
    assert raw.get("parentToolUseId") == "toolu-parent-2"
    assert raw.get("parentToolCallId") == "toolu-parent-2"

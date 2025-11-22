"""Adapter functions for streaming Portkey responses into neutral events."""

import inspect
from collections.abc import AsyncIterator, Iterator
from typing import Any

from portkey_ai import AsyncPortkey

from setta.llm.models import (
    LLMHistory,
    LLMRole,
    LLMStreamEvent,
    MessageStartedEvent,
    ResponseCompletedEvent,
    ResponseFinishStatus,
    TextDeltaEvent,
    ToolCallDeltaEvent,
)


def build_portkey_payload(
    *,
    history: LLMHistory,
    model: str,
    tools: list[dict[str, Any]] | None,
    request_params: dict[str, object] | None,
    extra_headers: dict[str, str] | None,
    provider_id: str,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": model,
        "messages": history.to_openai_messages(),
        "stream": True,
        "provider": provider_id,
    }
    if tools:
        payload["tools"] = tools
    if request_params:
        payload.update(request_params)
    if extra_headers:
        payload["extra_headers"] = extra_headers
    return payload


async def astream_portkey_response(
    *,
    client: AsyncPortkey,
    payload: dict[str, object],
    response_message_id: str,
) -> AsyncIterator[LLMStreamEvent]:
    stream = client.chat.completions.create(**payload)
    if inspect.isawaitable(stream):
        stream = await stream

    yield MessageStartedEvent(
        message_id=response_message_id,
        role=LLMRole.ASSISTANT,
    )

    completed = False
    async for chunk in stream:
        for event in events_from_chunk(chunk, response_message_id):
            if isinstance(event, ResponseCompletedEvent):
                completed = True
            yield event

    if not completed:
        yield ResponseCompletedEvent(
            message_id=response_message_id,
            status=ResponseFinishStatus.COMPLETED,
            finish_reason=None,
        )


def events_from_chunk(
    chunk: Any,
    response_message_id: str,
) -> list[LLMStreamEvent]:
    chunk_type = _get_attr(chunk, "type")
    events: list[LLMStreamEvent] = []

    if chunk_type == "response.completed":
        finish_reason = _get_attr(chunk, "finish_reason")
        events.append(
            ResponseCompletedEvent(
                message_id=response_message_id,
                status=ResponseFinishStatus.COMPLETED,
                finish_reason=finish_reason,
            )
        )
        return events

    choice = _get_first_choice(chunk)
    if choice is None:
        return events

    delta = _get_attr(choice, "delta")
    if delta is not None:
        for text_delta, stream_target in _text_deltas(delta):
            events.append(
                TextDeltaEvent(
                    message_id=response_message_id,
                    delta=text_delta,
                    stream_target=stream_target,
                )
            )
        events.extend(_tool_call_deltas(delta))

    finish_reason = _get_attr(choice, "finish_reason")
    if finish_reason is not None:
        events.append(
            ResponseCompletedEvent(
                message_id=response_message_id,
                status=ResponseFinishStatus.COMPLETED,
                finish_reason=finish_reason,
            )
        )

    return events


def _text_deltas(delta: Any) -> Iterator[tuple[str, str | None]]:
    content = _get_attr(delta, "content")
    if content is None:
        return

    if isinstance(content, str):
        yield content, None
        return

    if isinstance(content, list):
        for part in content:
            yield from _text_part(part)
        return

    text = _get_attr(content, "text")
    if text:
        stream_target = _get_attr(content, "stream_target")
        yield text, stream_target


def _text_part(
    part: Any,
) -> Iterator[tuple[str, str | None]]:
    if isinstance(part, str):
        yield part, None
        return

    text = _get_attr(part, "text")
    if not text:
        return

    stream_target = _get_attr(part, "stream_target")
    yield text, stream_target


def _tool_call_deltas(delta: Any) -> list[ToolCallDeltaEvent]:
    tool_calls = _get_attr(delta, "tool_calls")
    if not tool_calls:
        return []

    events: list[ToolCallDeltaEvent] = []
    for call in tool_calls:
        call_id = _get_attr(call, "id") or _get_attr(call, "tool_call_id")
        if not call_id:
            continue

        function = _get_attr(call, "function")
        arguments_delta = ""
        name = None
        if function is not None:
            arguments_delta = _get_attr(function, "arguments") or ""
            name = _get_attr(function, "name")

        events.append(
            ToolCallDeltaEvent(
                tool_call_id=call_id,
                arguments_delta=arguments_delta,
                name=name,
            )
        )

    return events


def _get_first_choice(chunk: Any) -> Any | None:
    choices = _get_attr(chunk, "choices")
    if not choices:
        return None
    return choices[0]


def _get_attr(data: Any, name: str) -> Any:
    if data is None:
        return None
    if isinstance(data, dict):
        return data.get(name)
    return getattr(data, name, None)

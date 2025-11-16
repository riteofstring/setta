"""Wrapper around the Portkey SDK that emits normalized stream events."""

from collections.abc import AsyncIterator, Iterator
import inspect
from typing import Any

from portkey_ai import AsyncPortkey, Portkey

from .models import (
    LLMHistory,
    LLMRole,
    LLMStreamEvent,
    MessageStartedEvent,
    ResponseCompletedEvent,
    TextDeltaEvent,
    ToolCallDeltaEvent,
)


ToolDefinition = dict[str, Any]


class PortkeyClient:
    """Translates Setta chat history+tools into Portkey chat completions."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        virtual_key: str | None = None,
        base_url: str | None = None,
        default_request_params: dict[str, Any] | None = None,
        sync_client: Portkey | None = None,
        async_client: AsyncPortkey | None = None,
    ) -> None:
        self._api_key = api_key
        self._virtual_key = virtual_key
        self._base_url = base_url
        self._default_request_params = default_request_params or {}
        self._sync_client = sync_client
        self._async_client = async_client

    def stream_chat_completion(
        self,
        *,
        response_message_id: str,
        history: LLMHistory,
        model: str,
        role: LLMRole = LLMRole.ASSISTANT,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        request_params: dict[str, Any] | None = None,
    ) -> Iterator[LLMStreamEvent]:
        """Stream chat completion deltas via Portkey and yield normalized events."""

        payload = self._build_payload(
            history=history,
            model=model,
            tools=tools,
            tool_choice=tool_choice,
            request_params=request_params,
        )
        stream = self._get_sync_client().chat.completions.create(**payload)

        yield MessageStartedEvent(message_id=response_message_id, role=role)

        completed = False
        for chunk in stream:
            for event in self._events_from_chunk(chunk, response_message_id):
                if isinstance(event, ResponseCompletedEvent):
                    completed = True
                yield event

        if not completed:
            yield ResponseCompletedEvent(message_id=response_message_id, finish_reason=None)

    async def astream_chat_completion(
        self,
        *,
        response_message_id: str,
        history: LLMHistory,
        model: str,
        role: LLMRole = LLMRole.ASSISTANT,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        request_params: dict[str, Any] | None = None,
    ) -> AsyncIterator[LLMStreamEvent]:
        """Async variant of :meth:`stream_chat_completion`."""

        payload = self._build_payload(
            history=history,
            model=model,
            tools=tools,
            tool_choice=tool_choice,
            request_params=request_params,
        )
        stream = self._get_async_client().chat.completions.create(**payload)
        if inspect.isawaitable(stream):
            stream = await stream

        yield MessageStartedEvent(message_id=response_message_id, role=role)

        completed = False
        async for chunk in stream:
            for event in self._events_from_chunk(chunk, response_message_id):
                if isinstance(event, ResponseCompletedEvent):
                    completed = True
                yield event

        if not completed:
            yield ResponseCompletedEvent(message_id=response_message_id, finish_reason=None)

    def _build_payload(
        self,
        *,
        history: LLMHistory,
        model: str,
        tools: list[ToolDefinition] | None,
        tool_choice: str | dict[str, Any] | None,
        request_params: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = dict(self._default_request_params)
        if request_params:
            payload.update(request_params)

        payload.update(
            {
                "model": model,
                "messages": history.to_openai_messages(),
                "stream": True,
            }
        )

        if tools:
            payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
        return payload

    def _events_from_chunk(
        self,
        chunk: Any,
        response_message_id: str,
    ) -> list[LLMStreamEvent]:
        chunk_type = self._get_attr(chunk, "type")
        events: list[LLMStreamEvent] = []

        if chunk_type == "response.completed":
            finish_reason = self._get_attr(chunk, "finish_reason")
            events.append(
                ResponseCompletedEvent(
                    message_id=response_message_id,
                    finish_reason=finish_reason,
                )
            )
            return events

        choice = self._get_first_choice(chunk)
        if choice is None:
            return events

        delta = self._get_attr(choice, "delta")
        if delta is not None:
            for text_delta, stream_target in self._text_deltas(delta):
                events.append(
                    TextDeltaEvent(
                        message_id=response_message_id,
                        delta=text_delta,
                        stream_target=stream_target,
                    )
                )
            events.extend(self._tool_call_deltas(delta))

        finish_reason = self._get_attr(choice, "finish_reason")
        if finish_reason is not None:
            events.append(
                ResponseCompletedEvent(
                    message_id=response_message_id,
                    finish_reason=finish_reason,
                )
            )

        return events

    def _text_deltas(
        self,
        delta: Any,
    ) -> Iterator[tuple[str, str | None]]:
        content = self._get_attr(delta, "content")
        if content is None:
            return

        if isinstance(content, str):
            yield content, None
            return

        if isinstance(content, list):
            for part in content:
                yield from self._text_part(part)
            return

        text = self._get_attr(content, "text")
        if text:
            stream_target = self._get_attr(content, "stream_target")
            yield text, stream_target

    def _text_part(
        self,
        part: Any,
    ) -> Iterator[tuple[str, str | None]]:
        if isinstance(part, str):
            yield part, None
            return

        text = self._get_attr(part, "text")
        if not text:
            return

        stream_target = self._get_attr(part, "stream_target")
        yield text, stream_target

    def _tool_call_deltas(self, delta: Any) -> list[ToolCallDeltaEvent]:
        tool_calls = self._get_attr(delta, "tool_calls")
        if not tool_calls:
            return []

        events: list[ToolCallDeltaEvent] = []
        for call in tool_calls:
            call_id = self._get_attr(call, "id") or self._get_attr(call, "tool_call_id")
            if not call_id:
                continue

            function = self._get_attr(call, "function")
            arguments_delta = ""
            name = None
            if function is not None:
                arguments_delta = self._get_attr(function, "arguments") or ""
                name = self._get_attr(function, "name")

            events.append(
                ToolCallDeltaEvent(
                    tool_call_id=call_id,
                    arguments_delta=arguments_delta,
                    name=name,
                )
            )

        return events

    def _get_first_choice(self, chunk: Any) -> Any | None:
        choices = self._get_attr(chunk, "choices")
        if not choices:
            return None
        return choices[0]

    def _get_sync_client(self) -> Portkey:
        if self._sync_client is None:
            kwargs: dict[str, Any] = {}
            if self._api_key is not None:
                kwargs["api_key"] = self._api_key
            if self._virtual_key is not None:
                kwargs["virtual_key"] = self._virtual_key
            if self._base_url is not None:
                kwargs["base_url"] = self._base_url
            self._sync_client = Portkey(**kwargs)
        return self._sync_client

    def _get_async_client(self) -> AsyncPortkey:
        if self._async_client is None:
            kwargs: dict[str, Any] = {}
            if self._api_key is not None:
                kwargs["api_key"] = self._api_key
            if self._virtual_key is not None:
                kwargs["virtual_key"] = self._virtual_key
            if self._base_url is not None:
                kwargs["base_url"] = self._base_url
            self._async_client = AsyncPortkey(**kwargs)
        return self._async_client

    def _get_attr(self, data: Any, name: str) -> Any:
        if data is None:
            return None
        if isinstance(data, dict):
            return data.get(name)
        return getattr(data, name, None)

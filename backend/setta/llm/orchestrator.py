"""Coordinates chat requests, history conversion, and Portkey streaming."""

import inspect
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Sequence
from typing import Any, Protocol, runtime_checkable

from .models import LLMHistory, LLMMessage, LLMRole, LLMStreamEvent
from .portkey_client import ToolDefinition

HistoryInput = LLMHistory | Sequence[LLMMessage] | Sequence[dict[str, Any]]
EventConsumer = Callable[[LLMStreamEvent], None]
AsyncEventConsumer = Callable[[LLMStreamEvent], Awaitable[None] | None]


@runtime_checkable
class LLMGateway(Protocol):
    """Minimal interface any LLM backend must implement for orchestration."""

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
    ) -> Iterator[LLMStreamEvent]: ...

    def astream_chat_completion(
        self,
        *,
        response_message_id: str,
        history: LLMHistory,
        model: str,
        role: LLMRole = LLMRole.ASSISTANT,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        request_params: dict[str, Any] | None = None,
    ) -> AsyncIterator[LLMStreamEvent]: ...


class LLMOrchestrator:
    """High-level coordinator around the lower-level Portkey client."""

    def __init__(self, gateway: LLMGateway) -> None:
        self._gateway = gateway

    def stream_response(
        self,
        *,
        response_message_id: str,
        history: HistoryInput,
        model: str,
        role: LLMRole = LLMRole.ASSISTANT,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        request_params: dict[str, Any] | None = None,
        event_consumer: EventConsumer | None = None,
    ) -> Iterator[LLMStreamEvent]:
        """Stream events synchronously and optionally forward them to a consumer."""

        normalized_history = self._normalize_history(history)
        stream = self._gateway.stream_chat_completion(
            response_message_id=response_message_id,
            history=normalized_history,
            model=model,
            role=role,
            tools=tools,
            tool_choice=tool_choice,
            request_params=request_params,
        )

        for event in stream:
            if event_consumer is not None:
                event_consumer(event)
            yield event

    async def astream_response(
        self,
        *,
        response_message_id: str,
        history: HistoryInput,
        model: str,
        role: LLMRole = LLMRole.ASSISTANT,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        request_params: dict[str, Any] | None = None,
        event_consumer: AsyncEventConsumer | None = None,
    ) -> AsyncIterator[LLMStreamEvent]:
        """Async counterpart to :meth:`stream_response`."""

        normalized_history = self._normalize_history(history)
        stream = self._gateway.astream_chat_completion(
            response_message_id=response_message_id,
            history=normalized_history,
            model=model,
            role=role,
            tools=tools,
            tool_choice=tool_choice,
            request_params=request_params,
        )

        async for event in stream:
            if event_consumer is not None:
                maybe_awaitable = event_consumer(event)
                if inspect.isawaitable(maybe_awaitable):
                    await maybe_awaitable
            yield event

    def _normalize_history(self, history: HistoryInput) -> LLMHistory:
        if isinstance(history, LLMHistory):
            return history
        if not isinstance(history, Sequence):
            raise TypeError("History payload must be a sequence or LLMHistory")

        as_list = list(history)
        if not as_list:
            return LLMHistory([])

        first = as_list[0]
        if isinstance(first, LLMMessage):
            return LLMHistory(list(as_list))

        if isinstance(first, dict):
            dicts: list[dict[str, Any]] = []
            for item in as_list:
                if not isinstance(item, dict):
                    raise TypeError("History sequence must be uniformly typed")
                dicts.append(item)
            return LLMHistory.from_dicts(dicts)

        raise TypeError(
            "History sequence must contain LLMMessage instances or serialized dicts"
        )

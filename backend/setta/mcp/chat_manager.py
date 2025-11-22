"""Chat persistence manager built on the neutral LLM models."""

import asyncio
import inspect
import json
import logging
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from portkey_ai import AsyncPortkey

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm import (
    LLMConfig,
    LLMHistory,
    LLMMessage,
    LLMModelConfig,
    LLMProviderConfig,
    LLMRole,
    LLMStreamEvent,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    MessageStartedEvent,
    ResponseCompletedEvent,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
    validate_llm_request,
    resolve_model_selection,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatMetadata,
    ChatStreamStatus,
    LLMModelSelection,
    ToolResult,
)
from setta.types.notifications import SettaNotification, SettaNotificationType

if TYPE_CHECKING:
    from mcp.types import CallToolResult

    from setta.mcp.client import MCPClient
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


logger = logging.getLogger(__name__)


class ChatManager:
    """Handles chat persistence and metadata enumeration."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: "MCPClient",
        wmh_frontend_sender: "WMHFrontendSender",
        *,
        llm_config: LLMConfig,
    ) -> None:
        self._dbe = dbe
        self._mcp_client = mcp_client
        self._wmh_frontend_sender = wmh_frontend_sender
        self._llm_config = llm_config
        self._active_streams: dict[str, _ActiveStream] = {}
        self._provider_clients: dict[tuple[str | None, str], AsyncPortkey] = {}

    def update_llm_config(self, llm_config: LLMConfig) -> None:
        """Replace the cached config so future requests use fresh credentials."""

        self._llm_config = llm_config
        self._provider_clients.clear()

    # ---------------------------------------------------------------------
    # Persistence helpers

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: ChatMessage,
        model_selection: LLMModelSelection,
        project_config_id: str | None,
    ) -> Chat:
        """Load an existing chat (if any), append the message, and persist."""

        if chat_id:
            chat = self.get_chat(chat_id)
            if chat is None:
                chat = self._create_chat(
                    message,
                    model_selection,
                    project_config_id=project_config_id,
                )
            else:
                self._ensure_model_selection(chat, model_selection)
                self._ensure_project_config(chat, project_config_id)
                chat.add_message(message)
        else:
            chat = self._create_chat(
                message,
                model_selection,
                project_config_id=project_config_id,
            )

        self._persist_chat(chat)
        return chat

    def get_chat(self, chat_id: str) -> Chat | None:
        payload = self._dbe.read_chat(chat_id)
        if payload is None:
            return None
        return Chat.model_validate(payload)

    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        """Return metadata for all chats stored on disk."""

        metadata: list[ChatMetadata] = []
        for path in self._dbe.list_chat_paths():
            payload = self._dbe.read_json(path)
            if not payload:
                continue
            try:
                chat = Chat.model_validate(payload)
            except Exception:
                # Old / invalid chats can be skipped—we do not need backwards compat.
                continue
            metadata.append(ChatMetadata.from_chat(chat))

        metadata.sort(key=lambda item: item.lastUpdated, reverse=True)
        return metadata

    def delete_chat(self, chat_id: str) -> None:
        self._dbe.delete_chat_file(chat_id)

    # ---------------------------------------------------------------------
    # Tool result utilities

    def separate_tool_results(
        self,
        messages: list[ChatMessage],
    ) -> tuple[list[ChatMessage], dict[str, ToolResult]]:
        """Split tool-result blocks out of messages for easier frontend rendering."""

        cleaned_messages: list[ChatMessage] = []
        tool_results: dict[str, ToolResult] = {}

        for message in messages:
            retained_blocks = []
            for block in message.content:
                if isinstance(block, LLMToolResultBlock):
                    tool_results[block.tool_call_id] = ToolResult.from_block(block)
                    continue
                retained_blocks.append(block)

            if not retained_blocks:
                continue

            cleaned_messages.append(
                message.model_copy(update={"content": retained_blocks})
            )

        return cleaned_messages, tool_results

    # ---------------------------------------------------------------------
    # LLM orchestration

    async def process_query(
        self,
        project_config_id: str | None,
        chat: Chat,
        deep_think: bool,
    ) -> None:
        """Stream a response from the Portkey-backed orchestrator."""

        response_message_id = create_new_id()
        model_selection = chat.modelSelection
        if model_selection is None:
            raise ValueError("Chat missing model selection")
        project_scope_id = chat.projectConfigId or project_config_id
        provider_config, model_config = resolve_model_selection(
            self._llm_config,
            model_selection,
            project_config_id=project_scope_id,
        )
        client = self._acquire_portkey_client(
            provider_config,
            project_config_id=project_scope_id,
        )
        assistant_message = LLMMessage(
            message_id=response_message_id,
            role=LLMRole.ASSISTANT,
            content=[],
        )
        logger.info(
            "Starting LLM stream",
            extra={
                "chat_id": chat.id,
                "project_config_id": project_scope_id,
                "provider_id": provider_config.provider_id,
                "model_id": model_config.model_id,
                "deep_think": deep_think,
            },
        )
        accumulator = _AssistantMessageAccumulator(assistant_message)
        recorder = _StreamingTranscriptRecorder(
            chat=chat,
            persist_chat=self._persist_chat,
        )
        chat.streamStatus = ChatStreamStatus.STREAMING
        recorder.persist_snapshot(assistant_message)
        tool_calls = _ToolCallAccumulator()
        current_task = asyncio.current_task()
        if current_task is None:
            raise RuntimeError("LLM orchestration must run inside an asyncio Task")
        self._active_streams[chat.id] = _ActiveStream(
            task=current_task,
            assistant_message=assistant_message,
        )

        history = chat.to_history()
        tools = self._mcp_client.available_tools or None
        request_params = validate_llm_request(
            provider_config,
            model_config,
            deep_think=deep_think,
        )
        extra_headers = self._build_extra_headers(provider_config)

        try:
            async for event in self._astream_portkey_response(
                client=client,
                response_message_id=response_message_id,
                history=history,
                model=model_config.model_id,
                tools=tools,
                request_params=request_params,
                extra_headers=extra_headers,
                provider_id=provider_config.provider_id,
            ):
                accumulator.apply_event(event)
                tool_calls.observe_event(event)
                recorder.persist_snapshot(assistant_message)
                await self._wmh_frontend_sender.send_streaming_response(
                    chatId=chat.id,
                    assistant_message_id=response_message_id,
                    chunk=event,
                )
                if isinstance(event, ResponseCompletedEvent) and (
                    event.finish_reason == "tool_calls"
                ):
                    await self._resolve_tool_calls(
                        chat_id=chat.id,
                        assistant_message_id=response_message_id,
                        tool_calls=tool_calls.consume_ready_calls(),
                        accumulator=accumulator,
                        recorder=recorder,
                    )
        except asyncio.CancelledError:
            chat.streamStatus = ChatStreamStatus.CANCELED
            recorder.persist_snapshot(assistant_message)
            self._active_streams.pop(chat.id, None)
            logger.info(
                "Canceled LLM stream",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": project_scope_id,
                    "provider_id": provider_config.provider_id,
                    "model_id": model_config.model_id,
                },
            )
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat.id,
                assistant_message_id=response_message_id,
                chunk=ResponseCompletedEvent(
                    message_id=response_message_id,
                    finish_reason="canceled",
                ),
            )
            return
        except Exception as exc:
            chat.streamStatus = ChatStreamStatus.COMPLETED
            recorder.persist_snapshot(assistant_message)
            self._active_streams.pop(chat.id, None)
            logger.exception(
                "LLM stream failed",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": project_scope_id,
                    "provider_id": provider_config.provider_id,
                    "model_id": model_config.model_id,
                },
            )
            await self._notify_llm_failure(
                chat_id=chat.id,
                project_config_id=project_scope_id,
                provider_id=provider_config.provider_id,
                model_id=model_config.model_id,
                error_message=str(exc),
            )
            raise

        try:
            chat.add_message(assistant_message)
            chat.streamStatus = ChatStreamStatus.COMPLETED
            self._persist_chat(chat)
            logger.info(
                "Completed LLM stream",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": project_scope_id,
                    "provider_id": provider_config.provider_id,
                    "model_id": model_config.model_id,
                },
            )
        finally:
            self._active_streams.pop(chat.id, None)

    async def request_stop_streaming(self, chat_id: str) -> None:
        active = self._active_streams.get(chat_id)
        if active is None:
            return
        active.task.cancel()
        try:
            await active.task
        except asyncio.CancelledError:
            return

    def is_waiting_for_response(self, chat_id: str) -> bool:
        return chat_id in self._active_streams

    def get_current_stream(self, chat_id: str) -> list[ChatMessage]:
        active = self._active_streams.get(chat_id)
        if active is None:
            return []
        return active.snapshot_messages()

    # ---------------------------------------------------------------------

    def _create_chat(
        self,
        initial_message: ChatMessage,
        model_selection: LLMModelSelection,
        *,
        project_config_id: str | None,
    ) -> Chat:
        chat = Chat(
            name=self._derive_chat_name(initial_message),
            modelSelection=model_selection,
            projectConfigId=project_config_id,
        )
        chat.add_message(initial_message)
        return chat

    def _ensure_model_selection(
        self,
        chat: Chat,
        model_selection: LLMModelSelection,
    ) -> None:
        if chat.modelSelection is None:
            chat.modelSelection = model_selection
            return

        if (
            chat.modelSelection.providerId != model_selection.providerId
            or chat.modelSelection.modelId != model_selection.modelId
        ):
            raise ValueError(
                "Existing chat model selection cannot be changed mid-conversation"
            )

    def _ensure_project_config(
        self,
        chat: Chat,
        project_config_id: str | None,
    ) -> None:
        if chat.projectConfigId is None:
            chat.projectConfigId = project_config_id
            return
        if project_config_id is not None and chat.projectConfigId != project_config_id:
            raise ValueError(
                "Existing chat project config cannot be changed mid-conversation"
            )

    def _derive_chat_name(self, message: ChatMessage) -> str:
        """Use the first text block as the chat title, otherwise fallback."""

        for block in message.content:
            if isinstance(block, LLMTextBlock):
                snippet = block.text.strip()
                if snippet:
                    return snippet[:80]
        return "Untitled Chat"

    def _persist_chat(self, chat: Chat) -> None:
        self._dbe.write_chat(chat.id, chat.model_dump(mode="json"))

    def _acquire_portkey_client(
        self,
        provider: LLMProviderConfig,
        *,
        project_config_id: str | None,
    ) -> AsyncPortkey:
        """Return a provider-scoped Portkey client, building and caching when needed."""

        cache_key = (project_config_id, provider.provider_id)
        cached = self._provider_clients.get(cache_key)
        if cached is not None:
            return cached

        client = self._build_portkey_client(provider)
        self._provider_clients[cache_key] = client
        return client

    def _build_portkey_client(self, provider: LLMProviderConfig) -> AsyncPortkey:
        """Construct a Portkey client that talks to the configured gateway or provider."""

        base_url = provider.base_url or self._llm_config.gateway_url
        api_key = provider.api_key or None
        return AsyncPortkey(
            api_key=api_key,
            base_url=base_url,
            provider=provider.provider_id,
        )

    def _build_extra_headers(
        self, provider: LLMProviderConfig
    ) -> dict[str, str] | None:
        headers = provider.extra_headers
        if not headers:
            return None
        return dict(headers)

    def _build_portkey_payload(
        self,
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

    async def _astream_portkey_response(
        self,
        *,
        client: AsyncPortkey,
        response_message_id: str,
        history: LLMHistory,
        model: str,
        tools: list[dict[str, Any]] | None,
        request_params: dict[str, object] | None,
        extra_headers: dict[str, str] | None,
        provider_id: str,
    ) -> AsyncIterator[LLMStreamEvent]:
        payload = self._build_portkey_payload(
            history=history,
            model=model,
            tools=tools,
            request_params=request_params,
            extra_headers=extra_headers,
            provider_id=provider_id,
        )
        stream = client.chat.completions.create(**payload)
        if inspect.isawaitable(stream):
            stream = await stream

        yield MessageStartedEvent(
            message_id=response_message_id,
            role=LLMRole.ASSISTANT,
        )

        completed = False
        async for chunk in stream:
            for event in _events_from_chunk(chunk, response_message_id):
                if isinstance(event, ResponseCompletedEvent):
                    completed = True
                yield event

        if not completed:
            yield ResponseCompletedEvent(
                message_id=response_message_id, finish_reason=None
            )

    async def _resolve_tool_calls(
        self,
        *,
        chat_id: str,
        assistant_message_id: str,
        tool_calls: list["_PendingToolCall"],
        accumulator: "_AssistantMessageAccumulator",
        recorder: "_StreamingTranscriptRecorder",
    ) -> None:
        if not tool_calls:
            return

        for tool_call in tool_calls:
            event = await self._call_tool(tool_call)
            accumulator.apply_event(event)
            recorder.persist_snapshot(accumulator.message)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat_id,
                assistant_message_id=assistant_message_id,
                chunk=event,
            )

    async def _call_tool(self, tool_call: "_PendingToolCall") -> ToolResultEvent:
        tool_name = tool_call.name
        if not tool_name:
            raise ValueError("Tool call missing name")

        arguments = tool_call.to_arguments_dict()
        result = await self._mcp_client.call_tool(tool_name, arguments)
        output_text = _extract_tool_output_text(result)
        return ToolResultEvent(
            tool_call_id=tool_call.tool_call_id,
            output=result.model_dump(),
            output_text=output_text,
            is_error=bool(getattr(result, "isError", False)),
        )

    async def _notify_llm_failure(
        self,
        *,
        chat_id: str,
        project_config_id: str | None,
        provider_id: str,
        model_id: str,
        error_message: str,
    ) -> None:
        if not self._wmh_frontend_sender:
            return

        detail = error_message.strip() or "LLM request failed"
        if len(detail) > 200:
            detail = f"{detail[:200]}..."

        notification = SettaNotification(
            projectConfigId=project_config_id,
            type=SettaNotificationType.error,
            message=(f"LLM request for {provider_id}:{model_id} failed: {detail}"),
            metadata={
                "chatId": chat_id,
                "providerId": provider_id,
                "modelId": model_id,
            },
        )
        await self._wmh_frontend_sender.broadcast_notification(notification)


def _events_from_chunk(
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


@dataclass
class _AssistantMessageAccumulator:
    """Incrementally builds the assistant message from incoming stream events."""

    message: LLMMessage
    _text_blocks: dict[str | None, LLMTextBlock] = field(default_factory=dict)
    _tool_call_blocks: dict[str, LLMToolCallBlock] = field(default_factory=dict)

    def apply_event(self, event: LLMStreamEvent) -> None:
        if isinstance(event, TextDeltaEvent):
            self._apply_text_delta(event)
            return
        if isinstance(event, ToolCallDeltaEvent):
            self._apply_tool_call_delta(event)
            return
        if isinstance(event, ToolResultEvent):
            self._apply_tool_result(event)

    def _apply_text_delta(self, event: TextDeltaEvent) -> None:
        block = self._text_blocks.get(event.stream_target)
        if block is None:
            block = LLMTextBlock(stream_target=event.stream_target)
            self._text_blocks[event.stream_target] = block
            self.message.add_block(block)
        block.text += event.delta

    def _apply_tool_call_delta(self, event: ToolCallDeltaEvent) -> None:
        block = self._tool_call_blocks.get(event.tool_call_id)
        if block is None:
            block = LLMToolCallBlock(tool_call_id=event.tool_call_id)
            self._tool_call_blocks[event.tool_call_id] = block
            self.message.add_block(block)
        if event.name and not block.name:
            block.name = event.name
        existing_arguments = block.arguments_text or ""
        block.arguments_text = f"{existing_arguments}{event.arguments_delta}"

    def _apply_tool_result(self, event: ToolResultEvent) -> None:
        tool_call = self._tool_call_blocks.get(event.tool_call_id)
        block = LLMToolResultBlock(
            tool_call_id=event.tool_call_id,
            name=tool_call.name if tool_call else None,
            output_json=event.output,
            output_text=event.output_text,
            is_error=event.is_error,
        )
        self.message.add_block(block)


@dataclass
class _PendingToolCall:
    tool_call_id: str
    name: str | None = None
    _argument_chunks: list[str] = field(default_factory=list)

    def add_delta(self, event: ToolCallDeltaEvent) -> None:
        if event.name and not self.name:
            self.name = event.name
        if event.arguments_delta:
            self._argument_chunks.append(event.arguments_delta)

    def to_arguments_dict(self) -> dict[str, object]:
        payload = "".join(self._argument_chunks).strip()
        if not payload:
            return {}
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Tool call {self.tool_call_id} provided invalid JSON arguments"
            ) from exc
        if not isinstance(data, dict):
            raise TypeError("Tool arguments must serialize to an object")
        return data


@dataclass
class _ToolCallAccumulator:
    _calls: dict[str, _PendingToolCall] = field(default_factory=dict)

    def observe_event(self, event: LLMStreamEvent) -> None:
        if isinstance(event, ToolCallDeltaEvent):
            self._record_delta(event)

    def _record_delta(self, event: ToolCallDeltaEvent) -> None:
        call = self._calls.get(event.tool_call_id)
        if call is None:
            call = _PendingToolCall(tool_call_id=event.tool_call_id)
            self._calls[event.tool_call_id] = call
        call.add_delta(event)

    def consume_ready_calls(self) -> list[_PendingToolCall]:
        if not self._calls:
            return []
        calls = list(self._calls.values())
        self._calls.clear()
        return calls


@dataclass
class _ActiveStream:
    """Tracks in-flight orchestration metadata for a chat."""

    task: asyncio.Task[object]
    assistant_message: LLMMessage

    def snapshot_messages(self) -> list[ChatMessage]:
        """Return the assistant message as a ChatMessage for merging with history."""

        return [ChatMessage.from_llm_message(self.assistant_message)]


@dataclass
class _StreamingTranscriptRecorder:
    """Persists incremental assistant/tool-call deltas while streaming."""

    chat: Chat
    persist_chat: Callable[[Chat], None]

    def persist_snapshot(self, assistant_message: LLMMessage) -> None:
        snapshot = self.chat.model_copy(deep=True)
        snapshot.add_message(assistant_message)
        self.persist_chat(snapshot)


def _extract_tool_output_text(result: "CallToolResult") -> str | None:
    contents = getattr(result, "content", None)
    if not contents:
        return None
    texts: list[str] = []
    for item in contents:
        text = getattr(item, "text", None)
        if text:
            texts.append(text)
    if not texts:
        return None
    return "\n".join(texts)

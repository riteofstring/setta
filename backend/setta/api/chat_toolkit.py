import inspect
import json
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Awaitable, Callable

from setta.api.listener_endpoint_client import RouterEndpointAPI
from setta.llm.chat_toolkit import (
    ChatStreamAssembler,
    ToolCallBuilder,
    assistant_message,
    build_chat_section_state,
    message_attachment,
    message_image_url,
    message_text,
    message_thinking,
    system_message,
    tool_reference,
    user_message,
)
from setta.llm.chat_toolkit.stream_assembler import AssistantMessageBuilder
from setta.mcp.tool_metadata import ToolArgumentPreviewIdType, ToolArgumentPreviewKind
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    Chat,
    ChatMetadata,
    ChatRole,
    ChatSectionState,
    ChatSendEvent,
    ChatStopEvent,
    LiteralDependencyValue,
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextContent,
    MessageTextDelta,
    MessageThinkingDelta,
    StreamingEventType,
    SystemChatMessage,
    ToolArgumentPreviewDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    ToolChatMessage,
    ToolResultEvent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.protocol import SectionDependencyKey

if TYPE_CHECKING:
    from setta.api.listener import DependencyEvent, ListenerCallbackContext

ChatActionEvent = ChatSendEvent | ChatStopEvent


class ChatHistoryClient:
    def __init__(self, project_manager: RouterEndpointAPI) -> None:
        self._project_manager = project_manager

    async def create(
        self,
        *,
        engine_config_id: ID | None,
        first_message: BaseChatMessageUnion,
    ) -> Chat:
        payload: dict[str, object] = {
            "engineConfigId": engine_config_id,
            "firstMessage": first_message,
        }
        return _coerce_chat(await self._project_manager.create_chat(payload))

    async def get(
        self,
        *,
        chat_id: ID,
    ) -> Chat:
        payload: dict[str, object] = {"chatId": chat_id}
        return _coerce_chat(await self._project_manager.get_chat(payload))

    async def append(
        self,
        *,
        chat_id: ID,
        messages: list[BaseChatMessageUnion],
    ) -> Chat:
        payload: dict[str, object] = {"chatId": chat_id, "messages": messages}
        return _coerce_chat(await self._project_manager.append_chat_messages(payload))

    async def delete(
        self,
        *,
        chat_id: ID,
    ) -> None:
        payload: dict[str, object] = {"chatId": chat_id}
        await self._project_manager.delete_chat(payload)

    async def set_system_prompt(
        self,
        *,
        chat_id: ID,
        system_prompt: str,
    ) -> Chat:
        payload: dict[str, object] = {
            "chatId": chat_id,
            "systemPrompt": system_prompt,
        }
        return _coerce_chat(await self._project_manager.set_chat_system_prompt(payload))

    async def get_all_metadata(self) -> list[ChatMetadata]:
        return _coerce_chat_metadata_list(
            await self._project_manager.get_all_chat_metadata({})
        )

    async def ensure_section_chat_id(
        self,
        *,
        section_id: ID,
        engine_config_id: ID | None,
        first_message: BaseChatMessageUnion,
    ) -> tuple[ID, bool]:
        payload: dict[str, object] = {"sectionId": section_id}
        chat_id = await self._project_manager.get_chat_section_chat_id(payload)
        if chat_id:
            return ID(chat_id), False
        chat = await self.create(
            engine_config_id=engine_config_id,
            first_message=first_message,
        )
        set_payload: dict[str, object] = {"sectionId": section_id, "chatId": chat.id}
        await self._project_manager.set_chat_section_chat_id(set_payload)
        return chat.id, True


class ChatStreamEmitterClient:
    def __init__(
        self,
        project_manager: RouterEndpointAPI,
        *,
        section_id: ID | None = None,
    ) -> None:
        self._project_manager = project_manager
        self._section_id = section_id

    def with_section(self, section_id: ID) -> "ChatStreamEmitterClient":
        return ChatStreamEmitterClient(self._project_manager, section_id=section_id)

    async def emit_message_start(
        self,
        *,
        chat_id: ID,
        message: BaseChatMessageUnion,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageStartEvent(
                type=StreamingEventType.message_start,
                message=message.model_dump(mode="python"),
            ),
        )

    async def emit_text_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        text: str,
        section_id: ID | None = None,
        index: int = 0,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id=message_id,
                content=[MessageTextDelta(type="text_delta", index=index, text=text)],
            ),
        )

    async def emit_thinking_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        thinking: str,
        section_id: ID | None = None,
        index: int = 0,
        summary: str | None = None,
        signature: str | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id=message_id,
                content=[
                    MessageThinkingDelta(
                        type="thinking_delta",
                        index=index,
                        thinking=thinking,
                        summary=summary,
                        signature=signature,
                    )
                ],
            ),
        )

    async def emit_tool_call_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        tool_call_id: str,
        arguments_delta: str,
        tool_name: str | None = None,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolCallDeltaEvent(
                type=StreamingEventType.tool_call_delta,
                message_id=message_id,
                tool_call_id=tool_call_id,
                arguments_delta=arguments_delta,
                tool_name=tool_name,
            ),
        )

    async def emit_tool_argument_preview_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        tool_call_id: str,
        tool_name: str,
        arguments_delta: str,
        preview_kind: ToolArgumentPreviewKind,
        target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
        preview_value_delta: str,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolArgumentPreviewDeltaEvent(
                type=StreamingEventType.tool_argument_preview_delta,
                message_id=message_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                arguments_delta=arguments_delta,
                preview_kind=preview_kind,
                target_ids_by_type=target_ids_by_type,
                preview_value_delta=preview_value_delta,
            ),
        )

    async def emit_tool_result(
        self,
        *,
        chat_id: ID,
        message: ToolChatMessage,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolResultEvent(
                type=StreamingEventType.tool_result,
                result=message.model_dump(mode="python"),
            ),
        )

    async def emit_message_stop(
        self,
        *,
        chat_id: ID,
        message_id: str,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageStopEvent(
                type=StreamingEventType.message_stop,
                message_id=message_id,
            ),
        )

    async def emit_message_finalized(
        self,
        *,
        chat_id: ID,
        message: BaseChatMessageUnion,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageFinalizedEvent(
                type=StreamingEventType.message_finalized,
                message=message.model_dump(mode="python"),
            ),
        )

    async def _emit(
        self,
        *,
        chat_id: ID,
        chunk: LLMStreamingResponseChunk,
        section_id: ID | None = None,
    ) -> None:
        resolved_section_id = section_id or self._section_id
        if resolved_section_id is None:
            raise ValueError("section_id is required for chat stream emission")
        await self._project_manager.emit_chat_stream_delta(
            {
                "sectionId": resolved_section_id,
                "chatId": chat_id,
                "chunk": chunk,
            }
        )


class ChatToolRunnerClient:
    def __init__(
        self,
        project_manager: RouterEndpointAPI,
        *,
        frontend_affinity_token: str | None = None,
    ) -> None:
        self._project_manager = project_manager
        self._frontend_affinity_token = frontend_affinity_token

    async def run(
        self,
        *,
        chat_id: ID,
        section_id: ID,
        tool_calls: list[ToolCall],
        frontend_affinity_token: str | None = None,
    ) -> list[ToolChatMessage]:
        payload: dict[str, object] = {
            "chatId": chat_id,
            "sectionId": section_id,
            "toolCalls": tool_calls,
        }
        resolved_frontend_affinity_token = frontend_affinity_token
        if resolved_frontend_affinity_token is None:
            resolved_frontend_affinity_token = self._frontend_affinity_token
        if resolved_frontend_affinity_token is not None:
            payload["frontendAffinityToken"] = resolved_frontend_affinity_token
        return _coerce_tool_messages(await self._project_manager.run_mcp_tools(payload))


class ChatSectionSyncClient:
    def __init__(
        self,
        project_manager: RouterEndpointAPI,
        history_client: ChatHistoryClient | None = None,
    ) -> None:
        self._project_manager = project_manager
        self._history = history_client or ChatHistoryClient(project_manager)

    async def update_from_chat(
        self,
        *,
        section_id: ID,
        chat_id: ID,
        waiting_for_response: bool = False,
        input_text: str = "",
        tool_call_arguments: dict[str, str] | None = None,
    ) -> None:
        chat = await self._history.get(chat_id=chat_id)
        state = build_chat_section_state(
            messages=chat.messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
        )
        await self.update_state(
            section_id=section_id,
            state=state,
        )

    async def update_state(
        self,
        *,
        section_id: ID,
        state: ChatSectionState,
    ) -> None:
        payload: dict[str, object] = {"sectionId": section_id, "state": state}
        await self._project_manager.set_chat_section_state(payload)


class ChatSession:
    def __init__(
        self,
        *,
        section_id: ID,
        chat_id: ID,
        history: ChatHistoryClient,
        stream: ChatStreamEmitterClient,
        tools: ChatToolRunnerClient,
        sync: ChatSectionSyncClient,
    ) -> None:
        self.section_id = section_id
        self.chat_id = chat_id
        self._history = history
        self._stream = stream.with_section(section_id)
        self._tools = tools
        self._sync = sync
        self._assembler = ChatStreamAssembler()
        self._assistant_builder: AssistantMessageBuilder | None = None

    @classmethod
    async def open_from_event(
        cls,
        *,
        ctx: "ListenerCallbackContext",
        section_id: ID,
        engine_config_id: ID | None,
        event: ChatSendEvent | None = None,
    ) -> "ChatSession":
        resolved_event = event or on_chat_send_event(ctx, section_id=section_id)
        if resolved_event is None:
            raise KeyError("No chat send event for section")
        history = ChatHistoryClient(ctx.project_manager)
        stream = ChatStreamEmitterClient(ctx.project_manager)
        tools = ChatToolRunnerClient(
            ctx.project_manager,
            frontend_affinity_token=ctx.frontend_affinity_token,
        )
        sync = ChatSectionSyncClient(ctx.project_manager, history)
        first_message = _build_first_chat_message(resolved_event)
        chat_id, created = await history.ensure_section_chat_id(
            section_id=section_id,
            engine_config_id=engine_config_id,
            first_message=first_message,
        )
        if not created:
            await history.append(chat_id=chat_id, messages=[first_message])

        return cls(
            section_id=section_id,
            chat_id=chat_id,
            history=history,
            stream=stream,
            tools=tools,
            sync=sync,
        )

    async def stream(
        self,
        *,
        provider_stream: AsyncIterator[object],
        normalize_chunk: Callable[[object], Awaitable[None] | None],
        run_tools: bool = True,
    ) -> AssistantChatMessage:
        self._assistant_builder = self._assembler.start_assistant_message()
        await self._stream.emit_message_start(
            chat_id=self.chat_id,
            message=self._assistant_builder.preview(),
        )
        try:
            await self._consume_provider_stream(
                provider_stream=provider_stream,
                normalize_chunk=normalize_chunk,
            )
            return await self._finalize_streamed_message(run_tools=run_tools)
        except BaseException:
            await self.cancel()
            raise
        finally:
            self._assistant_builder = None

    async def stream_text(
        self, provider_stream: AsyncIterator[object]
    ) -> AssistantChatMessage:
        async def normalize(chunk: object) -> None:
            await self.text_delta(str(chunk))

        return await self.stream(
            provider_stream=provider_stream,
            normalize_chunk=normalize,
            run_tools=False,
        )

    async def complete(self, *, text: str) -> AssistantChatMessage:
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(type="text", text=text)],
        )
        await self._history.append(
            chat_id=self.chat_id,
            messages=[assistant_message],
        )
        await self._update_waiting_for_response(waiting_for_response=False)
        self._assistant_builder = None
        return assistant_message

    async def text_delta(self, text: str) -> None:
        builder = self._require_builder()
        builder.append_text(text)
        await self._stream.emit_text_delta(
            chat_id=self.chat_id,
            message_id=builder.id,
            text=text,
        )

    async def tool_call_delta(
        self,
        tool_call: ToolCall,
        *,
        arguments_delta: str | None = None,
    ) -> None:
        builder = self._require_builder()
        builder.append_tool_call(tool_call)
        delta = arguments_delta
        if delta is None:
            delta = json.dumps(tool_call.function.arguments)
        builder.apply_tool_call_delta(
            tool_call_id=tool_call.id,
            arguments_delta=delta,
            tool_name=tool_call.function.name,
        )
        await self._stream.emit_tool_call_delta(
            chat_id=self.chat_id,
            message_id=builder.id,
            tool_call_id=tool_call.id,
            arguments_delta=delta,
            tool_name=tool_call.function.name,
        )

    async def cancel(self) -> None:
        builder = self._assistant_builder
        if builder is None:
            await self._update_waiting_for_response(waiting_for_response=False)
            return

        try:
            assistant_message = await self._close_assistant_message(builder)
            if _should_persist_partial_message(assistant_message):
                await self._history.append(
                    chat_id=self.chat_id,
                    messages=[assistant_message],
                )
                await self._update_waiting_for_response(waiting_for_response=False)
                await self._stream.emit_message_finalized(
                    chat_id=self.chat_id,
                    message=assistant_message,
                )
                return
            await self._update_waiting_for_response(waiting_for_response=False)
        finally:
            self._assistant_builder = None

    def _require_builder(self) -> AssistantMessageBuilder:
        if self._assistant_builder is None:
            raise ValueError("Chat session has no active assistant message")
        return self._assistant_builder

    async def _consume_provider_stream(
        self,
        *,
        provider_stream: AsyncIterator[object],
        normalize_chunk: Callable[[object], Awaitable[None] | None],
    ) -> None:
        async for chunk in provider_stream:
            normalized = normalize_chunk(chunk)
            if inspect.isawaitable(normalized):
                await normalized

    async def _finalize_streamed_message(
        self, *, run_tools: bool
    ) -> AssistantChatMessage:
        assistant_message = await self._close_assistant_message(self._require_builder())
        await self._history.append(
            chat_id=self.chat_id,
            messages=[assistant_message],
        )
        if run_tools and assistant_message.tool_calls:
            await self._run_tool_calls(assistant_message.tool_calls)
        await self._update_waiting_for_response(waiting_for_response=False)
        await self._stream.emit_message_finalized(
            chat_id=self.chat_id,
            message=assistant_message,
        )
        return assistant_message

    async def _close_assistant_message(
        self, builder: AssistantMessageBuilder
    ) -> AssistantChatMessage:
        await self._stream.emit_message_stop(
            chat_id=self.chat_id,
            message_id=builder.id,
        )
        return builder.finalize()

    async def _run_tool_calls(self, tool_calls: list[ToolCall]) -> None:
        tool_results = await self._tools.run(
            chat_id=self.chat_id,
            section_id=self.section_id,
            tool_calls=tool_calls,
        )
        if not tool_results:
            return
        for tool_result in tool_results:
            await self._stream.emit_tool_result(
                chat_id=self.chat_id,
                message=tool_result,
            )
        await self._history.append(
            chat_id=self.chat_id,
            messages=tool_results,
        )

    async def _update_waiting_for_response(self, *, waiting_for_response: bool) -> None:
        await self._sync.update_from_chat(
            section_id=self.section_id,
            chat_id=self.chat_id,
            waiting_for_response=waiting_for_response,
        )


def on_chat_send_event(
    ctx: "ListenerCallbackContext",
    *,
    section_id: ID,
) -> ChatSendEvent | None:
    event = on_chat_action_event(ctx, section_id=section_id)
    if isinstance(event, ChatSendEvent):
        return event
    return None


def on_chat_stop_event(
    ctx: "ListenerCallbackContext",
    *,
    section_id: ID,
) -> ChatStopEvent | None:
    event = on_chat_action_event(ctx, section_id=section_id)
    if isinstance(event, ChatStopEvent):
        return event
    return None


def on_chat_action_event(
    ctx: "ListenerCallbackContext",
    *,
    section_id: ID,
) -> ChatActionEvent | None:
    for event in ctx.events:
        action_event = _parse_chat_action_event(event, section_id=section_id)
        if action_event is not None:
            return action_event
    return None


def _build_first_chat_message(event: ChatSendEvent) -> BaseChatMessageUnion:
    message_type = _message_type_for_chat_role(event.role)
    return message_type(
        id=event.messageId,
        content=[MessageTextContent(type="text", text=event.text)],
        attachments=event.attachments,
    )


def _message_type_for_chat_role(
    role: ChatRole,
) -> type[UserChatMessage] | type[SystemChatMessage] | type[AssistantChatMessage]:
    if role == ChatRole.user:
        return UserChatMessage
    if role == ChatRole.system:
        return SystemChatMessage
    if role == ChatRole.assistant:
        return AssistantChatMessage
    if role == ChatRole.tool:
        raise ValueError(
            "ChatSendEvent role 'tool' requires tool metadata, which is not supported"
        )
    raise ValueError(f"Unsupported chat role: {role!r}")


def _parse_chat_action_event(
    event: "DependencyEvent",
    *,
    section_id: ID,
) -> ChatActionEvent | None:
    dep_key = event.dependencyKey
    if not isinstance(dep_key, SectionDependencyKey):
        return None
    if dep_key.sectionId != section_id:
        return None
    payload = event.payload
    if not isinstance(payload, LiteralDependencyValue):
        return None
    if payload.payload == "":
        return None
    return _parse_chat_action_payload(payload.payload)


def _parse_chat_action_payload(payload: str) -> ChatActionEvent | None:
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise TypeError("Chat action payload must decode to an object")
    action = parsed.get("action")
    if action == "send":
        return ChatSendEvent.model_validate(parsed)
    if action == "stop":
        return ChatStopEvent.model_validate(parsed)
    return None


def _should_persist_partial_message(message: AssistantChatMessage) -> bool:
    return bool(
        message.attachments
        or message.tool_calls
        or any(_message_block_has_persisted_value(block) for block in message.content)
    )


def _message_block_has_persisted_value(block: object) -> bool:
    if isinstance(block, MessageTextContent):
        return bool(block.text.strip())
    return True


def _coerce_chat(payload: Chat | dict[str, object]) -> Chat:
    if isinstance(payload, Chat):
        return payload
    return Chat.model_validate(payload)


def _coerce_chat_metadata_list(
    payload: list[ChatMetadata | dict[str, object]],
) -> list[ChatMetadata]:
    return [ChatMetadata.model_validate(entry) for entry in payload]


def _coerce_tool_messages(
    payload: list[ToolChatMessage | dict[str, object]],
) -> list[ToolChatMessage]:
    return [ToolChatMessage.model_validate(entry) for entry in payload]


__all__ = [
    "ChatHistoryClient",
    "ChatSectionSyncClient",
    "ChatSession",
    "ChatStreamAssembler",
    "ChatStreamEmitterClient",
    "ChatToolRunnerClient",
    "ToolCallBuilder",
    "assistant_message",
    "message_attachment",
    "message_image_url",
    "message_text",
    "message_thinking",
    "on_chat_action_event",
    "on_chat_send_event",
    "on_chat_stop_event",
    "system_message",
    "tool_reference",
    "user_message",
]

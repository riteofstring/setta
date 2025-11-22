"""Chat persistence manager built on the neutral LLM models."""

import asyncio
import logging
from typing import TYPE_CHECKING

from portkey_ai import AsyncPortkey

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm import (
    LLMConfig,
    LLMHistory,
    LLMMessage,
    LLMProviderConfig,
    LLMRole,
    LLMTextBlock,
    ResponseCompletedEvent,
    ResponseFinishStatus,
    ToolResultEvent,
)
from setta.llm.config_api import build_request_context
from setta.llm.config_store import normalize_gateway_url
from setta.llm.portkey_adapter import (
    astream_portkey_response,
    build_portkey_payload,
)
from setta.llm.stream_state_machine import (
    ActiveStream,
    PendingToolCall,
    StreamStateMachine,
    StreamingTranscriptRecorder,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatMetadata,
    ChatStreamStatus,
    LLMModelSelection,
)
from setta.types.notifications import SettaNotification, SettaNotificationType

if TYPE_CHECKING:
    from mcp.types import CallToolResult

    from setta.llm.portkey_client import ToolDefinition
    from setta.mcp.client import MCPClient
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


logger = logging.getLogger(__name__)

_STREAM_PERSIST_INTERVAL_SECONDS: float = 0.5


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
        self._active_streams: dict[str, ActiveStream] = {}
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

        for item in metadata:
            if item.id in self._active_streams:
                item.streamStatus = ChatStreamStatus.STREAMING

        metadata.sort(key=lambda item: item.lastUpdated, reverse=True)
        return metadata

    def delete_chat(self, chat_id: str) -> None:
        self._dbe.delete_chat_file(chat_id)

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
        request_context = build_request_context(
            self._llm_config,
            model_selection,
            project_config_id=chat.projectConfigId or project_config_id,
            deep_think=deep_think,
        )
        client = self._acquire_portkey_client(
            request_context.provider,
            project_config_id=request_context.project_config_id,
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
                "project_config_id": request_context.project_config_id,
                "provider_id": request_context.provider.provider_id,
                "model_id": request_context.model.model_id,
                "deep_think": deep_think,
            },
        )
        recorder = StreamingTranscriptRecorder(
            chat=chat,
            persist_chat=self._persist_chat,
            persist_interval_seconds=_STREAM_PERSIST_INTERVAL_SECONDS,
        )
        self._set_stream_status(chat, ChatStreamStatus.STREAMING)
        stream_state = StreamStateMachine(
            chat=chat,
            assistant_message=assistant_message,
            recorder=recorder,
        )
        current_task = asyncio.current_task()
        if current_task is None:
            raise RuntimeError("LLM orchestration must run inside an asyncio Task")
        self._active_streams[chat.id] = ActiveStream(
            task=current_task,
            stream_state=stream_state,
        )

        try:
            history = chat.to_history()
            tools = self._available_tools_or_none()
            payload = build_portkey_payload(
                history=history,
                model=request_context.model.model_id,
                tools=tools,
                request_params=request_context.request_params,
                extra_headers=request_context.extra_headers,
                provider_id=request_context.provider.provider_id,
            )

            async for event in self._astream_response(
                client=client,
                payload=payload,
                response_message_id=response_message_id,
            ):
                step = stream_state.apply_event(event)
                await self._wmh_frontend_sender.send_streaming_response(
                    chatId=chat.id,
                    assistant_message_id=response_message_id,
                    chunk=event,
                )
                if step.pending_tool_calls:
                    await self._resolve_tool_calls(
                        chat_id=chat.id,
                        assistant_message_id=response_message_id,
                        tool_calls=step.pending_tool_calls,
                        stream_state=stream_state,
                    )
        except asyncio.CancelledError:
            stream_state.mark_canceled()
            self._set_stream_status(chat, ChatStreamStatus.CANCELED)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat.id,
                assistant_message_id=response_message_id,
                chunk=ResponseCompletedEvent(
                    message_id=response_message_id,
                    status=ResponseFinishStatus.CANCELED,
                    finish_reason="canceled",
                ),
            )
            stream_state.persist_final_chat(self._persist_chat)
            logger.info(
                "Canceled LLM stream",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": request_context.project_config_id,
                    "provider_id": request_context.provider.provider_id,
                    "model_id": request_context.model.model_id,
                },
            )
            return
        except Exception as exc:
            stream_state.mark_error()
            self._set_stream_status(chat, ChatStreamStatus.ERROR)
            error_reason = str(exc)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat.id,
                assistant_message_id=response_message_id,
                chunk=ResponseCompletedEvent(
                    message_id=response_message_id,
                    status=ResponseFinishStatus.ERROR,
                    finish_reason="error",
                    error_reason=error_reason,
                ),
            )
            stream_state.persist_final_chat(self._persist_chat)
            logger.exception(
                "LLM stream failed",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": request_context.project_config_id,
                    "provider_id": request_context.provider.provider_id,
                    "model_id": request_context.model.model_id,
                },
            )
            await self._notify_llm_failure(
                chat_id=chat.id,
                project_config_id=request_context.project_config_id,
                provider_id=request_context.provider.provider_id,
                model_id=request_context.model.model_id,
                error_message=error_reason,
            )
            raise

        else:
            stream_state.finalize_status()
            self._set_stream_status(chat, stream_state.status)
            stream_state.persist_final_chat(self._persist_chat)
            logger.info(
                "Completed LLM stream",
                extra={
                    "chat_id": chat.id,
                    "project_config_id": request_context.project_config_id,
                    "provider_id": request_context.provider.provider_id,
                    "model_id": request_context.model.model_id,
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

    def _set_stream_status(self, chat: Chat, status: ChatStreamStatus) -> None:
        chat.streamStatus = status

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

        base_url = normalize_gateway_url(
            provider.base_url or self._llm_config.gateway_url
        )
        api_key = provider.api_key or None
        return AsyncPortkey(
            api_key=api_key,
            base_url=base_url,
            provider=provider.provider_id,
        )

    async def _astream_response(
        self,
        *,
        client: AsyncPortkey,
        payload: dict[str, object],
        response_message_id: str,
    ):
        async for event in astream_portkey_response(
            client=client,
            payload=payload,
            response_message_id=response_message_id,
        ):
            yield event

    async def _resolve_tool_calls(
        self,
        *,
        chat_id: str,
        assistant_message_id: str,
        tool_calls: list[PendingToolCall],
        stream_state: StreamStateMachine,
    ) -> None:
        if not tool_calls:
            return

        emitted_result = False
        for tool_call in tool_calls:
            event = await self._call_tool(tool_call)
            stream_state.apply_event(event)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat_id,
                assistant_message_id=assistant_message_id,
                chunk=event,
            )
            emitted_result = True

        if emitted_result:
            completion = ResponseCompletedEvent(
                message_id=assistant_message_id,
                status=ResponseFinishStatus.COMPLETED,
                finish_reason="tool_results",
            )
            stream_state.apply_event(completion)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat_id,
                assistant_message_id=assistant_message_id,
                chunk=completion,
            )

    async def _call_tool(self, tool_call: PendingToolCall) -> ToolResultEvent:
        tool_name = tool_call.name
        if not tool_name:
            raise ValueError("Tool call missing name")

        arguments = tool_call.to_arguments_dict()
        client = self._mcp_client
        if client is None:
            logger.warning("Skipping tool %s: MCP client unavailable", tool_name)
            return self._tool_failure_result(
                tool_call, "MCP client unavailable; tool call skipped"
            )

        try:
            result = await client.call_tool(tool_name, arguments)
        except Exception as exc:
            logger.error("Tool %s failed via MCP: %s", tool_name, exc)
            return self._tool_failure_result(tool_call, f"MCP tool call failed: {exc}")

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

    def _available_tools_or_none(self) -> list["ToolDefinition"] | None:
        client = self._mcp_client
        if client is None:
            logger.debug("MCP client unavailable; skipping tool advertisement")
            return None

        tools = getattr(client, "available_tools", None)
        if not tools:
            return None
        return tools

    def _tool_failure_result(
        self, tool_call: PendingToolCall, detail: str
    ) -> ToolResultEvent:
        return ToolResultEvent(
            tool_call_id=tool_call.tool_call_id,
            output={"error": detail},
            output_text=detail,
            is_error=True,
        )


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

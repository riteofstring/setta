"""Chat persistence manager built on the neutral LLM models."""

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm import (
    LLMConfig,
    LLMMessage,
    LLMOrchestrator,
    LLMRole,
    LLMStreamEvent,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    PortkeyClient,
    ResponseCompletedEvent,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatMetadata,
    LLMModelSelection,
    ToolResult,
)

if TYPE_CHECKING:
    from mcp.types import CallToolResult

    from setta.mcp.client import MCPClient
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ChatManager:
    """Handles chat persistence and metadata enumeration."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: "MCPClient",
        wmh_frontend_sender: "WMHFrontendSender",
        orchestrator: LLMOrchestrator | None = None,
        *,
        llm_config: LLMConfig,
    ) -> None:
        self._dbe = dbe
        self._mcp_client = mcp_client
        self._wmh_frontend_sender = wmh_frontend_sender
        self._llm_config = llm_config
        self._orchestrator = orchestrator or self._build_orchestrator(self._llm_config)

    # ---------------------------------------------------------------------
    # Persistence helpers

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: ChatMessage,
    ) -> Chat:
        """Load an existing chat (if any), append the message, and persist."""

        if chat_id:
            chat = self.get_chat(chat_id)
            if chat is None:
                chat = self._create_chat(message)
            else:
                chat.add_message(message)
        else:
            chat = self._create_chat(message)

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
    # Placeholders for the upcoming orchestrator integration

    async def process_query(
        self,
        project_config_id: str | None,
        chat: Chat,
        model_selection: LLMModelSelection,
        deep_think: bool,
    ) -> None:
        """Stream a response from the Portkey-backed orchestrator."""

        del project_config_id  # TODO: scope orchestration by config when available
        response_message_id = create_new_id()
        assistant_message = LLMMessage(
            message_id=response_message_id,
            role=LLMRole.ASSISTANT,
            content=[],
        )
        accumulator = _AssistantMessageAccumulator(assistant_message)
        tool_calls = _ToolCallAccumulator()

        history = chat.to_history()
        tools = self._mcp_client.available_tools or None
        request_params = self._build_request_params(deep_think=deep_think)

        async for event in self._orchestrator.astream_response(
            response_message_id=response_message_id,
            history=history,
            model=model_selection.modelId,
            tools=tools,
            request_params=request_params,
        ):
            accumulator.apply_event(event)
            tool_calls.observe_event(event)
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
                )

        chat.add_message(assistant_message)
        self._persist_chat(chat)

    async def request_stop_streaming(self, chat_id: str) -> None:
        raise NotImplementedError("Stopping in-flight LLM streams is not implemented.")

    def is_waiting_for_response(self, chat_id: str) -> bool:
        raise NotImplementedError(
            "LLM orchestration state tracking is not implemented."
        )

    def get_current_stream(self, chat_id: str) -> list[ChatMessage]:
        raise NotImplementedError("LLM stream buffering is not implemented.")

    # ---------------------------------------------------------------------

    def _create_chat(self, initial_message: ChatMessage) -> Chat:
        chat = Chat(name=self._derive_chat_name(initial_message))
        chat.add_message(initial_message)
        return chat

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

    def _build_orchestrator(self, config: LLMConfig) -> LLMOrchestrator:
        """Initialize the Portkey-backed orchestrator using the stored config."""

        gateway = self._build_portkey_gateway(config)
        return LLMOrchestrator(gateway)

    def _build_portkey_gateway(self, config: LLMConfig) -> PortkeyClient:
        """Construct a Portkey client that talks to the configured gateway."""

        return PortkeyClient(base_url=config.gateway_url)

    def _build_request_params(self, *, deep_think: bool) -> dict[str, object] | None:
        # Deep thinking parameters will be wired up once we map our toggle to Portkey.
        if not deep_think:
            return None
        return None

    async def _resolve_tool_calls(
        self,
        *,
        chat_id: str,
        assistant_message_id: str,
        tool_calls: list["_PendingToolCall"],
        accumulator: "_AssistantMessageAccumulator",
    ) -> None:
        if not tool_calls:
            return

        for tool_call in tool_calls:
            event = await self._call_tool(tool_call)
            accumulator.apply_event(event)
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

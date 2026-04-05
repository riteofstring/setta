from copy import deepcopy
from dataclasses import dataclass

from pydantic import TypeAdapter
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    ChatSectionBranch,
    ChatSectionState,
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextContent,
    MessageThinkingContent,
    ToolArgumentPreviewDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    ToolCallFunction,
    ToolChatMessage,
    ToolResultEvent,
)
from setta.types.id import ID

_CHAT_MESSAGE_TYPE_ADAPTER = TypeAdapter(BaseChatMessageUnion)


def build_chat_section_state(
    *,
    messages: list[BaseChatMessageUnion],
    input_text: str = "",
    waiting_for_response: bool = False,
    tool_call_arguments: dict[str, str] | None = None,
    active_branch_id: ID | None = None,
    branches: dict[ID, ChatSectionBranch] | None = None,
) -> ChatSectionState:
    return ChatSectionState(
        messages=list(messages),
        inputText=input_text,
        waitingForResponse=waiting_for_response,
        toolCallArguments=dict(tool_call_arguments or {}),
        activeBranchId=active_branch_id,
        branches=dict(branches or {}),
    )


@dataclass
class _StreamDeltaDraft:
    messages: list[BaseChatMessageUnion]
    tool_call_arguments: dict[str, str]
    waiting_for_response: bool
    input_text: str
    active_branch_id: ID | None
    branches: dict[ID, ChatSectionBranch]

    @classmethod
    def from_state(cls, state: ChatSectionState) -> "_StreamDeltaDraft":
        return cls(
            messages=list(state.messages),
            tool_call_arguments=dict(state.toolCallArguments),
            waiting_for_response=state.waitingForResponse,
            input_text=state.inputText,
            active_branch_id=state.activeBranchId,
            branches=dict(state.branches),
        )

    def build_state(self) -> ChatSectionState:
        return build_chat_section_state(
            messages=self.messages,
            input_text=self.input_text,
            waiting_for_response=self.waiting_for_response,
            tool_call_arguments=self.tool_call_arguments,
            active_branch_id=self.active_branch_id,
            branches=self._sync_active_branch_messages(),
        )

    def _sync_active_branch_messages(self) -> dict[ID, ChatSectionBranch]:
        if not self.active_branch_id:
            return self.branches
        active_branch = self.branches.get(self.active_branch_id)
        if active_branch is None:
            return self.branches
        updated = active_branch.model_copy(update={"messages": list(self.messages)})
        next_branches = dict(self.branches)
        next_branches[self.active_branch_id] = updated
        return next_branches


def apply_stream_delta(
    *,
    state: ChatSectionState,
    chunk: LLMStreamingResponseChunk,
) -> ChatSectionState:
    draft = _StreamDeltaDraft.from_state(state)
    _apply_stream_chunk(draft, chunk)
    return draft.build_state()


def _apply_stream_chunk(
    draft: _StreamDeltaDraft,
    chunk: LLMStreamingResponseChunk,
) -> None:
    handler = _STREAM_CHUNK_HANDLERS.get(type(chunk))
    if handler is None:
        return
    handler(draft, chunk)


def _apply_message_start(
    draft: _StreamDeltaDraft,
    chunk: MessageStartEvent,
) -> None:
    message = _coerce_chat_message(chunk.message)
    if isinstance(message, AssistantChatMessage):
        message = message.model_copy(deep=True)
    if _should_ignore_response_placeholder_message(message):
        return
    draft.messages = _upsert_message(draft.messages, message)
    draft.waiting_for_response = True


def _apply_message_delta_chunk(
    draft: _StreamDeltaDraft,
    chunk: MessageDeltaEvent,
) -> None:
    draft.messages = _apply_message_delta(draft.messages, chunk)


def _apply_tool_call_chunk(
    draft: _StreamDeltaDraft,
    chunk: ToolCallDeltaEvent | ToolArgumentPreviewDeltaEvent,
) -> None:
    draft.messages = _apply_tool_call_delta(
        draft.messages,
        draft.tool_call_arguments,
        chunk,
    )


def _apply_tool_result(
    draft: _StreamDeltaDraft,
    chunk: ToolResultEvent,
) -> None:
    draft.messages = _upsert_message(
        draft.messages,
        ToolChatMessage.model_validate(chunk.result),
    )


def _apply_message_stop(
    draft: _StreamDeltaDraft,
    chunk: MessageStopEvent,
) -> None:
    del chunk
    draft.waiting_for_response = False


def _apply_message_finalized(
    draft: _StreamDeltaDraft,
    chunk: MessageFinalizedEvent,
) -> None:
    message = _coerce_chat_message(chunk.message)
    if _should_ignore_response_placeholder_message(message):
        return
    if isinstance(message, AssistantChatMessage):
        message, target_id = _resolve_finalized_assistant_message(
            draft.messages,
            message,
        )
        draft.messages = _upsert_message(
            draft.messages,
            message,
            target_id=target_id,
        )
    else:
        draft.messages = _upsert_message(draft.messages, message)
    draft.waiting_for_response = False
    draft.tool_call_arguments = {}


_STREAM_CHUNK_HANDLERS = {
    MessageStartEvent: _apply_message_start,
    MessageDeltaEvent: _apply_message_delta_chunk,
    ToolCallDeltaEvent: _apply_tool_call_chunk,
    ToolArgumentPreviewDeltaEvent: _apply_tool_call_chunk,
    ToolResultEvent: _apply_tool_result,
    MessageStopEvent: _apply_message_stop,
    MessageFinalizedEvent: _apply_message_finalized,
}


def _upsert_message(
    messages: list[BaseChatMessageUnion],
    message: BaseChatMessageUnion,
    *,
    target_id: str | None = None,
) -> list[BaseChatMessageUnion]:
    target_message_id = target_id or message.id
    for index, entry in enumerate(messages):
        if entry.id == target_message_id:
            updated = list(messages)
            updated[index] = message
            return updated
    return list(messages) + [message]


def _coerce_chat_message(value: object) -> BaseChatMessageUnion:
    return _CHAT_MESSAGE_TYPE_ADAPTER.validate_python(value)


def _is_response_placeholder_message_id(message_id: str) -> bool:
    return message_id.startswith("rs_") or message_id.startswith("resp_")


def _assistant_message_empty(message: AssistantChatMessage) -> bool:
    return (
        len(message.content) == 0
        and not (message.tool_calls or [])
        and not (message.attachments or [])
    )


def _should_ignore_response_placeholder_message(
    message: BaseChatMessageUnion,
) -> bool:
    return (
        isinstance(message, AssistantChatMessage)
        and _is_response_placeholder_message_id(message.id)
        and _assistant_message_empty(message)
    )


def _resolve_finalized_assistant_message(
    messages: list[BaseChatMessageUnion],
    message: AssistantChatMessage,
) -> tuple[AssistantChatMessage, str]:
    existing_assistant = _find_assistant_message_for_finalized_update(messages, message)
    if existing_assistant is None:
        return message.model_copy(deep=True), message.id
    return (
        _merge_finalized_assistant_message(message, existing_assistant),
        existing_assistant.id,
    )


def _find_assistant_message_for_finalized_update(
    messages: list[BaseChatMessageUnion],
    message: AssistantChatMessage,
) -> AssistantChatMessage | None:
    for entry in messages:
        if entry.id == message.id and isinstance(entry, AssistantChatMessage):
            return entry
    for entry in reversed(messages):
        if not isinstance(entry, AssistantChatMessage):
            continue
        if not _is_response_placeholder_message_id(entry.id):
            continue
        return entry
    return None


def _merge_finalized_assistant_message(
    message: AssistantChatMessage,
    existing_assistant: AssistantChatMessage,
) -> AssistantChatMessage:
    merged = message.model_copy(deep=True)
    if len(merged.content) == 0 and len(existing_assistant.content) > 0:
        merged.content = deepcopy(existing_assistant.content)
    if not (merged.tool_calls or []) and existing_assistant.tool_calls:
        merged.tool_calls = deepcopy(existing_assistant.tool_calls)
    if not (merged.attachments or []) and existing_assistant.attachments:
        merged.attachments = deepcopy(existing_assistant.attachments)
    return merged


def _ensure_assistant_message(
    messages: list[BaseChatMessageUnion],
    message_id: str,
) -> tuple[list[BaseChatMessageUnion], AssistantChatMessage]:
    for entry in messages:
        if entry.id == message_id and isinstance(entry, AssistantChatMessage):
            return list(messages), entry
    assistant = AssistantChatMessage(id=message_id, content=[])
    return list(messages) + [assistant], assistant


def _apply_message_delta(
    messages: list[BaseChatMessageUnion],
    chunk: MessageDeltaEvent,
) -> list[BaseChatMessageUnion]:
    if not chunk.message_id:
        return messages
    if not chunk.content:
        return messages
    updated_messages, assistant = _ensure_assistant_message(messages, chunk.message_id)
    content = list(assistant.content)
    for delta in chunk.content:
        if delta.type == "text_delta":
            index = _normalize_index(delta.index, len(content))
            block = _ensure_text_block(content, index)
            block.text += delta.text
        elif delta.type == "thinking_delta":
            index = _normalize_index(delta.index, len(content))
            block = _ensure_thinking_block(content, index)
            if delta.thinking:
                block.thinking += delta.thinking
            if delta.summary is not None:
                block.summary = delta.summary
            if delta.signature is not None:
                block.signature = delta.signature
    assistant.content = content
    return _upsert_message(updated_messages, assistant)


def _apply_tool_call_delta(
    messages: list[BaseChatMessageUnion],
    tool_call_arguments: dict[str, str],
    chunk: ToolCallDeltaEvent | ToolArgumentPreviewDeltaEvent,
) -> list[BaseChatMessageUnion]:
    updated_messages, assistant = _ensure_assistant_message(messages, chunk.message_id)
    tool_calls = list(assistant.tool_calls or [])
    existing = None
    for call in tool_calls:
        if call.id == chunk.tool_call_id:
            existing = call
            break
    if existing is None:
        existing = ToolCall(
            id=chunk.tool_call_id,
            type="function",
            function=ToolCallFunction(
                name=chunk.tool_name or "",
                arguments={},
            ),
        )
        tool_calls.append(existing)
    elif chunk.tool_name:
        existing.function.name = chunk.tool_name
    assistant.tool_calls = tool_calls

    if chunk.tool_call_id not in tool_call_arguments:
        tool_call_arguments[chunk.tool_call_id] = ""
    tool_call_arguments[chunk.tool_call_id] += chunk.arguments_delta

    return _upsert_message(updated_messages, assistant)


def _normalize_index(index: int | None, current_length: int) -> int:
    if index is None:
        return max(current_length - 1, 0)
    if index < 0:
        return 0
    return index


def _ensure_text_block(
    content: list[MessageTextContent | MessageThinkingContent],
    index: int,
) -> MessageTextContent:
    while len(content) <= index:
        content.append(MessageTextContent(type="text", text=""))
    block = content[index]
    if isinstance(block, MessageTextContent):
        return block
    block = MessageTextContent(type="text", text="")
    content[index] = block
    return block


def _ensure_thinking_block(
    content: list[MessageTextContent | MessageThinkingContent],
    index: int,
) -> MessageThinkingContent:
    while len(content) <= index:
        content.append(
            MessageThinkingContent(
                type="thinking",
                thinking="",
                summary="",
                signature="",
            )
        )
    block = content[index]
    if isinstance(block, MessageThinkingContent):
        return block
    block = MessageThinkingContent(
        type="thinking",
        thinking="",
        summary="",
        signature="",
    )
    content[index] = block
    return block

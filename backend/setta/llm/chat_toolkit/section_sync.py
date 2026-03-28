from setta.types.chat import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    ChatSectionBranch,
    ChatSectionState,
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    ToolArgumentPreviewDeltaEvent,
    ToolResultEvent,
)
from setta.types.generated.go_shared_types import (
    MessageStopEvent,
    MessageTextContent,
    MessageThinkingContent,
    ToolCall,
    ToolCallDeltaEvent,
    ToolCallFunction,
)
from setta.types.id import ID


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


def apply_stream_delta(
    *,
    state: ChatSectionState,
    chunk: LLMStreamingResponseChunk,
) -> ChatSectionState:
    messages = list(state.messages)
    tool_call_arguments = dict(state.toolCallArguments)
    waiting_for_response = state.waitingForResponse
    input_text = state.inputText
    active_branch_id = state.activeBranchId
    branches = dict(state.branches)

    def sync_active_branch_messages() -> dict[ID, ChatSectionBranch]:
        if not active_branch_id:
            return branches
        active_branch = branches.get(active_branch_id)
        if active_branch is None:
            return branches
        updated = active_branch.model_copy(update={"messages": list(messages)})
        next_branches = dict(branches)
        next_branches[active_branch_id] = updated
        return next_branches

    if isinstance(chunk, MessageStartEvent):
        message = chunk.message
        if isinstance(message, AssistantChatMessage):
            message = message.model_copy(deep=True)
        messages = _upsert_message(messages, message)
        waiting_for_response = True
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, MessageDeltaEvent):
        messages = _apply_message_delta(messages, chunk)
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, ToolCallDeltaEvent):
        messages = _apply_tool_call_delta(messages, tool_call_arguments, chunk)
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, ToolArgumentPreviewDeltaEvent):
        messages = _apply_tool_call_delta(messages, tool_call_arguments, chunk)
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, ToolResultEvent):
        messages = _upsert_message(messages, chunk.result)
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, MessageStopEvent):
        waiting_for_response = False
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    if isinstance(chunk, MessageFinalizedEvent):
        messages = _upsert_message(messages, chunk.message)
        waiting_for_response = False
        tool_call_arguments = {}
        updated_branches = sync_active_branch_messages()
        return build_chat_section_state(
            messages=messages,
            input_text=input_text,
            waiting_for_response=waiting_for_response,
            tool_call_arguments=tool_call_arguments,
            active_branch_id=active_branch_id,
            branches=updated_branches,
        )

    updated_branches = sync_active_branch_messages()
    return build_chat_section_state(
        messages=messages,
        input_text=input_text,
        waiting_for_response=waiting_for_response,
        tool_call_arguments=tool_call_arguments,
        active_branch_id=active_branch_id,
        branches=updated_branches,
    )


def _upsert_message(
    messages: list[BaseChatMessageUnion],
    message: BaseChatMessageUnion,
) -> list[BaseChatMessageUnion]:
    for index, entry in enumerate(messages):
        if entry.id == message.id:
            updated = list(messages)
            updated[index] = message
            return updated
    return list(messages) + [message]


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

from dataclasses import dataclass

from setta.agentic.agentic_scope import AgenticContext, AgenticScope
from setta.mcp.tool_metadata import FollowIdType
from setta.types.chat_messages import ToolCall
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID


@dataclass(frozen=True)
class EmitChunkAction:
    chat_id: ID
    chunk: LLMStreamingResponseChunk


@dataclass(frozen=True)
class AppendMessagesAction:
    chat_id: ID
    messages: list[BaseChatMessageUnion]


@dataclass(frozen=True)
class SetSystemPromptAction:
    chat_id: ID
    system_prompt: str


@dataclass(frozen=True)
class UpdateAIFollowAction:
    project_config_id: ID
    chat_id: ID
    ids_by_type: dict[FollowIdType, list[ID]]


@dataclass(frozen=True)
class UpdateAIFollowResultAction:
    project_config_id: ID
    chat_id: ID
    ids_by_type: dict[FollowIdType, list[ID]]


@dataclass(frozen=True)
class ExecuteToolCallsAction:
    project_config_id: ID
    chat_id: ID
    tool_calls: list[ToolCall]
    allowed_server_ids: set[str] | None
    share_session_id: str | None
    agentic_scope: AgenticScope
    agentic_context: AgenticContext


ManagedAction = (
    EmitChunkAction
    | AppendMessagesAction
    | SetSystemPromptAction
    | UpdateAIFollowAction
    | UpdateAIFollowResultAction
    | ExecuteToolCallsAction
)

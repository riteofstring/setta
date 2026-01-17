from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_serializer, field_validator

from setta.database.utils import create_new_id
from setta.types.chat_messages import JSONValue, ToolCall, ToolChatMessage
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class AgentRunStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class RunEventType(str, Enum):
    status = "status"
    message = "message"
    stream = "stream"
    tool_call = "tool_call"
    tool_result = "tool_result"
    file_edit = "file_edit"
    shell_command = "shell_command"
    approval = "approval"
    error = "error"


class RunCosts(BaseModel, extra="forbid"):
    inputTokens: int | None = None
    outputTokens: int | None = None
    totalTokens: int | None = None
    totalCost: float | None = None
    currency: str | None = None


class AgentProfile(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str | None = None
    systemPrompt: str | None = None
    llmConfigId: str
    toolAllowlist: list[str] | None = None
    memoryScope: JSONValue | None = None


class RunEvent(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    type: RunEventType
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    inputs: JSONValue | None = None
    outputs: JSONValue | None = None
    status: AgentRunStatus | None = None
    costs: RunCosts | None = None
    toolCall: ToolCall | None = None
    toolResult: ToolChatMessage | None = None
    streamChunk: LLMStreamingResponseChunk | None = None
    metadata: dict[str, JSONValue] = Field(default_factory=dict)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value):
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()


class AgentRun(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    agentProfileId: ID | None = None
    llmConfigId: str | None = None
    inputs: JSONValue | None = None
    outputs: JSONValue | None = None
    toolCalls: list[ToolCall] = Field(default_factory=list)
    status: AgentRunStatus = AgentRunStatus.queued
    startedAt: datetime = Field(default_factory=get_now_timestamp)
    completedAt: datetime | None = None
    costs: RunCosts | None = None
    events: list[RunEvent] = Field(default_factory=list)

    @field_validator("startedAt", "completedAt", mode="before")
    @classmethod
    def parse_timestamps(cls, value):
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value

    @field_serializer("startedAt", "completedAt")
    def serialize_timestamps(self, timestamp: datetime | None):
        if timestamp is None:
            return None
        return timestamp.isoformat()

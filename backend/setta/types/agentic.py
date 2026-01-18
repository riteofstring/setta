from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from setta.database.utils import create_new_id
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class AgentProfile(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str = ""
    systemPrompt: str = ""
    llmConfigId: str | None = None
    toolAllowlist: list[str] = Field(default_factory=list)
    memoryScope: str | None = None


class AgentRunStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class RunEvent(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime:
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value


class AgentRun(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    profileId: ID | None = None
    status: AgentRunStatus = AgentRunStatus.queued
    startedAt: datetime | None = None
    finishedAt: datetime | None = None
    inputs: dict[str, Any] | None = None
    outputs: dict[str, Any] | None = None
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    cost: float | None = None
    events: list[RunEvent] = Field(default_factory=list)

    @field_validator("startedAt", "finishedAt", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value


class AgentProfileList(BaseModel, extra="forbid"):
    profiles: list[AgentProfile]


class AgentRunList(BaseModel, extra="forbid"):
    runs: list[AgentRun]

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel

from setta.types.project_state import ProjectStateSingleConfig


class ListenerFeed(str, Enum):
    PERSISTED = "persisted"
    REALTIME = "realtime"
    BOTH = "both"


class ListenerDependencyKey(BaseModel):
    sectionId: str
    codeObjId: str | None = None


class ListenerRealtimeDelta(BaseModel):
    dependency: ListenerDependencyKey
    value: Any


class ListenerRealtimeEventContent(BaseModel):
    projectConfigId: str
    delta: list[ListenerRealtimeDelta]
    sequence: int
    metadata: dict[str, Any] | None = None


class ListenerForceRefreshContent(BaseModel):
    projectState: ProjectStateSingleConfig | None = None
    reason: str | None = None
    schemaHash: str | None = None


class ListenerErrorContent(BaseModel):
    error: str
    details: Any | None = None


class ListenerFrontendEmitContent(BaseModel):
    projectConfigId: str
    payload: dict[str, Any]
    target: str | None = None


class ListenerRegisterCallback(BaseModel):
    dependencies: list[ListenerDependencyKey]
    feed: ListenerFeed
    debounceMs: int | None = None
    throttleMs: int | None = None
    runOnRefresh: bool = False


class ListenerRegisterContent(BaseModel):
    projectConfigId: str
    callbacks: dict[str, ListenerRegisterCallback]


class ListenerRegisterAckStatus(BaseModel):
    status: Literal["accepted", "rejected"]
    message: str | None = None


class ListenerRegisterAckContent(BaseModel):
    projectConfigId: str
    callbacks: dict[str, ListenerRegisterAckStatus]

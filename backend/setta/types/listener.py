from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel

from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)


class ListenerFeed(str, Enum):
    PERSISTED = "persisted"
    REALTIME = "realtime"
    BOTH = "both"


class ListenerRealtimeEventContent(BaseModel):
    projectConfigId: str
    dependencyIds: list[str]
    delta: dict[str, Any]
    sequence: int
    metadata: dict[str, Any] | None = None


class ListenerForceRefreshContent(BaseModel):
    projectState: ProjectStateSingleConfigWithCompletedOpIds | None = None
    reason: str | None = None
    schemaHash: str | None = None


class ListenerAckContent(BaseModel):
    message: str | None = None
    heartbeatIntervalSec: float | None = None


class ListenerErrorContent(BaseModel):
    error: str
    details: Any | None = None


class ListenerFrontendEmitContent(BaseModel):
    projectConfigId: str
    payload: dict[str, Any]
    target: str | None = None


class ListenerRegisterCallback(BaseModel):
    callbackId: str
    dependencies: list[str]
    feed: ListenerFeed
    debounceMs: int | None = None
    throttleMs: int | None = None
    runOnRefresh: bool = False


class ListenerRegisterContent(BaseModel):
    projectConfigId: str
    callbacks: list[ListenerRegisterCallback]


class ListenerRegisterAckStatus(BaseModel):
    callbackId: str
    status: Literal["accepted", "rejected"]
    message: str | None = None


class ListenerRegisterAckContent(BaseModel):
    projectConfigId: str
    callbacks: list[ListenerRegisterAckStatus]

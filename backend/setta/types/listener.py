from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel

from setta.code_gen.dependency_graph import GraphKeyType
from setta.types.project_state import ProjectStateSingleConfig


class ListenerFeed(str, Enum):
    PERSISTED = "persisted"
    REALTIME = "realtime"
    BOTH = "both"


class ListenerInitContent(BaseModel):
    projectConfigId: str
    defaultFeed: ListenerFeed | None = None


class ListenerRealtimeEventContent(BaseModel):
    projectConfigId: str
    deltas: list["ListenerRealtimeDelta"]
    sequence: int


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


class ListenerDependencyKey(BaseModel):
    sectionId: str
    codeObjId: str | None = None

    def to_graph_key(self) -> GraphKeyType:
        return (self.sectionId, self.codeObjId)

    @classmethod
    def from_graph_key(cls, key: GraphKeyType) -> "ListenerDependencyKey":
        section_id, code_obj_id = key
        return cls(sectionId=section_id, codeObjId=code_obj_id)


class ListenerRealtimeDelta(BaseModel):
    dependency: ListenerDependencyKey
    value: Any


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

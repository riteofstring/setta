from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, model_validator

from setta.code_gen.dependency_graph import GraphKeyType
from setta.types.project_state import ProjectStateSingleConfig


class ListenerFeed(str, Enum):
    PERSISTED = "persisted"
    REALTIME = "realtime"
    BOTH = "both"


class ListenerInitContent(BaseModel):
    projectConfigId: str | None = None
    projectName: str | None = None
    defaultFeed: ListenerFeed | None = None

    @model_validator(mode="after")
    def _validate_identifier(self):
        if self.projectConfigId is None and self.projectName is None:
            raise ValueError(
                "ListenerInitContent requires either projectConfigId or projectName"
            )
        return self


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
    payload: Any
    target: str | None = None


class ListenerCoverageRequest(BaseModel):
    projectConfigId: str


class ListenerCoverageSnapshot(BaseModel):
    projectConfigId: str
    dependencies: list["ListenerDependencyKey"]
    hasRealtimeWildcard: bool


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

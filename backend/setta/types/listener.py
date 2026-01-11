from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig


class ListenerDependencyMode(str, Enum):
    SPECIFIC = "specific"
    ANY_DEPENDENCY = "any_dependency"
    REFRESH_ONLY = "refresh_only"


class DependencyEventType(str, Enum):
    VALUE = "value"
    ACTION = "action"


class ListenerInitContent(BaseModel):
    projectConfigId: ID | None = None
    projectName: str | None = None
    useTemporaryIds: bool = False

    @model_validator(mode="after")
    def _validate_identifier(self):
        if self.projectConfigId is None and self.projectName is None:
            raise ValueError(
                "ListenerInitContent requires either projectConfigId or projectName"
            )
        return self


class ListenerRealtimeEventContent(BaseModel):
    projectConfigId: ID
    shareSessionId: str | None = None
    deltas: list["ListenerRealtimeDelta"]
    sequence: int


class DependencyEvent(BaseModel):
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    eventType: DependencyEventType
    payload: str | None = None
    timestampMs: int


class RealtimeDependencyEventContent(BaseModel):
    projectConfigId: ID
    dependencyEvent: DependencyEvent


class ListenerDependencyEventContent(BaseModel):
    projectConfigId: ID
    shareSessionId: str | None = None
    dependencyEvents: list[DependencyEvent]
    sequence: int


class ListenerForceRefreshContent(BaseModel):
    shareSessionId: str | None = None
    projectState: ProjectStateSingleConfig | None = None


class ListenerErrorContent(BaseModel):
    error: str
    details: Any | None = None


class ListenerFrontendEmitKeyAndValue(BaseModel):
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    value: BaseDependencyValueUnionWithDiscriminator


class ListenerFrontendEmitRawContent(BaseModel):
    projectConfigId: ID
    dependencyValues: dict[str, Any] = Field(default_factory=dict)
    artifactUpdates: list[BaseArtifactUnionWithDiscriminator] = Field(
        default_factory=list
    )


class ListenerRouterEndpointCallContent(BaseModel):
    projectConfigId: ID
    callId: str
    endpointName: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ListenerRouterEndpointResultContent(BaseModel):
    projectConfigId: ID
    callId: str
    ok: bool
    result: Any | None = None
    error: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ListenerCoverageRequest(BaseModel):
    projectConfigId: ID


class ListenerCoverageSnapshot(BaseModel):
    projectConfigId: ID
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator]
    hasRealtimeWildcard: bool


class RealtimeUIChangeContent(BaseModel):
    projectConfigId: ID
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    value: BaseDependencyValueUnionWithDiscriminator


class ListenerRealtimeDelta(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    dependency: BaseDependencyKeyUnionWithDiscriminator
    value: BaseDependencyValueUnionWithDiscriminator


class ListenerRegisterCallback(BaseModel):
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator]
    dependencyMode: ListenerDependencyMode
    debounceMs: int | None = None
    throttleMs: int | None = None
    runOnRefresh: bool = False
    eventTypes: list[DependencyEventType] = Field(
        default_factory=lambda: [DependencyEventType.VALUE]
    )


class ListenerRegisterContent(BaseModel):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterCallback]


class ListenerRegisterAckStatus(BaseModel):
    status: Literal["accepted", "rejected"]
    message: str | None = None


class ListenerRegisterAckContent(BaseModel):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterAckStatus]

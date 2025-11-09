from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, model_validator

from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
from setta.types.project_state import ProjectStateSingleConfig


class ListenerDependencyMode(str, Enum):
    SPECIFIC = "specific"
    ANY_DEPENDENCY = "any_dependency"
    REFRESH_ONLY = "refresh_only"


class ListenerInitContent(BaseModel):
    projectConfigId: str | None = None
    projectName: str | None = None

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


class ListenerErrorContent(BaseModel):
    error: str
    details: Any | None = None


class ListenerFrontendEmitKeyAndValue(BaseModel):
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    value: BaseDependencyValueUnionWithDiscriminator


class ListenerFrontendEmitRawContent(BaseModel):
    projectConfigId: str
    dependencyValues: dict[str, Any]


class ListenerCoverageRequest(BaseModel):
    projectConfigId: str


class ListenerCoverageSnapshot(BaseModel):
    projectConfigId: str
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator]
    hasRealtimeWildcard: bool


class RealtimeUIChangeContent(BaseModel):
    projectConfigId: str
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


class ListenerRegisterContent(BaseModel):
    projectConfigId: str
    callbacks: dict[str, ListenerRegisterCallback]


class ListenerRegisterAckStatus(BaseModel):
    status: Literal["accepted", "rejected"]
    message: str | None = None


class ListenerRegisterAckContent(BaseModel):
    projectConfigId: str
    callbacks: dict[str, ListenerRegisterAckStatus]

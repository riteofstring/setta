from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjValueRepresentationMode,
    SectionRepresentationMode,
)
from setta.types.section_impls import SectionType


class ListenerDependencyMode(str, Enum):
    REFRESH_ONLY = "refresh_only"
    REALTIME_ONLY = "realtime_only"
    ALWAYS = "always"


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
    deltas: list["ListenerRealtimeDelta"] = Field(default_factory=list)
    dependencyValues: "ListenerRenderedDependencyValues | None" = None
    sequence: int


class DependencyEvent(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    payload: BaseDependencyValueUnionWithDiscriminator | None = None
    timestampMs: int
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value


class RealtimeDependencyEventContent(BaseModel):
    projectConfigId: ID
    dependencyEvent: DependencyEvent


class ListenerDependencyEventContent(BaseModel):
    projectConfigId: ID
    shareSessionId: str | None = None
    dependencyEvents: list[DependencyEvent] = Field(default_factory=list)
    sequence: int


class ListenerDependencyCatalogEntry(BaseModel):
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    name: str
    fullPathName: str
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator] = Field(
        default_factory=list
    )
    sectionType: SectionType | None = None
    codeObjType: CodeObjType | None = None
    controlCodeObjId: ID | None = None
    controlCodeObjType: CodeObjType | None = None
    sectionRepresentation: SectionRepresentationMode | None = None
    controlValueRepresentation: CodeObjValueRepresentationMode | None = None
    valueRepresentation: CodeObjValueRepresentationMode | None = None


class ListenerDependencyCatalog(BaseModel):
    entries: list[ListenerDependencyCatalogEntry] = Field(default_factory=list)


class ListenerRenderedDependencyValue(BaseModel):
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    renderedValue: str


class ListenerRenderedDependencyValues(BaseModel):
    entries: list[ListenerRenderedDependencyValue] = Field(default_factory=list)


class ListenerSnapshot(BaseModel):
    projectConfigId: ID
    shareSessionId: str | None = None
    dependencyCatalog: ListenerDependencyCatalog
    dependencyValues: ListenerRenderedDependencyValues


class ListenerForceRefreshContent(BaseModel):
    callId: str | None = None
    snapshot: ListenerSnapshot
    sequence: int | None = None
    refreshKind: str | None = None


class ListenerErrorContent(BaseModel):
    error: str
    details: Any | None = None


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
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value


class ListenerRegisterCallback(BaseModel):
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator]
    dependencyMode: ListenerDependencyMode
    debounceMs: int | None = None
    throttleMs: int | None = None
    runOnRefresh: bool = False


class ListenerRegisterContent(BaseModel):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterCallback]


class ListenerRegisterAckStatus(BaseModel):
    status: Literal["accepted", "rejected"]
    message: str | None = None


class ListenerRegisterAckContent(BaseModel):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterAckStatus]

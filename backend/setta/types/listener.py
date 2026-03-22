from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator
from setta.sdk_contracts.generated import (
    ListenerErrorEvent as SDKListenerErrorEvent,
)
from setta.sdk_contracts.generated import (
    ListenerFrontendEmitRequest as SDKListenerFrontendEmitRequest,
)
from setta.sdk_contracts.generated import (
    ListenerInitRequest as SDKListenerInitRequest,
)
from setta.sdk_contracts.generated import (
    ListenerRegisterAckEvent as SDKListenerRegisterAckEvent,
)
from setta.sdk_contracts.generated import (
    ListenerRegisterAckStatus as SDKListenerRegisterAckStatus,
)
from setta.sdk_contracts.generated import (
    ListenerRouterEndpointCall as SDKListenerRouterEndpointCall,
)
from setta.sdk_contracts.generated import (
    ListenerRouterEndpointResult as SDKListenerRouterEndpointResult,
)
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
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


class ListenerInitContent(SDKListenerInitRequest):
    projectConfigId: ID | None = None

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


ListenerErrorContent = SDKListenerErrorEvent
ListenerFrontendEmitRawContent = SDKListenerFrontendEmitRequest
ListenerRouterEndpointCallContent = SDKListenerRouterEndpointCall
ListenerRouterEndpointResultContent = SDKListenerRouterEndpointResult


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
    callbacks: dict[str, ListenerRegisterCallback] = Field(default_factory=dict)


ListenerRegisterAckStatus = SDKListenerRegisterAckStatus


class ListenerRegisterAckContent(SDKListenerRegisterAckEvent):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterAckStatus] = Field(default_factory=dict)

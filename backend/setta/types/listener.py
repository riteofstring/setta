from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog as SDKListenerDependencyCatalog,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalogEntry as SDKListenerDependencyCatalogEntry,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyEvent as SDKListenerDependencyEvent,
)
from setta.sdk_contracts.generated import (
    ListenerErrorEvent as SDKListenerErrorEvent,
)
from setta.sdk_contracts.generated import (
    ListenerForceRefreshEvent as SDKListenerForceRefreshEvent,
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
    ListenerRegisterCallbackSpec as SDKListenerRegisterCallbackSpec,
)
from setta.sdk_contracts.generated import (
    ListenerRegisterRequest as SDKListenerRegisterRequest,
)
from setta.sdk_contracts.generated import (
    ListenerRenderedDependencyValue as SDKListenerRenderedDependencyValue,
)
from setta.sdk_contracts.generated import (
    ListenerRenderedDependencyValues as SDKListenerRenderedDependencyValues,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeEvent as SDKListenerRealtimeEvent,
)
from setta.sdk_contracts.generated import (
    ListenerRouterEndpointCall as SDKListenerRouterEndpointCall,
)
from setta.sdk_contracts.generated import (
    ListenerRouterEndpointResult as SDKListenerRouterEndpointResult,
)
from setta.sdk_contracts.generated import (
    ListenerSnapshot as SDKListenerSnapshot,
)
from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
from setta.types.id import ID


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


class ListenerRealtimeEventContent(SDKListenerRealtimeEvent):
    deltas: list["ListenerRealtimeDelta"] = Field(default_factory=list)
    dependencyValues: "ListenerRenderedDependencyValues | None" = None


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


class ListenerDependencyEventContent(SDKListenerDependencyEvent):
    dependencyEvents: list[DependencyEvent] = Field(default_factory=list)


ListenerDependencyCatalogEntry = SDKListenerDependencyCatalogEntry
ListenerDependencyCatalog = SDKListenerDependencyCatalog
ListenerRenderedDependencyValue = SDKListenerRenderedDependencyValue
ListenerRenderedDependencyValues = SDKListenerRenderedDependencyValues
ListenerSnapshot = SDKListenerSnapshot
ListenerForceRefreshContent = SDKListenerForceRefreshEvent


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


class ListenerRegisterCallback(SDKListenerRegisterCallbackSpec):
    dependencyMode: ListenerDependencyMode


class ListenerRegisterContent(SDKListenerRegisterRequest):
    callbacks: dict[str, ListenerRegisterCallback] = Field(default_factory=dict)


ListenerRegisterAckStatus = SDKListenerRegisterAckStatus


class ListenerRegisterAckContent(SDKListenerRegisterAckEvent):
    projectConfigId: ID
    callbacks: dict[str, ListenerRegisterAckStatus] = Field(default_factory=dict)

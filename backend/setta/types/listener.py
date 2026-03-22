from enum import Enum
from typing import Annotated, Literal

from pydantic import Field, PrivateAttr, TypeAdapter, model_validator
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
    ListenerDependencyEventEntry as SDKListenerDependencyEventEntry,
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
    ListenerRealtimeDelta as SDKListenerRealtimeDelta,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeEvent as SDKListenerRealtimeEvent,
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
    ListenerRouterEndpointCall as SDKListenerRouterEndpointCall,
)
from setta.sdk_contracts.generated import (
    ListenerRouterEndpointResult as SDKListenerRouterEndpointResult,
)
from setta.sdk_contracts.generated import (
    ListenerSnapshot as SDKListenerSnapshot,
)
from setta.types.generated.go_shared_types import (
    ListenerDependencyEventMessage as GoListenerDependencyEventMessage,
    ListenerDependencyMode as GeneratedListenerDependencyMode,
    ListenerErrorMessage as GoListenerErrorMessage,
    ListenerForceRefreshMessage as GoListenerForceRefreshMessage,
    ListenerFrontendEmitMessage as GoListenerFrontendEmitMessage,
    ListenerInitMessage as GoListenerInitMessage,
    ListenerMessageType,
    ListenerRealtimeEventMessage as GoListenerRealtimeEventMessage,
    ListenerRegisterAckMessage as GoListenerRegisterAckMessage,
    ListenerRegisterMessage as GoListenerRegisterMessage,
    ListenerRouterEndpointCallMessage as GoListenerRouterEndpointCallMessage,
    ListenerRouterEndpointResultMessage as GoListenerRouterEndpointResultMessage,
)
from setta.types.id import ID


class ListenerDependencyMode(str, Enum):
    REFRESH_ONLY = GeneratedListenerDependencyMode.refresh_only.value
    REALTIME_ONLY = GeneratedListenerDependencyMode.realtime_only.value
    ALWAYS = GeneratedListenerDependencyMode.always.value


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


class DependencyEvent(SDKListenerDependencyEventEntry):
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value


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


class ListenerRealtimeDelta(SDKListenerRealtimeDelta):
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


class WebsocketMsgListenerRealtimeEvent(GoListenerRealtimeEventMessage):
    content: ListenerRealtimeEventContent
    messageType: Literal[ListenerMessageType.ListenerRealtimeEvent] = (
        ListenerMessageType.ListenerRealtimeEvent
    )


class WebsocketMsgListenerDependencyEvent(GoListenerDependencyEventMessage):
    content: ListenerDependencyEventContent
    messageType: Literal[ListenerMessageType.ListenerDependencyEvent] = (
        ListenerMessageType.ListenerDependencyEvent
    )


class WebsocketMsgListenerForceRefresh(GoListenerForceRefreshMessage):
    content: ListenerForceRefreshContent
    messageType: Literal[ListenerMessageType.ListenerForceRefresh] = (
        ListenerMessageType.ListenerForceRefresh
    )


class WebsocketMsgListenerError(GoListenerErrorMessage):
    content: ListenerErrorContent
    messageType: Literal[ListenerMessageType.ListenerError] = (
        ListenerMessageType.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(GoListenerFrontendEmitMessage):
    content: ListenerFrontendEmitRawContent
    messageType: Literal[ListenerMessageType.ListenerFrontendEmit] = (
        ListenerMessageType.ListenerFrontendEmit
    )


class WebsocketMsgListenerRouterEndpointCall(GoListenerRouterEndpointCallMessage):
    content: ListenerRouterEndpointCallContent
    messageType: Literal[ListenerMessageType.ListenerRouterEndpointCall] = (
        ListenerMessageType.ListenerRouterEndpointCall
    )


class WebsocketMsgListenerRouterEndpointResult(
    GoListenerRouterEndpointResultMessage
):
    content: ListenerRouterEndpointResultContent
    messageType: Literal[
        ListenerMessageType.ListenerRouterEndpointResult
    ] = ListenerMessageType.ListenerRouterEndpointResult


class WebsocketMsgListenerRegister(GoListenerRegisterMessage):
    content: ListenerRegisterContent
    messageType: Literal[ListenerMessageType.ListenerRegister] = (
        ListenerMessageType.ListenerRegister
    )


class WebsocketMsgListenerRegisterAck(GoListenerRegisterAckMessage):
    content: ListenerRegisterAckContent
    messageType: Literal[ListenerMessageType.ListenerRegisterAck] = (
        ListenerMessageType.ListenerRegisterAck
    )


class WebsocketMsgListenerInit(GoListenerInitMessage):
    content: ListenerInitContent
    messageType: Literal[ListenerMessageType.ListenerInit] = (
        ListenerMessageType.ListenerInit
    )


PythonScriptWebsocketMsgUnion = (
    WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerDependencyEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
    | WebsocketMsgListenerRouterEndpointCall
    | WebsocketMsgListenerRouterEndpointResult
    | WebsocketMsgListenerRegister
    | WebsocketMsgListenerRegisterAck
    | WebsocketMsgListenerInit
)

PythonScriptWebsocketMsgUnionWithDiscriminator = Annotated[
    PythonScriptWebsocketMsgUnion, Field(discriminator="messageType")
]

PythonScriptWebsocketMsgTypeAdapter = TypeAdapter(
    PythonScriptWebsocketMsgUnionWithDiscriminator
)

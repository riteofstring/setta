from typing import Annotated, Literal

from pydantic import Field, PrivateAttr, TypeAdapter, model_validator
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
    ListenerRegisterRequest as SDKListenerRegisterRequest,
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
from setta.types.generated.go_shared_types import (
    ListenerDependencyEventMessage as GoListenerDependencyEventMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerErrorMessage as GoListenerErrorMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerForceRefreshMessage as GoListenerForceRefreshMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerFrontendEmitMessage as GoListenerFrontendEmitMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerInitMessage as GoListenerInitMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerMessageType,
)
from setta.types.generated.go_shared_types import (
    ListenerRealtimeEventMessage as GoListenerRealtimeEventMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRegisterAckMessage as GoListenerRegisterAckMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRegisterMessage as GoListenerRegisterMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRouterEndpointCallMessage as GoListenerRouterEndpointCallMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRouterEndpointResultMessage as GoListenerRouterEndpointResultMessage,
)
from setta.types.id import ID


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
    dependencyValues: SDKListenerRenderedDependencyValues | None = None


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


class ListenerRealtimeDelta(SDKListenerRealtimeDelta):
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value

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
    content: SDKListenerForceRefreshEvent
    messageType: Literal[ListenerMessageType.ListenerForceRefresh] = (
        ListenerMessageType.ListenerForceRefresh
    )


class WebsocketMsgListenerError(GoListenerErrorMessage):
    content: SDKListenerErrorEvent
    messageType: Literal[ListenerMessageType.ListenerError] = (
        ListenerMessageType.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(GoListenerFrontendEmitMessage):
    content: SDKListenerFrontendEmitRequest
    messageType: Literal[ListenerMessageType.ListenerFrontendEmit] = (
        ListenerMessageType.ListenerFrontendEmit
    )


class WebsocketMsgListenerRouterEndpointCall(GoListenerRouterEndpointCallMessage):
    content: SDKListenerRouterEndpointCall
    messageType: Literal[ListenerMessageType.ListenerRouterEndpointCall] = (
        ListenerMessageType.ListenerRouterEndpointCall
    )


class WebsocketMsgListenerRouterEndpointResult(GoListenerRouterEndpointResultMessage):
    content: SDKListenerRouterEndpointResult
    messageType: Literal[ListenerMessageType.ListenerRouterEndpointResult] = (
        ListenerMessageType.ListenerRouterEndpointResult
    )


class WebsocketMsgListenerRegister(GoListenerRegisterMessage):
    content: SDKListenerRegisterRequest
    messageType: Literal[ListenerMessageType.ListenerRegister] = (
        ListenerMessageType.ListenerRegister
    )


class WebsocketMsgListenerRegisterAck(GoListenerRegisterAckMessage):
    content: SDKListenerRegisterAckEvent
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

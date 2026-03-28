from typing import Annotated, Any, Literal

from pydantic import (
    Discriminator,
    Field,
    PrivateAttr,
    Tag,
    TypeAdapter,
    model_validator,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyEvent as SDKListenerDependencyEvent,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyEventEntry as SDKListenerDependencyEventEntry,
)
from setta.sdk_contracts.generated import (
    ListenerForceRefreshEvent as SDKListenerForceRefreshEvent,
)
from setta.sdk_contracts.generated import ListenerInitRequest as SDKListenerInitRequest
from setta.sdk_contracts.generated import (
    ListenerRealtimeDelta as SDKListenerRealtimeDelta,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeEvent as SDKListenerRealtimeEvent,
)
from setta.sdk_contracts.generated import (
    ListenerRegisterRequest as SDKListenerRegisterRequest,
)
from setta.types.generated.go_shared_types import (
    ListenerDependencyEventMessage as GoListenerDependencyEventMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerErrorMessage,
    ListenerFrontendEmitMessage,
    ListenerInitMessage,
    ListenerMessageType,
    ListenerRegisterAckMessage,
    ListenerRouterEndpointCallMessage,
    ListenerRouterEndpointResultMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerForceRefreshMessage as GoListenerForceRefreshMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRealtimeEventMessage as GoListenerRealtimeEventMessage,
)
from setta.types.generated.go_shared_types import (
    ListenerRegisterMessage as GoListenerRegisterMessage,
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


class WebsocketMsgListenerRegister(GoListenerRegisterMessage):
    content: SDKListenerRegisterRequest
    messageType: Literal[ListenerMessageType.ListenerRegister] = (
        ListenerMessageType.ListenerRegister
    )


def _listener_message_type(value: Any) -> str | None:
    raw_type = value.get("messageType") if isinstance(value, dict) else getattr(value, "messageType", None)
    if isinstance(raw_type, ListenerMessageType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


PythonScriptWebsocketMsgUnion = Annotated[
    Annotated[
        WebsocketMsgListenerRealtimeEvent,
        Tag(ListenerMessageType.ListenerRealtimeEvent.value),
    ]
    | Annotated[
        WebsocketMsgListenerDependencyEvent,
        Tag(ListenerMessageType.ListenerDependencyEvent.value),
    ]
    | Annotated[
        WebsocketMsgListenerForceRefresh,
        Tag(ListenerMessageType.ListenerForceRefresh.value),
    ]
    | Annotated[ListenerErrorMessage, Tag(ListenerMessageType.ListenerError.value)]
    | Annotated[
        ListenerFrontendEmitMessage,
        Tag(ListenerMessageType.ListenerFrontendEmit.value),
    ]
    | Annotated[
        ListenerRouterEndpointCallMessage,
        Tag(ListenerMessageType.ListenerRouterEndpointCall.value),
    ]
    | Annotated[
        ListenerRouterEndpointResultMessage,
        Tag(ListenerMessageType.ListenerRouterEndpointResult.value),
    ]
    | Annotated[
        WebsocketMsgListenerRegister,
        Tag(ListenerMessageType.ListenerRegister.value),
    ]
    | Annotated[
        ListenerRegisterAckMessage,
        Tag(ListenerMessageType.ListenerRegisterAck.value),
    ]
    | Annotated[ListenerInitMessage, Tag(ListenerMessageType.ListenerInit.value)],
    Discriminator(_listener_message_type),
]

PythonScriptWebsocketMsgTypeAdapter = TypeAdapter(PythonScriptWebsocketMsgUnion)

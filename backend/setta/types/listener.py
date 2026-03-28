from typing import Annotated, Any

from pydantic import (
    Discriminator,
    Field,
    PrivateAttr,
    Tag,
    TypeAdapter,
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
from setta.sdk_contracts.generated import (
    ListenerRealtimeDelta as SDKListenerRealtimeDelta,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeEvent as SDKListenerRealtimeEvent,
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


class WebsocketMsgListenerDependencyEvent(GoListenerDependencyEventMessage):
    content: ListenerDependencyEventContent


class WebsocketMsgListenerForceRefresh(GoListenerForceRefreshMessage):
    content: SDKListenerForceRefreshEvent


def _listener_message_type(value: Any) -> str | None:
    raw_type = (
        value.get("messageType")
        if isinstance(value, dict)
        else getattr(value, "messageType", None)
    )
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
        ListenerRegisterAckMessage,
        Tag(ListenerMessageType.ListenerRegisterAck.value),
    ]
    | Annotated[ListenerInitMessage, Tag(ListenerMessageType.ListenerInit.value)],
    Discriminator(_listener_message_type),
]

PythonScriptWebsocketMsgTypeAdapter = TypeAdapter(PythonScriptWebsocketMsgUnion)

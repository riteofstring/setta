from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter
from setta.types.generated.go_shared_types import ListenerMessageType
from setta.types.listener import (
    ListenerDependencyEventContent,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerFrontendEmitRawContent,
    ListenerInitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckContent,
    ListenerRegisterContent,
    ListenerRouterEndpointCallContent,
    ListenerRouterEndpointResultContent,
)


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class PythonScriptWebsocketMsg(WebsocketMsg):
    pass


class WebsocketMsgListenerRealtimeEvent(PythonScriptWebsocketMsg):
    content: ListenerRealtimeEventContent
    messageType: Literal[ListenerMessageType.ListenerRealtimeEvent] = (
        ListenerMessageType.ListenerRealtimeEvent
    )


class WebsocketMsgListenerDependencyEvent(PythonScriptWebsocketMsg):
    content: ListenerDependencyEventContent
    messageType: Literal[ListenerMessageType.ListenerDependencyEvent] = (
        ListenerMessageType.ListenerDependencyEvent
    )


class WebsocketMsgListenerForceRefresh(PythonScriptWebsocketMsg):
    content: ListenerForceRefreshContent
    messageType: Literal[ListenerMessageType.ListenerForceRefresh] = (
        ListenerMessageType.ListenerForceRefresh
    )


class WebsocketMsgListenerError(PythonScriptWebsocketMsg):
    content: ListenerErrorContent
    messageType: Literal[ListenerMessageType.ListenerError] = (
        ListenerMessageType.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(PythonScriptWebsocketMsg):
    content: ListenerFrontendEmitRawContent
    messageType: Literal[ListenerMessageType.ListenerFrontendEmit] = (
        ListenerMessageType.ListenerFrontendEmit
    )


class WebsocketMsgListenerRouterEndpointCall(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointCallContent
    messageType: Literal[ListenerMessageType.ListenerRouterEndpointCall] = (
        ListenerMessageType.ListenerRouterEndpointCall
    )


class WebsocketMsgListenerRouterEndpointResult(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointResultContent
    messageType: Literal[
        ListenerMessageType.ListenerRouterEndpointResult
    ] = ListenerMessageType.ListenerRouterEndpointResult


class WebsocketMsgListenerRegister(PythonScriptWebsocketMsg):
    content: ListenerRegisterContent
    messageType: Literal[ListenerMessageType.ListenerRegister] = (
        ListenerMessageType.ListenerRegister
    )


class WebsocketMsgListenerRegisterAck(PythonScriptWebsocketMsg):
    content: ListenerRegisterAckContent
    messageType: Literal[ListenerMessageType.ListenerRegisterAck] = (
        ListenerMessageType.ListenerRegisterAck
    )


class WebsocketMsgListenerInit(PythonScriptWebsocketMsg):
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

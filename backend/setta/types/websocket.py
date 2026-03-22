from typing import Annotated, Literal

from pydantic import Field, TypeAdapter
from setta.types.generated.go_shared_types import (
    ListenerDependencyEventMessage as GoListenerDependencyEventMessage,
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

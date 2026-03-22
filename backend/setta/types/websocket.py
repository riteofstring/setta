from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter
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


class WebsocketMsgTypeForPythonScript(str, Enum):
    ListenerInit = "ListenerInit"
    ListenerRegister = "ListenerRegister"
    ListenerRegisterAck = "ListenerRegisterAck"
    ListenerRealtimeEvent = "ListenerRealtimeEvent"
    ListenerDependencyEvent = "ListenerDependencyEvent"
    ListenerForceRefresh = "ListenerForceRefresh"
    ListenerError = "ListenerError"
    ListenerFrontendEmit = "ListenerFrontendEmit"
    ListenerRouterEndpointCall = "ListenerRouterEndpointCall"
    ListenerRouterEndpointResult = "ListenerRouterEndpointResult"


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class PythonScriptWebsocketMsg(WebsocketMsg):
    pass


class WebsocketMsgListenerRealtimeEvent(PythonScriptWebsocketMsg):
    content: ListenerRealtimeEventContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent] = (
        WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent
    )


class WebsocketMsgListenerDependencyEvent(PythonScriptWebsocketMsg):
    content: ListenerDependencyEventContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerDependencyEvent] = (
        WebsocketMsgTypeForPythonScript.ListenerDependencyEvent
    )


class WebsocketMsgListenerForceRefresh(PythonScriptWebsocketMsg):
    content: ListenerForceRefreshContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerForceRefresh] = (
        WebsocketMsgTypeForPythonScript.ListenerForceRefresh
    )


class WebsocketMsgListenerError(PythonScriptWebsocketMsg):
    content: ListenerErrorContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerError] = (
        WebsocketMsgTypeForPythonScript.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(PythonScriptWebsocketMsg):
    content: ListenerFrontendEmitRawContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerFrontendEmit] = (
        WebsocketMsgTypeForPythonScript.ListenerFrontendEmit
    )


class WebsocketMsgListenerRouterEndpointCall(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointCallContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRouterEndpointCall] = (
        WebsocketMsgTypeForPythonScript.ListenerRouterEndpointCall
    )


class WebsocketMsgListenerRouterEndpointResult(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointResultContent
    messageType: Literal[
        WebsocketMsgTypeForPythonScript.ListenerRouterEndpointResult
    ] = WebsocketMsgTypeForPythonScript.ListenerRouterEndpointResult


class WebsocketMsgListenerRegister(PythonScriptWebsocketMsg):
    content: ListenerRegisterContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRegister] = (
        WebsocketMsgTypeForPythonScript.ListenerRegister
    )


class WebsocketMsgListenerRegisterAck(PythonScriptWebsocketMsg):
    content: ListenerRegisterAckContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRegisterAck] = (
        WebsocketMsgTypeForPythonScript.ListenerRegisterAck
    )


class WebsocketMsgListenerInit(PythonScriptWebsocketMsg):
    content: ListenerInitContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerInit] = (
        WebsocketMsgTypeForPythonScript.ListenerInit
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

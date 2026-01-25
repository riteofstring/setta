from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAIFollowToolArgumentsUpdate,
    WebsocketMsgAIFollowToolResultUpdate,
    WebsocketMsgAllConnections,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgListenerActionEvent,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
    WebsocketMsgLLMApiKeysUpdated,
    WebsocketMsgLLMConfigUpdated,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
    WebsocketMsgRealtimeActionEvent,
    WebsocketMsgRealtimeUIChange,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateArtifacts,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
)

WebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerCoverageSnapshot
    | WebsocketMsgLLMConfigUpdated
    | WebsocketMsgLLMApiKeysUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
    | WebsocketMsgRealtimeUIChange
    | WebsocketMsgRealtimeActionEvent
    | WebsocketMsgCurrentAddressUpdate
    | WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerActionEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
    | WebsocketMsgListenerRouterEndpointCall
    | WebsocketMsgListenerRouterEndpointResult
    | WebsocketMsgListenerRegister
    | WebsocketMsgListenerRegisterAck
    | WebsocketMsgListenerInit
)

WebsocketMsgUnionWithDiscriminator = Annotated[
    WebsocketMsgUnion, Field(discriminator="messageType")
]

WebsocketMsgTypeAdapter = TypeAdapter(WebsocketMsgUnionWithDiscriminator)

WebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerCoverageSnapshot",
        "LLMConfigUpdated",
        "LLMApiKeysUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
        "RealtimeUIChange",
        "RealtimeActionEvent",
        "CurrentAddressUpdate",
        "ListenerRealtimeEvent",
        "ListenerActionEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRouterEndpointCall",
        "ListenerRouterEndpointResult",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)

FrontendWebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerCoverageSnapshot
    | WebsocketMsgLLMConfigUpdated
    | WebsocketMsgLLMApiKeysUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
)

FrontendWebsocketMsgUnionWithDiscriminator = Annotated[
    FrontendWebsocketMsgUnion, Field(discriminator="messageType")
]

FrontendWebsocketMsgTypeAdapter = TypeAdapter(
    FrontendWebsocketMsgUnionWithDiscriminator
)

FrontendWebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerCoverageSnapshot",
        "LLMConfigUpdated",
        "LLMApiKeysUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
    ]
)

BackendWebsocketMsgUnion = (
    WebsocketMsgRealtimeUIChange
    | WebsocketMsgRealtimeActionEvent
    | WebsocketMsgCurrentAddressUpdate
)

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

BackendWebsocketMsgTypeSet = set(
    ["RealtimeUIChange", "RealtimeActionEvent", "CurrentAddressUpdate"]
)

PythonScriptWebsocketMsgUnion = (
    WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerActionEvent
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

PythonScriptWebsocketMsgTypeSet = set(
    [
        "ListenerRealtimeEvent",
        "ListenerActionEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRouterEndpointCall",
        "ListenerRouterEndpointResult",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)

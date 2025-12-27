from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAIFollowToolArgumentsUpdate,
    WebsocketMsgAIFollowToolResultUpdate,
    WebsocketMsgAllConnections,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgLLMApiKeysUpdated,
    WebsocketMsgLLMConfigUpdated,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
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
    | WebsocketMsgCurrentAddressUpdate
    | WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
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
        "CurrentAddressUpdate",
        "ListenerRealtimeEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
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
    WebsocketMsgRealtimeUIChange | WebsocketMsgCurrentAddressUpdate
)

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

BackendWebsocketMsgTypeSet = set(["RealtimeUIChange", "CurrentAddressUpdate"])

PythonScriptWebsocketMsgUnion = (
    WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
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
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)

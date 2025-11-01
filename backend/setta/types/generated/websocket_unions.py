from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAllConnections,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerFrontendEmitForward,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerPersistedUpdate,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
    WebsocketMsgRealtimeUIChange,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateArtifacts,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
    WebsocketMsgUUIDMappingForLLM,
)

WebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgNotification
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgUUIDMappingForLLM
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerFrontendEmitForward
    | WebsocketMsgListenerCoverageSnapshot
    | WebsocketMsgRealtimeUIChange
    | WebsocketMsgCurrentAddressUpdate
    | WebsocketMsgListenerBootstrap
    | WebsocketMsgListenerPersistedUpdate
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
        "LLMStreamingResponse",
        "UUIDMappingForLLM",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerFrontendEmitForward",
        "ListenerCoverageSnapshot",
        "RealtimeUIChange",
        "CurrentAddressUpdate",
        "ListenerBootstrap",
        "ListenerPersistedUpdate",
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
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgUUIDMappingForLLM
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerFrontendEmitForward
    | WebsocketMsgListenerCoverageSnapshot
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
        "LLMStreamingResponse",
        "UUIDMappingForLLM",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerFrontendEmitForward",
        "ListenerCoverageSnapshot",
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
    WebsocketMsgListenerBootstrap
    | WebsocketMsgListenerPersistedUpdate
    | WebsocketMsgListenerRealtimeEvent
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
        "ListenerBootstrap",
        "ListenerPersistedUpdate",
        "ListenerRealtimeEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)

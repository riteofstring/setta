from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAllConnections,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerPersistedUpdate,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
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
    | WebsocketMsgCurrentAddressUpdate
    | WebsocketMsgListenerBootstrap
    | WebsocketMsgListenerPersistedUpdate
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
        "CurrentAddressUpdate",
        "ListenerBootstrap",
        "ListenerPersistedUpdate",
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
    ]
)

BackendWebsocketMsgUnion = WebsocketMsgCurrentAddressUpdate

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

BackendWebsocketMsgTypeSet = set(["CurrentAddressUpdate"])

PythonScriptWebsocketMsgUnion = (
    WebsocketMsgListenerBootstrap | WebsocketMsgListenerPersistedUpdate
)

PythonScriptWebsocketMsgUnionWithDiscriminator = Annotated[
    PythonScriptWebsocketMsgUnion, Field(discriminator="messageType")
]

PythonScriptWebsocketMsgTypeAdapter = TypeAdapter(
    PythonScriptWebsocketMsgUnionWithDiscriminator
)

PythonScriptWebsocketMsgTypeSet = set(["ListenerBootstrap", "ListenerPersistedUpdate"])

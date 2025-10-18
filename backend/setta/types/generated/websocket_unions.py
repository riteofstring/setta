from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAllConnections,
    WebsocketMsgAllDependencies,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgCurrentAddressUpdate,
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
    | WebsocketMsgAllDependencies
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgCurrentAddressUpdate
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
        "AllDependencies",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "CurrentAddressUpdate",
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
    | WebsocketMsgAllDependencies
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
        "AllDependencies",
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

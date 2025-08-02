from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAllConnections,
    WebsocketMsgAllDependencies,
    WebsocketMsgArtifact,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateBackendProjectState,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
    WebsocketMsgUUIDMappingForLLM,
)

WebsocketMsgUnion = Union[
    WebsocketMsgAllConnections,
    WebsocketMsgArtifact,
    WebsocketMsgNotification,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgUUIDMappingForLLM,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgAllDependencies,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateSettings,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
]

WebsocketMsgUnionWithDiscriminator = Annotated[
    WebsocketMsgUnion, Field(discriminator="messageType")
]

WebsocketMsgTypeAdapter = TypeAdapter(WebsocketMsgUnionWithDiscriminator)

WebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "Artifact",
        "Notification",
        "LLMStreamingResponse",
        "UUIDMappingForLLM",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "SpecificFileWatcherUpdate",
        "AllDependencies",
        "TerminalMetadata",
        "UpdateSettings",
        "CurrentAddressUpdate",
        "UpdateBackendProjectState",
    ]
)

FrontendWebsocketMsgUnion = Union[
    WebsocketMsgAllConnections,
    WebsocketMsgArtifact,
    WebsocketMsgNotification,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgUUIDMappingForLLM,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgAllDependencies,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateSettings,
]

FrontendWebsocketMsgUnionWithDiscriminator = Annotated[
    FrontendWebsocketMsgUnion, Field(discriminator="messageType")
]

FrontendWebsocketMsgTypeAdapter = TypeAdapter(
    FrontendWebsocketMsgUnionWithDiscriminator
)

FrontendWebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "Artifact",
        "Notification",
        "LLMStreamingResponse",
        "UUIDMappingForLLM",
        "LSPDiagnostics",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "SpecificFileWatcherUpdate",
        "AllDependencies",
        "TerminalMetadata",
        "UpdateSettings",
    ]
)

BackendWebsocketMsgUnion = Union[
    WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState
]

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

BackendWebsocketMsgTypeSet = set(["CurrentAddressUpdate", "UpdateBackendProjectState"])

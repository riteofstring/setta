from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAllConnections,
    WebsocketMsgAllDependencies,
    WebsocketMsgArtifact,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNewTerminalCreated,
    WebsocketMsgNotification,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateBackendProjectState,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUUIDMappingForLLM,
)

WebsocketMsgForBackendUnion = Union[
    WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState
]

WebsocketMsgForBackendUnionWithDiscriminator = Annotated[
    WebsocketMsgForBackendUnion, Field(discriminator="messageType")
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(
    WebsocketMsgForBackendUnionWithDiscriminator
)

WebsocketMsgForBackendTypeSet = set(
    ["CurrentAddressUpdate", "UpdateBackendProjectState"]
)

WebsocketMsgForFrontendUnion = Union[
    WebsocketMsgAllConnections,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgAllDependencies,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgNotification,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgUUIDMappingForLLM,
    WebsocketMsgArtifact,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgNewTerminalCreated,
]

WebsocketMsgForFrontendUnionWithDiscriminator = Annotated[
    WebsocketMsgForFrontendUnion, Field(discriminator="messageType")
]

WebsocketMsgForFrontendTypeAdapter = TypeAdapter(
    WebsocketMsgForFrontendUnionWithDiscriminator
)

WebsocketMsgForFrontendTypeSet = set(
    [
        "AllConnections",
        "LSPDiagnostics",
        "TerminalMetadata",
        "AllDependencies",
        "SpecificFileWatcherUpdate",
        "Notification",
        "LLMStreamingResponse",
        "UUIDMappingForLLM",
        "Artifact",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "NewTerminalCreated",
    ]
)

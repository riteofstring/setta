from typing import Any, Literal

from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict

from setta.project_state.lsp_response_handlers.diagnostics import (
    SettaProjectConfigDiagnostics,
)
from setta.types.ai import IDToUUIDForLLM
from setta.types.artifact import Artifact
from setta.types.chat_messages import LLMStreamingResponse
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.utils import AsIsStrEnum

WebsocketMsgTypeForFrontend = AsIsStrEnum(
    "WebsocketMsgTypeForFrontend",
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
    ],
)


WebsocketConnectionType = AsIsStrEnum(
    "WebsocketConnectionType",
    ["CLI", "SERVER", "PYTHON_SCRIPT", "PYTHON_LOGGER", "FRONTEND"],
)


class WebsocketConnectionInfo(BaseModel):
    id: str
    connectionType: WebsocketConnectionType
    location: str | None


class WebsocketConnectionInfoWithSocket(WebsocketConnectionInfo):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    websocket: WebSocket


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class WebsocketMsgAllConnections(WebsocketMsg):
    content: list[WebsocketConnectionInfo]
    messageType: Literal[WebsocketMsgTypeForFrontend.AllConnections] = (
        WebsocketMsgTypeForFrontend.AllConnections
    )


class WebsocketMsgArtifact(WebsocketMsg):
    content: Artifact
    messageType: Literal[WebsocketMsgTypeForFrontend.Artifact] = (
        WebsocketMsgTypeForFrontend.Artifact
    )


class WebsocketMsgNotification(WebsocketMsg):
    content: SettaNotification
    messageType: Literal[WebsocketMsgTypeForFrontend.Notification] = (
        WebsocketMsgTypeForFrontend.Notification
    )


class WebsocketMsgLLMStreamingResponse(WebsocketMsg):
    content: LLMStreamingResponse
    messageType: Literal[WebsocketMsgTypeForFrontend.LLMStreamingResponse] = (
        WebsocketMsgTypeForFrontend.LLMStreamingResponse
    )


class WebsocketMsgUUIDMappingForLLM(WebsocketMsg):
    content: IDToUUIDForLLM
    messageType: Literal[WebsocketMsgTypeForFrontend.UUIDMappingForLLM] = (
        WebsocketMsgTypeForFrontend.UUIDMappingForLLM
    )


class WebsocketMsgLSPDiagnostics(WebsocketMsg):
    content: SettaProjectConfigDiagnostics
    messageType: Literal[WebsocketMsgTypeForFrontend.LSPDiagnostics] = (
        WebsocketMsgTypeForFrontend.LSPDiagnostics
    )


class WebsocketMsgReturnRenameRefactorResults(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.ReturnRenameRefactorResults] = (
        WebsocketMsgTypeForFrontend.ReturnRenameRefactorResults
    )


class WebsocketMsgUpdateFrontendProjectState(WebsocketMsg):
    content: ProjectStateSingleConfig
    messageType: Literal[WebsocketMsgTypeForFrontend.UpdateFrontendProjectState] = (
        WebsocketMsgTypeForFrontend.UpdateFrontendProjectState
    )


class WebsocketMsgSpecificFileWatcherUpdate(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.SpecificFileWatcherUpdate] = (
        WebsocketMsgTypeForFrontend.SpecificFileWatcherUpdate
    )


class WebsocketMsgAllDependencies(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.AllDependencies] = (
        WebsocketMsgTypeForFrontend.AllDependencies
    )


class WebsocketMsgTerminalMetadata(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.TerminalMetadata] = (
        WebsocketMsgTypeForFrontend.TerminalMetadata
    )


class WebsocketMsgNewTerminalCreated(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.NewTerminalCreated] = (
        WebsocketMsgTypeForFrontend.NewTerminalCreated
    )

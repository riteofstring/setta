from enum import Enum
from typing import Any, Literal

from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict

from setta.types.ai import IDToUUIDForLLM
from setta.types.artifact import Artifact
from setta.types.chat_messages import LLMStreamingResponse
from setta.types.lsp import (
    SettaProjectConfigDiagnostics,
)
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.settings_state import SettingsState
from setta.types.specific_file_watcher import FileWatcherUpdate


class WebsocketMsgTypeForFrontend(str, Enum):
    AllConnections = "AllConnections"
    LSPDiagnostics = "LSPDiagnostics"
    TerminalMetadata = "TerminalMetadata"
    AllDependencies = "AllDependencies"
    SpecificFileWatcherUpdate = "SpecificFileWatcherUpdate"
    Notification = "Notification"
    LLMStreamingResponse = "LLMStreamingResponse"
    UUIDMappingForLLM = "UUIDMappingForLLM"
    Artifact = "Artifact"
    ReturnRenameRefactorResults = "ReturnRenameRefactorResults"
    UpdateFrontendProjectState = "UpdateFrontendProjectState"
    NewTerminalCreated = "NewTerminalCreated"
    UpdateSettings = "UpdateSettings"


class WebsocketMsgTypeForBackend(str, Enum):
    CurrentAddressUpdate = "CurrentAddressUpdate"
    UpdateBackendProjectState = "UpdateBackendProjectState"


class WebsocketConnectionType(str, Enum):
    CLI = "CLI"
    SERVER = "SERVER"
    PYTHON_SCRIPT = "PYTHON_SCRIPT"
    PYTHON_LOGGER = "PYTHON_LOGGER"
    FRONTEND = "FRONTEND"


class WebsocketConnectionInfo(BaseModel):
    id: str
    connectionType: WebsocketConnectionType
    currentAddress: str | None


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
    content: FileWatcherUpdate
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


class WebsocketMsgUpdateSettings(WebsocketMsg):
    content: SettingsState
    messageType: Literal[WebsocketMsgTypeForFrontend.UpdateSettings] = (
        WebsocketMsgTypeForFrontend.UpdateSettings
    )


class WebsocketMsgCurrentAddressUpdate(WebsocketMsg):
    content: str
    messageType: Literal[WebsocketMsgTypeForBackend.CurrentAddressUpdate] = (
        WebsocketMsgTypeForBackend.CurrentAddressUpdate
    )


class WebsocketMsgUpdateBackendProjectStateContent(BaseModel):
    projectState: ProjectStateSingleConfig
    requestRenameRefactor: bool


class WebsocketMsgUpdateBackendProjectState(WebsocketMsg):
    content: WebsocketMsgUpdateBackendProjectStateContent
    messageType: Literal[WebsocketMsgTypeForBackend.UpdateBackendProjectState] = (
        WebsocketMsgTypeForBackend.UpdateBackendProjectState
    )

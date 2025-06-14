from typing import Any, Literal

from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict

from setta.types.ai import IDToUUIDForLLM
from setta.types.artifact import Artifact
from setta.types.chat_messages import LLMStreamingResponse
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.utils import AsIsStrEnum

WebsocketMsgTypeForFrontend = AsIsStrEnum(
    "WebsocketMsgTypeForFrontend",
    [
        "ALL_CONNECTIONS",
        "LSP_DIAGNOSTICS",
        "TERMINAL_METADATA",
        "ALL_DEPENDENCIES",
        "SPECIFIC_FILE_WATCHER_UPDATE",
        "NOTIFICATION",
        "LLM_STREAMING_RESPONSE",
        "UUID_MAPPING_FOR_LLM",
        "ARTIFACT",
        "RETURN_RENAME_REFACTOR_RESULTS",
        "UPDATE_FRONTEND_PROJECT_STATE",
        "NEW_TERMINAL_CREATED",
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
    messageType: Literal[WebsocketMsgTypeForFrontend.ALL_CONNECTIONS] = (
        WebsocketMsgTypeForFrontend.ALL_CONNECTIONS
    )


class WebsocketMsgArtifact(WebsocketMsg):
    content: Artifact
    messageType: Literal[WebsocketMsgTypeForFrontend.ARTIFACT] = (
        WebsocketMsgTypeForFrontend.ARTIFACT
    )


class WebsocketMsgNotification(WebsocketMsg):
    content: SettaNotification
    messageType: Literal[WebsocketMsgTypeForFrontend.NOTIFICATION] = (
        WebsocketMsgTypeForFrontend.NOTIFICATION
    )


class WebsocketMsgLLMStreamingResponse(WebsocketMsg):
    content: LLMStreamingResponse
    messageType: Literal[WebsocketMsgTypeForFrontend.LLM_STREAMING_RESPONSE] = (
        WebsocketMsgTypeForFrontend.LLM_STREAMING_RESPONSE
    )


class WebsocketMsgUUIDMapping(WebsocketMsg):
    content: IDToUUIDForLLM
    messageType: Literal[WebsocketMsgTypeForFrontend.UUID_MAPPING_FOR_LLM] = (
        WebsocketMsgTypeForFrontend.UUID_MAPPING_FOR_LLM
    )


class WebsocketMsgLSPDiagnostics(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.LSP_DIAGNOSTICS] = (
        WebsocketMsgTypeForFrontend.LSP_DIAGNOSTICS
    )


class WebsocketMsgRenameRefactorResults(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.RETURN_RENAME_REFACTOR_RESULTS] = (
        WebsocketMsgTypeForFrontend.RETURN_RENAME_REFACTOR_RESULTS
    )


class WebsocketMsgUpdateFrontendProjectState(WebsocketMsg):
    content: ProjectStateSingleConfig
    messageType: Literal[WebsocketMsgTypeForFrontend.UPDATE_FRONTEND_PROJECT_STATE] = (
        WebsocketMsgTypeForFrontend.UPDATE_FRONTEND_PROJECT_STATE
    )


class WebsocketMsgSpecificFileWatcherUpdate(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.SPECIFIC_FILE_WATCHER_UPDATE] = (
        WebsocketMsgTypeForFrontend.SPECIFIC_FILE_WATCHER_UPDATE
    )


class WebsocketMsgAllDependencies(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.ALL_DEPENDENCIES] = (
        WebsocketMsgTypeForFrontend.ALL_DEPENDENCIES
    )


class WebsocketMsgTerminalMetadata(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.TERMINAL_METADATA] = (
        WebsocketMsgTypeForFrontend.TERMINAL_METADATA
    )


class WebsocketMsgNewTerminalCreated(WebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.NEW_TERMINAL_CREATED] = (
        WebsocketMsgTypeForFrontend.NEW_TERMINAL_CREATED
    )

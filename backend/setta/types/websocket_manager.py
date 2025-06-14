from typing import Any

from fastapi import WebSocket
from pydantic import BaseModel

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
    websocket: WebSocket


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: WebsocketMsgTypeForFrontend


class WebsocketMsgAllConnections(WebsocketMsg):
    content: list[WebsocketConnectionInfo]
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.ALL_CONNECTIONS
    )


class WebsocketMsgArtifact(WebsocketMsg):
    content: Artifact
    messageType: WebsocketMsgTypeForFrontend = WebsocketMsgTypeForFrontend.ARTIFACT


class WebsocketMsgNotification(WebsocketMsg):
    content: SettaNotification
    messageType: WebsocketMsgTypeForFrontend = WebsocketMsgTypeForFrontend.NOTIFICATION


class WebsocketMsgLLMStreamingResponse(WebsocketMsg):
    content: LLMStreamingResponse
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.LLM_STREAMING_RESPONSE
    )


class WebsocketMsgUUIDMapping(WebsocketMsg):
    content: IDToUUIDForLLM
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.UUID_MAPPING_FOR_LLM
    )


class WebsocketMsgLSPDiagnostics(WebsocketMsg):
    content: Any
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.LSP_DIAGNOSTICS
    )


class WebsocketMsgRenameRefactorResults(WebsocketMsg):
    content: Any
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.RETURN_RENAME_REFACTOR_RESULTS
    )


class WebsocketMsgUpdateFrontendProjectState(WebsocketMsg):
    content: ProjectStateSingleConfig
    messageType: WebsocketMsgTypeForFrontend = (
        WebsocketMsgTypeForFrontend.UPDATE_FRONTEND_PROJECT_STATE
    )

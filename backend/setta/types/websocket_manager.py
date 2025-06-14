from typing import Any

from fastapi import WebSocket
from pydantic import BaseModel

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

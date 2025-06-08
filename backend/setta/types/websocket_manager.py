from dataclasses import dataclass

from fastapi import WebSocket

from setta.types.utils import AsIsStrEnum

WebsocketConnectionType = AsIsStrEnum(
    "WebsocketConnectionType",
    ["CLI", "SERVER", "PYTHON_SCRIPT", "PYTHON_LOGGER", "FRONTEND"],
)


@dataclass
class WebsocketConnectionInfo:
    id: str
    connectionType: WebsocketConnectionType
    location: str | None


@dataclass
class WebsocketConnectionInfoWithSocket(WebsocketConnectionInfo):
    websocket: WebSocket

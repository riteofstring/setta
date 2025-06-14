from typing import Any

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


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class WebsocketMsgForFrontend(WebsocketMsg):
    content: Any
    messageType: WebsocketMsgTypeForFrontend

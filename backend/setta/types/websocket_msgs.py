from setta.types.utils import AsIsStrEnum

WebsocketMsgForFrontend = AsIsStrEnum(
    "WebsocketMsgForFrontend",
    [
        "WS_ALL_CONNECTIONS",
        "WS_LSP_DIAGNOSTICS",
        "WS_TERMINAL_METADATA",
        "WS_ALL_DEPENDENCIES",
        "WS_SPECIFIC_FILE_WATCHER_UPDATE",
        "WS_NOTIFICATION",
        "WS_LLM_STREAMING_RESPONSE",
        "WS_UUID_MAPPING_FOR_LLM",
        "WS_ARTIFACT",
        "WS_RETURN_RENAME_REFACTOR_RESULTS",
        "WS_UPDATE_FRONTEND_PROJECT_STATE",
        "WS_NEW_TERMINAL_CREATED",
    ],
)

from setta.types.utils import AsIsStrEnum

WebsocketConnectionType = AsIsStrEnum(
    "WebsocketConnectionType",
    ["CLI", "SERVER", "PYTHON_SCRIPT", "PYTHON_LOGGER", "FRONTEND"],
)

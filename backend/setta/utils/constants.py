import logging
import os
from pathlib import Path

from setta.types.routes import Route

logger = logging.getLogger(__name__)

CWD = Path.cwd()
CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"
IS_DEV_MODE = os.environ.get("SETTA_DEV_MODE")


class classproperty:
    """Descriptor for creating class-level properties"""

    def __init__(self, func):
        self.func = func

    def __get__(self, instance, owner):
        return self.func(owner)


class C:
    # Basic configuration
    DEFAULT_HOST = "127.0.0.1"
    DEFAULT_PORT = 8000
    DEV_MODE_FRONTEND_PORT = 3000
    SETTINGS_PROJECT_NAME = "settings"

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT

    SETTA_FILES_FOLDER = Path("setta_files")
    CODE_FOLDER = SETTA_FILES_FOLDER / "code"
    DB_BACKUP_FOLDER = SETTA_FILES_FOLDER / "backups"
    ARTIFACTS_FOLDER = SETTA_FILES_FOLDER / "artifacts"

    # WebSocket message types
    WS_RUN_CODE = "runCode"
    WS_TERMINAL_RESIZE = "terminalResize"
    SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY"

    # Allowed artifact types
    ALLOWED_ARTIFACT_TYPES = {
        "DRAW": ["img", "brushStrokes"],
        "IMAGE": ["img"],
        "CHART": ["list"],
        "CHAT": ["chatHistory"],
    }

    NOTIFICATION_IS_FOR_ALL_PROJECTS = "NOTIFICATION_IS_FOR_ALL_PROJECTS"

    # LLM roles and types
    LLM_TEXT = "text"
    LLM_THINKING = "thinking"

    MCP_CHAT_ID_ARG_NAME = "setta_chat_id"
    MCP_SETTA_STATE_ARG_NAME = "setta_state"
    MCP_PROJECT_CONFIG_ID_ARG_NAME = "projectConfigId"
    SEARCH_MCP_TOOLS_NAME = "search_mcp_tools"
    MCP_HIDDEN_FIELD_SCHEMA_KEY = "settaMcpHidden"
    SETTA_MCP_PARAM_NAMES = [
        MCP_CHAT_ID_ARG_NAME,
        MCP_SETTA_STATE_ARG_NAME,
        MCP_PROJECT_CONFIG_ID_ARG_NAME,
    ]

    @classproperty
    def FRONTEND_ORIGINS(cls):
        if IS_DEV_MODE:
            output: list[str] = [f"http://{cls.HOST}:{cls.DEV_MODE_FRONTEND_PORT}"]
        else:
            output: list[str] = [cls.BACKEND]
        if cls.HOST == "127.0.0.1":
            output.append(output[0].replace("127.0.0.1", "localhost"))
        return output

    @classproperty
    def BACKEND(cls):
        return f"http://{cls.HOST}:{cls.PORT}"

    @classproperty
    def WEBSOCKET(cls):
        return f"ws://{cls.HOST}:{cls.PORT}{Route.PREFIX.value}"

import logging
import os
from pathlib import Path

from setta.types.routes import Route

logger = logging.getLogger(__name__)

CWD = Path.cwd()
CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"
IS_DEV_MODE = os.environ.get("SETTA_DEV_MODE")
BACKEND_INIT_DELAY_SECONDS = float(os.environ.get("SETTA_INIT_DELAY_SECONDS", "0") or 0)


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
    DEV_MODE_FRONTEND_PORT = int(
        os.environ.get("SETTA_DEV_FRONTEND_PORT", "3000") or 3000
    )
    SETTINGS_PROJECT_NAME = "settings"
    BACKEND_INIT_DELAY_SECONDS = BACKEND_INIT_DELAY_SECONDS
    OPEN_BROWSER_ON_START: str | None = None

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT

    SETTA_FILES_FOLDER = Path("setta_files")
    CODE_FOLDER = SETTA_FILES_FOLDER / "code"
    DB_BACKUP_FOLDER = SETTA_FILES_FOLDER / "backups"
    ARTIFACTS_FOLDER = SETTA_FILES_FOLDER / "artifacts"
    BINARY_FOLDER_NAME = "binary"
    BINARY_FOLDER = SETTA_FILES_FOLDER / BINARY_FOLDER_NAME
    RUN_FOLDER = SETTA_FILES_FOLDER / "run"
    RUN_SESSIONS_FOLDER = RUN_FOLDER / "sessions"
    RUN_LOGS_FOLDER = RUN_FOLDER / "logs"
    SHARE_DEPLOYMENTS_FOLDER = SETTA_FILES_FOLDER / "share_deployments"
    SHARE_MODE = False
    SHARE_DEPLOYMENT_ROOT: Path | None = None

    AUTH_COOKIE_NAME = os.environ.get("SETTA_AUTH_COOKIE_NAME", "setta_auth")
    AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12
    AUTH_COOKIE_REFRESH_WINDOW_SECONDS = 60 * 60
    AUTH_COOKIE_SAMESITE = "lax"
    AUTH_COOKIE_SECURE = False
    BOOTSTRAP_TOKEN_TTL_SECONDS = 60 * 10
    SESSION_SECRET_BYTES = 32

    # WebSocket message types
    WS_RUN_CODE = "runCode"
    WS_TERMINAL_RESIZE = "terminalResize"
    SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY"

    BINARY_TTL_SECONDS = int(os.environ.get("SETTA_BINARY_TTL_SECONDS", "21600") or 0)
    BINARY_UPLOAD_MAX_BYTES = int(
        os.environ.get("SETTA_BINARY_UPLOAD_MAX_BYTES", str(32 * 1024 * 1024)) or 0
    )
    BINARY_CLEANUP_INTERVAL_SECONDS = int(
        os.environ.get("SETTA_BINARY_CLEANUP_INTERVAL_SECONDS", "60") or 0
    )
    BINARY_CLEANUP_WRITE_INTERVAL = int(
        os.environ.get("SETTA_BINARY_CLEANUP_WRITE_INTERVAL", "50") or 0
    )
    REALTIME_BINARY_MAX_BYTES = int(
        os.environ.get("SETTA_REALTIME_BINARY_MAX_BYTES", str(10 * 1024 * 1024)) or 0
    )

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

    MCP_SETTA_STATE_ARG_NAME = "setta_state"
    SEARCH_MCP_TOOLS_NAME = "search_mcp_tools"
    MCP_HIDDEN_FIELD_SCHEMA_KEY = "settaMcpHidden"
    SETTA_MCP_PARAM_NAMES = [
        MCP_SETTA_STATE_ARG_NAME,
    ]
    GEN_CODE_SEPARATOR_NEWLINES = 2
    EDGE_OUTPUT_BASE_LABEL = "value"

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

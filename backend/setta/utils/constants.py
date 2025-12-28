import logging
import os
from pathlib import Path

from setta.types.routes import Route

logger = logging.getLogger(__name__)

CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"
WORKSPACE_ROOT_ENV_VARIABLE = "SETTA_WORKSPACE_ROOT"
STORAGE_ROOT_ENV_VARIABLE = "SETTA_STORAGE_ROOT"
IS_DEV_MODE = os.environ.get("SETTA_DEV_MODE")
BACKEND_INIT_DELAY_SECONDS = float(os.environ.get("SETTA_INIT_DELAY_SECONDS", "0") or 0)


def _resolve_root(root: str | Path) -> Path:
    return Path(root).expanduser().resolve()


def configure_workspace_root(root: str | Path) -> Path:
    resolved = _resolve_root(root)
    if not resolved.exists():
        raise FileNotFoundError(f"Workspace root does not exist: {resolved}")
    if not resolved.is_dir():
        raise NotADirectoryError(f"Workspace root is not a directory: {resolved}")
    C.WORKSPACE_ROOT = resolved
    return resolved


def configure_storage_root(root: str | Path) -> Path:
    resolved = _resolve_root(root)
    resolved.mkdir(parents=True, exist_ok=True)
    C.STORAGE_ROOT = resolved
    return resolved


def require_workspace_root() -> Path:
    root = C.WORKSPACE_ROOT
    if root is None:
        raise RuntimeError("Workspace root is not configured.")
    return root


def require_storage_root() -> Path:
    root = C.STORAGE_ROOT
    if root is None:
        raise RuntimeError("Storage root is not configured.")
    return root


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
    BACKEND_INIT_DELAY_SECONDS = BACKEND_INIT_DELAY_SECONDS

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT
    WORKSPACE_ROOT: Path | None = None
    STORAGE_ROOT: Path | None = None

    @classproperty
    def SETTA_FILES_FOLDER(cls) -> Path:
        return require_storage_root() / "setta_files"

    @classproperty
    def CODE_FOLDER(cls) -> Path:
        return cls.SETTA_FILES_FOLDER / "code"

    @classproperty
    def DB_BACKUP_FOLDER(cls) -> Path:
        return cls.SETTA_FILES_FOLDER / "backups"

    @classproperty
    def ARTIFACTS_FOLDER(cls) -> Path:
        return cls.SETTA_FILES_FOLDER / "artifacts"

    # WebSocket message types
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

    MCP_SETTA_STATE_ARG_NAME = "setta_state"
    SEARCH_AND_UNLOCK_MCP_TOOLS_NAME = "search_and_unlock_mcp_tools"
    MCP_HIDDEN_FIELD_SCHEMA_KEY = "settaMcpHidden"
    SETTA_MCP_PARAM_NAMES = [
        MCP_SETTA_STATE_ARG_NAME,
    ]
    GEN_CODE_SEPARATOR_NEWLINES = 2

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

import logging
import os
from pathlib import Path

from setta.types.routes import Route
from setta.utils.paths import get_setta_paths

logger = logging.getLogger(__name__)

IS_DEV_MODE = os.environ.get("SETTA_DEV_MODE")
BACKEND_INIT_DELAY_SECONDS = float(os.environ.get("SETTA_INIT_DELAY_SECONDS", "0") or 0)

_HTTP_TOKEN_SEPARATORS = set("()<>@,;:/[]?={} \t")
_HTTP_TOKEN_SEPARATORS.update({"\\", '"'})


def normalize_cookie_name(raw: str | None, *, default: str = "setta_auth") -> str:
    if raw is None:
        return default
    trimmed = raw.strip()
    if not trimmed:
        return default

    def is_token_char(ch: str) -> bool:
        codepoint = ord(ch)
        if codepoint < 0x21 or codepoint > 0x7E:
            return False
        return ch not in _HTTP_TOKEN_SEPARATORS

    sanitized = "".join(ch if is_token_char(ch) else "_" for ch in trimmed)
    return sanitized or default


def _normalize_origin(raw_origin: str) -> str:
    return raw_origin.strip().rstrip("/")


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


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

    @classproperty
    def SETTA_FILES_FOLDER(cls) -> Path:
        return get_setta_paths().setta_files_root

    @classproperty
    def CODE_FOLDER(cls) -> Path:
        return get_setta_paths().code_root

    @classproperty
    def DB_BACKUP_FOLDER(cls) -> Path:
        return cls.SETTA_FILES_FOLDER / "backups"

    @classproperty
    def ARTIFACTS_FOLDER(cls) -> Path:
        return get_setta_paths().artifacts_root

    @classproperty
    def RUNTIME_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_root

    @classproperty
    def RUNTIME_SESSIONS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_sessions_root

    @classproperty
    def RUNTIME_LOGS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_logs_root

    @classproperty
    def RUNTIME_MCP_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_mcp_root

    @classproperty
    def RUNTIME_SECRETS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_secrets_root

    @classproperty
    def DETACHED_RUNS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_detached_runs_root

    BINARY_FOLDER_NAME = "binary"

    @classproperty
    def BINARY_FOLDER(cls) -> Path:
        return cls.SETTA_FILES_FOLDER / cls.BINARY_FOLDER_NAME

    @classproperty
    def SHARE_DEPLOYMENTS_FOLDER(cls) -> Path:
        return get_setta_paths().share_deployments_root

    @classproperty
    def DEPLOYMENTS_FOLDER(cls) -> Path:
        # Legacy name: deployments (share + app) live under the share deployments root.
        return cls.SHARE_DEPLOYMENTS_FOLDER

    SHARE_MODE = False
    SHARE_DEPLOYMENT_ROOT: Path | None = None
    APP_MODE = False
    APP_DEPLOYMENT_ROOT: Path | None = None
    _raw_server_mode = (os.environ.get("SETTA_SERVER_MODE") or "").strip().lower()
    LAUNCHER_MODE = _raw_server_mode == "launcher"

    _raw_auth_cookie_name = os.environ.get("SETTA_AUTH_COOKIE_NAME")
    AUTH_COOKIE_NAME = normalize_cookie_name(
        _raw_auth_cookie_name, default="setta_auth"
    )
    if _raw_auth_cookie_name is not None:
        _trimmed_auth_cookie_name = _raw_auth_cookie_name.strip()
        if _trimmed_auth_cookie_name and _trimmed_auth_cookie_name != AUTH_COOKIE_NAME:
            logger.warning(
                "Sanitized SETTA_AUTH_COOKIE_NAME=%r to %r",
                _trimmed_auth_cookie_name,
                AUTH_COOKIE_NAME,
            )
    AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12
    AUTH_COOKIE_REFRESH_WINDOW_SECONDS = 60 * 60
    AUTH_COOKIE_SAMESITE = "lax"
    AUTH_COOKIE_SECURE = False
    BOOTSTRAP_TOKEN_TTL_SECONDS = 60 * 10
    LAUNCH_INTENT_TOKEN_TTL_SECONDS = 60 * 5
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
    TRANSCRIPTION_FILE_SESSION_MAX_BYTES = int(
        os.environ.get(
            "SETTA_TRANSCRIPTION_FILE_SESSION_MAX_BYTES", str(25 * 1024 * 1024)
        )
        or 0
    )

    # Allowed artifact types
    ALLOWED_ARTIFACT_TYPES = {
        "DRAW": ["img", "brushStrokes"],
        "IMAGE": ["img"],
        "CHART": ["list"],
        "CHAT": ["chatHistory"],
    }

    CHAT_ATTACHMENTS_MAX_FILES = 10
    CHAT_ATTACHMENTS_MAX_FILE_BYTES = 25 * 1024 * 1024
    CHAT_ATTACHMENTS_MAX_FILE_LABEL = (
        f"{CHAT_ATTACHMENTS_MAX_FILE_BYTES // (1024 * 1024)} MB"
    )
    CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES: list[str] = []
    CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS = 60 * 10
    DROPZONE_STATEFUL_MAX_FILE_BYTES = 25 * 1024 * 1024
    DROPZONE_STATEFUL_MAX_FILE_LABEL = (
        f"{DROPZONE_STATEFUL_MAX_FILE_BYTES // (1024 * 1024)} MB"
    )
    DROPZONE_STATELESS_MAX_FILE_BYTES = 5 * 1024 * 1024
    DROPZONE_STATELESS_MAX_FILE_LABEL = (
        f"{DROPZONE_STATELESS_MAX_FILE_BYTES // (1024 * 1024)} MB"
    )
    DROPZONE_STATELESS_MAX_TOTAL_BYTES = 16 * 1024 * 1024
    DROPZONE_STATELESS_MAX_TOTAL_LABEL = (
        f"{DROPZONE_STATELESS_MAX_TOTAL_BYTES // (1024 * 1024)} MB"
    )
    DROPZONE_ALLOWED_MIME_PREFIXES: list[str] = []

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
        raw_extra_origins = os.environ.get("SETTA_FRONTEND_ORIGINS", "")
        for raw_origin in raw_extra_origins.split(","):
            normalized_origin = _normalize_origin(raw_origin)
            if not normalized_origin:
                continue
            output.append(normalized_origin)
        return _dedupe_preserving_order(output)

    @classproperty
    def FRONTEND_ORIGIN_REGEX(cls):
        return None

    @classproperty
    def BACKEND(cls):
        return f"http://{cls.HOST}:{cls.PORT}"

    @classproperty
    def WEBSOCKET(cls):
        return f"ws://{cls.HOST}:{cls.PORT}{Route.PREFIX.value}"

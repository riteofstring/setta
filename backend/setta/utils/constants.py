import logging
from pathlib import Path

from setta.types.routes import Route

from .utils import is_dev_mode

logger = logging.getLogger(__name__)

CWD = Path.cwd()
SETTA_FILES_FOLDER = CWD / "setta_files"
CODE_FOLDER = SETTA_FILES_FOLDER / "code"
DB_BACKUP_FOLDER = SETTA_FILES_FOLDER / "backups"
CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"


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
    DEFAULT_DB_PATH = SETTA_FILES_FOLDER / "setta.db"

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT
    DB_PATH: Path = DEFAULT_DB_PATH

    # Non-section types list
    NON_SECTION_TYPES = [
        "TEXT",
        "SLIDER",
        "SWITCH",
        "COLOR_PICKER",
        "DROPDOWN",
        "PASSWORD",
    ]

    # Nested parameter
    NESTED_PARAM = "NESTED_PARAM"

    # WebSocket message types
    WS_ALL_CONNECTIONS = "allConnections"
    WS_LSP_DIAGNOSTICS = "lspDiagnostics"
    WS_RUN_CODE = "runCode"
    WS_ARTIFACT = "artifact"
    WS_TERMINAL_RESIZE = "terminalResize"
    WS_TERMINAL_METADATA = "terminalMetadata"
    WS_SCRIPT_READY = "scriptReady"
    WS_SCRIPT_DEPENDENCIES = "scriptDependencies"
    WS_ALL_DEPENDENCIES = "allDependencies"
    WS_PROJECT_DATA = "projectData"
    WS_SPECIFIC_FILE_WATCHER_UPDATE = "specificFileWatcherUpdate"
    WS_NOTIFICATION = "notification"
    WS_MCP_TOOL_USE = "mcpToolUse"
    WS_MCP_TOOL_USE_RETURN = "WS_MCP_TOOL_USE_RETURN"
    WS_LLM_STREAMING_RESPONSE = "WS_LLM_STREAMING_RESPONSE"
    WS_UUID_MAPPING_FOR_LLM = "WS_UUID_MAPPING_FOR_LLM"
    WS_CALL_INTERACTIVE_FNS = "WS_CALL_INTERACTIVE_FNS"
    WS_UPDATE_PROJECT_STATE = "WS_UPDATE_PROJECT_STATE"
    WS_UPDATE_FRONTEND_PROJECT_STATE = "WS_UPDATE_FRONTEND_PROJECT_STATE"
    WS_RETURN_RENAME_REFACTOR_RESULTS = "WS_RETURN_RENAME_REFACTOR_RESULTS"
    WS_NEW_TERMINAL_CREATED = "WS_NEW_TERMINAL_CREATED"

    SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY"

    # Allowed artifact types
    ALLOWED_ARTIFACT_TYPES = {
        "DRAW": ["img", "brushStrokes"],
        "IMAGE": ["img"],
        "CHART": ["list"],
        "CHAT": ["chatHistory"],
    }

    NOTIFICATION_IS_FOR_ALL_PROJECTS = "NOTIFICATION_IS_FOR_ALL_PROJECTS"

    # LLM API key names
    LLM_API_KEY_NAMES = {"Anthropic": "ANTHROPIC_API_KEY", "OpenAI": "OPENAI_API_KEY"}

    # LLM message types
    LLM_MESSAGE_START = "message_start"
    LLM_CONTENT_BLOCK_START = "content_block_start"
    LLM_CONTENT_BLOCK_DELTA = "content_block_delta"
    LLM_CONTENT_BLOCK_STOP = "content_block_stop"
    LLM_FULL_MESSAGE_STOP = "full_message_stop"
    LLM_STREAMING_INTO_CODE_BLOCK = "llm_streaming_into_code_block"
    LLM_TEXT_DELTA = "text_delta"
    LLM_THINKING_DELTA = "thinking_delta"
    LLM_SIGNATURE_DELTA = "signature_delta"
    LLM_INPUT_JSON_DELTA = "input_json_delta"

    # LLM roles and types
    LLM_ASSISTANT_ROLE = "assistant"
    LLM_USER_ROLE = "user"
    LLM_TEXT = "text"
    LLM_THINKING = "thinking"
    LLM_TOOL_USE = "tool_use"
    LLM_TOOL_RESULT = "tool_result"
    LLM_STR_REPLACE_EDITOR_TOOL = "str_replace_editor"
    SETTA_MCP_TOOL_ERROR = "SETTA_MCP_TOOL_ERROR"

    MCP_CHAT_ID_ARG_NAME = "setta_chat_id"
    MCP_SERVER_ARG_NAME = "setta_mcp_server"
    MCP_PROJECT_CONFIG_ID_ARG_NAME = "projectConfigId"
    SETTA_MCP_PARAM_NAMES = [
        MCP_CHAT_ID_ARG_NAME,
        MCP_SERVER_ARG_NAME,
        MCP_PROJECT_CONFIG_ID_ARG_NAME,
    ]

    @classproperty
    def FRONTEND_ORIGINS(cls):
        if is_dev_mode():
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

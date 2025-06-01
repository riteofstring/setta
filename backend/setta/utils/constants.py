import logging
from pathlib import Path

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
    DEFAULT_DB_ALIAS = "default"

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT
    DB_PATH: str = ""

    # UI Component Types
    TEXT = "TEXT"
    SLIDER = "SLIDER"
    SWITCH = "SWITCH"
    COLOR_PICKER = "COLOR_PICKER"
    DROPDOWN = "DROPDOWN"
    PASSWORD = "PASSWORD"
    SECTION = "SECTION"
    LIST_ROOT = "LIST_ROOT"
    DICT_ROOT = "DICT_ROOT"
    GROUP = "GROUP"
    GLOBAL_VARIABLES = "GLOBAL_VARIABLES"
    CODE = "CODE"
    GEN_PYTHON_CODE = "GEN_PYTHON_CODE"
    TEXT_BLOCK = "TEXT_BLOCK"
    PARAM_SWEEP = "PARAM_SWEEP"
    TERMINAL = "TERMINAL"
    GLOBAL_PARAM_SWEEP = "GLOBAL_PARAM_SWEEP"
    IMAGE = "IMAGE"
    CHART = "CHART"
    DRAW = "DRAW"
    SOCIAL = "SOCIAL"
    IFRAME = "IFRAME"
    CHAT = "CHAT"
    BROWSER = "BROWSER"

    # Non-section types list
    NON_SECTION_TYPES = [
        "TEXT",
        "SLIDER",
        "SWITCH",
        "COLOR_PICKER",
        "DROPDOWN",
        "PASSWORD",
    ]

    # Collection types
    COLLECTION = "collection"
    CALLABLE = "callable"
    PARAMETER = "parameter"

    # Preset UI types
    PRESET_UI_TYPE_BASE = "BASE"
    PRESET_UI_TYPE_USER = "USER"

    # API Routes
    ROUTE_PREFIX = "/api"
    ROUTE_SWAGGER_DOCS = "/docs"
    ROUTE_OPENAPI_DOCS = "/openapi.json"
    ROUTE_REDOC_DOCS = "/redoc"
    ROUTE_LOAD_ALL_PROJECT_METADATA = "/loadAllProjectMetadata"
    ROUTE_LOAD_PROJECT_CONFIG = "/loadProjectConfig"
    ROUTE_SAVE_PROJECT = "/projects/save"
    ROUTE_CREATE_PROJECT_CONFIG = "/projects/createProjectConfig"
    ROUTE_DELETE_PROJECT_CONFIGS = "/deleteProjectConfigs"
    ROUTE_SAVE_AS_NEW_PROJECT_CONFIG = "/projects/saveAsNewProjectConfig"
    ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG = "/projects/saveAsExistingProjectConfig"
    ROUTE_SET_PROJECT_CONFIG_NAME = "/setProjectConfigName"
    ROUTE_SAVE_SETTINGS = "/saveSettings"
    ROUTE_LOAD_SETTINGS = "/loadSettings"
    ROUTE_SAVE_SETTINGS_PROJECT = "/saveSettingsProject"
    ROUTE_LOAD_SETTINGS_PROJECT = "/loadSettingsProject"
    ROUTE_TERMINAL = "/terminal/{projectConfigId}/{sectionId}/{id}/{isTemporary}"
    ROUTE_DELETE_TERMINALS = "/terminal/deleteTerminals"
    ROUTE_WEBSOCKET_FRONTEND = "/frontend"
    ROUTE_WEBSOCKET_CLI = "/cli"
    ROUTE_WEBSOCKET_CLI_WITH_ID = "/cli/{id}"
    ROUTE_WEBSOCKET_PYTHON_SCRIPT = "/pythonScript/{id}"
    ROUTE_WEBSOCKET_PYTHON_LOGGER = "/pythonLogger"
    ROUTE_GET_EXISTING_TERMINALS = "/terminal/getExistingTerminals/{projectConfigId}"
    ROUTE_SAVE_CODE_INFO = "/codeInfo/save"
    ROUTE_COPY_SECTIONS = "/copySections"
    ROUTE_SEND_PROJECT_TO_INTERACTIVE_CODE = "/sendProjectTointeractiveCode"
    ROUTE_KILL_SUBPROCESSES = "/killSubprocesses"
    ROUTE_FORMAT_CODE = "/formatCode"
    ROUTE_SEND_ARTIFACT = "/sendArtfiact"
    ROUTE_LOAD_ARTIFACTS = "/loadArtifacts"
    ROUTE_LOAD_AVAILABLE_ARTIFACTS = "/loadAvailableArtifacts"
    ROUTE_READ_CSV_BASE64 = "/readCSVBase64"
    ROUTE_FILL_IN_MISSING_ARTIFACT_IDS = "/getArtifactIdsFromNamePathType"
    ROUTE_GET_DEFAULT_PROJECT_CONFIG_NAME = "/getDefaultConfigName"
    ROUTE_SECTION_TO_YAML = "/sectionToYaml"
    ROUTE_PARAM_SWEEP_SECTION_TO_YAML = "/paramSweepSectionToYaml"
    ROUTE_GLOBAL_PARAM_SWEEP_SECTION_TO_YAML = "/globalParamSweepSectionToYaml"
    ROUTE_LOAD_SECTION_JSON_SOURCE = "/loadSectionJSONSource"
    ROUTE_DOCSTRING_TO_MARKDOWN = "/docstringToMarkdown"
    ROUTE_NEW_JSON_VERSION_NAME = "/newJsonVersionName"
    ROUTE_SAVE_SECTION_JSON_SOURCE = "/saveSectionJsonSource"
    ROUTE_SET_AS_DEFAULT_PROJECT = "/setAsDefaultProject"
    ROUTE_FILTER_DATA_FOR_JSON_EXPORT = "/filterDataForJSONExport"
    ROUTE_ADD_DEFAULT_DATA_FOR_JSON_IMPORT = "/addDefaultDataForJSONImport"
    ROUTE_GET_JSON_SOURCE_PATH_TO_BE_DELETED = "/getJsonSourcePathToBeDeleted"
    ROUTE_CREATE_FILE = "/createFile"
    ROUTE_DELETE_FILE = "/deleteFile"
    ROUTE_CHECK_IF_FILE_EXISTS = "/checkIfFileExists"
    ROUTE_LOAD_ARTIFACT_FROM_DISK = "/loadArtifactFromDisk"
    ROUTE_RESTART_LANGUAGE_SERVER = "/restartLanguageServer"
    ROUTE_FILE_WATCH_LIST = "/fileWatchList"
    ROUTE_FILE_WATCH_GEN_PYTHON_CODE = "/fileWatchGenPythonCode"
    ROUTE_GET_NOTIFICATIONS = "/getNotifications"
    ROUTE_DELETE_NOTIFICATION = "/deleteNotification"
    ROUTE_GET_LLM_RESPONSE = "/getLLMResponse"
    ROUTE_SET_LLM_API_KEYS = "/setLLMApiKeys"
    ROUTE_GET_ALL_LLM_CHAT_METADATA = "/getAllLLMChatMetadata"
    ROUTE_DELETE_LLM_CHAT = "/deleteLLMChat"
    ROUTE_STOP_LLM_CHAT = "/stopLLMChat"
    ROUTE_GET_LLM_CHAT = "/getLLMChat"
    ROUTE_GET_UUID_MAPPING_FOR_LLM = "/getUUIDMappingForLLM"
    ROUTE_RUN_CODE = "/runCode"
    ROUTE_TYPE_CHECK = "/typeCheck"

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
    WS_CODE_AREA_AUTOCOMPLETE = "WS_CODE_AREA_AUTOCOMPLETE"
    WS_GEN_CODE_PREFIX_AUTOCOMPLETE = "WS_GEN_CODE_PREFIX_AUTOCOMPLETE"
    WS_PARAMETERS_REQUEST = "WS_PARAMETERS_REQUEST"
    WS_TEXT_FIELD_AUTOCOMPLETE = "WS_TEXT_FIELD_AUTOCOMPLETE"
    WS_UPDATE_PROJECT_STATE = "WS_UPDATE_PROJECT_STATE"
    WS_RETURN_RENAME_REFACTOR_RESULTS = "WS_RETURN_RENAME_REFACTOR_RESULTS"

    # Default script names
    DEFAULT_PYTHON_SCRIPT_NAME = "setta_python_script"
    DEFAULT_BASH_SCRIPT_NAME = "setta_bash_script"

    # Code area states
    CODE_AREA_GEN_CODE_NOT_INITIALIZED = "CODE_AREA_GEN_CODE_NOT_INITIALIZED"
    SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY"

    # Allowed artifact types
    ALLOWED_ARTIFACT_TYPES = {
        "DRAW": ["img", "brushStrokes"],
        "IMAGE": ["img"],
        "CHART": ["list"],
        "CHAT": ["chatHistory"],
    }

    NOTIFICATION_IS_FOR_ALL_PROJECTS = "NOTIFICATION_IS_FOR_ALL_PROJECTS"

    # WebSocket connection types
    WEBSOCKET_CONNECTION_TYPE_CLI = "WEBSOCKET_CONNECTION_TYPE_CLI"
    WEBSOCKET_CONNECTION_TYPE_SERVER = "WEBSOCKET_CONNECTION_TYPE_SERVER"
    WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT = "WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT"
    WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER = "WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER"
    WEBSOCKET_CONNECTION_TYPE_FRONTEND = "WEBSOCKET_CONNECTION_TYPE_FRONTEND"
    WEBSOCKET_CONNECTION_TYPE_MCP_CLIENT = "WEBSOCKET_CONNECTION_TYPE_MCP_CLIENT"

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

    # Rename refactor options
    RENAME_REFACTOR_ALWAYS_ASK = "Always Ask"
    RENAME_REFACTOR_ALWAYS_RENAME = "Always Rename"
    RENAME_REFACTOR_NEVER_RENAME = "Never Rename"

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
        return f"ws://{cls.HOST}:{cls.PORT}{cls.ROUTE_PREFIX}"

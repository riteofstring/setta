// Auto-generated constants file
// Generated from Python Constants class - DO NOT EDIT MANUALLY
// Run the meta-script to regenerate this file

export class C {
  static ALLOWED_ARTIFACT_TYPES = {
    DRAW: ["img", "brushStrokes"],
    IMAGE: ["img"],
    CHART: ["list"],
    CHAT: ["chatHistory"],
  };
  static BROWSER = "BROWSER";
  static CALLABLE = "callable";
  static CHART = "CHART";
  static CHAT = "CHAT";
  static CODE = "CODE";
  static CODE_AREA_GEN_CODE_NOT_INITIALIZED =
    "CODE_AREA_GEN_CODE_NOT_INITIALIZED";
  static COLLECTION = "collection";
  static COLOR_PICKER = "COLOR_PICKER";
  static DEFAULT_BASH_SCRIPT_NAME = "setta_bash_script";
  static DEFAULT_DB_ALIAS = "default";
  static DEFAULT_HOST = "127.0.0.1";
  static DEFAULT_PORT = 8000;
  static DEFAULT_PYTHON_SCRIPT_NAME = "setta_python_script";
  static DEV_MODE_FRONTEND_PORT = 3000;
  static DICT_ROOT = "DICT_ROOT";
  static DRAW = "DRAW";
  static DROPDOWN = "DROPDOWN";
  static GEN_PYTHON_CODE = "GEN_PYTHON_CODE";
  static GLOBAL_VARIABLES = "GLOBAL_VARIABLES";
  static GROUP = "GROUP";
  static HOST = "127.0.0.1";
  static IFRAME = "IFRAME";
  static IMAGE = "IMAGE";
  static LIST_ROOT = "LIST_ROOT";
  static LLM_API_KEY_NAMES = {
    Anthropic: "ANTHROPIC_API_KEY",
    OpenAI: "OPENAI_API_KEY",
  };
  static LLM_ASSISTANT_ROLE = "assistant";
  static LLM_CONTENT_BLOCK_DELTA = "content_block_delta";
  static LLM_CONTENT_BLOCK_START = "content_block_start";
  static LLM_CONTENT_BLOCK_STOP = "content_block_stop";
  static LLM_FULL_MESSAGE_STOP = "full_message_stop";
  static LLM_INPUT_JSON_DELTA = "input_json_delta";
  static LLM_MESSAGE_START = "message_start";
  static LLM_SIGNATURE_DELTA = "signature_delta";
  static LLM_STREAMING_INTO_CODE_BLOCK = "llm_streaming_into_code_block";
  static LLM_STR_REPLACE_EDITOR_TOOL = "str_replace_editor";
  static LLM_TEXT = "text";
  static LLM_TEXT_DELTA = "text_delta";
  static LLM_THINKING = "thinking";
  static LLM_THINKING_DELTA = "thinking_delta";
  static LLM_TOOL_RESULT = "tool_result";
  static LLM_TOOL_USE = "tool_use";
  static LLM_USER_ROLE = "user";
  static MCP_CHAT_ID_ARG_NAME = "setta_chat_id";
  static MCP_SERVER_ARG_NAME = "setta_mcp_server";
  static NESTED_PARAM = "NESTED_PARAM";
  static NON_SECTION_TYPES = [
    "TEXT",
    "SLIDER",
    "SWITCH",
    "COLOR_PICKER",
    "DROPDOWN",
    "PASSWORD",
  ];
  static NOTIFICATION_IS_FOR_ALL_PROJECTS = "NOTIFICATION_IS_FOR_ALL_PROJECTS";
  static PARAMETER = "parameter";
  static PASSWORD = "PASSWORD";
  static PORT = 8000;
  static PRESET_UI_TYPE_BASE = "BASE";
  static PRESET_UI_TYPE_USER = "USER";
  static RENAME_REFACTOR_ALWAYS_ASK = "Always Ask";
  static RENAME_REFACTOR_ALWAYS_RENAME = "Always Rename";
  static RENAME_REFACTOR_NEVER_RENAME = "Never Rename";
  static ROUTE_ADD_DEFAULT_DATA_FOR_JSON_IMPORT =
    "/addDefaultDataForJSONImport";
  static ROUTE_CHECK_IF_FILE_EXISTS = "/checkIfFileExists";
  static ROUTE_COPY_SECTIONS = "/copySections";
  static ROUTE_CREATE_FILE = "/createFile";
  static ROUTE_CREATE_PROJECT_CONFIG = "/projects/createProjectConfig";
  static ROUTE_DELETE_FILE = "/deleteFile";
  static ROUTE_DELETE_LLM_CHAT = "/deleteLLMChat";
  static ROUTE_DELETE_NOTIFICATION = "/deleteNotification";
  static ROUTE_DELETE_PROJECT_CONFIGS = "/deleteProjectConfigs";
  static ROUTE_DELETE_TERMINALS = "/terminal/deleteTerminals";
  static ROUTE_DOCSTRING_TO_MARKDOWN = "/docstringToMarkdown";
  static ROUTE_FILE_WATCH_GEN_PYTHON_CODE = "/fileWatchGenPythonCode";
  static ROUTE_FILE_WATCH_LIST = "/fileWatchList";
  static ROUTE_FILL_IN_MISSING_ARTIFACT_IDS = "/getArtifactIdsFromNamePathType";
  static ROUTE_FILTER_DATA_FOR_JSON_EXPORT = "/filterDataForJSONExport";
  static ROUTE_FORMAT_CODE = "/formatCode";
  static ROUTE_GET_ALL_LLM_CHAT_METADATA = "/getAllLLMChatMetadata";
  static ROUTE_GET_DEFAULT_PROJECT_CONFIG_NAME = "/getDefaultConfigName";
  static ROUTE_GET_EXISTING_TERMINALS =
    "/terminal/getExistingTerminals/{projectConfigId}";
  static ROUTE_GET_JSON_SOURCE_PATH_TO_BE_DELETED =
    "/getJsonSourcePathToBeDeleted";
  static ROUTE_GET_LLM_CHAT = "/getLLMChat";
  static ROUTE_GET_LLM_RESPONSE = "/getLLMResponse";
  static ROUTE_GET_NOTIFICATIONS = "/getNotifications";
  static ROUTE_GET_UUID_MAPPING_FOR_LLM = "/getUUIDMappingForLLM";
  static ROUTE_KILL_SUBPROCESSES = "/killSubprocesses";
  static ROUTE_LOAD_ALL_PROJECT_METADATA = "/loadAllProjectMetadata";
  static ROUTE_LOAD_ARTIFACTS = "/loadArtifacts";
  static ROUTE_LOAD_ARTIFACT_FROM_DISK = "/loadArtifactFromDisk";
  static ROUTE_LOAD_AVAILABLE_ARTIFACTS = "/loadAvailableArtifacts";
  static ROUTE_LOAD_PROJECT_CONFIG = "/loadProjectConfig";
  static ROUTE_LOAD_SECTION_JSON_SOURCE = "/loadSectionJSONSource";
  static ROUTE_LOAD_SETTINGS = "/loadSettings";
  static ROUTE_LOAD_SETTINGS_PROJECT = "/loadSettingsProject";
  static ROUTE_NEW_JSON_VERSION_NAME = "/newJsonVersionName";
  static ROUTE_OPENAPI_DOCS = "/openapi.json";
  static ROUTE_PREFIX = "/api";
  static ROUTE_READ_CSV_BASE64 = "/readCSVBase64";
  static ROUTE_REDOC_DOCS = "/redoc";
  static ROUTE_RESTART_LANGUAGE_SERVER = "/restartLanguageServer";
  static ROUTE_RUN_CODE = "/runCode";
  static ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG =
    "/projects/saveAsExistingProjectConfig";
  static ROUTE_SAVE_AS_NEW_PROJECT_CONFIG = "/projects/saveAsNewProjectConfig";
  static ROUTE_SAVE_CODE_INFO = "/codeInfo/save";
  static ROUTE_SAVE_PROJECT = "/projects/save";
  static ROUTE_SAVE_SECTION_JSON_SOURCE = "/saveSectionJsonSource";
  static ROUTE_SAVE_SETTINGS = "/saveSettings";
  static ROUTE_SAVE_SETTINGS_PROJECT = "/saveSettingsProject";
  static ROUTE_SECTION_TO_YAML = "/sectionToYaml";
  static ROUTE_SEND_ARTIFACT = "/sendArtfiact";
  static ROUTE_SEND_PROJECT_TO_INTERACTIVE_CODE =
    "/sendProjectTointeractiveCode";
  static ROUTE_SET_AS_DEFAULT_PROJECT = "/setAsDefaultProject";
  static ROUTE_SET_LLM_API_KEYS = "/setLLMApiKeys";
  static ROUTE_SET_PROJECT_CONFIG_NAME = "/setProjectConfigName";
  static ROUTE_STOP_LLM_CHAT = "/stopLLMChat";
  static ROUTE_SWAGGER_DOCS = "/docs";
  static ROUTE_TERMINAL =
    "/terminal/{projectConfigId}/{sectionId}/{id}/{isTemporary}";
  static ROUTE_TYPE_CHECK = "/typeCheck";
  static ROUTE_WEBSOCKET_CLI = "/cli";
  static ROUTE_WEBSOCKET_CLI_WITH_ID = "/cli/{id}";
  static ROUTE_WEBSOCKET_FRONTEND = "/frontend";
  static ROUTE_WEBSOCKET_PYTHON_LOGGER = "/pythonLogger";
  static ROUTE_WEBSOCKET_PYTHON_SCRIPT = "/pythonScript/{id}";
  static SECTION = "SECTION";
  static SETTA_MCP_PARAM_NAMES = ["setta_chat_id", "setta_mcp_server"];
  static SETTA_MCP_TOOL_ERROR = "SETTA_MCP_TOOL_ERROR";
  static SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY";
  static SLIDER = "SLIDER";
  static SOCIAL = "SOCIAL";
  static SWITCH = "SWITCH";
  static TERMINAL = "TERMINAL";
  static TEXT = "TEXT";
  static TEXT_BLOCK = "TEXT_BLOCK";
  static WEBSOCKET_CONNECTION_TYPE_CLI = "WEBSOCKET_CONNECTION_TYPE_CLI";
  static WEBSOCKET_CONNECTION_TYPE_FRONTEND =
    "WEBSOCKET_CONNECTION_TYPE_FRONTEND";
  static WEBSOCKET_CONNECTION_TYPE_MCP_CLIENT =
    "WEBSOCKET_CONNECTION_TYPE_MCP_CLIENT";
  static WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER =
    "WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER";
  static WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT =
    "WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT";
  static WEBSOCKET_CONNECTION_TYPE_SERVER = "WEBSOCKET_CONNECTION_TYPE_SERVER";
  static WS_ALL_CONNECTIONS = "allConnections";
  static WS_ALL_DEPENDENCIES = "allDependencies";
  static WS_ARTIFACT = "artifact";
  static WS_CALL_INTERACTIVE_FNS = "WS_CALL_INTERACTIVE_FNS";
  static WS_CODE_AREA_AUTOCOMPLETE = "WS_CODE_AREA_AUTOCOMPLETE";
  static WS_GEN_CODE_PREFIX_AUTOCOMPLETE = "WS_GEN_CODE_PREFIX_AUTOCOMPLETE";
  static WS_LLM_STREAMING_RESPONSE = "WS_LLM_STREAMING_RESPONSE";
  static WS_LSP_DIAGNOSTICS = "lspDiagnostics";
  static WS_MCP_TOOL_USE = "mcpToolUse";
  static WS_MCP_TOOL_USE_RETURN = "WS_MCP_TOOL_USE_RETURN";
  static WS_NOTIFICATION = "notification";
  static WS_PROJECT_DATA = "projectData";
  static WS_RETURN_RENAME_REFACTOR_RESULTS =
    "WS_RETURN_RENAME_REFACTOR_RESULTS";
  static WS_RUN_CODE = "runCode";
  static WS_SCRIPT_DEPENDENCIES = "scriptDependencies";
  static WS_SCRIPT_READY = "scriptReady";
  static WS_SET_SELECTED_ITEM = "WS_SET_SELECTED_ITEM";
  static WS_SPECIFIC_FILE_WATCHER_UPDATE = "specificFileWatcherUpdate";
  static WS_TERMINAL_METADATA = "terminalMetadata";
  static WS_TERMINAL_RESIZE = "terminalResize";
  static WS_TEXT_FIELD_AUTOCOMPLETE = "WS_TEXT_FIELD_AUTOCOMPLETE";
  static WS_UPDATE_PROJECT_STATE = "WS_UPDATE_PROJECT_STATE";
  static WS_UUID_MAPPING_FOR_LLM = "WS_UUID_MAPPING_FOR_LLM";

  static DEV_MODE = import.meta.env?.DEV;

  // Computed properties that mirror the Python class
  static get BACKEND() {
    if (this.DEV_MODE) {
      return `http://${this.DEFAULT_HOST}:${this.DEFAULT_PORT}${this.ROUTE_PREFIX}`;
    } else {
      return `http://${location.host}${this.ROUTE_PREFIX}`;
    }
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      return `ws://${this.DEFAULT_HOST}:${this.DEFAULT_PORT}${this.ROUTE_PREFIX}`;
    } else {
      return `ws://${location.host}${this.ROUTE_PREFIX}`;
    }
  }
}

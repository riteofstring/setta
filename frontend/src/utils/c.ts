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
  static DEFAULT_HOST = "127.0.0.1";
  static DEFAULT_PORT = 8000;
  static DEV_MODE_FRONTEND_PORT = 3000;
  static HOST = "127.0.0.1";
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
  static MCP_PROJECT_CONFIG_ID_ARG_NAME = "projectConfigId";
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
  static PORT = 8000;
  static SETTA_MCP_PARAM_NAMES = [
    "setta_chat_id",
    "setta_mcp_server",
    "projectConfigId",
  ];
  static SETTA_MCP_TOOL_ERROR = "SETTA_MCP_TOOL_ERROR";
  static SETTA_TERMINAL_READY = "SETTA_TERMINAL_READY";
  static WS_ALL_CONNECTIONS = "allConnections";
  static WS_ALL_DEPENDENCIES = "allDependencies";
  static WS_ARTIFACT = "artifact";
  static WS_CALL_INTERACTIVE_FNS = "WS_CALL_INTERACTIVE_FNS";
  static WS_LLM_STREAMING_RESPONSE = "WS_LLM_STREAMING_RESPONSE";
  static WS_LSP_DIAGNOSTICS = "lspDiagnostics";
  static WS_MCP_TOOL_USE = "mcpToolUse";
  static WS_MCP_TOOL_USE_RETURN = "WS_MCP_TOOL_USE_RETURN";
  static WS_NEW_TERMINAL_CREATED = "WS_NEW_TERMINAL_CREATED";
  static WS_NOTIFICATION = "notification";
  static WS_PROJECT_DATA = "projectData";
  static WS_RETURN_RENAME_REFACTOR_RESULTS =
    "WS_RETURN_RENAME_REFACTOR_RESULTS";
  static WS_RUN_CODE = "runCode";
  static WS_SCRIPT_DEPENDENCIES = "scriptDependencies";
  static WS_SCRIPT_READY = "scriptReady";
  static WS_SPECIFIC_FILE_WATCHER_UPDATE = "specificFileWatcherUpdate";
  static WS_TERMINAL_METADATA = "terminalMetadata";
  static WS_TERMINAL_RESIZE = "terminalResize";
  static WS_UPDATE_FRONTEND_PROJECT_STATE = "WS_UPDATE_FRONTEND_PROJECT_STATE";
  static WS_UPDATE_PROJECT_STATE = "WS_UPDATE_PROJECT_STATE";
  static WS_UUID_MAPPING_FOR_LLM = "WS_UUID_MAPPING_FOR_LLM";
}

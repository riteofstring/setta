import type { AppGenerationMode } from "state/types/appGenerationMode";

const CHAT_PERMISSION_MODES = [
  "minimal",
  "yolo",
  "config_toml_custom",
] as const;

export type ChatPermissionModeValue = (typeof CHAT_PERMISSION_MODES)[number];

export type ManagedChatExecutionSettings = {
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
};

type ManagedExecutionControlHandlers = {
  onPermissionModeChange: (nextMode: ChatPermissionModeValue) => void;
  onSearchEnabledChange: (nextValue: boolean) => void;
};

type UpdateManagedExecutionSettings = (
  nextSettings:
    | ManagedChatExecutionSettings
    | ((
        previousSettings: ManagedChatExecutionSettings,
      ) => ManagedChatExecutionSettings),
) => void;

export function createManagedExecutionControlHandlers(
  updateExecutionSettings: UpdateManagedExecutionSettings,
): ManagedExecutionControlHandlers {
  return {
    onPermissionModeChange: (nextMode) => {
      updateExecutionSettings((previousSettings) => ({
        ...previousSettings,
        permissionMode: nextMode,
      }));
    },
    onSearchEnabledChange: (nextValue) => {
      updateExecutionSettings((previousSettings) => ({
        ...previousSettings,
        searchEnabled: nextValue,
      }));
    },
  };
}

export function resolvePermissionModeArg(
  rawArg: string | undefined,
): ChatPermissionModeValue | null {
  if (!rawArg) {
    return null;
  }
  const normalized = rawArg.trim().toLowerCase().replaceAll(".", "_");
  if (normalized === "config_toml_custom") {
    return "config_toml_custom";
  }
  if (normalized === "minimal") {
    return "minimal";
  }
  if (normalized === "yolo") {
    return "yolo";
  }
  return null;
}

export function resolveToggleArg(
  rawArg: string | undefined,
  currentValue: boolean,
): boolean | null {
  if (!rawArg) {
    return !currentValue;
  }
  const normalized = rawArg.trim().toLowerCase();
  if (["on", "true", "enable", "enabled", "1"].includes(normalized)) {
    return true;
  }
  if (["off", "false", "disable", "disabled", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

export type ChatSlashCommandAction =
  | "new"
  | "resume"
  | "app_json_render"
  | "app_json_render_with_image"
  | "app_prompt_builder"
  | "app_mcp_server"
  | "model"
  | "permissions"
  | "search"
  | "help"
  | "custom_prompt";

export type ChatSlashCommandDefinition = {
  command: string;
  action: ChatSlashCommandAction;
  summary: string;
  promptTemplate?: string;
};

type ManagedChatSlashCommandAction = Exclude<
  ChatSlashCommandAction,
  "custom_prompt"
>;

type ChatSlashCommandInput = {
  action: ChatSlashCommandAction;
  args: string[];
  promptTemplate?: string;
};

type ChatSlashCommandExecutionResult =
  | boolean
  | {
      handled?: boolean;
      feedback?: string;
      keepInput?: boolean;
    };

type ParsedSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
  promptTemplate?: string;
};

type ChatSlashCommandCapabilities = {
  model?: boolean;
  permissions?: boolean;
  search?: boolean;
  appGenerationModes?: boolean;
};

type ManagedChatSlashCommandArgs = {
  command: ChatSlashCommandInput;
  slashCommands: ChatSlashCommandDefinition[];
  onSetPermissionMode: (nextMode: ChatPermissionModeValue) => void;
  onStartNewChat: () => void;
  onResumeLatestChat: () => Promise<boolean>;
  resumeFeedback: {
    success: string;
    notFound: string;
  };
  newFeedback?: string;
  modelFeedback?: string | null;
  searchEnabled?: boolean;
  onSetSearchEnabled?: (nextValue: boolean) => void;
  appGenerationMode?: AppGenerationMode | null;
  onSetAppGenerationMode?: (nextMode: AppGenerationMode) => void;
};

const CHAT_SLASH_COMMAND_DEFINITIONS: Record<
  ManagedChatSlashCommandAction,
  ChatSlashCommandDefinition
> = {
  new: { command: "/new", action: "new", summary: "Start a new chat thread." },
  resume: {
    command: "/resume",
    action: "resume",
    summary: "Resume the latest chat thread.",
  },
  model: {
    command: "/model",
    action: "model",
    summary: "Set or inspect model config.",
  },
  app_json_render: {
    command: "/app-json",
    action: "app_json_render",
    summary: "Set app generation mode to JSON Render.",
  },
  app_json_render_with_image: {
    command: "/app-image",
    action: "app_json_render_with_image",
    summary: "Set app generation mode to JSON + Image.",
  },
  app_prompt_builder: {
    command: "/app-prompt",
    action: "app_prompt_builder",
    summary: "Set app generation mode to Prompt Builder.",
  },
  app_mcp_server: {
    command: "/app-mcp",
    action: "app_mcp_server",
    summary: "Set app generation mode to MCP Server.",
  },
  permissions: {
    command: "/permissions",
    action: "permissions",
    summary: "Set permissions mode: minimal, yolo, or config_toml_custom.",
  },
  search: {
    command: "/search",
    action: "search",
    summary: "Toggle search: on or off.",
  },
  help: {
    command: "/help",
    action: "help",
    summary: "Show slash command help.",
  },
};

export function buildChatSlashCommands(
  capabilities: ChatSlashCommandCapabilities = {},
): ChatSlashCommandDefinition[] {
  const includeModel = capabilities.model ?? true;
  const includePermissions = capabilities.permissions ?? true;
  const includeSearch = capabilities.search ?? true;
  const includeAppGenerationModes = capabilities.appGenerationModes ?? false;
  const actions: ManagedChatSlashCommandAction[] = ["new", "resume"];
  if (includeAppGenerationModes) {
    actions.push(
      "app_json_render",
      "app_json_render_with_image",
      "app_prompt_builder",
      "app_mcp_server",
    );
  }
  if (includeModel) {
    actions.push("model");
  }
  if (includePermissions) {
    actions.push("permissions");
  }
  if (includeSearch) {
    actions.push("search");
  }
  actions.push("help");
  return actions.map((action) => CHAT_SLASH_COMMAND_DEFINITIONS[action]);
}

function resolveAppGenerationModeForSlashAction(
  action: ChatSlashCommandAction,
): AppGenerationMode | null {
  if (action === "app_json_render") {
    return "json_render";
  }
  if (action === "app_json_render_with_image") {
    return "json_render_with_image";
  }
  if (action === "app_prompt_builder") {
    return "prompt_builder";
  }
  if (action === "app_mcp_server") {
    return "mcp_server";
  }
  return null;
}

function formatAppGenerationModeLabel(mode: AppGenerationMode): string {
  if (mode === "json_render") {
    return "JSON Render";
  }
  if (mode === "json_render_with_image") {
    return "JSON + Image";
  }
  if (mode === "prompt_builder") {
    return "Prompt Builder";
  }
  return "MCP Server";
}

export function formatSlashCommandHelp(
  commands: ChatSlashCommandDefinition[],
): string {
  const commandList = commands.map((entry) => entry.command).join(", ");
  return `Commands: ${commandList}.`;
}

export async function executeManagedChatSlashCommand({
  command,
  slashCommands,
  onSetPermissionMode,
  onStartNewChat,
  onResumeLatestChat,
  resumeFeedback,
  newFeedback,
  modelFeedback,
  searchEnabled,
  onSetSearchEnabled,
  appGenerationMode,
  onSetAppGenerationMode,
}: ManagedChatSlashCommandArgs): Promise<ChatSlashCommandExecutionResult> {
  if (command.action === "new") {
    onStartNewChat();
    return { feedback: newFeedback ?? "Started a new chat thread." };
  }
  if (command.action === "resume") {
    const resumed = await onResumeLatestChat();
    return resumed
      ? { feedback: resumeFeedback.success }
      : {
          feedback: resumeFeedback.notFound,
          keepInput: true,
        };
  }
  if (command.action === "permissions") {
    const nextMode = resolvePermissionModeArg(command.args[0]);
    if (!nextMode) {
      return {
        feedback: "Usage: /permissions minimal|yolo|config_toml_custom",
        keepInput: true,
      };
    }
    onSetPermissionMode(nextMode);
    return { feedback: `Permissions set to ${nextMode}.` };
  }
  if (command.action === "search") {
    if (
      typeof searchEnabled !== "boolean" ||
      typeof onSetSearchEnabled !== "function"
    ) {
      return false;
    }
    const nextValue = resolveToggleArg(command.args[0], searchEnabled);
    if (nextValue === null) {
      return {
        feedback: "Usage: /search on|off",
        keepInput: true,
      };
    }
    onSetSearchEnabled(nextValue);
    return { feedback: `Search ${nextValue ? "enabled" : "disabled"}.` };
  }
  if (
    command.action === "app_json_render" ||
    command.action === "app_json_render_with_image" ||
    command.action === "app_prompt_builder" ||
    command.action === "app_mcp_server"
  ) {
    const nextMode = resolveAppGenerationModeForSlashAction(command.action);
    if (!nextMode || typeof onSetAppGenerationMode !== "function") {
      return false;
    }
    const unchanged = appGenerationMode === nextMode;
    onSetAppGenerationMode(nextMode);
    if (unchanged) {
      return {
        feedback: `App mode already set to ${formatAppGenerationModeLabel(nextMode)}.`,
      };
    }
    return {
      feedback: `App mode set to ${formatAppGenerationModeLabel(nextMode)}.`,
    };
  }
  if (command.action === "model") {
    if (!modelFeedback) {
      return false;
    }
    return {
      feedback: modelFeedback,
      keepInput: true,
    };
  }
  if (command.action === "help") {
    return {
      feedback: formatSlashCommandHelp(slashCommands),
    };
  }
  return false;
}

export const CHAT_SLASH_COMMANDS: ChatSlashCommandDefinition[] =
  buildChatSlashCommands();

const SLASH_SUGGESTION_LIMIT = 8;
const SLASH_COMMAND_TOKEN_RE = /^\/[a-z][a-z0-9_-]*$/iu;

export function normalizeSlashCommandToken(
  rawCommandToken: string,
): string | null {
  const trimmed = rawCommandToken.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const withPrefix = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!SLASH_COMMAND_TOKEN_RE.test(withPrefix)) {
    return null;
  }
  return withPrefix;
}

export function buildCustomPromptSlashCommandDefinitions(
  customCommands: Array<{ command: string; prompt: string }>,
): ChatSlashCommandDefinition[] {
  const normalized: ChatSlashCommandDefinition[] = [];
  const seen = new Set<string>();
  for (const customCommand of customCommands) {
    const normalizedCommand = normalizeSlashCommandToken(customCommand.command);
    if (!normalizedCommand || seen.has(normalizedCommand)) {
      continue;
    }
    const promptTemplate = customCommand.prompt.trim();
    if (!promptTemplate) {
      continue;
    }
    seen.add(normalizedCommand);
    normalized.push({
      command: normalizedCommand,
      action: "custom_prompt",
      summary: "Run a saved custom prompt.",
      promptTemplate,
    });
  }
  return normalized;
}

function resolveSlashCommandDefinition(
  rawCommandToken: string,
  commands: ChatSlashCommandDefinition[],
): ChatSlashCommandDefinition | null {
  const commandToken = normalizeSlashCommandToken(rawCommandToken);
  if (!commandToken) {
    return null;
  }
  const exactMatch = commands.find((entry) => entry.command === commandToken);
  if (exactMatch) {
    return exactMatch;
  }
  let prefixMatch: ChatSlashCommandDefinition | null = null;
  for (const entry of commands) {
    if (!entry.command.startsWith(commandToken)) {
      continue;
    }
    if (prefixMatch) {
      return null;
    }
    prefixMatch = entry;
  }
  return prefixMatch;
}

export function shouldTreatInputAsSlashCommand(
  text: string,
  commands: ChatSlashCommandDefinition[] = CHAT_SLASH_COMMANDS,
): boolean {
  return shouldTreatInputAsSlashCommandWithCommands(text, commands);
}

function shouldTreatInputAsSlashCommandWithCommands(
  text: string,
  commands: ChatSlashCommandDefinition[],
): boolean {
  const trimmedStart = text.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return false;
  }
  const firstToken = trimmedStart.split(/\s+/u)[0] ?? "";
  if (!SLASH_COMMAND_TOKEN_RE.test(firstToken)) {
    return false;
  }
  return resolveSlashCommandDefinition(firstToken, commands) !== null;
}

export function parseSlashCommand(
  text: string,
  commands: ChatSlashCommandDefinition[] = CHAT_SLASH_COMMANDS,
): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const parts = trimmed.split(/\s+/u);
  const rawCommand = parts[0];
  if (!rawCommand) {
    return null;
  }
  if (!SLASH_COMMAND_TOKEN_RE.test(rawCommand)) {
    return null;
  }
  const args = parts.slice(1);
  const definition = resolveSlashCommandDefinition(rawCommand, commands);
  if (!definition) {
    return null;
  }
  const parsedCommand: ParsedSlashCommand = {
    command: definition.command,
    action: definition.action,
    args,
  };
  if (definition.promptTemplate) {
    parsedCommand.promptTemplate = definition.promptTemplate;
  }
  return parsedCommand;
}

export function getSlashCommandSuggestions(
  value: string,
  commands: ChatSlashCommandDefinition[] = CHAT_SLASH_COMMANDS,
): ChatSlashCommandDefinition[] {
  const trimmedStart = value.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return [];
  }
  const newlineIndex = trimmedStart.indexOf("\n");
  if (newlineIndex >= 0) {
    return [];
  }
  const token = trimmedStart.split(/\s+/u)[0] ?? "";
  const query = token.toLowerCase();
  if (query.length === 0) {
    return [];
  }
  const filtered = commands.filter((entry) => entry.command.startsWith(query));
  return filtered.slice(0, SLASH_SUGGESTION_LIMIT);
}

export type ChatStarterPrompt = {
  id: string;
  label: string;
  prompt: string;
  requiresPython: boolean;
};

export const CREATE_PROJECT_STARTER_PROMPT = [
  "Assume this workspace already contains a real codebase and use it as the source of truth.",
  "Before generating sections or code, ask me 8-12 concise clarifying questions about product goals, constraints, quality bar, environments, and rollout expectations.",
  "After I answer, summarize the agreed direction, list open risks or assumptions, then create the core Setta sections and wire them correctly.",
  "Before claiming completion, run error checks and report pass/fail explicitly.",
].join(" ");

export const CHAT_STARTER_PROMPTS: ChatStarterPrompt[] = [
  {
    id: "create-project",
    label: "Create Project",
    prompt: CREATE_PROJECT_STARTER_PROMPT,
    requiresPython: false,
  },
  {
    id: "summarize-codebase",
    label: "Summarize Codebase",
    prompt:
      "Summarize this codebase architecture, key modules, and highest-risk areas.",
    requiresPython: false,
  },
  {
    id: "plan-next-steps",
    label: "Plan Next Steps",
    prompt:
      "Create a concrete implementation plan with milestones, risks, and validation steps.",
    requiresPython: false,
  },
];

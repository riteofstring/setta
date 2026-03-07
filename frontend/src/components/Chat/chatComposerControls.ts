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
  | "model"
  | "permissions"
  | "search"
  | "help";

export type ChatSlashCommandDefinition = {
  command: string;
  action: ChatSlashCommandAction;
  summary: string;
};

type ChatSlashCommandInput = {
  action: ChatSlashCommandAction;
  args: string[];
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
};

type ChatSlashCommandCapabilities = {
  model?: boolean;
  permissions?: boolean;
  search?: boolean;
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
};

const CHAT_SLASH_COMMAND_DEFINITIONS: Record<
  ChatSlashCommandAction,
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
  const actions: ChatSlashCommandAction[] = ["new", "resume"];
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

function resolveSlashCommandDefinition(
  rawCommandToken: string,
  commands: ChatSlashCommandDefinition[],
): ChatSlashCommandDefinition | null {
  const commandToken = rawCommandToken.toLowerCase();
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
  return {
    command: definition.command,
    action: definition.action,
    args,
  };
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

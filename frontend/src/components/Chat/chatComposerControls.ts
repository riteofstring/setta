import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";
import {
  ProjectChatUIConfig,
  type ChatPermissionMode,
} from "utils/generatedTypes";

const CHAT_PERMISSION_MODES = ProjectChatUIConfig.permissionModeOptions.map(
  (option) => option.value,
);
const CHAT_PERMISSION_MODE_USAGE = CHAT_PERMISSION_MODES.join("|");
const CHAT_PERMISSION_MODE_SUMMARY =
  CHAT_PERMISSION_MODES.length > 1
    ? `${CHAT_PERMISSION_MODES.slice(0, -1).join(", ")}, or ${CHAT_PERMISSION_MODES.at(-1)}`
    : CHAT_PERMISSION_MODES[0] ?? "";

export type ChatPermissionModeValue = ChatPermissionMode;

type ManagedBuiltInSlashCommandAction =
  | "new"
  | "resume"
  | "model"
  | "permissions"
  | "search"
  | "help";

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

function resolvePermissionModeArg(
  rawArg: string | undefined,
): ChatPermissionModeValue | null {
  if (!rawArg) {
    return null;
  }
  const normalized = rawArg.trim().toLowerCase().replaceAll(".", "_");
  return CHAT_PERMISSION_MODES.find((mode) => mode === normalized) ?? null;
}

function resolveToggleArg(
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
  | ManagedBuiltInSlashCommandAction
  | "custom_prompt"
  | "native_prompt"
  | (string & {});

export type ChatSlashCommandDefinition = {
  command: string;
  action: ChatSlashCommandAction;
  summary: string;
  promptTemplate?: string;
  appGenerationMode?: AppGenerationMode | null;
  requiresImageAttachment?: boolean;
  unavailableFeedback?: string;
};

type ChatSlashCommandInput = {
  action: ChatSlashCommandAction;
  args: string[];
  promptTemplate?: string;
  appGenerationMode?: AppGenerationMode | null;
  requiresImageAttachment?: boolean;
};

type ChatSlashCommandExecutionResult =
  | boolean
  | {
      appGenerationMode?: AppGenerationMode | null;
      handled?: boolean;
      feedback?: string;
      keepInput?: boolean;
      submitPromptTemplate?: boolean;
    };

type ParsedSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
  rawSuffix: string;
  promptTemplate?: string;
  appGenerationMode?: AppGenerationMode | null;
  requiresImageAttachment?: boolean;
  unavailableFeedback?: string;
};

type ChatSlashCommandCapabilities = {
  model?: boolean;
  permissions?: boolean;
  search?: boolean;
  appGenerationCommands?: ChatSlashCommandDefinition[];
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
  ManagedBuiltInSlashCommandAction,
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
    summary: `Set permissions mode: ${CHAT_PERMISSION_MODE_SUMMARY}.`,
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

function appendSlashCommandIfEnabled(
  commands: ChatSlashCommandDefinition[],
  enabled: boolean,
  command: ChatSlashCommandDefinition,
) {
  if (enabled) {
    commands.push(command);
  }
}

function appendSlashCommandsIfEnabled(
  commands: ChatSlashCommandDefinition[],
  enabled: boolean,
  nextCommands: ChatSlashCommandDefinition[],
) {
  if (enabled) {
    commands.push(...nextCommands);
  }
}

export function buildChatSlashCommands(
  capabilities: ChatSlashCommandCapabilities = {},
): ChatSlashCommandDefinition[] {
  const commands: ChatSlashCommandDefinition[] = [
    CHAT_SLASH_COMMAND_DEFINITIONS.new,
    CHAT_SLASH_COMMAND_DEFINITIONS.resume,
  ];
  appendSlashCommandsIfEnabled(
    commands,
    (capabilities.appGenerationCommands?.length ?? 0) > 0,
    capabilities.appGenerationCommands ?? [],
  );
  appendSlashCommandIfEnabled(
    commands,
    capabilities.model ?? true,
    CHAT_SLASH_COMMAND_DEFINITIONS.model,
  );
  appendSlashCommandIfEnabled(
    commands,
    capabilities.permissions ?? true,
    CHAT_SLASH_COMMAND_DEFINITIONS.permissions,
  );
  appendSlashCommandIfEnabled(
    commands,
    capabilities.search ?? true,
    CHAT_SLASH_COMMAND_DEFINITIONS.search,
  );
  commands.push(CHAT_SLASH_COMMAND_DEFINITIONS.help);
  return commands;
}

export function formatSlashCommandHelp(
  commands: ChatSlashCommandDefinition[],
): string {
  const commandList = commands.map((entry) => entry.command).join(", ");
  return `Commands: ${commandList}.`;
}

async function executeResumeSlashCommand({
  onResumeLatestChat,
  resumeFeedback,
}: Pick<
  ManagedChatSlashCommandArgs,
  "onResumeLatestChat" | "resumeFeedback"
>): Promise<ChatSlashCommandExecutionResult> {
  const resumed = await onResumeLatestChat();
  return resumed
    ? { feedback: resumeFeedback.success }
    : {
        feedback: resumeFeedback.notFound,
        keepInput: true,
      };
}

function executePermissionsSlashCommand({
  command,
  onSetPermissionMode,
}: Pick<
  ManagedChatSlashCommandArgs,
  "command" | "onSetPermissionMode"
>): ChatSlashCommandExecutionResult {
  const nextMode = resolvePermissionModeArg(command.args[0]);
  if (!nextMode) {
    return {
      feedback: `Usage: /permissions ${CHAT_PERMISSION_MODE_USAGE}`,
      keepInput: true,
    };
  }
  onSetPermissionMode(nextMode);
  return { feedback: `Permissions set to ${nextMode}.` };
}

function executeSearchSlashCommand({
  command,
  searchEnabled,
  onSetSearchEnabled,
}: Pick<
  ManagedChatSlashCommandArgs,
  "command" | "searchEnabled" | "onSetSearchEnabled"
>): ChatSlashCommandExecutionResult {
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

function executeAppGenerationSlashCommand({
  command,
  slashCommands,
}: Pick<
  ManagedChatSlashCommandArgs,
  "command" | "slashCommands"
>): ChatSlashCommandExecutionResult {
  if (!command.appGenerationMode || !command.promptTemplate?.trim()) {
    return false;
  }
  const registeredCommand =
    slashCommands.find((entry) => entry.action === command.action)?.command ??
    "app command";
  return {
    appGenerationMode: command.appGenerationMode,
    feedback: `Submitted ${registeredCommand}.`,
    submitPromptTemplate: true,
  };
}

function executeModelSlashCommand(
  modelFeedback: string | null | undefined,
): ChatSlashCommandExecutionResult {
  if (!modelFeedback) {
    return false;
  }
  return {
    feedback: modelFeedback,
    keepInput: true,
  };
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
  if (command.appGenerationMode) {
    return executeAppGenerationSlashCommand({ command, slashCommands });
  }

  const handlers: Record<
    Exclude<ManagedBuiltInSlashCommandAction, "help">,
    () =>
      | Promise<ChatSlashCommandExecutionResult>
      | ChatSlashCommandExecutionResult
  > = {
    model: () => executeModelSlashCommand(modelFeedback),
    new: () => {
      onStartNewChat();
      return { feedback: newFeedback ?? "Started a new chat thread." };
    },
    permissions: () =>
      executePermissionsSlashCommand({
        command,
        onSetPermissionMode,
      }),
    resume: () =>
      executeResumeSlashCommand({
        onResumeLatestChat,
        resumeFeedback,
      }),
    search: () =>
      executeSearchSlashCommand({
        command,
        searchEnabled,
        onSetSearchEnabled,
      }),
  };

  if (command.action === "help") {
    return {
      feedback: formatSlashCommandHelp(slashCommands),
    };
  }

  if (
    command.action !== "model" &&
    command.action !== "new" &&
    command.action !== "permissions" &&
    command.action !== "resume" &&
    command.action !== "search"
  ) {
    return false;
  }
  return await handlers[command.action]();
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

function isCustomSlashCommandRecord(value: unknown): value is {
  command: unknown;
  prompt: unknown;
  appGenerationMode?: unknown;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildCustomPromptSlashCommandDefinitions(
  customCommands: unknown[],
): ChatSlashCommandDefinition[] {
  const normalized: ChatSlashCommandDefinition[] = [];
  const seen = new Set<string>();
  for (const customCommand of customCommands) {
    if (!isCustomSlashCommandRecord(customCommand)) {
      continue;
    }
    if (
      typeof customCommand.command !== "string" ||
      typeof customCommand.prompt !== "string"
    ) {
      continue;
    }
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
      appGenerationMode: parseAppGenerationMode(
        customCommand.appGenerationMode,
      ),
      requiresImageAttachment: false,
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

type ParsedSlashCommandParts = {
  rawCommand: string;
  rawSuffix: string;
  args: string[];
};

function parseSlashCommandParts(text: string): ParsedSlashCommandParts | null {
  const trimmedStart = text.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return null;
  }
  const firstWhitespaceIndex = trimmedStart.search(/\s/u);
  const rawCommand =
    firstWhitespaceIndex < 0
      ? trimmedStart
      : trimmedStart.slice(0, firstWhitespaceIndex);
  if (!rawCommand || !SLASH_COMMAND_TOKEN_RE.test(rawCommand)) {
    return null;
  }
  const rawSuffix =
    firstWhitespaceIndex < 0
      ? ""
      : trimmedStart.slice(firstWhitespaceIndex).replace(/^\s/u, "");
  const trimmedSuffix = rawSuffix.trim();
  return {
    rawCommand,
    rawSuffix,
    args: trimmedSuffix.length === 0 ? [] : trimmedSuffix.split(/\s+/u),
  };
}

function buildParsedSlashCommand(
  definition: ChatSlashCommandDefinition,
  parsedParts: ParsedSlashCommandParts,
): ParsedSlashCommand {
  const parsedCommand: ParsedSlashCommand = {
    command: definition.command,
    action: definition.action,
    args: parsedParts.args,
    rawSuffix: parsedParts.rawSuffix,
  };
  if (definition.promptTemplate) {
    parsedCommand.promptTemplate = definition.promptTemplate;
  }
  if (Object.prototype.hasOwnProperty.call(definition, "appGenerationMode")) {
    parsedCommand.appGenerationMode = definition.appGenerationMode ?? null;
  }
  if (
    Object.prototype.hasOwnProperty.call(definition, "requiresImageAttachment")
  ) {
    parsedCommand.requiresImageAttachment =
      definition.requiresImageAttachment === true;
  }
  if (definition.unavailableFeedback) {
    parsedCommand.unavailableFeedback = definition.unavailableFeedback;
  }
  return parsedCommand;
}

export function parseSlashCommand(
  text: string,
  commands: ChatSlashCommandDefinition[] = CHAT_SLASH_COMMANDS,
): ParsedSlashCommand | null {
  const parsedParts = parseSlashCommandParts(text);
  if (!parsedParts) {
    return null;
  }
  const definition = resolveSlashCommandDefinition(
    parsedParts.rawCommand,
    commands,
  );
  if (!definition) {
    return null;
  }
  return buildParsedSlashCommand(definition, parsedParts);
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

export const CHAT_PERMISSION_MODES = [
  "minimal",
  "yolo",
  "config_toml_custom",
] as const;

export type ChatPermissionModeValue = (typeof CHAT_PERMISSION_MODES)[number];

export type ChatSlashCommandAction =
  | "new"
  | "resume"
  | "model"
  | "permissions"
  | "search"
  | "skills"
  | "help";

export type ChatSlashCommandDefinition = {
  command: string;
  action: ChatSlashCommandAction;
  summary: string;
};

export type ParsedSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
};

export const CHAT_SLASH_COMMANDS: ChatSlashCommandDefinition[] = [
  { command: "/new", action: "new", summary: "Start a new chat thread." },
  {
    command: "/resume",
    action: "resume",
    summary: "Resume the latest chat thread for this section.",
  },
  { command: "/model", action: "model", summary: "Set or inspect model config." },
  {
    command: "/permissions",
    action: "permissions",
    summary: "Set permissions mode: minimal, yolo, or config_toml_custom.",
  },
  { command: "/search", action: "search", summary: "Toggle search: on or off." },
  { command: "/skills", action: "skills", summary: "Toggle skills: on or off." },
  { command: "/help", action: "help", summary: "Show slash command help." },
];

const SLASH_SUGGESTION_LIMIT = 8;

export function parseSlashCommand(
  text: string,
  commands: ChatSlashCommandDefinition[] = CHAT_SLASH_COMMANDS,
): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [rawCommand, ...args] = trimmed.split(/\s+/u);
  const command = rawCommand.toLowerCase();
  const definition = commands.find((entry) => entry.command === command);
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
  const filtered = commands.filter((entry) =>
    entry.command.startsWith(query),
  );
  return filtered.slice(0, SLASH_SUGGESTION_LIMIT);
}

export type ChatStarterPrompt = {
  id: string;
  label: string;
  prompt: string;
  requiresPython: boolean;
};

export const CREATE_PROJECT_STARTER_PROMPT = [
  "Analyze this codebase and create a complete Setta project setup.",
  "Create the core sections needed for this project and wire them correctly.",
  "Before claiming completion, run error checks and report pass/fail explicitly.",
].join(" ");

export const CHAT_STARTER_PROMPTS: ChatStarterPrompt[] = [
  {
    id: "create-project",
    label: "Create Project",
    prompt: CREATE_PROJECT_STARTER_PROMPT,
    requiresPython: true,
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


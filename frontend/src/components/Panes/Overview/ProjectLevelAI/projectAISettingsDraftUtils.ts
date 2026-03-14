import {
  AgentProfile,
  ClaudeSettingsSourceEnum,
  ExternalAgentConfig,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  PromptFormatEnum,
  PromptTemplate,
  TranscriptionProfile,
  TranscriptionTransportModeEnum,
} from "utils/generatedTypes";

export type AgentProfileDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  enableBackgroundSummaryFill: boolean;
  enableLlmChatTitles: boolean;
  engineConfigId: string;
  toolAllowlistText: string;
  memoryScope: string;
};

export type AgentProfileDraftTextKey = Exclude<
  keyof AgentProfileDraft,
  "enableBackgroundSummaryFill" | "enableLlmChatTitles"
>;

export type PromptFormatValue =
  (typeof PromptFormatEnum)[keyof typeof PromptFormatEnum];

export type PromptTemplateDraft = {
  name: string;
  description: string;
  template: string;
  format: PromptFormatValue;
  inputSchemaText: string;
  metadataText: string;
};

export type TranscriptionTransportModeValue =
  (typeof TranscriptionTransportModeEnum)[keyof typeof TranscriptionTransportModeEnum];

export type TranscriptionProfileDraft = {
  name: string;
  transcriptionLlmConfigId: string;
  transportMode: TranscriptionTransportModeValue;
  chunkMs: string;
  language: string;
};

export type ExternalAgentToolTypeValue =
  (typeof ExternalAgentToolTypeEnum)[keyof typeof ExternalAgentToolTypeEnum];

export type ExternalAgentSettingsModeValue =
  (typeof ExternalAgentSettingsModeEnum)[keyof typeof ExternalAgentSettingsModeEnum];

export type ClaudeSettingsSourceValue =
  (typeof ClaudeSettingsSourceEnum)[keyof typeof ClaudeSettingsSourceEnum];

export type ExternalAgentConfigDraft = {
  name: string;
  description: string;
  toolType: ExternalAgentToolTypeValue;
  runMode: ExternalAgentConfig["runMode"];
  commandPath: string;
  baseUrl: string;
  defaultModel: string;
  sandboxPolicy: string;
  approvalPolicy: string;
  settingsMode: ExternalAgentSettingsModeValue;
  settingsSources: Array<ClaudeSettingsSourceValue>;
  settingsFilePath: string;
  settingsAllowSettaEdits: boolean;
  envVarWhitelistText: string;
  workingDirStrategy: ExternalAgentConfig["workingDirStrategy"];
  workingDir: string;
  claudeAllowText: string;
  claudeAskText: string;
  claudeDenyText: string;
  opencodePermissionText: string;
  opencodeMcpText: string;
};

export const DEFAULT_CLAUDE_ASK_RULES = [
  "Bash(rm:*)",
  "Bash(sudo:*)",
  "Bash(chmod:*)",
  "Bash(chown:*)",
  "Bash(git push:*)",
  "Bash(git reset:*)",
  "Bash(git clean:*)",
  "Bash(dd:*)",
  "Bash(mkfs:*)",
  "Bash(diskutil:*)",
  "Bash(shutdown:*)",
  "Bash(reboot:*)",
];

export const TRANSCRIPTION_CHUNK_MS_DEFAULT = 1200;

export type JsonParseResult = {
  value: Record<string, unknown>;
  error: string | null;
};

export type OptionalJsonParseResult = {
  value: Record<string, unknown> | null;
  error: string | null;
};

export type OpenCodePermission = Record<
  string,
  string | Record<string, string>
>;

export function resolveTranscriptionChunkMsForSave({
  transportMode,
  chunkMsInput,
}: {
  transportMode: TranscriptionTransportModeValue;
  chunkMsInput: string;
}): number | null {
  if (transportMode === TranscriptionTransportModeEnum.file) {
    return TRANSCRIPTION_CHUNK_MS_DEFAULT;
  }
  const parsedChunkMs = Number.parseInt(chunkMsInput, 10);
  if (
    !Number.isInteger(parsedChunkMs) ||
    parsedChunkMs < 200 ||
    parsedChunkMs > 10_000
  ) {
    return null;
  }
  return parsedChunkMs;
}

export function buildAgentProfileDraft(
  profile: AgentProfile,
): AgentProfileDraft {
  return {
    name: profile.name ?? "",
    description: profile.description ?? "",
    systemPrompt: profile.systemPrompt ?? "",
    enableBackgroundSummaryFill: profile.enableBackgroundSummaryFill ?? false,
    enableLlmChatTitles: profile.enableLlmChatTitles ?? false,
    engineConfigId: profile.engineConfigId ?? "",
    toolAllowlistText: (profile.toolAllowlist ?? []).join("\n"),
    memoryScope: profile.memoryScope ?? "",
  };
}

export function buildTranscriptionProfileDraft(
  profile: TranscriptionProfile,
): TranscriptionProfileDraft {
  return {
    name: profile.name ?? "",
    transcriptionLlmConfigId: profile.transcriptionLlmConfigId ?? "",
    transportMode: profile.transportMode,
    chunkMs: String(profile.chunkMs),
    language: profile.language ?? "",
  };
}

export function buildPromptTemplateDraft(
  template: PromptTemplate,
): PromptTemplateDraft {
  return {
    name: template.name ?? "",
    description: template.description ?? "",
    template: template.template ?? "",
    format: template.format,
    inputSchemaText: JSON.stringify(template.inputSchema ?? {}, null, 2),
    metadataText: JSON.stringify(template.metadata ?? {}, null, 2),
  };
}

export function buildExternalAgentConfigDraft(
  config: ExternalAgentConfig,
): ExternalAgentConfigDraft {
  return {
    name: config.name ?? "",
    description: config.description ?? "",
    toolType: config.toolType,
    runMode: config.runMode,
    commandPath: config.commandPath ?? "",
    baseUrl: config.baseUrl ?? "",
    defaultModel: config.defaultModel ?? "",
    sandboxPolicy: config.sandboxPolicy ?? "",
    approvalPolicy: config.approvalPolicy ?? "",
    settingsMode:
      config.settingsMode ?? ExternalAgentSettingsModeEnum.managed_local,
    settingsSources:
      config.settingsSources ??
      (config.toolType === ExternalAgentToolTypeEnum.claude_code
        ? [ClaudeSettingsSourceEnum.project, ClaudeSettingsSourceEnum.local]
        : []),
    settingsFilePath: config.settingsFilePath ?? "",
    settingsAllowSettaEdits: config.settingsAllowSettaEdits ?? true,
    envVarWhitelistText: (config.envVarWhitelist ?? []).join("\n"),
    workingDirStrategy: config.workingDirStrategy,
    workingDir: config.workingDir ?? "",
    claudeAllowText:
      config.settingsManagedBlock?.claude?.permissions?.allow?.join("\n") ?? "",
    claudeAskText:
      config.settingsManagedBlock?.claude?.permissions?.ask?.join("\n") ?? "",
    claudeDenyText:
      config.settingsManagedBlock?.claude?.permissions?.deny?.join("\n") ?? "",
    opencodePermissionText: serializeJson(
      config.settingsManagedBlock?.opencode?.permission,
    ),
    opencodeMcpText: serializeJson(config.settingsManagedBlock?.opencode?.mcp),
  };
}

export function buildSettingsManagedBlock(
  draft: ExternalAgentConfigDraft,
  existing: ExternalAgentConfig | null,
  opencodeOverrides?: {
    opencodePermission: OpenCodePermission | null;
    opencodeMcp: Record<string, unknown> | null;
  },
): ExternalAgentConfig["settingsManagedBlock"] | null {
  const existingBlock = existing?.settingsManagedBlock ?? null;
  const baseBlock: NonNullable<ExternalAgentConfig["settingsManagedBlock"]> =
    existingBlock && typeof existingBlock === "object"
      ? { ...existingBlock }
      : {};
  if (draft.toolType === ExternalAgentToolTypeEnum.claude_code) {
    const claudePermissions = {
      allow: parseListInput(draft.claudeAllowText),
      ask: parseListInput(draft.claudeAskText),
      deny: parseListInput(draft.claudeDenyText),
    };
    baseBlock.claude = { permissions: claudePermissions };
    return baseBlock;
  }
  if (draft.toolType === ExternalAgentToolTypeEnum.opencode) {
    const permission = opencodeOverrides?.opencodePermission ?? null;
    const mcp = opencodeOverrides?.opencodeMcp ?? null;
    if (permission === null && mcp === null) {
      return existingBlock;
    }
    const existingOpencode =
      existingBlock && typeof existingBlock === "object"
        ? existingBlock.opencode ?? null
        : null;
    const opencodeBlock = {
      permission: permission ?? existingOpencode?.permission ?? null,
      mcp: mcp ?? existingOpencode?.mcp ?? null,
      model: existingOpencode?.model ?? null,
    };
    baseBlock.opencode = opencodeBlock;
    return baseBlock;
  }
  return existingBlock;
}

export function parseListInput(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function serializeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function parseJsonObject(value: string): JsonParseResult {
  if (!value.trim()) {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: {}, error: "JSON must be an object." };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: {}, error: "Invalid JSON." };
  }
}

export function parseOptionalJsonObject(
  value: string,
): OptionalJsonParseResult {
  if (!value.trim()) {
    return { value: null, error: null };
  }
  const result = parseJsonObject(value);
  if (result.error) {
    return { value: null, error: result.error };
  }
  return { value: result.value, error: null };
}

export function parseOpenCodePermission(value: string): {
  value: OpenCodePermission | null;
  error: string | null;
} {
  if (!value.trim()) {
    return { value: null, error: null };
  }
  const result = parseJsonObject(value);
  if (result.error) {
    return { value: null, error: result.error };
  }
  const entries = Object.entries(result.value);
  for (const [, entry] of entries) {
    if (typeof entry === "string") {
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        value: null,
        error: "Permission values must be strings or JSON objects.",
      };
    }
    for (const nested of Object.values(entry)) {
      if (typeof nested !== "string") {
        return {
          value: null,
          error: "Permission objects must map to string values.",
        };
      }
    }
  }
  return { value: result.value as OpenCodePermission, error: null };
}

import {
  ClaudeSettingsSourceEnum,
  type ExternalAgentConfig,
  ExternalAgentUIConfig,
  RunModeEnum,
  SettingsModeEnum,
  ToolTypeEnum,
  WorkingDirStrategyEnum,
} from "utils/generatedTypes";

export type ExternalAgentToolTypeValue =
  (typeof ToolTypeEnum)[keyof typeof ToolTypeEnum];
export type ExternalAgentRunModeValue =
  (typeof RunModeEnum)[keyof typeof RunModeEnum];
export type ExternalAgentSettingsModeValue =
  (typeof SettingsModeEnum)[keyof typeof SettingsModeEnum];
export type ExternalAgentWorkingDirStrategyValue =
  (typeof WorkingDirStrategyEnum)[keyof typeof WorkingDirStrategyEnum];
export type ClaudeSettingsSourceValue =
  (typeof ClaudeSettingsSourceEnum)[keyof typeof ClaudeSettingsSourceEnum];

export type ExternalAgentConfigDraft = {
  name: string;
  description: string;
  toolType: ExternalAgentToolTypeValue;
  runMode: ExternalAgentRunModeValue;
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
  workingDirStrategy: ExternalAgentWorkingDirStrategyValue;
  workingDir: string;
  claudeAllowText: string;
  claudeAskText: string;
  claudeDenyText: string;
};

type ExternalAgentConfigSavePayload = {
  name: string;
  description: string;
  toolType: ExternalAgentToolTypeValue;
  runMode: ExternalAgentRunModeValue;
  commandPath: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  sandboxPolicy: string | null;
  approvalPolicy: string | null;
  settingsMode: ExternalAgentSettingsModeValue;
  settingsSources: Array<ClaudeSettingsSourceValue> | null;
  settingsFilePath: string | null;
  settingsAllowSettaEdits: boolean;
  settingsManagedBlock: ExternalAgentConfig["settingsManagedBlock"] | null;
  envVarWhitelist: Array<string>;
  workingDirStrategy: ExternalAgentWorkingDirStrategyValue;
  workingDir: string | null;
};

type ClaudePermissionTexts = Pick<
  ExternalAgentConfigDraft,
  "claudeAllowText" | "claudeAskText" | "claudeDenyText"
>;

export function createExternalAgentConfigDraft(
  toolType: ExternalAgentToolTypeValue,
): ExternalAgentConfigDraft {
  return {
    name: "",
    description: "",
    toolType,
    runMode: RunModeEnum.sdk,
    commandPath: "",
    baseUrl: "",
    defaultModel: "",
    sandboxPolicy: "",
    approvalPolicy: "",
    settingsMode: SettingsModeEnum.managed_local,
    settingsSources: [...ExternalAgentUIConfig.defaultClaudeSettingsSources],
    settingsFilePath: "",
    settingsAllowSettaEdits: true,
    envVarWhitelistText: "",
    workingDirStrategy: WorkingDirStrategyEnum.project_root,
    workingDir: "",
    ...defaultClaudePermissionTexts(),
  };
}

export function buildExternalAgentConfigDraft(
  config: ExternalAgentConfig,
): ExternalAgentConfigDraft {
  return {
    ...createExternalAgentConfigDraft(config.toolType),
    ...buildExternalAgentDraftTextFields(config),
    runMode: config.runMode,
    ...buildExternalAgentDraftConfigFields(config),
    envVarWhitelistText: joinLines(config.envVarWhitelist),
    ...buildExternalAgentDraftWorkingDirFields(config),
    ...buildClaudePermissionTexts(config),
  };
}

export function buildExternalAgentConfigSavePayload(
  draft: ExternalAgentConfigDraft,
  existing: ExternalAgentConfig | null,
): ExternalAgentConfigSavePayload {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    toolType: draft.toolType,
    runMode: draft.runMode,
    commandPath: normalizeOptionalText(draft.commandPath),
    baseUrl: normalizeOptionalText(draft.baseUrl),
    defaultModel: normalizeOptionalText(draft.defaultModel),
    sandboxPolicy: normalizeOptionalText(draft.sandboxPolicy),
    approvalPolicy: normalizeOptionalText(draft.approvalPolicy),
    settingsMode: draft.settingsMode,
    settingsSources: resolveSaveSettingsSources(draft),
    settingsFilePath: normalizeOptionalText(draft.settingsFilePath),
    settingsAllowSettaEdits: draft.settingsAllowSettaEdits,
    settingsManagedBlock: buildSettingsManagedBlock(draft, existing),
    envVarWhitelist: parseListInput(draft.envVarWhitelistText),
    workingDirStrategy: draft.workingDirStrategy,
    workingDir: normalizeOptionalText(draft.workingDir),
  };
}

export function updateExternalAgentDraftField<
  K extends keyof ExternalAgentConfigDraft,
>(
  draft: ExternalAgentConfigDraft,
  key: K,
  value: ExternalAgentConfigDraft[K],
): ExternalAgentConfigDraft {
  if (key !== "toolType") {
    return { ...draft, [key]: value };
  }
  const toolType = value as ExternalAgentToolTypeValue;
  return {
    ...draft,
    toolType,
    runMode: resolveToolTypeRunMode(toolType, draft.runMode),
  };
}

export function toggleClaudeSettingsSource(
  settingsSources: Array<ClaudeSettingsSourceValue>,
  source: ClaudeSettingsSourceValue,
): Array<ClaudeSettingsSourceValue> {
  if (settingsSources.includes(source)) {
    return settingsSources.filter((entry) => entry !== source);
  }
  return [...settingsSources, source];
}

function defaultClaudePermissionTexts(): ClaudePermissionTexts {
  return {
    claudeAllowText: "",
    claudeAskText: ExternalAgentUIConfig.defaultClaudeAskRules.join("\n"),
    claudeDenyText: "",
  };
}

function buildClaudePermissionTexts(
  config: ExternalAgentConfig,
): ClaudePermissionTexts {
  const permissions = config.settingsManagedBlock?.claude?.permissions;
  return {
    claudeAllowText: joinLines(permissions?.allow),
    claudeAskText: joinLines(
      permissions?.ask,
      ExternalAgentUIConfig.defaultClaudeAskRules,
    ),
    claudeDenyText: joinLines(permissions?.deny),
  };
}

function buildExternalAgentDraftTextFields(
  config: ExternalAgentConfig,
): Pick<
  ExternalAgentConfigDraft,
  | "name"
  | "description"
  | "commandPath"
  | "baseUrl"
  | "defaultModel"
  | "sandboxPolicy"
  | "approvalPolicy"
> {
  return {
    name: config.name ?? "",
    description: config.description ?? "",
    commandPath: config.commandPath ?? "",
    baseUrl: config.baseUrl ?? "",
    defaultModel: config.defaultModel ?? "",
    sandboxPolicy: config.sandboxPolicy ?? "",
    approvalPolicy: config.approvalPolicy ?? "",
  };
}

function buildExternalAgentDraftConfigFields(
  config: ExternalAgentConfig,
): Pick<
  ExternalAgentConfigDraft,
  | "settingsMode"
  | "settingsSources"
  | "settingsFilePath"
  | "settingsAllowSettaEdits"
> {
  return {
    settingsMode: config.settingsMode ?? SettingsModeEnum.managed_local,
    settingsSources: resolveDraftSettingsSources(config),
    settingsFilePath: config.settingsFilePath ?? "",
    settingsAllowSettaEdits: config.settingsAllowSettaEdits ?? true,
  };
}

function buildExternalAgentDraftWorkingDirFields(
  config: ExternalAgentConfig,
): Pick<ExternalAgentConfigDraft, "workingDirStrategy" | "workingDir"> {
  return {
    workingDirStrategy: config.workingDirStrategy,
    workingDir: config.workingDir ?? "",
  };
}

function resolveDraftSettingsSources(
  config: ExternalAgentConfig,
): Array<ClaudeSettingsSourceValue> {
  if (config.settingsSources != null) {
    return [...config.settingsSources];
  }
  if (config.toolType === ToolTypeEnum.claude_code) {
    return [...ExternalAgentUIConfig.defaultClaudeSettingsSources];
  }
  return [];
}

function resolveSaveSettingsSources(
  draft: ExternalAgentConfigDraft,
): Array<ClaudeSettingsSourceValue> | null {
  if (
    draft.toolType === ToolTypeEnum.claude_code &&
    draft.settingsSources.length > 0
  ) {
    return draft.settingsSources;
  }
  return null;
}

function buildSettingsManagedBlock(
  draft: ExternalAgentConfigDraft,
  existing: ExternalAgentConfig | null,
): ExternalAgentConfig["settingsManagedBlock"] | null {
  if (draft.toolType !== ToolTypeEnum.claude_code) {
    return existing?.settingsManagedBlock ?? null;
  }
  const existingBlock = existing?.settingsManagedBlock;
  const baseBlock =
    existingBlock && typeof existingBlock === "object"
      ? { ...existingBlock }
      : {};
  baseBlock.claude = {
    permissions: {
      allow: parseListInput(draft.claudeAllowText),
      ask: parseListInput(draft.claudeAskText),
      deny: parseListInput(draft.claudeDenyText),
    },
  };
  return baseBlock;
}

function resolveToolTypeRunMode(
  toolType: ExternalAgentToolTypeValue,
  runMode: ExternalAgentRunModeValue,
): ExternalAgentRunModeValue {
  if (toolType === ToolTypeEnum.codex && runMode === RunModeEnum.sdk) {
    return RunModeEnum.app_server;
  }
  if (toolType !== ToolTypeEnum.codex && runMode === RunModeEnum.app_server) {
    return RunModeEnum.sdk;
  }
  return runMode;
}

function joinLines(
  values: Array<string> | undefined,
  fallback: ReadonlyArray<string> = [],
): string {
  return (values ?? fallback).join("\n");
}

function parseListInput(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

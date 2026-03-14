import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  createExternalAgentConfig,
  deleteExternalAgentConfig,
  updateExternalAgentConfig,
} from "state/actions/ai/projectAiResources";
import { useAIStore } from "state/definitions";
import {
  ClaudeSettingsSourceEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  type ClaudeSettingsSourceValue,
  DEFAULT_CLAUDE_ASK_RULES,
  type ExternalAgentConfigDraft,
  type ExternalAgentSettingsModeValue,
  type ExternalAgentToolTypeValue,
  type OpenCodePermission,
  buildExternalAgentConfigDraft,
  buildSettingsManagedBlock,
  normalizeOptionalText,
  parseListInput,
  parseOpenCodePermission,
  parseOptionalJsonObject,
} from "./projectAISettingsDraftUtils";
import {
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  SELECT_CLASS_NAME,
  TEXTAREA_CLASS_NAME,
} from "./projectAISettingsFormPrimitives";

const EXTERNAL_AGENT_TOOL_TYPE_OPTIONS = Object.values(
  ExternalAgentToolTypeEnum,
);
const EXTERNAL_AGENT_RUN_MODE_OPTIONS = Object.values(ExternalAgentRunModeEnum);
const EXTERNAL_AGENT_WORKING_DIR_OPTIONS = Object.values(
  ExternalAgentWorkingDirStrategyEnum,
);
const EXTERNAL_AGENT_SETTINGS_MODE_OPTIONS = Object.values(
  ExternalAgentSettingsModeEnum,
);
const CLAUDE_SETTINGS_SOURCE_OPTIONS = Object.values(ClaudeSettingsSourceEnum);
const DEFAULT_EXTERNAL_AGENT_TOOL_TYPE =
  EXTERNAL_AGENT_TOOL_TYPE_OPTIONS[0] ?? ExternalAgentToolTypeEnum.codex;

function buildNewExternalAgentConfigDraft(): ExternalAgentConfigDraft {
  return {
    name: "",
    description: "",
    toolType: DEFAULT_EXTERNAL_AGENT_TOOL_TYPE,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: "",
    baseUrl: "",
    defaultModel: "",
    sandboxPolicy: "",
    approvalPolicy: "",
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: [
      ClaudeSettingsSourceEnum.project,
      ClaudeSettingsSourceEnum.local,
    ],
    settingsFilePath: "",
    settingsAllowSettaEdits: true,
    envVarWhitelistText: "",
    workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
    workingDir: "",
    claudeAllowText: "",
    claudeAskText: DEFAULT_CLAUDE_ASK_RULES.join("\n"),
    claudeDenyText: "",
    opencodePermissionText: "",
    opencodeMcpText: "",
  };
}

function resolveCommandPathPlaceholder(
  draft: ExternalAgentConfigDraft | null,
): string {
  if (
    draft?.toolType === ExternalAgentToolTypeEnum.codex &&
    draft.runMode === ExternalAgentRunModeEnum.app_server
  ) {
    return "codex";
  }
  return "node";
}

export function ProjectAIExternalAgentConfigsManager({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { externalAgentConfigs } = useAIStore(
    (state) => ({ externalAgentConfigs: state.externalAgentConfigs }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ExternalAgentConfigDraft | null>(null);
  const [opencodePermissionError, setOpencodePermissionError] = useState<
    string | null
  >(null);
  const [opencodeMcpError, setOpencodeMcpError] = useState<string | null>(null);

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (externalAgentConfigs.length > 0) {
        setActiveId(externalAgentConfigs[0].id);
      }
      return;
    }
    const exists = externalAgentConfigs.some(
      (config) => config.id === activeId,
    );
    if (!exists) {
      setActiveId(
        externalAgentConfigs.length > 0 ? externalAgentConfigs[0].id : null,
      );
    }
  }, [activeId, externalAgentConfigs, isCreating]);

  const activeConfig = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return (
      externalAgentConfigs.find((config) => config.id === activeId) ?? null
    );
  }, [activeId, externalAgentConfigs]);

  useEffect(() => {
    if (isCreating) {
      setDraft(buildNewExternalAgentConfigDraft());
      setOpencodePermissionError(null);
      setOpencodeMcpError(null);
      return;
    }
    if (!activeConfig) {
      setDraft(null);
      setOpencodePermissionError(null);
      setOpencodeMcpError(null);
      return;
    }
    setDraft(buildExternalAgentConfigDraft(activeConfig));
    setOpencodePermissionError(null);
    setOpencodeMcpError(null);
  }, [activeConfig, isCreating]);

  const handleCreateClick = () => {
    if (!canEdit) {
      return;
    }
    setIsCreating(true);
    setActiveId(null);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    const envVarWhitelist = parseListInput(draft.envVarWhitelistText);
    let settingsSources: Array<ClaudeSettingsSourceValue> | null = null;
    if (
      draft.toolType === ExternalAgentToolTypeEnum.claude_code &&
      draft.settingsSources.length > 0
    ) {
      settingsSources = draft.settingsSources;
    }
    let opencodePermission: OpenCodePermission | null = null;
    let opencodeMcp: Record<string, unknown> | null = null;
    if (draft.toolType === ExternalAgentToolTypeEnum.opencode) {
      const permissionResult = parseOpenCodePermission(
        draft.opencodePermissionText,
      );
      const mcpResult = parseOptionalJsonObject(draft.opencodeMcpText);
      setOpencodePermissionError(permissionResult.error);
      setOpencodeMcpError(mcpResult.error);
      if (permissionResult.error || mcpResult.error) {
        return;
      }
      opencodePermission = permissionResult.value;
      opencodeMcp = mcpResult.value;
    } else {
      setOpencodePermissionError(null);
      setOpencodeMcpError(null);
    }
    const settingsManagedBlock = buildSettingsManagedBlock(
      draft,
      activeConfig,
      {
        opencodePermission,
        opencodeMcp,
      },
    );
    const payloadBase = {
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
      settingsSources,
      settingsFilePath: normalizeOptionalText(draft.settingsFilePath),
      settingsAllowSettaEdits: draft.settingsAllowSettaEdits,
      settingsManagedBlock,
      envVarWhitelist,
      workingDirStrategy: draft.workingDirStrategy,
      workingDir: normalizeOptionalText(draft.workingDir),
    };
    if (isCreating) {
      const created = await createExternalAgentConfig(payloadBase);
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeConfig) {
      return;
    }
    const updated = await updateExternalAgentConfig({
      config: {
        ...activeConfig,
        ...payloadBase,
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };

  const handleDelete = async () => {
    if (!activeConfig) {
      return;
    }
    const deleted = await deleteExternalAgentConfig({
      configId: activeConfig.id,
    });
    if (deleted) {
      setActiveId(null);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      return;
    }
    if (activeConfig) {
      setDraft(buildExternalAgentConfigDraft(activeConfig));
      setOpencodePermissionError(null);
      setOpencodeMcpError(null);
    }
  };

  const handleFieldChange = <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      if (key === "toolType") {
        const toolType = value as ExternalAgentToolTypeValue;
        let nextRunMode = prev.runMode;
        if (
          toolType === ExternalAgentToolTypeEnum.codex &&
          prev.runMode === ExternalAgentRunModeEnum.sdk
        ) {
          nextRunMode = ExternalAgentRunModeEnum.app_server;
        }
        if (
          toolType !== ExternalAgentToolTypeEnum.codex &&
          prev.runMode === ExternalAgentRunModeEnum.app_server
        ) {
          nextRunMode = ExternalAgentRunModeEnum.sdk;
        }
        return { ...prev, toolType, runMode: nextRunMode };
      }
      return { ...prev, [key]: value };
    });
  };

  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeConfig || isCreating;
  const isCancelDisabled = !draft;
  const isClaudeTool =
    draft?.toolType === ExternalAgentToolTypeEnum.claude_code;
  const isOpenCodeTool = draft?.toolType === ExternalAgentToolTypeEnum.opencode;
  const needsBaseUrl = draft?.runMode === ExternalAgentRunModeEnum.server;
  const commandPathPlaceholder = resolveCommandPathPlaceholder(draft);
  const isExplicitSettingsPath =
    draft?.settingsMode === ExternalAgentSettingsModeEnum.explicit_path;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          onClick={handleCreateClick}
          disabled={!canEdit}
        >
          New External Agent
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new external agent config.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
          {externalAgentConfigs.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No external agents configured.
            </div>
          ) : (
            externalAgentConfigs.map((config) => {
              const isActive = config.id === activeId && !isCreating;
              let itemClassName =
                "rounded-md px-2 py-2 text-left text-xs transition-colors";
              if (isActive) {
                itemClassName += " bg-blue-600 text-white dark:bg-blue-700";
              } else {
                itemClassName +=
                  " hover:bg-setta-50 dark:hover:bg-setta-800/60";
              }
              return (
                <button
                  type="button"
                  key={config.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(config.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {config.name || "Untitled"}
                  </p>
                  <p className="truncate text-[11px] opacity-80">
                    {config.toolType} · {config.runMode}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className={MANAGER_FORM_CLASS_NAME}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select an external agent config to edit.
            </div>
          ) : (
            <>
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    handleFieldChange("name", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Description">
                <input
                  value={draft.description}
                  onChange={(event) =>
                    handleFieldChange("description", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Tool Type">
                  <select
                    value={draft.toolType}
                    onChange={(event) =>
                      handleFieldChange(
                        "toolType",
                        event.target.value as ExternalAgentToolTypeValue,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {EXTERNAL_AGENT_TOOL_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Run Mode">
                  <select
                    value={draft.runMode}
                    onChange={(event) =>
                      handleFieldChange(
                        "runMode",
                        event.target
                          .value as ExternalAgentConfigDraft["runMode"],
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {EXTERNAL_AGENT_RUN_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Command Path">
                <input
                  value={draft.commandPath}
                  onChange={(event) =>
                    handleFieldChange("commandPath", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                  placeholder={commandPathPlaceholder}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                {needsBaseUrl ? (
                  <Field label="Base URL">
                    <input
                      value={draft.baseUrl}
                      onChange={(event) =>
                        handleFieldChange("baseUrl", event.target.value)
                      }
                      className={INPUT_CLASS_NAME}
                      disabled={!canEdit}
                      placeholder="http://localhost:3000"
                    />
                  </Field>
                ) : (
                  <div />
                )}
                <Field label="Default Model">
                  <input
                    value={draft.defaultModel}
                    onChange={(event) =>
                      handleFieldChange("defaultModel", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Sandbox Policy">
                  <input
                    value={draft.sandboxPolicy}
                    onChange={(event) =>
                      handleFieldChange("sandboxPolicy", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Approval Policy">
                  <input
                    value={draft.approvalPolicy}
                    onChange={(event) =>
                      handleFieldChange("approvalPolicy", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Settings Mode">
                  <select
                    value={draft.settingsMode}
                    onChange={(event) =>
                      handleFieldChange(
                        "settingsMode",
                        event.target.value as ExternalAgentSettingsModeValue,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {EXTERNAL_AGENT_SETTINGS_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Settings File Path"
                  hint={
                    isExplicitSettingsPath
                      ? "Used when settings mode is explicit_path."
                      : "Available when settings mode is explicit_path."
                  }
                >
                  <input
                    value={draft.settingsFilePath}
                    onChange={(event) =>
                      handleFieldChange("settingsFilePath", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit || !isExplicitSettingsPath}
                    placeholder="/path/to/settings"
                  />
                </Field>
              </div>
              <Field label="Allow Setta Edits">
                <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
                  <input
                    type="checkbox"
                    checked={draft.settingsAllowSettaEdits}
                    onChange={(event) =>
                      handleFieldChange(
                        "settingsAllowSettaEdits",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                    disabled={!canEdit}
                  />
                  Allow Setta to merge managed settings into existing files.
                </label>
              </Field>
              {isClaudeTool ? (
                <>
                  <Field
                    label="Claude Settings Sources"
                    hint="Select where Claude Code should read settings from."
                  >
                    <div className="flex flex-wrap gap-2">
                      {CLAUDE_SETTINGS_SOURCE_OPTIONS.map((source) => (
                        <label
                          key={source}
                          className="flex items-center gap-2 rounded-md border border-setta-200/70 px-2 py-1 text-[11px] text-setta-600 dark:border-setta-800 dark:text-setta-300"
                        >
                          <input
                            type="checkbox"
                            checked={draft.settingsSources.includes(source)}
                            onChange={() => {
                              if (!draft) {
                                return;
                              }
                              const hasSource =
                                draft.settingsSources.includes(source);
                              const nextSources = hasSource
                                ? draft.settingsSources.filter(
                                    (entry) => entry !== source,
                                  )
                                : [...draft.settingsSources, source];
                              handleFieldChange("settingsSources", nextSources);
                            }}
                            className="h-4 w-4 accent-blue-600"
                            disabled={!canEdit}
                          />
                          {source}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label="Claude Allow Rules"
                    hint="Names only, one per line."
                  >
                    <textarea
                      value={draft.claudeAllowText}
                      onChange={(event) =>
                        handleFieldChange("claudeAllowText", event.target.value)
                      }
                      className={TEXTAREA_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field
                    label="Claude Ask Rules"
                    hint="Names only, one per line."
                  >
                    <textarea
                      value={draft.claudeAskText}
                      onChange={(event) =>
                        handleFieldChange("claudeAskText", event.target.value)
                      }
                      className={TEXTAREA_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field
                    label="Claude Deny Rules"
                    hint="Names only, one per line."
                  >
                    <textarea
                      value={draft.claudeDenyText}
                      onChange={(event) =>
                        handleFieldChange("claudeDenyText", event.target.value)
                      }
                      className={TEXTAREA_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  </Field>
                  <div className="rounded-md border border-setta-200/70 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-300">
                    Setta will only edit{" "}
                    <code>.claude/settings.local.json</code> or{" "}
                    <code>.claude/settings.json</code> if you opt in.
                  </div>
                </>
              ) : null}
              {isOpenCodeTool ? (
                <>
                  <Field
                    label="OpenCode Permission (JSON)"
                    hint="Leave blank to use defaults."
                    error={opencodePermissionError}
                  >
                    <textarea
                      value={draft.opencodePermissionText}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                        handleFieldChange(
                          "opencodePermissionText",
                          event.target.value,
                        );
                        const result = parseOpenCodePermission(
                          event.target.value,
                        );
                        setOpencodePermissionError(result.error);
                      }}
                      className={TEXTAREA_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field
                    label="OpenCode MCP Overrides (JSON)"
                    hint="Optional. Merged into opencode.json."
                    error={opencodeMcpError}
                  >
                    <textarea
                      value={draft.opencodeMcpText}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                        handleFieldChange(
                          "opencodeMcpText",
                          event.target.value,
                        );
                        const result = parseOptionalJsonObject(
                          event.target.value,
                        );
                        setOpencodeMcpError(result.error);
                      }}
                      className={TEXTAREA_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  </Field>
                </>
              ) : null}
              <Field label="Env Var Whitelist" hint="Names only, one per line.">
                <textarea
                  value={draft.envVarWhitelistText}
                  onChange={(event) =>
                    handleFieldChange("envVarWhitelistText", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Working Dir Strategy">
                  <select
                    value={draft.workingDirStrategy}
                    onChange={(event) =>
                      handleFieldChange(
                        "workingDirStrategy",
                        event.target
                          .value as ExternalAgentConfigDraft["workingDirStrategy"],
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {EXTERNAL_AGENT_WORKING_DIR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Working Dir">
                  <input
                    value={draft.workingDir}
                    onChange={(event) =>
                      handleFieldChange("workingDir", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSave()}
                  disabled={isSaveDisabled}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
                  onClick={handleCancel}
                  disabled={isCancelDisabled}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
                  onClick={() => void handleDelete()}
                  disabled={isDeleteDisabled}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

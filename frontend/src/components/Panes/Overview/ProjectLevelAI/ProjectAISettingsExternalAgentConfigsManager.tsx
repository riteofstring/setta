import { useCallback, useMemo, useState } from "react";
import {
  createExternalAgentConfig,
  deleteExternalAgentConfig,
  updateExternalAgentConfig,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import {
  ClaudeSettingsSourceEnum,
  type ExternalAgentConfig,
  RunModeEnum,
  SettingsModeEnum,
  ToolTypeEnum,
  WorkingDirStrategyEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  CLAUDE_APPROVAL_POLICY_OPTIONS,
  type ClaudeSettingsSourceValue,
  type ExternalAgentConfigDraft,
  type ExternalAgentRunModeValue,
  type ExternalAgentSettingsModeValue,
  type ExternalAgentToolTypeValue,
  type ExternalAgentWorkingDirStrategyValue,
  buildExternalAgentConfigDraft,
  buildExternalAgentConfigSavePayload,
  createExternalAgentConfigDraft,
  toggleClaudeSettingsSource,
  updateExternalAgentDraftField,
} from "./projectAISettingsExternalAgents";
import { useSelectableDraftManager } from "./projectAISettingsManagerState";
import {
  DANGER_ACTION_BUTTON_CLASS_NAME,
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  PRIMARY_ACTION_BUTTON_CLASS_NAME,
  SECONDARY_ACTION_BUTTON_CLASS_NAME,
  SELECT_CLASS_NAME,
  TEXTAREA_CLASS_NAME,
  resolveManagerItemClassName,
} from "./projectAISettingsShared";

export function ExternalAgentConfigsManager({ canEdit }: { canEdit: boolean }) {
  const { externalAgentConfigs } = useAIStore(
    (state) => ({ externalAgentConfigs: state.externalAgentConfigs }),
    shallow,
  );
  const [isCreating, setIsCreating] = useState(false);
  const toolTypeOptions = useMemo(() => Object.values(ToolTypeEnum), []);
  const runModeOptions = useMemo(() => Object.values(RunModeEnum), []);
  const workingDirOptions = useMemo(
    () => Object.values(WorkingDirStrategyEnum),
    [],
  );
  const settingsModeOptions = useMemo(
    () => Object.values(SettingsModeEnum),
    [],
  );
  const settingsSourceOptions = useMemo(
    () => Object.values(ClaudeSettingsSourceEnum),
    [],
  );
  const defaultToolType = toolTypeOptions[0] ?? ToolTypeEnum.codex;
  const buildNewDraft = useCallback(
    () => createExternalAgentConfigDraft(defaultToolType),
    [defaultToolType],
  );
  const buildExistingDraft = useCallback(
    (config: ExternalAgentConfig) => buildExternalAgentConfigDraft(config),
    [],
  );
  const {
    activeId,
    setActiveId,
    activeItem: activeConfig,
    draft,
    setDraft,
  } = useSelectableDraftManager({
    items: externalAgentConfigs,
    isCreating,
    buildDraft: buildExistingDraft,
    buildNewDraft,
  });

  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeConfig || isCreating;
  const isCancelDisabled = !draft;

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
    const payloadBase = buildExternalAgentConfigSavePayload(
      draft,
      activeConfig,
    );
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
    }
  };
  const handleFieldChange = <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => {
    setDraft((prev) =>
      prev ? updateExternalAgentDraftField(prev, key, value) : prev,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={SECONDARY_ACTION_BUTTON_CLASS_NAME}
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
        <ExternalAgentConfigsList
          configs={externalAgentConfigs}
          activeId={activeId}
          isCreating={isCreating}
          onSelect={setActiveId}
        />
        <ExternalAgentConfigEditor
          canEdit={canEdit}
          draft={draft}
          toolTypeOptions={toolTypeOptions}
          runModeOptions={runModeOptions}
          workingDirOptions={workingDirOptions}
          settingsModeOptions={settingsModeOptions}
          settingsSourceOptions={settingsSourceOptions}
          isSaveDisabled={isSaveDisabled}
          isDeleteDisabled={isDeleteDisabled}
          isCancelDisabled={isCancelDisabled}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function ExternalAgentConfigsList({
  configs,
  activeId,
  isCreating,
  onSelect,
}: {
  configs: Array<ExternalAgentConfig>;
  activeId: string | null;
  isCreating: boolean;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
      {configs.length === 0 ? (
        <div className="py-4 text-center text-xs text-setta-400">
          No external agents configured.
        </div>
      ) : (
        configs.map((config) => (
          <button
            type="button"
            key={config.id}
            className={resolveManagerItemClassName(
              config.id === activeId && !isCreating,
            )}
            onClick={() => {
              if (isCreating) {
                return;
              }
              onSelect(config.id);
            }}
          >
            <p className="truncate font-semibold">
              {config.name || "Untitled"}
            </p>
            <p className="truncate text-[11px] opacity-80">
              {config.toolType} · {config.runMode}
            </p>
          </button>
        ))
      )}
    </div>
  );
}

function ExternalAgentConfigEditor({
  canEdit,
  draft,
  toolTypeOptions,
  runModeOptions,
  workingDirOptions,
  settingsModeOptions,
  settingsSourceOptions,
  isSaveDisabled,
  isDeleteDisabled,
  isCancelDisabled,
  onFieldChange,
  onSave,
  onCancel,
  onDelete,
}: {
  canEdit: boolean;
  draft: ExternalAgentConfigDraft | null;
  toolTypeOptions: Array<string>;
  runModeOptions: Array<string>;
  workingDirOptions: Array<string>;
  settingsModeOptions: Array<string>;
  settingsSourceOptions: Array<ClaudeSettingsSourceValue>;
  isSaveDisabled: boolean;
  isDeleteDisabled: boolean;
  isCancelDisabled: boolean;
  onFieldChange: <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  if (!draft) {
    return (
      <div className={MANAGER_FORM_CLASS_NAME}>
        <div className="text-xs text-setta-400">
          Select an external agent config to edit.
        </div>
      </div>
    );
  }
  const isClaudeTool = draft.toolType === ToolTypeEnum.claude_code;
  const needsBaseUrl = draft.runMode === RunModeEnum.server;
  const isExplicitSettingsPath =
    draft.settingsMode === SettingsModeEnum.explicit_path;
  const commandPathPlaceholder =
    draft.toolType === ToolTypeEnum.codex &&
    draft.runMode === RunModeEnum.app_server
      ? "codex"
      : "node";

  return (
    <div className={MANAGER_FORM_CLASS_NAME}>
      <Field label="Name">
        <input
          value={draft.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          className={INPUT_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Description">
        <input
          value={draft.description}
          onChange={(event) => onFieldChange("description", event.target.value)}
          className={INPUT_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <ExternalAgentToolFields
        canEdit={canEdit}
        draft={draft}
        toolTypeOptions={toolTypeOptions}
        runModeOptions={runModeOptions}
        commandPathPlaceholder={commandPathPlaceholder}
        needsBaseUrl={needsBaseUrl}
        onFieldChange={onFieldChange}
      />
      <ExternalAgentSettingsFields
        canEdit={canEdit}
        draft={draft}
        settingsModeOptions={settingsModeOptions}
        isExplicitSettingsPath={isExplicitSettingsPath}
        onFieldChange={onFieldChange}
      />
      {isClaudeTool ? (
        <ClaudeToolSettings
          canEdit={canEdit}
          draft={draft}
          settingsSourceOptions={settingsSourceOptions}
          onFieldChange={onFieldChange}
        />
      ) : null}
      <Field label="Env Var Whitelist" hint="Names only, one per line.">
        <textarea
          value={draft.envVarWhitelistText}
          onChange={(event) =>
            onFieldChange("envVarWhitelistText", event.target.value)
          }
          className={TEXTAREA_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <ExternalAgentWorkingDirectoryFields
        canEdit={canEdit}
        draft={draft}
        workingDirOptions={workingDirOptions}
        onFieldChange={onFieldChange}
      />
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className={PRIMARY_ACTION_BUTTON_CLASS_NAME}
          onClick={() => void onSave()}
          disabled={isSaveDisabled}
        >
          Save
        </button>
        <button
          type="button"
          className={SECONDARY_ACTION_BUTTON_CLASS_NAME}
          onClick={onCancel}
          disabled={isCancelDisabled}
        >
          Cancel
        </button>
        <button
          type="button"
          className={DANGER_ACTION_BUTTON_CLASS_NAME}
          onClick={() => void onDelete()}
          disabled={isDeleteDisabled}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ExternalAgentToolFields({
  canEdit,
  draft,
  toolTypeOptions,
  runModeOptions,
  commandPathPlaceholder,
  needsBaseUrl,
  onFieldChange,
}: {
  canEdit: boolean;
  draft: ExternalAgentConfigDraft;
  toolTypeOptions: Array<string>;
  runModeOptions: Array<string>;
  commandPathPlaceholder: string;
  needsBaseUrl: boolean;
  onFieldChange: <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => void;
}) {
  return (
    <>
      <div className="grid gap-3 @[40rem]:grid-cols-2">
        <Field label="Tool Type">
          <select
            value={draft.toolType}
            onChange={(event) =>
              onFieldChange(
                "toolType",
                event.target.value as ExternalAgentToolTypeValue,
              )
            }
            className={SELECT_CLASS_NAME}
            disabled={!canEdit}
          >
            {toolTypeOptions.map((option) => (
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
              onFieldChange(
                "runMode",
                event.target.value as ExternalAgentRunModeValue,
              )
            }
            className={SELECT_CLASS_NAME}
            disabled={!canEdit}
          >
            {runModeOptions.map((option) => (
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
          onChange={(event) => onFieldChange("commandPath", event.target.value)}
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
              onChange={(event) => onFieldChange("baseUrl", event.target.value)}
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
              onFieldChange("defaultModel", event.target.value)
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
              onFieldChange("sandboxPolicy", event.target.value)
            }
            className={INPUT_CLASS_NAME}
            disabled={!canEdit}
          />
        </Field>
        <Field
          label="Approval Policy"
          hint={
            draft.toolType === ToolTypeEnum.claude_code
              ? "Claude Code permission mode. Choose YOLO to bypass approval prompts when chat permissions stay at config_toml_custom; /permissions yolo still overrides per run."
              : undefined
          }
        >
          {draft.toolType === ToolTypeEnum.claude_code ? (
            <select
              value={draft.approvalPolicy}
              onChange={(event) =>
                onFieldChange("approvalPolicy", event.target.value)
              }
              className={SELECT_CLASS_NAME}
              disabled={!canEdit}
            >
              {CLAUDE_APPROVAL_POLICY_OPTIONS.map((option) => (
                <option
                  key={option.value || "default-source"}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={draft.approvalPolicy}
              onChange={(event) =>
                onFieldChange("approvalPolicy", event.target.value)
              }
              className={INPUT_CLASS_NAME}
              disabled={!canEdit}
            />
          )}
        </Field>
      </div>
    </>
  );
}

function ExternalAgentSettingsFields({
  canEdit,
  draft,
  settingsModeOptions,
  isExplicitSettingsPath,
  onFieldChange,
}: {
  canEdit: boolean;
  draft: ExternalAgentConfigDraft;
  settingsModeOptions: Array<string>;
  isExplicitSettingsPath: boolean;
  onFieldChange: <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => void;
}) {
  return (
    <>
      <div className="grid gap-3 @[40rem]:grid-cols-2">
        <Field label="Settings Mode">
          <select
            value={draft.settingsMode}
            onChange={(event) =>
              onFieldChange(
                "settingsMode",
                event.target.value as ExternalAgentSettingsModeValue,
              )
            }
            className={SELECT_CLASS_NAME}
            disabled={!canEdit}
          >
            {settingsModeOptions.map((option) => (
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
              onFieldChange("settingsFilePath", event.target.value)
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
              onFieldChange("settingsAllowSettaEdits", event.target.checked)
            }
            className="h-4 w-4 accent-blue-600"
            disabled={!canEdit}
          />
          Allow Setta to merge managed settings into existing files.
        </label>
      </Field>
    </>
  );
}

function ClaudeToolSettings({
  canEdit,
  draft,
  settingsSourceOptions,
  onFieldChange,
}: {
  canEdit: boolean;
  draft: ExternalAgentConfigDraft;
  settingsSourceOptions: Array<ClaudeSettingsSourceValue>;
  onFieldChange: <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => void;
}) {
  return (
    <>
      <Field
        label="Claude Settings Sources"
        hint="Select where Claude Code should read settings from."
      >
        <div className="flex flex-wrap gap-2">
          {settingsSourceOptions.map((source) => (
            <label
              key={source}
              className="flex items-center gap-2 rounded-md border border-setta-200/70 px-2 py-1 text-[11px] text-setta-600 dark:border-setta-800 dark:text-setta-300"
            >
              <input
                type="checkbox"
                checked={draft.settingsSources.includes(source)}
                onChange={() =>
                  onFieldChange(
                    "settingsSources",
                    toggleClaudeSettingsSource(draft.settingsSources, source),
                  )
                }
                className="h-4 w-4 accent-blue-600"
                disabled={!canEdit}
              />
              {source}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Claude Allow Rules" hint="Names only, one per line.">
        <textarea
          value={draft.claudeAllowText}
          onChange={(event) =>
            onFieldChange("claudeAllowText", event.target.value)
          }
          className={TEXTAREA_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Claude Ask Rules" hint="Names only, one per line.">
        <textarea
          value={draft.claudeAskText}
          onChange={(event) =>
            onFieldChange("claudeAskText", event.target.value)
          }
          className={TEXTAREA_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Claude Deny Rules" hint="Names only, one per line.">
        <textarea
          value={draft.claudeDenyText}
          onChange={(event) =>
            onFieldChange("claudeDenyText", event.target.value)
          }
          className={TEXTAREA_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <div className="rounded-md border border-setta-200/70 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-300">
        Setta will only edit <code>.claude/settings.local.json</code> or{" "}
        <code>.claude/settings.json</code> if you opt in.
      </div>
    </>
  );
}

function ExternalAgentWorkingDirectoryFields({
  canEdit,
  draft,
  workingDirOptions,
  onFieldChange,
}: {
  canEdit: boolean;
  draft: ExternalAgentConfigDraft;
  workingDirOptions: Array<string>;
  onFieldChange: <K extends keyof ExternalAgentConfigDraft>(
    key: K,
    value: ExternalAgentConfigDraft[K],
  ) => void;
}) {
  return (
    <div className="grid gap-3 @[40rem]:grid-cols-2">
      <Field label="Working Dir Strategy">
        <select
          value={draft.workingDirStrategy}
          onChange={(event) =>
            onFieldChange(
              "workingDirStrategy",
              event.target.value as ExternalAgentWorkingDirStrategyValue,
            )
          }
          className={SELECT_CLASS_NAME}
          disabled={!canEdit}
        >
          {workingDirOptions.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Working Dir">
        <input
          value={draft.workingDir}
          onChange={(event) => onFieldChange("workingDir", event.target.value)}
          className={INPUT_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
    </div>
  );
}

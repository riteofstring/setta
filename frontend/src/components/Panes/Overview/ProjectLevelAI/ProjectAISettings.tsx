import { PaneAccordion } from "components/Panes/Common/PaneAccordion";
import { ProjectAIAgentProfilesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAIAgentProfilesManager";
import { ProjectAIPromptTemplatesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAIPromptTemplatesManager";
import { ProjectAITranscriptionProfilesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAITranscriptionProfilesManager";
import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createExternalAgentConfig,
  deleteExternalAgentConfig,
  updateExternalAgentConfig,
} from "state/actions/ai/projectAiResources";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_save_settings } from "utils/generatedEndpoints";
import {
  ClaudeSettingsSourceEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  createSettingsState,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
  type ProjectAISettingsAccordionItemValue,
  normalizeProjectAISettingsAccordionOpenValues,
} from "./projectAISettingsAccordionState";
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
import { useHydrateAgenticState } from "./useHydrateAgenticState";

type ProjectAISettingsAccordionItem = {
  value: ProjectAISettingsAccordionItemValue;
  title: string;
  description: string;
  triggerTestId: string;
  content: ReactNode;
};
const PROJECT_AI_SETTINGS_TRIGGER_ENABLED_CLASSES =
  "group box-border flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-setta-100/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-setta-850/70 [&[data-state=open]_.project-ai-settings-accordion-chevron]:rotate-180";
const PROJECT_AI_SETTINGS_TRIGGER_DISABLED_CLASSES =
  "group box-border flex w-full cursor-not-allowed items-start justify-between gap-3 px-3 py-2 text-left text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500";

export function ProjectAISettings() {
  useHydrateAgenticState();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const storedAccordionOpenValues = useLocalStorage(
    (state) =>
      state.projectAiSettingsAccordionOpenValuesByProjectConfigId[
        projectConfigId
      ] ?? null,
  );
  const canEdit = !isDeploymentMode;
  const resolvedAccordionOpenValues = useMemo(
    () =>
      normalizeProjectAISettingsAccordionOpenValues(
        storedAccordionOpenValues ??
          PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
      ),
    [storedAccordionOpenValues],
  );
  const handleAccordionOpenValuesChange = useCallback(
    (nextOpenValues: Array<string>) => {
      useLocalStorage.setState((state) => ({
        projectAiSettingsAccordionOpenValuesByProjectConfigId: {
          ...state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
          [projectConfigId]:
            normalizeProjectAISettingsAccordionOpenValues(nextOpenValues),
        },
      }));
    },
    [projectConfigId],
  );
  const accordionItems = useMemo<Array<ProjectAISettingsAccordionItem>>(
    () => [
      {
        value: "project-ai-settings-llm-api-keys",
        title: "LLM API Keys",
        description: "Manage API keys for built-in LLM engines.",
        triggerTestId: "project-ai-settings-accordion-llm-api-keys",
        content: isDeploymentMode ? (
          <div data-setting-anchor="core.project_ai_settings.llm_api_keys">
            <ShareModeNotice />
          </div>
        ) : (
          <div data-setting-anchor="core.project_ai_settings.llm_api_keys">
            <ProjectLLMSettings className="pb-2" />
          </div>
        ),
      },
      {
        value: "project-ai-settings-guardrails",
        title: "Guardrails",
        description: "Control completion verification requirements.",
        triggerTestId: "project-ai-settings-accordion-guardrails",
        content: <GuardrailsSettings canEdit={canEdit} />,
      },
      {
        value: "project-ai-settings-agent-profiles",
        title: "Agent Profiles",
        description: "Create reusable agent personas and tool allowlists.",
        triggerTestId: "project-ai-settings-accordion-agent-profiles",
        content: (
          <div data-setting-anchor="core.project_ai_settings.agent_profiles">
            <ProjectAIAgentProfilesManager canEdit={canEdit} />
          </div>
        ),
      },
      {
        value: "project-ai-settings-transcription-profiles",
        title: "Transcription Profiles",
        description:
          "Configure provider transcription independently of chat engines.",
        triggerTestId: "project-ai-settings-accordion-transcription-profiles",
        content: <ProjectAITranscriptionProfilesManager canEdit={canEdit} />,
      },
      {
        value: "project-ai-settings-prompt-templates",
        title: "Prompt Templates",
        description: "Store reusable prompt assets for Prompt sections.",
        triggerTestId: "project-ai-settings-accordion-prompt-templates",
        content: (
          <div data-setting-anchor="core.project_ai_settings.prompt_templates">
            <ProjectAIPromptTemplatesManager canEdit={canEdit} />
          </div>
        ),
      },
      {
        value: "project-ai-settings-external-agents",
        title: "External Agents",
        description: "Configure Claude Code, Codex, or OpenCode adapters.",
        triggerTestId: "project-ai-settings-accordion-external-agents",
        content: (
          <div data-setting-anchor="core.project_ai_settings.external_agents">
            <ExternalAgentConfigsManager canEdit={canEdit} />
          </div>
        ),
      },
    ],
    [canEdit, isDeploymentMode],
  );

  return (
    <div
      data-testid="project-ai-settings-scroll-region"
      className="setta-pane-scroll h-full min-h-0 space-y-3 pb-[15dvh] text-setta-700 dark:text-setta-300"
    >
      <div className="px-1 text-[11px] text-setta-500 dark:text-setta-400">
        Tune project-wide AI behavior. Non-essential sections start minimized.
      </div>
      <ProjectAISettingsAccordion
        items={accordionItems}
        openValues={resolvedAccordionOpenValues}
        onOpenValuesChange={handleAccordionOpenValuesChange}
      />
    </div>
  );
}

function ProjectAISettingsAccordion({
  items,
  openValues,
  onOpenValuesChange,
}: {
  items: Array<ProjectAISettingsAccordionItem>;
  openValues: Array<ProjectAISettingsAccordionItemValue>;
  onOpenValuesChange: (nextOpenValues: Array<string>) => void;
}) {
  return (
    <PaneAccordion
      items={items}
      openValues={openValues}
      onOpenValuesChange={onOpenValuesChange}
      enabledTriggerClassName={PROJECT_AI_SETTINGS_TRIGGER_ENABLED_CLASSES}
      disabledTriggerClassName={PROJECT_AI_SETTINGS_TRIGGER_DISABLED_CLASSES}
      chevronClassName="project-ai-settings-accordion-chevron"
      includeItemTestId={true}
      includeContentTestId={true}
      rootClassName="space-y-2"
      itemClassName="overflow-hidden rounded-lg border border-setta-200/70 bg-white/70 dark:border-setta-800/70 dark:bg-setta-950/40"
      contentClassName="border-t border-setta-200/70 px-3 py-2 dark:border-setta-800/70"
      titleWrapperClassName="min-w-0 flex-1"
      titleClassName="block truncate text-[11px] font-bold uppercase tracking-wide text-setta-600 dark:text-setta-200"
      descriptionClassName="mt-0.5 block text-[11px] text-setta-500 dark:text-setta-400"
    />
  );
}

function ShareModeNotice() {
  return (
    <div className="rounded-md border border-setta-200/70 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-300">
      LLM settings are unavailable in share mode.
    </div>
  );
}

function GuardrailsSettings({ canEdit }: { canEdit: boolean }) {
  const completionGuardEnabled = useSettings(
    (settings) => settings.backend.completionGuardEnabled,
  );
  const [isSavingCompletionGuard, setIsSavingCompletionGuard] = useState(false);
  const completionGuardSaveRequestIdRef = useRef(0);

  const handleCompletionGuardEnabledChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!canEdit || isSavingCompletionGuard) {
        return;
      }
      const checked = event.target.checked;
      const currentSettings = createSettingsState(useSettings.getState());
      const nextSettings = {
        ...currentSettings,
        backend: {
          ...currentSettings.backend,
          completionGuardEnabled: checked,
        },
      };
      const requestId = completionGuardSaveRequestIdRef.current + 1;
      completionGuardSaveRequestIdRef.current = requestId;
      setIsSavingCompletionGuard(true);
      void (async () => {
        const response = await route_save_settings({ settings: nextSettings });
        if (requestId !== completionGuardSaveRequestIdRef.current) {
          return;
        }
        setIsSavingCompletionGuard(false);
        if (!res200(response)) {
          const detail = getErrorDetail(response.data);
          addTemporaryNotification(
            detail ?? "Failed to save completion guard setting.",
            "error",
          );
          return;
        }
        useSettings.setState(nextSettings);
      })();
    },
    [canEdit, isSavingCompletionGuard],
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 bg-setta-50/70 p-3 text-xs text-setta-600 dark:border-setta-800/70 dark:bg-setta-900/40 dark:text-setta-300">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={completionGuardEnabled}
          onChange={handleCompletionGuardEnabledChange}
          disabled={!canEdit || isSavingCompletionGuard}
          data-testid="project-ai-settings-completion-guard-toggle"
          className="h-4 w-4 cursor-pointer rounded border border-setta-300 bg-white text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:bg-setta-950"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-setta-600 dark:text-setta-200">
          Require verification before completion
        </span>
      </label>
      <p className="m-0 text-[11px] leading-5 text-setta-500 dark:text-setta-400">
        When enabled, final completion responses require structured verification
        check results.
      </p>
      {!canEdit ? (
        <p className="m-0 text-[11px] text-setta-500 dark:text-setta-400">
          Guardrail settings are read-only in share mode.
        </p>
      ) : null}
    </div>
  );
}

function ExternalAgentConfigsManager({ canEdit }: { canEdit: boolean }) {
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

  const toolTypeOptions = useMemo(
    () => Object.values(ExternalAgentToolTypeEnum),
    [],
  );
  const runModeOptions = useMemo(
    () => Object.values(ExternalAgentRunModeEnum),
    [],
  );
  const workingDirOptions = useMemo(
    () => Object.values(ExternalAgentWorkingDirStrategyEnum),
    [],
  );
  const settingsModeOptions = useMemo(
    () => Object.values(ExternalAgentSettingsModeEnum),
    [],
  );
  const settingsSourceOptions = useMemo(
    () => Object.values(ClaudeSettingsSourceEnum),
    [],
  );

  const defaultToolType = toolTypeOptions.length
    ? toolTypeOptions[0]
    : ExternalAgentToolTypeEnum.codex;

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
      setDraft({
        name: "",
        description: "",
        toolType: defaultToolType,
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
      });
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
  }, [activeConfig, defaultToolType, isCreating]);

  const listClassName = MANAGER_LIST_CLASS_NAME;

  const formClassName = MANAGER_FORM_CLASS_NAME;

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
  const commandPathPlaceholder =
    draft?.toolType === ExternalAgentToolTypeEnum.codex &&
    draft?.runMode === ExternalAgentRunModeEnum.app_server
      ? "codex"
      : "node";
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
        <div className={`${listClassName} @[42rem]:w-64`}>
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

        <div className={formClassName}>
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
                      handleFieldChange(
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
                      {settingsSourceOptions.map((source) => (
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
                          .value as ExternalAgentWorkingDirStrategyValue,
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

import { buildLLMConfigGroups } from "components/Chat/llmConfigUtils";
import { PaneAccordion } from "components/Panes/Common/PaneAccordion";
import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { saveSettings } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
  createAgentProfile,
  createExternalAgentConfig,
  createPromptTemplate,
  createTranscriptionProfile,
  deleteAgentProfile,
  deleteExternalAgentConfig,
  deletePromptTemplate,
  deleteTranscriptionProfile,
  updateAgentProfile,
  updateExternalAgentConfig,
  updatePromptTemplate,
  updateTranscriptionProfile,
} from "state/actions/ai";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  AgentProfile,
  ClaudeSettingsSourceEnum,
  ExternalAgentConfig,
  FormatEnum,
  RunModeEnum,
  SettingsModeEnum,
  Template,
  ToolTypeEnum,
  TranscriptionProfile,
  TranscriptionTransportModeEnum,
  WorkingDirStrategyEnum,
  createSettingsState,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
  type ProjectAISettingsAccordionItemValue,
  normalizeProjectAISettingsAccordionOpenValues,
} from "./projectAISettingsAccordionState";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
};
type ProjectAISettingsAccordionItem = {
  value: ProjectAISettingsAccordionItemValue;
  title: string;
  description: string;
  triggerTestId: string;
  content: ReactNode;
};
type AgentProfileDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  enableBackgroundSummaryFill: boolean;
  enableLlmChatTitles: boolean;
  engineConfigId: string;
  toolAllowlistText: string;
  memoryScope: string;
};
type AgentProfileDraftTextKey = Exclude<
  keyof AgentProfileDraft,
  "enableBackgroundSummaryFill" | "enableLlmChatTitles"
>;
type PromptTemplateDraft = {
  name: string;
  description: string;
  template: string;
  format: PromptFormatValue;
  inputSchemaText: string;
  metadataText: string;
};
type TranscriptionProfileDraft = {
  name: string;
  transcriptionLlmConfigId: string;
  transportMode: TranscriptionTransportModeValue;
  chunkMs: string;
  language: string;
};
type ExternalAgentConfigDraft = {
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
type PromptFormatValue = (typeof FormatEnum)[keyof typeof FormatEnum];
type ExternalAgentToolTypeValue =
  (typeof ToolTypeEnum)[keyof typeof ToolTypeEnum];
type ExternalAgentRunModeValue = (typeof RunModeEnum)[keyof typeof RunModeEnum];
type ExternalAgentSettingsModeValue =
  (typeof SettingsModeEnum)[keyof typeof SettingsModeEnum];
type ExternalAgentWorkingDirStrategyValue =
  (typeof WorkingDirStrategyEnum)[keyof typeof WorkingDirStrategyEnum];
type ClaudeSettingsSourceValue =
  (typeof ClaudeSettingsSourceEnum)[keyof typeof ClaudeSettingsSourceEnum];
type TranscriptionTransportModeValue =
  (typeof TranscriptionTransportModeEnum)[keyof typeof TranscriptionTransportModeEnum];
const INPUT_CLASS_NAME =
  "box-border h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
const TEXTAREA_CLASS_NAME =
  "box-border min-h-[110px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600";
const SELECT_CLASS_NAME =
  "box-border h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
const MANAGER_LIST_CLASS_NAME =
  "flex max-h-[360px] flex-col gap-1 overflow-x-hidden overflow-y-scroll rounded-md bg-setta-50/45 pl-2 pr-3 py-2 [scrollbar-gutter:stable] dark:bg-setta-900/40";
const MANAGER_FORM_CLASS_NAME =
  "flex min-h-0 flex-1 flex-col gap-4 rounded-md bg-white/45 p-4 dark:bg-setta-900/30";
const PROJECT_AI_SETTINGS_TRIGGER_ENABLED_CLASSES =
  "group box-border flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-setta-100/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-setta-850/70 [&[data-state=open]_.project-ai-settings-accordion-chevron]:rotate-180";
const PROJECT_AI_SETTINGS_TRIGGER_DISABLED_CLASSES =
  "group box-border flex w-full cursor-not-allowed items-start justify-between gap-3 px-3 py-2 text-left text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500";
const DEFAULT_CLAUDE_ASK_RULES = [
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
const CLAUDE_APPROVAL_POLICY_OPTIONS = [
  { value: "", label: "Use settings file / chat override" },
  { value: "default", label: "Default" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan" },
  { value: "bypassPermissions", label: "YOLO (bypassPermissions)" },
] as const;
const TRANSCRIPTION_CHUNK_MS_DEFAULT = 1200;
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
    parsedChunkMs > 10000
  ) {
    return null;
  }
  return parsedChunkMs;
}
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
            <AgentProfilesManager canEdit={canEdit} />
          </div>
        ),
      },
      {
        value: "project-ai-settings-transcription-profiles",
        title: "Transcription Profiles",
        description:
          "Configure provider transcription independently of chat engines.",
        triggerTestId: "project-ai-settings-accordion-transcription-profiles",
        content: <TranscriptionProfilesManager canEdit={canEdit} />,
      },
      {
        value: "project-ai-settings-prompt-templates",
        title: "Prompt Templates",
        description: "Store reusable prompt assets for Prompt sections.",
        triggerTestId: "project-ai-settings-accordion-prompt-templates",
        content: (
          <div data-setting-anchor="core.project_ai_settings.prompt_templates">
            <PromptTemplatesManager canEdit={canEdit} />
          </div>
        ),
      },
      {
        value: "project-ai-settings-external-agents",
        title: "External Agents",
        description: "Configure Claude Code and Codex adapters.",
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
function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {label}
      </span>
      {children}
      {hint ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-400">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
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
        const response = await callOpenAPI(
          saveSettings({ body: { settings: nextSettings } } as Parameters<
            typeof saveSettings
          >[0]),
        );
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
function AgentProfilesManager({ canEdit }: { canEdit: boolean }) {
  const { agentProfiles } = useAIStore(
    (state) => ({ agentProfiles: state.agentProfiles }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<AgentProfileDraft | null>(null);
  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (agentProfiles.length > 0) {
        setActiveId(agentProfiles[0].id);
      }
      return;
    }
    const exists = agentProfiles.some((profile) => profile.id === activeId);
    if (!exists) {
      setActiveId(agentProfiles.length > 0 ? agentProfiles[0].id : null);
    }
  }, [activeId, agentProfiles, isCreating]);
  const activeProfile = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return agentProfiles.find((profile) => profile.id === activeId) ?? null;
  }, [activeId, agentProfiles]);
  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        description: "",
        systemPrompt: "",
        enableBackgroundSummaryFill: false,
        enableLlmChatTitles: false,
        engineConfigId: "",
        toolAllowlistText: "",
        memoryScope: "",
      });
      return;
    }
    if (!activeProfile) {
      setDraft(null);
      return;
    }
    setDraft(buildAgentProfileDraft(activeProfile));
  }, [activeProfile, isCreating]);
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
    const toolAllowlist = parseListInput(draft.toolAllowlistText);
    if (isCreating) {
      const created = await createAgentProfile({
        name: draft.name.trim(),
        description: draft.description.trim(),
        systemPrompt: draft.systemPrompt,
        enableBackgroundSummaryFill: draft.enableBackgroundSummaryFill,
        enableLlmChatTitles: draft.enableLlmChatTitles,
        engineConfigId: normalizeOptionalText(draft.engineConfigId),
        toolAllowlist,
        memoryScope: normalizeOptionalText(draft.memoryScope),
      });
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeProfile) {
      return;
    }
    const updated = await updateAgentProfile({
      profile: {
        ...activeProfile,
        name: draft.name.trim(),
        description: draft.description.trim(),
        systemPrompt: draft.systemPrompt,
        enableBackgroundSummaryFill: draft.enableBackgroundSummaryFill,
        enableLlmChatTitles: draft.enableLlmChatTitles,
        engineConfigId: normalizeOptionalText(draft.engineConfigId),
        toolAllowlist,
        memoryScope: normalizeOptionalText(draft.memoryScope),
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };
  const handleDelete = async () => {
    if (!activeProfile) {
      return;
    }
    const deleted = await deleteAgentProfile({ profileId: activeProfile.id });
    if (deleted) {
      setActiveId(null);
    }
  };
  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      return;
    }
    if (activeProfile) {
      setDraft(buildAgentProfileDraft(activeProfile));
    }
  };
  const handleFieldChange = (key: AgentProfileDraftTextKey, value: string) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  };
  const handleToggleChange = (
    key: "enableBackgroundSummaryFill" | "enableLlmChatTitles",
    value: boolean,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  };
  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeProfile || isCreating;
  const isCancelDisabled = !draft;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          onClick={handleCreateClick}
          disabled={!canEdit}
        >
          New Profile
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new agent profile.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${listClassName} @[42rem]:w-64`}>
          {agentProfiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No profiles yet.
            </div>
          ) : (
            agentProfiles.map((profile) => {
              const isActive = profile.id === activeId && !isCreating;
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
                  key={profile.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(profile.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {profile.name || "Untitled"}
                  </p>
                  {profile.description ? (
                    <p className="truncate text-[11px] opacity-80">
                      {profile.description}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className={formClassName}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a profile to edit.
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
              <Field label="System Prompt">
                <textarea
                  value={draft.systemPrompt}
                  onChange={(event) =>
                    handleFieldChange("systemPrompt", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Background Summary Fill"
                hint="When enabled, Setta may generate missing section summaries in the background during a chat run."
              >
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.enableBackgroundSummaryFill}
                    onChange={(event) =>
                      handleToggleChange(
                        "enableBackgroundSummaryFill",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                    disabled={!canEdit}
                    aria-label="Enable Background Summary Fill"
                  />
                  <span>Enable</span>
                </label>
              </Field>
              <Field
                label="LLM Chat Titles"
                hint="When enabled, Setta may call the LLM to generate chat titles after runs complete."
              >
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.enableLlmChatTitles}
                    onChange={(event) =>
                      handleToggleChange(
                        "enableLlmChatTitles",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                    disabled={!canEdit}
                    aria-label="Enable LLM Chat Titles"
                  />
                  <span>Enable</span>
                </label>
              </Field>
              <Field
                label="Engine Config ID"
                hint="Leave empty to use the engine assigned elsewhere."
              >
                <input
                  value={draft.engineConfigId}
                  onChange={(event) =>
                    handleFieldChange("engineConfigId", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Tool Allowlist"
                hint="One tool name per line. Use server__tool for MCP names."
              >
                <textarea
                  value={draft.toolAllowlistText}
                  onChange={(event) =>
                    handleFieldChange("toolAllowlistText", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Memory Scope">
                <input
                  value={draft.memoryScope}
                  onChange={(event) =>
                    handleFieldChange("memoryScope", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>

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
function TranscriptionProfilesManager({ canEdit }: { canEdit: boolean }) {
  const { apiKeys, allLLMConfigs, transcriptionProfiles } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      transcriptionProfiles: state.transcriptionProfiles,
    }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<TranscriptionProfileDraft | null>(null);
  const transportModeOptions = useMemo(
    () => Object.values(TranscriptionTransportModeEnum),
    [],
  );
  const configGroups = useMemo(
    () =>
      buildLLMConfigGroups(allLLMConfigs, apiKeys, {
        includeConfigsWithoutApiKey: true,
      }),
    [allLLMConfigs, apiKeys],
  );
  const firstConfigId = useMemo(() => {
    for (const group of configGroups) {
      for (const item of group.items) {
        return item.id;
      }
    }
    return "";
  }, [configGroups]);
  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (transcriptionProfiles.length > 0) {
        setActiveId(transcriptionProfiles[0].id);
      }
      return;
    }
    const exists = transcriptionProfiles.some(
      (profile) => profile.id === activeId,
    );
    if (!exists) {
      setActiveId(
        transcriptionProfiles.length > 0 ? transcriptionProfiles[0].id : null,
      );
    }
  }, [activeId, isCreating, transcriptionProfiles]);
  const activeProfile = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return (
      transcriptionProfiles.find((profile) => profile.id === activeId) ?? null
    );
  }, [activeId, transcriptionProfiles]);
  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        transcriptionLlmConfigId: firstConfigId,
        transportMode: TranscriptionTransportModeEnum.auto,
        chunkMs: String(TRANSCRIPTION_CHUNK_MS_DEFAULT),
        language: "",
      });
      return;
    }
    if (!activeProfile) {
      setDraft(null);
      return;
    }
    setDraft(buildTranscriptionProfileDraft(activeProfile));
  }, [activeProfile, firstConfigId, isCreating]);
  const handleCreateClick = () => {
    if (!canEdit) {
      return;
    }
    setIsCreating(true);
    setActiveId(null);
  };
  const handleSave = async () => {
    if (!draft || !draft.transcriptionLlmConfigId) {
      return;
    }
    const resolvedChunkMs = resolveTranscriptionChunkMsForSave({
      transportMode: draft.transportMode,
      chunkMsInput: draft.chunkMs,
    });
    if (resolvedChunkMs === null) {
      return;
    }
    const trimmedName = draft.name.trim() || "Untitled";
    const normalizedLanguage = draft.language.trim() || null;
    if (isCreating) {
      const created = await createTranscriptionProfile({
        name: trimmedName,
        transcriptionLlmConfigId: draft.transcriptionLlmConfigId,
        transportMode: draft.transportMode,
        chunkMs: resolvedChunkMs,
        language: normalizedLanguage,
      });
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeProfile) {
      return;
    }
    const updated = await updateTranscriptionProfile({
      profile: {
        ...activeProfile,
        name: trimmedName,
        transcriptionLlmConfigId: draft.transcriptionLlmConfigId,
        transportMode: draft.transportMode,
        chunkMs: resolvedChunkMs,
        language: normalizedLanguage,
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };
  const handleDelete = async () => {
    if (!activeProfile) {
      return;
    }
    const deleted = await deleteTranscriptionProfile({
      profileId: activeProfile.id,
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
    if (activeProfile) {
      setDraft(buildTranscriptionProfileDraft(activeProfile));
    }
  };
  const resolvedChunkMs = draft
    ? resolveTranscriptionChunkMsForSave({
        transportMode: draft.transportMode,
        chunkMsInput: draft.chunkMs,
      })
    : null;
  const isSaveDisabled =
    !canEdit ||
    !draft ||
    !draft.transcriptionLlmConfigId ||
    resolvedChunkMs === null;
  const isDeleteDisabled = !canEdit || !activeProfile || isCreating;
  const isCancelDisabled = !draft;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          onClick={handleCreateClick}
          disabled={!canEdit}
        >
          New Profile
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new transcription profile.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
          {transcriptionProfiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No transcription profiles yet.
            </div>
          ) : (
            transcriptionProfiles.map((profile) => {
              const isActive = profile.id === activeId && !isCreating;
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
                  key={profile.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(profile.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {profile.name || "Untitled"}
                  </p>
                  <p className="truncate text-[11px] opacity-80">
                    {profile.transcriptionLlmConfigId}
                    {" · "}
                    {profile.transportMode}
                  </p>
                </button>
              );
            })
          )}
        </div>
        <div className={MANAGER_FORM_CLASS_NAME}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a transcription profile to edit.
            </div>
          ) : (
            <>
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, name: event.target.value } : prev,
                    )
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Transcription LLM Config"
                hint={
                  configGroups.some((group) => group.items.length > 0)
                    ? "Choose the provider model used for transcription."
                    : "No LLM configs available. Add one in LLM API Keys first."
                }
              >
                <IdNameCombobox
                  allItems={configGroups}
                  value={draft.transcriptionLlmConfigId}
                  small={false}
                  onSelectedItemChange={(value) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            transcriptionLlmConfigId: value ?? "",
                          }
                        : prev,
                    )
                  }
                  placeholder="Select a transcription config"
                  outerDivClasses="w-full"
                  isDisabled={!canEdit}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-3">
                <Field
                  label="Transport Mode"
                  hint="Auto uses realtime when available, otherwise file windows."
                >
                  <select
                    value={draft.transportMode}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              transportMode: event.target
                                .value as TranscriptionTransportModeValue,
                            }
                          : prev,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {transportModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Chunk (ms)"
                  hint="Used for realtime transport chunking. File mode ignores this value."
                >
                  <input
                    value={draft.chunkMs}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, chunkMs: event.target.value } : prev,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={
                      !canEdit ||
                      draft.transportMode ===
                        TranscriptionTransportModeEnum.file
                    }
                  />
                </Field>
                <Field
                  label="Language"
                  hint="Optional ISO-639-1 hint, e.g. en."
                >
                  <input
                    value={draft.language}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, language: event.target.value } : prev,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                    placeholder="auto"
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
function PromptTemplatesManager({ canEdit }: { canEdit: boolean }) {
  const { promptTemplates } = useAIStore(
    (state) => ({ promptTemplates: state.promptTemplates }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<PromptTemplateDraft | null>(null);
  const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const formatOptions = useMemo(() => Object.values(FormatEnum), []);
  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (promptTemplates.length > 0) {
        setActiveId(promptTemplates[0].id);
      }
      return;
    }
    const exists = promptTemplates.some((template) => template.id === activeId);
    if (!exists) {
      setActiveId(promptTemplates.length > 0 ? promptTemplates[0].id : null);
    }
  }, [activeId, isCreating, promptTemplates]);
  const activeTemplate = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return promptTemplates.find((template) => template.id === activeId) ?? null;
  }, [activeId, promptTemplates]);
  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        description: "",
        template: "",
        format: FormatEnum.Jinja,
        inputSchemaText: "{}",
        metadataText: "{}",
      });
      setInputSchemaError(null);
      setMetadataError(null);
      return;
    }
    if (!activeTemplate) {
      setDraft(null);
      return;
    }
    setDraft(buildPromptTemplateDraft(activeTemplate));
    setInputSchemaError(null);
    setMetadataError(null);
  }, [activeTemplate, isCreating]);
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
    const inputSchemaResult = parseJsonObject(draft.inputSchemaText);
    if (inputSchemaResult.error) {
      setInputSchemaError(inputSchemaResult.error);
      return;
    }
    const metadataResult = parseJsonObject(draft.metadataText);
    if (metadataResult.error) {
      setMetadataError(metadataResult.error);
      return;
    }
    setInputSchemaError(null);
    setMetadataError(null);
    if (isCreating) {
      const created = await createPromptTemplate({
        name: draft.name.trim(),
        description: draft.description.trim(),
        template: draft.template,
        format: draft.format,
        inputSchema: inputSchemaResult.value,
        metadata: metadataResult.value,
      });
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeTemplate) {
      return;
    }
    const updated = await updatePromptTemplate({
      template: {
        ...activeTemplate,
        name: draft.name.trim(),
        description: draft.description.trim(),
        template: draft.template,
        format: draft.format,
        inputSchema: inputSchemaResult.value,
        metadata: metadataResult.value,
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };
  const handleDelete = async () => {
    if (!activeTemplate) {
      return;
    }
    const deleted = await deletePromptTemplate({
      templateId: activeTemplate.id,
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
    if (activeTemplate) {
      setDraft(buildPromptTemplateDraft(activeTemplate));
      setInputSchemaError(null);
      setMetadataError(null);
    }
  };
  const handleFieldChange = (
    key: keyof PromptTemplateDraft,
    value: string | PromptFormatValue,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value } as PromptTemplateDraft;
    });
  };
  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeTemplate || isCreating;
  const isCancelDisabled = !draft;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          onClick={handleCreateClick}
          disabled={!canEdit}
        >
          New Template
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new prompt template.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${listClassName} @[42rem]:w-64`}>
          {promptTemplates.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No templates yet.
            </div>
          ) : (
            promptTemplates.map((template) => {
              const isActive = template.id === activeId && !isCreating;
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
                  key={template.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(template.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {template.name || "Untitled"}
                  </p>
                  {template.description ? (
                    <p className="truncate text-[11px] opacity-80">
                      {template.description}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className={formClassName}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a template to edit.
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
              <Field label="Format">
                <select
                  value={draft.format}
                  onChange={(event) =>
                    handleFieldChange(
                      "format",
                      event.target.value as PromptFormatValue,
                    )
                  }
                  className={SELECT_CLASS_NAME}
                  disabled={!canEdit}
                >
                  {formatOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Template">
                <textarea
                  value={draft.template}
                  onChange={(event) =>
                    handleFieldChange("template", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Input Schema (JSON)" error={inputSchemaError}>
                <textarea
                  value={draft.inputSchemaText}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                    handleFieldChange("inputSchemaText", event.target.value);
                    const result = parseJsonObject(event.target.value);
                    setInputSchemaError(result.error);
                  }}
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Metadata (JSON)" error={metadataError}>
                <textarea
                  value={draft.metadataText}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                    handleFieldChange("metadataText", event.target.value);
                    const result = parseJsonObject(event.target.value);
                    setMetadataError(result.error);
                  }}
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>

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
function ExternalAgentConfigsManager({ canEdit }: { canEdit: boolean }) {
  const { externalAgentConfigs } = useAIStore(
    (state) => ({ externalAgentConfigs: state.externalAgentConfigs }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ExternalAgentConfigDraft | null>(null);
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
  const defaultToolType = toolTypeOptions.length
    ? toolTypeOptions[0]
    : ToolTypeEnum.codex;
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
        runMode: RunModeEnum.sdk,
        commandPath: "",
        baseUrl: "",
        defaultModel: "",
        sandboxPolicy: "",
        approvalPolicy: "",
        settingsMode: SettingsModeEnum.managed_local,
        settingsSources: [
          ClaudeSettingsSourceEnum.project,
          ClaudeSettingsSourceEnum.local,
        ],
        settingsFilePath: "",
        settingsAllowSettaEdits: true,
        envVarWhitelistText: "",
        workingDirStrategy: WorkingDirStrategyEnum.project_root,
        workingDir: "",
        claudeAllowText: "",
        claudeAskText: DEFAULT_CLAUDE_ASK_RULES.join("\n"),
        claudeDenyText: "",
      });
      return;
    }
    if (!activeConfig) {
      setDraft(null);
      return;
    }
    setDraft(buildExternalAgentConfigDraft(activeConfig));
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
      draft.toolType === ToolTypeEnum.claude_code &&
      draft.settingsSources.length > 0
    ) {
      settingsSources = draft.settingsSources;
    }
    const settingsManagedBlock = buildSettingsManagedBlock(draft, activeConfig);
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
          toolType === ToolTypeEnum.codex &&
          prev.runMode === RunModeEnum.sdk
        ) {
          nextRunMode = RunModeEnum.app_server;
        }
        if (
          toolType !== ToolTypeEnum.codex &&
          prev.runMode === RunModeEnum.app_server
        ) {
          nextRunMode = RunModeEnum.sdk;
        }
        return { ...prev, toolType, runMode: nextRunMode };
      }
      return { ...prev, [key]: value };
    });
  };
  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeConfig || isCreating;
  const isCancelDisabled = !draft;
  const isClaudeTool = draft?.toolType === ToolTypeEnum.claude_code;
  const needsBaseUrl = draft?.runMode === RunModeEnum.server;
  const commandPathPlaceholder =
    draft?.toolType === ToolTypeEnum.codex &&
    draft?.runMode === RunModeEnum.app_server
      ? "codex"
      : "node";
  const isExplicitSettingsPath =
    draft?.settingsMode === SettingsModeEnum.explicit_path;
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
                        handleFieldChange("approvalPolicy", event.target.value)
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
                        handleFieldChange("approvalPolicy", event.target.value)
                      }
                      className={INPUT_CLASS_NAME}
                      disabled={!canEdit}
                    />
                  )}
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
function buildAgentProfileDraft(profile: AgentProfile): AgentProfileDraft {
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
function buildTranscriptionProfileDraft(
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
function buildPromptTemplateDraft(template: Template): PromptTemplateDraft {
  return {
    name: template.name ?? "",
    description: template.description ?? "",
    template: template.template ?? "",
    format: template.format,
    inputSchemaText: JSON.stringify(template.inputSchema ?? {}, null, 2),
    metadataText: JSON.stringify(template.metadata ?? {}, null, 2),
  };
}
function buildExternalAgentConfigDraft(
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
    settingsMode: config.settingsMode ?? SettingsModeEnum.managed_local,
    settingsSources:
      config.settingsSources ??
      (config.toolType === ToolTypeEnum.claude_code
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
  };
}
function buildSettingsManagedBlock(
  draft: ExternalAgentConfigDraft,
  existing: ExternalAgentConfig | null,
): ExternalAgentConfig["settingsManagedBlock"] | null {
  const existingBlock = existing?.settingsManagedBlock ?? null;
  const baseBlock: NonNullable<ExternalAgentConfig["settingsManagedBlock"]> =
    existingBlock && typeof existingBlock === "object"
      ? { ...existingBlock }
      : {};
  if (draft.toolType === ToolTypeEnum.claude_code) {
    const claudePermissions = {
      allow: parseListInput(draft.claudeAllowText),
      ask: parseListInput(draft.claudeAskText),
      deny: parseListInput(draft.claudeDenyText),
    };
    baseBlock.claude = { permissions: claudePermissions };
    return baseBlock;
  }
  return existingBlock;
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
type JsonParseResult = {
  value: Record<string, unknown>;
  error: string | null;
};
function parseJsonObject(value: string): JsonParseResult {
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

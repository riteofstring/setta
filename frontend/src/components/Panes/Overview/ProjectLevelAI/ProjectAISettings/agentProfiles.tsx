import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { PaneAccordion } from "components/Panes/Common/PaneAccordion";

import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";

import { saveSettings } from "openapi/http";

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
  deleteAgentProfile,
  updateAgentProfile,
} from "state/actions/ai";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";

import {
  FormatEnum,
  TranscriptionProfileUIConfig,
  createSettingsState,
} from "utils/generatedTypes";

import { shallow } from "zustand/shallow";

import { ExternalAgentConfigsManager } from "../ProjectAISettingsExternalAgentConfigsManager";

import { TranscriptionProfilesManager } from "../ProjectAISettingsTranscriptionProfilesManager";

import {
  PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
  type ProjectAISettingsAccordionItemValue,
  normalizeProjectAISettingsAccordionOpenValues,
} from "../projectAISettingsAccordionState";

import {
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  TEXTAREA_CLASS_NAME,
  normalizeOptionalText,
  parseListInput,
} from "../projectAISettingsShared";

import { useHydrateAgenticState } from "../useHydrateAgenticState";

import {
  PromptTemplatesManager,
  buildAgentProfileDraft,
} from "./promptTemplates";

type ProjectAISettingsAccordionItem = {
  value: ProjectAISettingsAccordionItemValue;
  title: string;
  description: string;
  triggerTestId: string;
  content: ReactNode;
};

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

type AgentProfileDraftTextKey = Exclude<
  keyof AgentProfileDraft,
  "enableBackgroundSummaryFill" | "enableLlmChatTitles"
>;

export type PromptTemplateDraft = {
  name: string;
  description: string;
  template: string;
  format: PromptFormatValue;
  inputSchemaText: string;
  metadataText: string;
};

export type PromptFormatValue = (typeof FormatEnum)[keyof typeof FormatEnum];

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
                    {profile.name || TranscriptionProfileUIConfig.defaultName}
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

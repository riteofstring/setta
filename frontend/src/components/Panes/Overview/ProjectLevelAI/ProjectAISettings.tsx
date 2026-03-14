import { PaneAccordion } from "components/Panes/Common/PaneAccordion";
import { ProjectAIAgentProfilesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAIAgentProfilesManager";
import { ProjectAIExternalAgentConfigsManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAIExternalAgentConfigsManager";
import { ProjectAIPromptTemplatesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAIPromptTemplatesManager";
import { ProjectAITranscriptionProfilesManager } from "components/Panes/Overview/ProjectLevelAI/ProjectAITranscriptionProfilesManager";
import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_save_settings } from "utils/generatedEndpoints";
import { createSettingsState } from "utils/generatedTypes";
import {
  PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
  type ProjectAISettingsAccordionItemValue,
  normalizeProjectAISettingsAccordionOpenValues,
} from "./projectAISettingsAccordionState";
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
            <ProjectAIExternalAgentConfigsManager canEdit={canEdit} />
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

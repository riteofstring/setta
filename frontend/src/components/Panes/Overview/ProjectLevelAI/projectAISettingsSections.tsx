import { PaneAccordion } from "components/Panes/Common/PaneAccordion";
import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";
import { useMemo, type ReactNode } from "react";
import type { ProjectAISettingsAccordionItemValue } from "./projectAISettingsAccordionState";
import { ProjectAISettingsAgentProfilesManager } from "./projectAISettingsAgentProfiles";
import { ExternalAgentConfigsManager } from "./projectAISettingsExternalAgents";
import { ProjectAISettingsGuardrails } from "./projectAISettingsGuardrails";
import { ProjectAISettingsPromptTemplatesManager } from "./projectAISettingsPromptTemplates";
import { ProjectAISettingsTranscriptionProfilesManager } from "./projectAISettingsTranscriptionProfiles";

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

// Owns accordion composition, deployment-mode gating, and manager routing for
// the Project AI settings surface.
export function ProjectAISettingsSections({
  canEdit,
  isDeploymentMode,
  openValues,
  onOpenValuesChange,
}: {
  canEdit: boolean;
  isDeploymentMode: boolean;
  openValues: Array<ProjectAISettingsAccordionItemValue>;
  onOpenValuesChange: (nextOpenValues: Array<string>) => void;
}) {
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
        content: <ProjectAISettingsGuardrails canEdit={canEdit} />,
      },
      {
        value: "project-ai-settings-agent-profiles",
        title: "Agent Profiles",
        description: "Create reusable agent personas and tool allowlists.",
        triggerTestId: "project-ai-settings-accordion-agent-profiles",
        content: (
          <div data-setting-anchor="core.project_ai_settings.agent_profiles">
            <ProjectAISettingsAgentProfilesManager canEdit={canEdit} />
          </div>
        ),
      },
      {
        value: "project-ai-settings-transcription-profiles",
        title: "Transcription Profiles",
        description:
          "Configure provider transcription independently of chat engines.",
        triggerTestId: "project-ai-settings-accordion-transcription-profiles",
        content: (
          <ProjectAISettingsTranscriptionProfilesManager canEdit={canEdit} />
        ),
      },
      {
        value: "project-ai-settings-prompt-templates",
        title: "Prompt Templates",
        description: "Store reusable prompt assets for Prompt sections.",
        triggerTestId: "project-ai-settings-accordion-prompt-templates",
        content: (
          <div data-setting-anchor="core.project_ai_settings.prompt_templates">
            <ProjectAISettingsPromptTemplatesManager canEdit={canEdit} />
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
    <PaneAccordion
      items={accordionItems}
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

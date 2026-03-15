import { useCallback, useMemo } from "react";
import { useProjectState, useShareSession } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES,
  normalizeProjectAISettingsAccordionOpenValues,
  type ProjectAISettingsAccordionItemValue,
} from "./projectAISettingsAccordionState";
import { ProjectAISettingsSections } from "./projectAISettingsSections";
import { useHydrateAgenticState } from "./useHydrateAgenticState";

// Owns hydration and project-scoped accordion persistence for Project AI
// settings. Section routing and CRUD managers live in local owners.
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
  const resolvedAccordionOpenValues = useMemo<
    Array<ProjectAISettingsAccordionItemValue>
  >(
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

  return (
    <div
      data-testid="project-ai-settings-scroll-region"
      className="setta-pane-scroll h-full min-h-0 space-y-3 pb-[15dvh] text-setta-700 dark:text-setta-300"
    >
      <div className="px-1 text-[11px] text-setta-500 dark:text-setta-400">
        Tune project-wide AI behavior. Non-essential sections start minimized.
      </div>
      <ProjectAISettingsSections
        canEdit={canEdit}
        isDeploymentMode={isDeploymentMode}
        openValues={resolvedAccordionOpenValues}
        onOpenValuesChange={handleAccordionOpenValuesChange}
      />
    </div>
  );
}

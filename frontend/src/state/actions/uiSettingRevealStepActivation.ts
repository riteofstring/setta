import { normalizeProjectAISettingsAccordionOpenValues } from "components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState";
import { normalizeRunInstructionsAccordionOpenValues } from "components/Panes/Overview/runInstructionsAccordionState";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import type { UISettingRevealTarget } from "utils/generatedTypes";

import {
  areStringArraysEqual,
  resolveProjectConfigIdForActivation,
} from "./uiSettingRevealActivationShared";
import type { RevealMutationDiff } from "./uiSettingRevealMutationTypes";
import { WATCH_CODE_REVEAL_SETTING_IDS } from "./uiSettingRevealShared";

export function applyRevealActivationSteps({
  target,
  fallbackProjectConfigId,
  mutationDiff,
}: {
  target: UISettingRevealTarget;
  fallbackProjectConfigId: string;
  mutationDiff: RevealMutationDiff;
}): void {
  const activationSteps = target.revealActivationSteps;
  const shouldOpenWatchCodePortal = WATCH_CODE_REVEAL_SETTING_IDS.has(
    target.settingId,
  );
  if (
    !shouldOpenWatchCodePortal &&
    (!Array.isArray(activationSteps) || activationSteps.length === 0)
  ) {
    return;
  }
  const projectConfigId = resolveProjectConfigIdForActivation(
    fallbackProjectConfigId,
  );
  useLocalStorage.setState((state) => {
    let nextRunInstructionsOpenValues =
      state.runInstructionsAccordionOpenValuesByProjectConfigId[
        projectConfigId
      ] ?? [];
    let nextProjectAiOpenValues =
      state.projectAiSettingsAccordionOpenValuesByProjectConfigId[
        projectConfigId
      ] ?? [];
    let nextProjectChatAuxViewByProjectConfigId:
      | typeof state.projectChatAuxViewByProjectConfigId
      | null = null;
    let runInstructionsChanged = false;
    let projectAiChanged = false;
    let projectChatAuxViewChanged = false;
    const currentProjectChatAuxView =
      state.projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
    let nextProjectChatAuxView = currentProjectChatAuxView;
    const watchCodePortalOpenChanged =
      shouldOpenWatchCodePortal && !state.watchCodePortalOpen;

    for (const step of activationSteps ?? []) {
      if (step.type === "run_instructions_accordion_item") {
        const normalizedOpenValues =
          normalizeRunInstructionsAccordionOpenValues([
            ...nextRunInstructionsOpenValues,
            step.itemValue,
          ]);
        if (
          !areStringArraysEqual(
            normalizedOpenValues,
            nextRunInstructionsOpenValues,
          )
        ) {
          nextRunInstructionsOpenValues = normalizedOpenValues;
          runInstructionsChanged = true;
        }
        continue;
      }
      if (step.type === "project_ai_settings_accordion_item") {
        const normalizedOpenValues =
          normalizeProjectAISettingsAccordionOpenValues([
            ...nextProjectAiOpenValues,
            step.itemValue,
          ]);
        if (
          !areStringArraysEqual(normalizedOpenValues, nextProjectAiOpenValues)
        ) {
          nextProjectAiOpenValues = normalizedOpenValues;
          projectAiChanged = true;
        }
        if (nextProjectChatAuxView !== "ai_settings") {
          nextProjectChatAuxView = "ai_settings";
          projectChatAuxViewChanged = true;
        }
      }
    }

    if (
      !runInstructionsChanged &&
      !projectAiChanged &&
      !watchCodePortalOpenChanged &&
      !projectChatAuxViewChanged
    ) {
      return state;
    }

    const nextState: Partial<typeof state> = {};
    if (watchCodePortalOpenChanged) {
      nextState.watchCodePortalOpen = true;
      mutationDiff.touchedWatchCodePortalOpen = true;
    }
    if (runInstructionsChanged) {
      nextState.runInstructionsAccordionOpenValuesByProjectConfigId = {
        ...state.runInstructionsAccordionOpenValuesByProjectConfigId,
        [projectConfigId]: nextRunInstructionsOpenValues,
      };
      mutationDiff.touchedRunInstructionsProjectConfigIds.add(projectConfigId);
    }
    if (projectAiChanged) {
      nextState.projectAiSettingsAccordionOpenValuesByProjectConfigId = {
        ...state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        [projectConfigId]: nextProjectAiOpenValues,
      };
      mutationDiff.touchedProjectAiProjectConfigIds.add(projectConfigId);
    }
    if (projectChatAuxViewChanged) {
      if (nextProjectChatAuxViewByProjectConfigId === null) {
        nextProjectChatAuxViewByProjectConfigId = {
          ...state.projectChatAuxViewByProjectConfigId,
        };
      }
      if (nextProjectChatAuxView === "none") {
        delete nextProjectChatAuxViewByProjectConfigId[projectConfigId];
      } else {
        nextProjectChatAuxViewByProjectConfigId[projectConfigId] =
          nextProjectChatAuxView;
      }
      nextState.projectChatAuxViewByProjectConfigId =
        nextProjectChatAuxViewByProjectConfigId;
      mutationDiff.touchedProjectChatAuxViewProjectConfigIds.add(
        projectConfigId,
      );
    }
    return nextState;
  });
}

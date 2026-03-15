import { normalizeProjectAISettingsAccordionOpenValues } from "components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState";
import { normalizeRunInstructionsAccordionOpenValues } from "components/Panes/Overview/runInstructionsAccordionState";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabNameEnum,
  isOverviewTabKey,
  type OverviewTabKey,
  type UIEditorTabName,
} from "utils/constants";
import type { SectionType, UISettingRevealTarget } from "utils/generatedTypes";
import { setActiveSectionIds } from "./activeSections";
import { WATCH_CODE_REVEAL_SETTING_IDS } from "./uiSettingRevealShared";

type RevealMutationDiff = {
  touchedOverviewVis: boolean;
  touchedOverviewTab: boolean;
  touchedWatchCodePortalOpen: boolean;
  touchedUiEditorVis: boolean;
  touchedUiEditorTabSectionTypes: Set<string>;
  touchedProjectChatAuxViewProjectConfigIds: Set<string>;
  touchedRunInstructionsProjectConfigIds: Set<string>;
  touchedProjectAiProjectConfigIds: Set<string>;
  touchedProjectStateActiveIdsProjectConfigIds: Set<string>;
};

export type OpenPaneResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errorMessage: string;
    };

const uiEditorTabNameValues = new Set<string>(
  Object.values(UIEditorTabNameEnum),
);

export function applyRequestedActiveSectionForReveal({
  requestedActiveSectionId,
  fallbackProjectConfigId,
  mutationDiff,
}: {
  requestedActiveSectionId: string | null;
  fallbackProjectConfigId: string;
  mutationDiff: RevealMutationDiff;
}): OpenPaneResult {
  if (requestedActiveSectionId === null) {
    return { ok: true };
  }
  const projectConfigId = resolveProjectConfigIdForActivation(
    fallbackProjectConfigId,
  );
  const projectState = useProjectState.getState();
  if (projectState.projectConfig.id !== projectConfigId) {
    return {
      ok: false,
      errorMessage:
        "UI setting reveal execution context mismatch: requested project " +
        `${projectConfigId} but active project is ${projectState.projectConfig.id}.`,
    };
  }
  if (
    areStringArraysEqual(getActiveSectionUIIds(), [requestedActiveSectionId])
  ) {
    return { ok: true };
  }
  setActiveSectionIds([requestedActiveSectionId], { syncMode: "ui-only" });
  mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.add(
    projectConfigId,
  );
  return { ok: true };
}

export function openPaneForRevealTarget(
  target: UISettingRevealTarget,
  mutationDiff: RevealMutationDiff,
): OpenPaneResult {
  if (target.side === "left") {
    const overviewTab = target.overviewTabKey;
    if (typeof overviewTab !== "string" || !isOverviewTabKey(overviewTab)) {
      return {
        ok: false,
        errorMessage: `Invalid overviewTabKey for ${target.settingId}.`,
      };
    }
    useLocalStorage.setState({
      overviewVis: true,
      overviewTab: overviewTab as OverviewTabKey,
    });
    mutationDiff.touchedOverviewVis = true;
    mutationDiff.touchedOverviewTab = true;
    return { ok: true };
  }

  const uiEditorTabName = target.uiEditorTabName;
  if (
    typeof uiEditorTabName !== "string" ||
    !uiEditorTabNameValues.has(uiEditorTabName)
  ) {
    return {
      ok: false,
      errorMessage: `Invalid uiEditorTabName for ${target.settingId}.`,
    };
  }
  const sectionType = getActiveSectionType();
  if (sectionType === null) {
    return {
      ok: false,
      errorMessage:
        "Right-pane reveal requires an active section. Provide sectionIdToActivate.",
    };
  }
  const requestedTab = uiEditorTabName as UIEditorTabName;
  const requiredTabs = REQUIRED_UI_EDITOR_TABS[sectionType];
  if (!requiredTabs.includes(requestedTab)) {
    return {
      ok: false,
      errorMessage: `Section type ${sectionType} does not support tab ${requestedTab}.`,
    };
  }
  useLocalStorage.setState((state) => ({
    uiEditorVis: true,
    uiEditorTab: {
      ...state.uiEditorTab,
      [sectionType]: requestedTab,
    },
  }));
  mutationDiff.touchedUiEditorVis = true;
  mutationDiff.touchedUiEditorTabSectionTypes.add(sectionType);
  return { ok: true };
}

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

export function areStringArraysEqual(
  left: Array<string>,
  right: Array<string>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function resolveProjectConfigIdForActivation(
  fallbackProjectConfigId: string,
): string {
  const normalizedProjectConfigId = fallbackProjectConfigId.trim();
  if (normalizedProjectConfigId === "") {
    throw new Error("UI setting reveal content is missing projectConfigId.");
  }
  return normalizedProjectConfigId;
}

function getActiveSectionType(): SectionType | null {
  const projectState = useProjectState.getState();
  const activeSectionId = getActiveSectionUIIds()[0] ?? null;
  if (activeSectionId === null) {
    return null;
  }
  const variantId =
    projectState.projectConfig.sectionVariantMap[activeSectionId];
  if (!variantId) {
    return null;
  }
  const sectionVariant = projectState.sectionVariants[variantId];
  if (!sectionVariant) {
    return null;
  }
  const sectionImpl = projectState.sectionImpls[sectionVariant.impl];
  if (!sectionImpl) {
    return null;
  }
  return sectionImpl.type;
}

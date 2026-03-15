import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { restoreRevealMutationSnapshotsIfOwned } from "./uiSettingRevealMutationRestore";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationResult,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";
import type { UISettingRevealResultStatus } from "./uiSettingRevealShared";

export function createEmptyRevealMutationDiff(): RevealMutationDiff {
  return {
    touchedOverviewVis: false,
    touchedOverviewTab: false,
    touchedWatchCodePortalOpen: false,
    touchedUiEditorVis: false,
    touchedUiEditorTabSectionTypes: new Set<string>(),
    touchedProjectChatAuxViewProjectConfigIds: new Set<string>(),
    touchedRunInstructionsProjectConfigIds: new Set<string>(),
    touchedProjectAiProjectConfigIds: new Set<string>(),
    touchedProjectStateActiveIdsProjectConfigIds: new Set<string>(),
  };
}

export function buildRevealMutationFailureResult(
  status: UISettingRevealResultStatus,
  snapshots: {
    localStorageSnapshot: RevealLocalStorageSnapshot;
    projectStateSnapshot: RevealProjectStateSnapshot;
    mutationDiff: RevealMutationDiff;
  },
): RevealMutationResult {
  restoreRevealMutationSnapshotsIfOwned({
    ...snapshots,
    postMutationLocalStorageSnapshot: captureRevealLocalStorageSnapshot(),
    postMutationProjectStateSnapshot: captureRevealProjectStateSnapshot(),
  });
  return {
    ok: false,
    status,
  };
}

export function captureRevealLocalStorageSnapshot(): RevealLocalStorageSnapshot {
  const state = useLocalStorage.getState();
  return {
    overviewVis: state.overviewVis,
    overviewTab: state.overviewTab,
    watchCodePortalOpen: state.watchCodePortalOpen,
    uiEditorVis: state.uiEditorVis,
    uiEditorTab: { ...state.uiEditorTab },
    projectChatAuxViewByProjectConfigId: {
      ...state.projectChatAuxViewByProjectConfigId,
    },
    runInstructionsAccordionOpenValuesByProjectConfigId: cloneStringArrayRecord(
      state.runInstructionsAccordionOpenValuesByProjectConfigId,
    ),
    projectAiSettingsAccordionOpenValuesByProjectConfigId:
      cloneStringArrayRecord(
        state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
      ),
  };
}

export function captureRevealProjectStateSnapshot(): RevealProjectStateSnapshot {
  const state = useProjectState.getState();
  return {
    projectConfigId: state.projectConfig.id,
    activeIds: [...getActiveSectionUIIds()],
  };
}

function cloneStringArrayRecord(
  value: Record<string, Array<string>>,
): Record<string, Array<string>> {
  const cloned: Record<string, Array<string>> = {};
  for (const [recordKey, recordValue] of Object.entries(value)) {
    cloned[recordKey] = [...recordValue];
  }
  return cloned;
}

import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  isRevealMutationOwnerMatch,
  revealMutationOwners,
} from "./uiSettingRevealMutationOwnership";
import {
  cloneStringArrayRecord,
  revertStringArrayRecordEntryIfOwned,
  revertStringRecordEntryIfOwned,
} from "./uiSettingRevealMutationRecordRestore";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
} from "./uiSettingRevealMutationTypes";

export function restoreRevealLocalStorageSnapshotIfOwned({
  snapshot,
  postMutationSnapshot,
  mutationDiff,
  leaseId,
}: {
  snapshot: RevealLocalStorageSnapshot;
  postMutationSnapshot: RevealLocalStorageSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId?: number;
}): void {
  useLocalStorage.setState((state) => {
    const nextState: Partial<typeof state> = {};
    let changed = false;

    if (
      mutationDiff.touchedOverviewVis &&
      isRevealMutationOwnerMatch(revealMutationOwners.overviewVis, leaseId) &&
      state.overviewVis === postMutationSnapshot.overviewVis
    ) {
      nextState.overviewVis = snapshot.overviewVis;
      changed = true;
    }
    if (
      mutationDiff.touchedOverviewTab &&
      isRevealMutationOwnerMatch(revealMutationOwners.overviewTab, leaseId) &&
      state.overviewTab === postMutationSnapshot.overviewTab
    ) {
      nextState.overviewTab = snapshot.overviewTab;
      changed = true;
    }
    if (
      mutationDiff.touchedWatchCodePortalOpen &&
      isRevealMutationOwnerMatch(
        revealMutationOwners.watchCodePortalOpen,
        leaseId,
      ) &&
      state.watchCodePortalOpen === postMutationSnapshot.watchCodePortalOpen
    ) {
      nextState.watchCodePortalOpen = snapshot.watchCodePortalOpen;
      changed = true;
    }
    if (
      mutationDiff.touchedUiEditorVis &&
      isRevealMutationOwnerMatch(revealMutationOwners.uiEditorVis, leaseId) &&
      state.uiEditorVis === postMutationSnapshot.uiEditorVis
    ) {
      nextState.uiEditorVis = snapshot.uiEditorVis;
      changed = true;
    }

    let nextUiEditorTab: typeof state.uiEditorTab | null = null;
    for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
      if (
        !isRevealMutationOwnerMatch(
          revealMutationOwners.uiEditorTabSectionType.get(sectionType),
          leaseId,
        )
      ) {
        continue;
      }
      const currentTab = state.uiEditorTab[sectionType];
      const postMutationTab = postMutationSnapshot.uiEditorTab[sectionType];
      if (currentTab !== postMutationTab) {
        continue;
      }
      if (nextUiEditorTab === null) {
        nextUiEditorTab = { ...state.uiEditorTab };
      }
      nextUiEditorTab[sectionType] = snapshot.uiEditorTab[sectionType];
      changed = true;
    }
    if (nextUiEditorTab !== null) {
      nextState.uiEditorTab = nextUiEditorTab;
    }

    let nextProjectChatAuxView:
      | typeof state.projectChatAuxViewByProjectConfigId
      | null = null;
    for (const projectConfigId of mutationDiff.touchedProjectChatAuxViewProjectConfigIds) {
      const didRevert = revertStringRecordEntryIfOwned({
        currentRecord: state.projectChatAuxViewByProjectConfigId,
        postMutationRecord:
          postMutationSnapshot.projectChatAuxViewByProjectConfigId,
        snapshotRecord: snapshot.projectChatAuxViewByProjectConfigId,
        recordKey: projectConfigId,
        ownerLeaseId:
          revealMutationOwners.projectChatAuxViewProjectConfigId.get(
            projectConfigId,
          ),
        leaseId,
        ensureMutableRecord: () => {
          if (nextProjectChatAuxView === null) {
            nextProjectChatAuxView = {
              ...state.projectChatAuxViewByProjectConfigId,
            };
          }
          return nextProjectChatAuxView;
        },
      });
      if (didRevert) {
        changed = true;
      }
    }
    if (nextProjectChatAuxView !== null) {
      nextState.projectChatAuxViewByProjectConfigId = nextProjectChatAuxView;
    }

    let nextRunInstructions: Record<string, Array<string>> | null = null;
    for (const projectConfigId of mutationDiff.touchedRunInstructionsProjectConfigIds) {
      const didRevert = revertStringArrayRecordEntryIfOwned({
        currentRecord:
          state.runInstructionsAccordionOpenValuesByProjectConfigId,
        postMutationRecord:
          postMutationSnapshot.runInstructionsAccordionOpenValuesByProjectConfigId,
        snapshotRecord:
          snapshot.runInstructionsAccordionOpenValuesByProjectConfigId,
        recordKey: projectConfigId,
        ownerLeaseId:
          revealMutationOwners.runInstructionsProjectConfigId.get(
            projectConfigId,
          ),
        leaseId,
        ensureMutableRecord: () => {
          if (nextRunInstructions === null) {
            nextRunInstructions = cloneStringArrayRecord(
              state.runInstructionsAccordionOpenValuesByProjectConfigId,
            );
          }
          return nextRunInstructions;
        },
      });
      if (didRevert) {
        changed = true;
      }
    }
    if (nextRunInstructions !== null) {
      nextState.runInstructionsAccordionOpenValuesByProjectConfigId =
        nextRunInstructions;
    }

    let nextProjectAiSettings: Record<string, Array<string>> | null = null;
    for (const projectConfigId of mutationDiff.touchedProjectAiProjectConfigIds) {
      const didRevert = revertStringArrayRecordEntryIfOwned({
        currentRecord:
          state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        postMutationRecord:
          postMutationSnapshot.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        snapshotRecord:
          snapshot.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        recordKey: projectConfigId,
        ownerLeaseId:
          revealMutationOwners.projectAiProjectConfigId.get(projectConfigId),
        leaseId,
        ensureMutableRecord: () => {
          if (nextProjectAiSettings === null) {
            nextProjectAiSettings = cloneStringArrayRecord(
              state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
            );
          }
          return nextProjectAiSettings;
        },
      });
      if (didRevert) {
        changed = true;
      }
    }
    if (nextProjectAiSettings !== null) {
      nextState.projectAiSettingsAccordionOpenValuesByProjectConfigId =
        nextProjectAiSettings;
    }

    if (!changed) {
      return state;
    }
    return nextState;
  });
}

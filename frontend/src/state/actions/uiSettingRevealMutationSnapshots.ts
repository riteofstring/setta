import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { restoreBackendAuthoritativeActiveSectionIds } from "./activeSections";
import { areStringArraysEqual } from "./uiSettingRevealActivation";
import {
  isRevealMutationOwnerMatch,
  revealMutationOwners,
} from "./uiSettingRevealMutationOwnership";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
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

export function restoreRevealMutationSnapshotsIfOwned({
  localStorageSnapshot,
  postMutationLocalStorageSnapshot,
  projectStateSnapshot,
  postMutationProjectStateSnapshot,
  mutationDiff,
  leaseId,
}: {
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId?: number;
}): void {
  restoreRevealLocalStorageSnapshotIfOwned({
    snapshot: localStorageSnapshot,
    postMutationSnapshot: postMutationLocalStorageSnapshot,
    mutationDiff,
    leaseId,
  });
  restoreRevealProjectStateSnapshotIfOwned({
    snapshot: projectStateSnapshot,
    postMutationSnapshot: postMutationProjectStateSnapshot,
    mutationDiff,
    leaseId,
  });
}

export function rollbackRevealMutationSnapshotsForLease(
  mutationLease: RevealMutationLease,
): void {
  restoreRevealMutationSnapshotsIfOwned(mutationLease);
}

function restoreRevealLocalStorageSnapshotIfOwned({
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

function restoreRevealProjectStateSnapshotIfOwned({
  snapshot,
  postMutationSnapshot,
  mutationDiff,
  leaseId,
}: {
  snapshot: RevealProjectStateSnapshot;
  postMutationSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId?: number;
}): void {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (
    !mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.has(
      projectConfigId,
    )
  ) {
    return;
  }
  if (
    !isRevealMutationOwnerMatch(
      revealMutationOwners.projectStateActiveIdsProjectConfigId.get(
        projectConfigId,
      ),
      leaseId,
    )
  ) {
    return;
  }
  if (projectConfigId !== postMutationSnapshot.projectConfigId) {
    return;
  }
  if (
    !areStringArraysEqual(
      getActiveSectionUIIds(),
      postMutationSnapshot.activeIds,
    )
  ) {
    return;
  }
  restoreBackendAuthoritativeActiveSectionIds(snapshot.activeIds);
}

function revertStringArrayRecordEntryIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  recordKey,
  ownerLeaseId,
  leaseId,
  ensureMutableRecord,
}: {
  currentRecord: Record<string, Array<string>>;
  postMutationRecord: Record<string, Array<string>>;
  snapshotRecord: Record<string, Array<string>>;
  recordKey: string;
  ownerLeaseId: number | undefined;
  leaseId: number | undefined;
  ensureMutableRecord: () => Record<string, Array<string>>;
}): boolean {
  if (!isRevealMutationOwnerMatch(ownerLeaseId, leaseId)) {
    return false;
  }
  const currentEntry = currentRecord[recordKey];
  const postMutationEntry = postMutationRecord[recordKey];
  if (!areOptionalStringArraysEqual(currentEntry, postMutationEntry)) {
    return false;
  }
  const mutableRecord = ensureMutableRecord();
  const snapshotEntry = snapshotRecord[recordKey];
  if (snapshotEntry === undefined) {
    delete mutableRecord[recordKey];
    return true;
  }
  mutableRecord[recordKey] = [...snapshotEntry];
  return true;
}

function revertStringRecordEntryIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  recordKey,
  ownerLeaseId,
  leaseId,
  ensureMutableRecord,
}: {
  currentRecord: Record<string, string>;
  postMutationRecord: Record<string, string>;
  snapshotRecord: Record<string, string>;
  recordKey: string;
  ownerLeaseId: number | undefined;
  leaseId: number | undefined;
  ensureMutableRecord: () => Record<string, string>;
}): boolean {
  if (!isRevealMutationOwnerMatch(ownerLeaseId, leaseId)) {
    return false;
  }
  const currentEntry = currentRecord[recordKey];
  const postMutationEntry = postMutationRecord[recordKey];
  if (currentEntry !== postMutationEntry) {
    return false;
  }
  const mutableRecord = ensureMutableRecord();
  const snapshotEntry = snapshotRecord[recordKey];
  if (snapshotEntry === undefined) {
    delete mutableRecord[recordKey];
    return true;
  }
  mutableRecord[recordKey] = snapshotEntry;
  return true;
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

function areOptionalStringArraysEqual(
  left: Array<string> | undefined,
  right: Array<string> | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return areStringArraysEqual(left, right);
}

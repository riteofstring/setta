import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import type { UISettingRevealTarget } from "utils/generatedTypes";
import { restoreBackendAuthoritativeActiveSectionIds } from "./activeSections";
import {
  applyRequestedActiveSectionForReveal,
  applyRevealActivationSteps,
  areStringArraysEqual,
  openPaneForRevealTarget,
} from "./uiSettingRevealActivation";
import {
  buildExecutionContextMismatchStatus,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";

type LocalStorageState = ReturnType<typeof useLocalStorage.getState>;

type RevealLocalStorageSnapshot = {
  overviewVis: LocalStorageState["overviewVis"];
  overviewTab: LocalStorageState["overviewTab"];
  watchCodePortalOpen: LocalStorageState["watchCodePortalOpen"];
  uiEditorVis: LocalStorageState["uiEditorVis"];
  uiEditorTab: LocalStorageState["uiEditorTab"];
  projectChatAuxViewByProjectConfigId: LocalStorageState["projectChatAuxViewByProjectConfigId"];
  runInstructionsAccordionOpenValuesByProjectConfigId: LocalStorageState["runInstructionsAccordionOpenValuesByProjectConfigId"];
  projectAiSettingsAccordionOpenValuesByProjectConfigId: LocalStorageState["projectAiSettingsAccordionOpenValuesByProjectConfigId"];
};

type RevealProjectStateSnapshot = {
  projectConfigId: string;
  activeIds: Array<string>;
};

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

export type RevealMutationLease = {
  leaseId: number;
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
};

export type RevealMutationResult =
  | {
      ok: true;
      lease: RevealMutationLease;
    }
  | {
      ok: false;
      status: UISettingRevealResultStatus;
    };

let revealMutationLock: Promise<void> = Promise.resolve();
let revealMutationSequence = 0;
let revealMutationOwnerForOverviewVis: number | null = null;
let revealMutationOwnerForOverviewTab: number | null = null;
let revealMutationOwnerForWatchCodePortalOpen: number | null = null;
let revealMutationOwnerForUiEditorVis: number | null = null;
const revealMutationOwnerByUiEditorTabSectionType = new Map<string, number>();
const revealMutationOwnerByProjectChatAuxViewProjectConfigId = new Map<
  string,
  number
>();
const revealMutationOwnerByRunInstructionsProjectConfigId = new Map<
  string,
  number
>();
const revealMutationOwnerByProjectAiProjectConfigId = new Map<string, number>();
const revealMutationOwnerByProjectStateActiveIdsProjectConfigId = new Map<
  string,
  number
>();

export async function applyRevealMutationsWithLease({
  target,
  fallbackProjectConfigId,
  requestedActiveSectionId,
  executionContext,
}: {
  target: UISettingRevealTarget;
  fallbackProjectConfigId: string;
  requestedActiveSectionId: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<RevealMutationResult> {
  return runWithRevealMutationLock(async () => {
    const startMismatch = resolveRevealExecutionMismatch(executionContext);
    if (startMismatch !== null) {
      return {
        ok: false,
        status: buildExecutionContextMismatchStatus(
          target.settingId,
          startMismatch.message,
        ),
      };
    }
    const localStorageSnapshot = captureRevealLocalStorageSnapshot();
    const projectStateSnapshot = captureRevealProjectStateSnapshot();
    const mutationDiff = createEmptyRevealMutationDiff();
    const buildMutationFailureResult = (
      status: UISettingRevealResultStatus,
    ): RevealMutationResult => {
      const postMutationLocalStorageSnapshot =
        captureRevealLocalStorageSnapshot();
      const postMutationProjectStateSnapshot =
        captureRevealProjectStateSnapshot();
      restoreRevealMutationSnapshotsIfOwned({
        localStorageSnapshot,
        postMutationLocalStorageSnapshot,
        projectStateSnapshot,
        postMutationProjectStateSnapshot,
        mutationDiff,
      });
      return {
        ok: false,
        status,
      };
    };

    const requestedSectionActivationResult =
      applyRequestedActiveSectionForReveal({
        requestedActiveSectionId,
        fallbackProjectConfigId,
        mutationDiff,
      });
    if (!requestedSectionActivationResult.ok) {
      return buildMutationFailureResult({
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: requestedSectionActivationResult.errorMessage,
      });
    }

    const opened = openPaneForRevealTarget(target, mutationDiff);
    if (!opened.ok) {
      return buildMutationFailureResult({
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: opened.errorMessage,
      });
    }

    const postPaneMismatch = resolveRevealExecutionMismatch(executionContext);
    if (postPaneMismatch !== null) {
      return buildMutationFailureResult(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postPaneMismatch.message,
        ),
      );
    }

    applyRevealActivationSteps({
      target,
      fallbackProjectConfigId,
      mutationDiff,
    });
    const postActivationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postActivationMismatch !== null) {
      return buildMutationFailureResult(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postActivationMismatch.message,
        ),
      );
    }

    const postMutationLocalStorageSnapshot =
      captureRevealLocalStorageSnapshot();
    const postMutationProjectStateSnapshot =
      captureRevealProjectStateSnapshot();
    return {
      ok: true,
      lease: registerRevealMutationLease(
        localStorageSnapshot,
        postMutationLocalStorageSnapshot,
        projectStateSnapshot,
        postMutationProjectStateSnapshot,
        mutationDiff,
      ),
    };
  });
}

export async function rollbackRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    restoreRevealMutationSnapshotsIfOwned(mutationLease);
  });
}

export async function finalizeRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    clearRevealMutationOwnershipForLease(mutationLease);
  });
}

function createEmptyRevealMutationDiff(): RevealMutationDiff {
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

function registerRevealMutationLease(
  localStorageSnapshot: RevealLocalStorageSnapshot,
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot,
  projectStateSnapshot: RevealProjectStateSnapshot,
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot,
  mutationDiff: RevealMutationDiff,
): RevealMutationLease {
  revealMutationSequence += 1;
  const lease = {
    leaseId: revealMutationSequence,
    localStorageSnapshot,
    postMutationLocalStorageSnapshot,
    projectStateSnapshot,
    postMutationProjectStateSnapshot,
    mutationDiff,
  };
  recordRevealMutationOwnership(lease);
  return lease;
}

function captureRevealLocalStorageSnapshot(): RevealLocalStorageSnapshot {
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

function captureRevealProjectStateSnapshot(): RevealProjectStateSnapshot {
  const state = useProjectState.getState();
  return {
    projectConfigId: state.projectConfig.id,
    activeIds: [...getActiveSectionUIIds()],
  };
}

function recordRevealMutationOwnership({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  if (mutationDiff.touchedOverviewVis) {
    revealMutationOwnerForOverviewVis = leaseId;
  }
  if (mutationDiff.touchedOverviewTab) {
    revealMutationOwnerForOverviewTab = leaseId;
  }
  if (mutationDiff.touchedWatchCodePortalOpen) {
    revealMutationOwnerForWatchCodePortalOpen = leaseId;
  }
  if (mutationDiff.touchedUiEditorVis) {
    revealMutationOwnerForUiEditorVis = leaseId;
  }
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    revealMutationOwnerByUiEditorTabSectionType.set(sectionType, leaseId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectChatAuxViewProjectConfigIds) {
    revealMutationOwnerByProjectChatAuxViewProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedRunInstructionsProjectConfigIds) {
    revealMutationOwnerByRunInstructionsProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedProjectAiProjectConfigIds) {
    revealMutationOwnerByProjectAiProjectConfigId.set(projectConfigId, leaseId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectStateActiveIdsProjectConfigIds) {
    revealMutationOwnerByProjectStateActiveIdsProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
}

function clearRevealMutationOwnershipForLease({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  if (
    mutationDiff.touchedOverviewVis &&
    revealMutationOwnerForOverviewVis === leaseId
  ) {
    revealMutationOwnerForOverviewVis = null;
  }
  if (
    mutationDiff.touchedOverviewTab &&
    revealMutationOwnerForOverviewTab === leaseId
  ) {
    revealMutationOwnerForOverviewTab = null;
  }
  if (
    mutationDiff.touchedWatchCodePortalOpen &&
    revealMutationOwnerForWatchCodePortalOpen === leaseId
  ) {
    revealMutationOwnerForWatchCodePortalOpen = null;
  }
  if (
    mutationDiff.touchedUiEditorVis &&
    revealMutationOwnerForUiEditorVis === leaseId
  ) {
    revealMutationOwnerForUiEditorVis = null;
  }
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    if (
      revealMutationOwnerByUiEditorTabSectionType.get(sectionType) !== leaseId
    ) {
      continue;
    }
    revealMutationOwnerByUiEditorTabSectionType.delete(sectionType);
  }
  for (const projectConfigId of mutationDiff.touchedProjectChatAuxViewProjectConfigIds) {
    if (
      revealMutationOwnerByProjectChatAuxViewProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwnerByProjectChatAuxViewProjectConfigId.delete(
      projectConfigId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedRunInstructionsProjectConfigIds) {
    if (
      revealMutationOwnerByRunInstructionsProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwnerByRunInstructionsProjectConfigId.delete(projectConfigId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectAiProjectConfigIds) {
    if (
      revealMutationOwnerByProjectAiProjectConfigId.get(projectConfigId) !==
      leaseId
    ) {
      continue;
    }
    revealMutationOwnerByProjectAiProjectConfigId.delete(projectConfigId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectStateActiveIdsProjectConfigIds) {
    if (
      revealMutationOwnerByProjectStateActiveIdsProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwnerByProjectStateActiveIdsProjectConfigId.delete(
      projectConfigId,
    );
  }
}

function restoreRevealMutationSnapshotsIfOwned({
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
      isRevealMutationOwnerMatch(revealMutationOwnerForOverviewVis, leaseId) &&
      state.overviewVis === postMutationSnapshot.overviewVis
    ) {
      nextState.overviewVis = snapshot.overviewVis;
      changed = true;
    }
    if (
      mutationDiff.touchedOverviewTab &&
      isRevealMutationOwnerMatch(revealMutationOwnerForOverviewTab, leaseId) &&
      state.overviewTab === postMutationSnapshot.overviewTab
    ) {
      nextState.overviewTab = snapshot.overviewTab;
      changed = true;
    }
    if (
      mutationDiff.touchedWatchCodePortalOpen &&
      isRevealMutationOwnerMatch(
        revealMutationOwnerForWatchCodePortalOpen,
        leaseId,
      ) &&
      state.watchCodePortalOpen === postMutationSnapshot.watchCodePortalOpen
    ) {
      nextState.watchCodePortalOpen = snapshot.watchCodePortalOpen;
      changed = true;
    }
    if (
      mutationDiff.touchedUiEditorVis &&
      isRevealMutationOwnerMatch(revealMutationOwnerForUiEditorVis, leaseId) &&
      state.uiEditorVis === postMutationSnapshot.uiEditorVis
    ) {
      nextState.uiEditorVis = snapshot.uiEditorVis;
      changed = true;
    }

    let nextUiEditorTab: typeof state.uiEditorTab | null = null;
    for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
      if (
        !isRevealMutationOwnerMatch(
          revealMutationOwnerByUiEditorTabSectionType.get(sectionType),
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
          revealMutationOwnerByProjectChatAuxViewProjectConfigId.get(
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
          revealMutationOwnerByRunInstructionsProjectConfigId.get(
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
          revealMutationOwnerByProjectAiProjectConfigId.get(projectConfigId),
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
      revealMutationOwnerByProjectStateActiveIdsProjectConfigId.get(
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

function isRevealMutationOwnerMatch(
  ownerLeaseId: number | undefined | null,
  leaseId: number | undefined,
): boolean {
  if (leaseId === undefined) {
    return true;
  }
  return ownerLeaseId === leaseId;
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

async function runWithRevealMutationLock<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  const previousLock = revealMutationLock;
  let releaseCurrentLock: (() => void) | null = null;
  revealMutationLock = new Promise<void>((resolve) => {
    releaseCurrentLock = resolve;
  });
  await previousLock;
  try {
    return await operation();
  } finally {
    if (releaseCurrentLock !== null) {
      releaseCurrentLock();
    }
  }
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

import { usePluginRuntimeStore } from "plugins/runtime";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useLocalStorage, useProjectState } from "state/definitions";

import { isOverviewTabKey, type OverviewTabKey } from "utils/constants";

import {
  RequiredUIEditorTabs,
  type UIEditorTabName,
  type UISettingRevealTarget,
} from "utils/generatedTypes";

import {
  restoreBackendAuthoritativeActiveSectionIds,
  setActiveSectionIds,
} from "./activeSections";

import {
  FIND_TARGET_INTERVAL_MS,
  LocalStorageState,
  OpenPaneResult,
  PluginRevealIterationResult,
  PluginRevealLoopContext,
  PluginRevealPendingResult,
  PluginRevealResult,
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
  RevealProjectStateSnapshot,
  UISettingRevealExecutionContext,
  setRevealMutationScalarOwnerIfTouched,
  uiEditorTabNameValues,
} from "./targetParsingAndReveal";

import {
  areOptionalStringArraysEqual,
  areStringArraysEqual,
  attemptPendingPluginReveal,
  getActiveSectionType,
  resolveProjectConfigIdForActivation,
  resolveRevealExecutionMismatch,
  sleep,
} from "./pluginRevealAndDom";

export let revealMutationLock: Promise<void> = Promise.resolve();

export let revealMutationOwnerForOverviewVis: number | null = null;

export let revealMutationOwnerForOverviewTab: number | null = null;

export let revealMutationOwnerForUiEditorVis: number | null = null;

export const revealMutationOwnerByUiEditorTabSectionType = new Map<
  string,
  number
>();

export const revealMutationOwnerByProjectChatAuxViewProjectConfigId = new Map<
  string,
  number
>();

export const revealMutationOwnerByRunInstructionsProjectConfigId = new Map<
  string,
  number
>();

export const revealMutationOwnerByProjectAiProjectConfigId = new Map<
  string,
  number
>();

export const revealMutationOwnerByProjectStateActiveIdsProjectConfigId =
  new Map<string, number>();

export function recordRevealMutationOwnership({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  setRevealMutationScalarOwnerIfTouched(
    mutationDiff.touchedOverviewVis,
    leaseId,
    (nextLeaseId) => {
      revealMutationOwnerForOverviewVis = nextLeaseId;
    },
  );
  setRevealMutationScalarOwnerIfTouched(
    mutationDiff.touchedOverviewTab,
    leaseId,
    (nextLeaseId) => {
      revealMutationOwnerForOverviewTab = nextLeaseId;
    },
  );
  setRevealMutationScalarOwnerIfTouched(
    mutationDiff.touchedUiEditorVis,
    leaseId,
    (nextLeaseId) => {
      revealMutationOwnerForUiEditorVis = nextLeaseId;
    },
  );
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

export function clearRevealMutationScalarOwnerIfOwned({
  wasTouched,
  ownerLeaseId,
  leaseId,
  clear,
}: {
  wasTouched: boolean;
  ownerLeaseId: number | null;
  leaseId: number;
  clear: () => void;
}): void {
  if (!wasTouched || ownerLeaseId !== leaseId) {
    return;
  }
  clear();
}

export function clearRevealMutationOwnershipForKeys(
  touchedKeys: Iterable<string>,
  ownerMap: Map<string, number>,
  leaseId: number,
): void {
  for (const touchedKey of touchedKeys) {
    if (ownerMap.get(touchedKey) === leaseId) {
      ownerMap.delete(touchedKey);
    }
  }
}

export function clearRevealMutationOwnershipForLease({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  clearRevealMutationScalarOwnerIfOwned({
    wasTouched: mutationDiff.touchedOverviewVis,
    ownerLeaseId: revealMutationOwnerForOverviewVis,
    leaseId,
    clear: () => {
      revealMutationOwnerForOverviewVis = null;
    },
  });
  clearRevealMutationScalarOwnerIfOwned({
    wasTouched: mutationDiff.touchedOverviewTab,
    ownerLeaseId: revealMutationOwnerForOverviewTab,
    leaseId,
    clear: () => {
      revealMutationOwnerForOverviewTab = null;
    },
  });
  clearRevealMutationScalarOwnerIfOwned({
    wasTouched: mutationDiff.touchedUiEditorVis,
    ownerLeaseId: revealMutationOwnerForUiEditorVis,
    leaseId,
    clear: () => {
      revealMutationOwnerForUiEditorVis = null;
    },
  });
  clearRevealMutationOwnershipForKeys(
    mutationDiff.touchedUiEditorTabSectionTypes,
    revealMutationOwnerByUiEditorTabSectionType,
    leaseId,
  );
  clearRevealMutationOwnershipForKeys(
    mutationDiff.touchedProjectChatAuxViewProjectConfigIds,
    revealMutationOwnerByProjectChatAuxViewProjectConfigId,
    leaseId,
  );
  clearRevealMutationOwnershipForKeys(
    mutationDiff.touchedRunInstructionsProjectConfigIds,
    revealMutationOwnerByRunInstructionsProjectConfigId,
    leaseId,
  );
  clearRevealMutationOwnershipForKeys(
    mutationDiff.touchedProjectAiProjectConfigIds,
    revealMutationOwnerByProjectAiProjectConfigId,
    leaseId,
  );
  clearRevealMutationOwnershipForKeys(
    mutationDiff.touchedProjectStateActiveIdsProjectConfigIds,
    revealMutationOwnerByProjectStateActiveIdsProjectConfigId,
    leaseId,
  );
}

export function shouldRestoreRevealLocalStorageValue<T>({
  wasTouched,
  ownerLeaseId,
  leaseId,
  currentValue,
  postMutationValue,
}: {
  wasTouched: boolean;
  ownerLeaseId: number | undefined | null;
  leaseId: number | undefined;
  currentValue: T;
  postMutationValue: T;
}): boolean {
  return (
    wasTouched &&
    isRevealMutationOwnerMatch(ownerLeaseId, leaseId) &&
    currentValue === postMutationValue
  );
}

export function restoreScalarRevealLocalStorageFieldsIfOwned({
  state,
  snapshot,
  postMutationSnapshot,
  mutationDiff,
  leaseId,
}: {
  state: LocalStorageState;
  snapshot: RevealLocalStorageSnapshot;
  postMutationSnapshot: RevealLocalStorageSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId: number | undefined;
}): Partial<LocalStorageState> {
  const nextState: Partial<LocalStorageState> = {};
  if (
    shouldRestoreRevealLocalStorageValue({
      wasTouched: mutationDiff.touchedOverviewVis,
      ownerLeaseId: revealMutationOwnerForOverviewVis,
      leaseId,
      currentValue: state.overviewVis,
      postMutationValue: postMutationSnapshot.overviewVis,
    })
  ) {
    nextState.overviewVis = snapshot.overviewVis;
  }
  if (
    shouldRestoreRevealLocalStorageValue({
      wasTouched: mutationDiff.touchedOverviewTab,
      ownerLeaseId: revealMutationOwnerForOverviewTab,
      leaseId,
      currentValue: state.overviewTab,
      postMutationValue: postMutationSnapshot.overviewTab,
    })
  ) {
    nextState.overviewTab = snapshot.overviewTab;
  }
  if (
    shouldRestoreRevealLocalStorageValue({
      wasTouched: mutationDiff.touchedUiEditorVis,
      ownerLeaseId: revealMutationOwnerForUiEditorVis,
      leaseId,
      currentValue: state.uiEditorVis,
      postMutationValue: postMutationSnapshot.uiEditorVis,
    })
  ) {
    nextState.uiEditorVis = snapshot.uiEditorVis;
  }
  return nextState;
}

export function restoreRevealUiEditorTabsIfOwned({
  state,
  snapshot,
  postMutationSnapshot,
  mutationDiff,
  leaseId,
}: {
  state: LocalStorageState;
  snapshot: RevealLocalStorageSnapshot;
  postMutationSnapshot: RevealLocalStorageSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId: number | undefined;
}): LocalStorageState["uiEditorTab"] | null {
  let nextUiEditorTab: LocalStorageState["uiEditorTab"] | null = null;
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    if (
      !shouldRestoreRevealLocalStorageValue({
        wasTouched: true,
        ownerLeaseId:
          revealMutationOwnerByUiEditorTabSectionType.get(sectionType),
        leaseId,
        currentValue: state.uiEditorTab[sectionType],
        postMutationValue: postMutationSnapshot.uiEditorTab[sectionType],
      })
    ) {
      continue;
    }
    if (nextUiEditorTab === null) {
      nextUiEditorTab = { ...state.uiEditorTab };
    }
    nextUiEditorTab[sectionType] = snapshot.uiEditorTab[sectionType];
  }
  return nextUiEditorTab;
}

export function restoreRevealStringRecordIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  touchedKeys,
  ownerMap,
  leaseId,
}: {
  currentRecord: Record<string, string>;
  postMutationRecord: Record<string, string>;
  snapshotRecord: Record<string, string>;
  touchedKeys: Iterable<string>;
  ownerMap: Map<string, number>;
  leaseId: number | undefined;
}): Record<string, string> | null {
  let nextRecord: Record<string, string> | null = null;
  for (const recordKey of touchedKeys) {
    revertStringRecordEntryIfOwned({
      currentRecord,
      postMutationRecord,
      snapshotRecord,
      recordKey,
      ownerLeaseId: ownerMap.get(recordKey),
      leaseId,
      ensureMutableRecord: () => {
        if (nextRecord === null) {
          nextRecord = { ...currentRecord };
        }
        return nextRecord;
      },
    });
  }
  return nextRecord;
}

export function restoreRevealStringArrayRecordIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  touchedKeys,
  ownerMap,
  leaseId,
}: {
  currentRecord: Record<string, Array<string>>;
  postMutationRecord: Record<string, Array<string>>;
  snapshotRecord: Record<string, Array<string>>;
  touchedKeys: Iterable<string>;
  ownerMap: Map<string, number>;
  leaseId: number | undefined;
}): Record<string, Array<string>> | null {
  let nextRecord: Record<string, Array<string>> | null = null;
  for (const recordKey of touchedKeys) {
    revertStringArrayRecordEntryIfOwned({
      currentRecord,
      postMutationRecord,
      snapshotRecord,
      recordKey,
      ownerLeaseId: ownerMap.get(recordKey),
      leaseId,
      ensureMutableRecord: () => {
        if (nextRecord === null) {
          nextRecord = cloneStringArrayRecord(currentRecord);
        }
        return nextRecord;
      },
    });
  }
  return nextRecord;
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
    const nextState = restoreScalarRevealLocalStorageFieldsIfOwned({
      state,
      snapshot,
      postMutationSnapshot,
      mutationDiff,
      leaseId,
    });
    const nextUiEditorTab = restoreRevealUiEditorTabsIfOwned({
      state,
      snapshot,
      postMutationSnapshot,
      mutationDiff,
      leaseId,
    });
    if (nextUiEditorTab !== null) {
      nextState.uiEditorTab = nextUiEditorTab;
    }
    const nextProjectChatAuxViewByProjectConfigId =
      restoreRevealStringRecordIfOwned({
        currentRecord: state.projectChatAuxViewByProjectConfigId,
        postMutationRecord:
          postMutationSnapshot.projectChatAuxViewByProjectConfigId,
        snapshotRecord: snapshot.projectChatAuxViewByProjectConfigId,
        touchedKeys: mutationDiff.touchedProjectChatAuxViewProjectConfigIds,
        ownerMap: revealMutationOwnerByProjectChatAuxViewProjectConfigId,
        leaseId,
      });
    if (nextProjectChatAuxViewByProjectConfigId !== null) {
      nextState.projectChatAuxViewByProjectConfigId =
        nextProjectChatAuxViewByProjectConfigId;
    }
    const nextRunInstructions = restoreRevealStringArrayRecordIfOwned({
      currentRecord: state.runInstructionsAccordionOpenValuesByProjectConfigId,
      postMutationRecord:
        postMutationSnapshot.runInstructionsAccordionOpenValuesByProjectConfigId,
      snapshotRecord:
        snapshot.runInstructionsAccordionOpenValuesByProjectConfigId,
      touchedKeys: mutationDiff.touchedRunInstructionsProjectConfigIds,
      ownerMap: revealMutationOwnerByRunInstructionsProjectConfigId,
      leaseId,
    });
    if (nextRunInstructions !== null) {
      nextState.runInstructionsAccordionOpenValuesByProjectConfigId =
        nextRunInstructions;
    }
    const nextProjectAiSettings = restoreRevealStringArrayRecordIfOwned({
      currentRecord:
        state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
      postMutationRecord:
        postMutationSnapshot.projectAiSettingsAccordionOpenValuesByProjectConfigId,
      snapshotRecord:
        snapshot.projectAiSettingsAccordionOpenValuesByProjectConfigId,
      touchedKeys: mutationDiff.touchedProjectAiProjectConfigIds,
      ownerMap: revealMutationOwnerByProjectAiProjectConfigId,
      leaseId,
    });
    if (nextProjectAiSettings !== null) {
      nextState.projectAiSettingsAccordionOpenValuesByProjectConfigId =
        nextProjectAiSettings;
    }
    if (Object.keys(nextState).length === 0) {
      return state;
    }
    return nextState;
  });
}

export function restoreRevealProjectStateSnapshotIfOwned({
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

export function isRevealMutationOwnerMatch(
  ownerLeaseId: number | undefined | null,
  leaseId: number | undefined,
): boolean {
  if (leaseId === undefined) {
    return true;
  }
  return ownerLeaseId === leaseId;
}

export function revertStringArrayRecordEntryIfOwned({
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

export function revertStringRecordEntryIfOwned({
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

export function cloneStringArrayRecord(
  value: Record<string, Array<string>>,
): Record<string, Array<string>> {
  const cloned: Record<string, Array<string>> = {};
  for (const [recordKey, recordValue] of Object.entries(value)) {
    cloned[recordKey] = [...recordValue];
  }
  return cloned;
}

export async function runWithRevealMutationLock<T>(
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
    return openLeftPaneForRevealTarget(target, mutationDiff);
  }
  return openRightPaneForRevealTarget(target, mutationDiff);
}

export function openLeftPaneForRevealTarget(
  target: UISettingRevealTarget,
  mutationDiff: RevealMutationDiff,
): OpenPaneResult {
  const overviewTab = target.overviewTabKey;
  if (target.strategy === "plugin_handler" && overviewTab === null) {
    return { ok: true };
  }
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

export function openRightPaneForRevealTarget(
  target: UISettingRevealTarget,
  mutationDiff: RevealMutationDiff,
): OpenPaneResult {
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
  const requiredTabs = RequiredUIEditorTabs[
    sectionType
  ] as readonly UIEditorTabName[];
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

export async function revealWithPluginHandler(
  target: UISettingRevealTarget,
  deadlineMs: number,
  executionContext: UISettingRevealExecutionContext | null,
): Promise<PluginRevealResult> {
  if (!canRevealWithPluginHandler(target)) {
    return {
      ok: false,
      errorMessage: null,
    };
  }
  let latestErrorMessage: string | null = null;
  while (true) {
    const iterationResult = await runPluginRevealIteration({
      target,
      deadlineMs,
      executionContext,
    });
    if (iterationResult.result !== null) {
      return iterationResult.result;
    }
    latestErrorMessage =
      iterationResult.latestErrorMessage ?? latestErrorMessage;
    if (iterationResult.waitMs === null) {
      break;
    }
    await sleep(iterationResult.waitMs);
  }
  latestErrorMessage ??= `Plugin pane for ${target.settingId} did not become available before reveal timeout.`;
  return {
    ok: false,
    errorMessage: latestErrorMessage,
  };
}

export function canRevealWithPluginHandler(
  target: UISettingRevealTarget,
): boolean {
  return Boolean(target.pluginId) && Boolean(target.pluginRevealKey);
}

export function shouldContinuePluginRevealPolling(
  pendingResult: PluginRevealPendingResult,
  remainingMs: number,
): boolean {
  return !pendingResult.stop && remainingMs > 0;
}

export async function runPluginRevealIteration({
  target,
  deadlineMs,
  executionContext,
}: {
  target: UISettingRevealTarget;
  deadlineMs: number;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<PluginRevealIterationResult> {
  const loopContext = getPluginRevealLoopContext(deadlineMs, executionContext);
  if (loopContext.result !== null) {
    return {
      latestErrorMessage: null,
      result: loopContext.result,
      waitMs: null,
    };
  }
  if (loopContext.remainingMs <= 0) {
    return {
      latestErrorMessage: null,
      result: null,
      waitMs: null,
    };
  }
  const pendingResult = await attemptPendingPluginReveal({
    target,
    remainingMs: loopContext.remainingMs,
  });
  if (pendingResult.result !== null) {
    return {
      latestErrorMessage: pendingResult.latestErrorMessage,
      result: pendingResult.result,
      waitMs: null,
    };
  }
  const postAttemptContext = getPluginRevealLoopContext(
    deadlineMs,
    executionContext,
  );
  if (postAttemptContext.result !== null) {
    return {
      latestErrorMessage: pendingResult.latestErrorMessage,
      result: postAttemptContext.result,
      waitMs: null,
    };
  }
  if (
    !shouldContinuePluginRevealPolling(
      pendingResult,
      postAttemptContext.remainingMs,
    )
  ) {
    return {
      latestErrorMessage: pendingResult.latestErrorMessage,
      result: null,
      waitMs: null,
    };
  }
  return {
    latestErrorMessage: pendingResult.latestErrorMessage,
    result: null,
    waitMs: Math.min(FIND_TARGET_INTERVAL_MS, postAttemptContext.remainingMs),
  };
}

export function getPluginRevealLoopContext(
  deadlineMs: number,
  executionContext: UISettingRevealExecutionContext | null,
): PluginRevealLoopContext {
  const revealExecutionMismatch =
    resolveRevealExecutionMismatch(executionContext);
  if (revealExecutionMismatch !== null) {
    return {
      remainingMs: 0,
      result: {
        ok: false,
        errorMessage: revealExecutionMismatch.message,
      },
    };
  }
  return {
    remainingMs: deadlineMs - Date.now(),
    result: null,
  };
}

export function pluginRevealTargetCanRegisterHandler(
  target: UISettingRevealTarget,
): boolean {
  if (target.paneId === null || target.overviewTabKey === null) {
    return true;
  }
  return usePluginRuntimeStore
    .getState()
    .sortedPaneTabs.some((tab) => tab.tabKey === target.overviewTabKey);
}

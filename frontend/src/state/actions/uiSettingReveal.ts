import { normalizeProjectAISettingsAccordionOpenValues } from "components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState";
import { normalizeRunInstructionsAccordionOpenValues } from "components/Panes/Overview/runInstructionsAccordionState";
import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { useLocalStorage, useProjectState } from "state/definitions";
import {
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabNameEnum,
  isOverviewTabKey,
  type OverviewTabKey,
  type UIEditorTabName,
} from "utils/constants";
import type {
  SectionType,
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";

const DEFAULT_DURATION_MS = 3000;
const MAX_DURATION_MS = 10000;
const FIND_TARGET_INTERVAL_MS = 50;
const HIGHLIGHT_CLASS_NAME = "setta-ui-setting-reveal-highlight";

const highlightTimeoutByElement = new WeakMap<HTMLElement, number>();
const uiEditorTabNameValues = new Set<string>(
  Object.values(UIEditorTabNameEnum),
);

type UISettingRevealResultStatus = {
  settingId: string;
  status: "revealed" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
};

type OpenPaneResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errorMessage: string;
    };

type PluginRevealResult = {
  ok: boolean;
  errorMessage: string | null;
};

type PluginRevealHandlerOutcome =
  | { status: "handled"; message: null }
  | { status: "retryable_failure"; message: string }
  | { status: "terminal_failure"; message: string };

type LocalStorageState = ReturnType<typeof useLocalStorage.getState>;
type RevealLocalStorageSnapshot = {
  overviewVis: LocalStorageState["overviewVis"];
  overviewTab: LocalStorageState["overviewTab"];
  uiEditorVis: LocalStorageState["uiEditorVis"];
  uiEditorTab: LocalStorageState["uiEditorTab"];
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
  touchedUiEditorVis: boolean;
  touchedUiEditorTabSectionTypes: Set<string>;
  touchedRunInstructionsProjectConfigIds: Set<string>;
  touchedProjectAiProjectConfigIds: Set<string>;
  touchedProjectStateActiveIdsProjectConfigIds: Set<string>;
};
type RevealMutationLease = {
  leaseId: number;
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
};
type RevealMutationResult =
  | {
      ok: true;
      lease: RevealMutationLease;
    }
  | {
      ok: false;
      status: UISettingRevealResultStatus;
    };

export type UISettingRevealExecutionContext = {
  requestId: string;
  requestedProjectConfigId: string;
  socketGeneration: number;
  isSocketGenerationActive: () => boolean;
};

let revealMutationLock: Promise<void> = Promise.resolve();
let revealMutationSequence = 0;
let revealMutationOwnerForOverviewVis: number | null = null;
let revealMutationOwnerForOverviewTab: number | null = null;
let revealMutationOwnerForUiEditorVis: number | null = null;
const revealMutationOwnerByUiEditorTabSectionType = new Map<string, number>();
const revealMutationOwnerByRunInstructionsProjectConfigId = new Map<
  string,
  number
>();
const revealMutationOwnerByProjectAiProjectConfigId = new Map<string, number>();
const revealMutationOwnerByProjectStateActiveIdsProjectConfigId = new Map<
  string,
  number
>();

function createEmptyRevealMutationDiff(): RevealMutationDiff {
  return {
    touchedOverviewVis: false,
    touchedOverviewTab: false,
    touchedUiEditorVis: false,
    touchedUiEditorTabSectionTypes: new Set<string>(),
    touchedRunInstructionsProjectConfigIds: new Set<string>(),
    touchedProjectAiProjectConfigIds: new Set<string>(),
    touchedProjectStateActiveIdsProjectConfigIds: new Set<string>(),
  };
}

function resolveRequestedActiveSectionId(
  requestedActiveSectionId: string | null | undefined,
): string | null {
  if (typeof requestedActiveSectionId !== "string") {
    return null;
  }
  const normalizedRequestedActiveSectionId = requestedActiveSectionId.trim();
  if (normalizedRequestedActiveSectionId === "") {
    return null;
  }
  return normalizedRequestedActiveSectionId;
}

export async function receiveUISettingReveal(
  content: UISettingRevealContent,
  executionContext: UISettingRevealExecutionContext | null = null,
): Promise<Array<UISettingRevealResultStatus>> {
  const requestedActiveSectionId = resolveRequestedActiveSectionId(
    content.activeSectionId,
  );
  const requestedProjectConfigId = content.projectConfigId.trim();
  const activeProjectConfigId = useProjectState
    .getState()
    .projectConfig.id.trim();
  if (requestedProjectConfigId !== activeProjectConfigId) {
    return buildProjectContextMismatchStatuses({
      reveals: content.reveals,
      requestedProjectConfigId,
      activeProjectConfigId,
    });
  }
  const initialExecutionMismatch =
    resolveRevealExecutionMismatch(executionContext);
  if (initialExecutionMismatch !== null) {
    return buildExecutionContextMismatchStatuses({
      reveals: content.reveals,
      errorMessage: initialExecutionMismatch.message,
    });
  }
  const durationMs = normalizeDurationMs(content.durationMs);
  const deadlineMs = Date.now() + durationMs;
  const statuses: Array<UISettingRevealResultStatus> = [];
  for (const revealTarget of content.reveals) {
    const revealExecutionMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (revealExecutionMismatch !== null) {
      return [
        ...statuses,
        ...buildExecutionContextMismatchStatuses({
          reveals: content.reveals.slice(statuses.length),
          errorMessage: revealExecutionMismatch.message,
        }),
      ];
    }
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      statuses.push(buildRevealDeadlineExceededStatus(revealTarget.settingId));
      continue;
    }
    statuses.push(
      await revealSingleSetting({
        target: revealTarget,
        durationMs: remainingMs,
        fallbackProjectConfigId: content.projectConfigId,
        requestedActiveSectionId,
        executionContext,
      }),
    );
  }
  return statuses;
}

async function revealSingleSetting({
  target,
  durationMs,
  fallbackProjectConfigId,
  requestedActiveSectionId,
  executionContext,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  fallbackProjectConfigId: string;
  requestedActiveSectionId: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<UISettingRevealResultStatus> {
  const startMismatch = resolveRevealExecutionMismatch(executionContext);
  if (startMismatch !== null) {
    return buildExecutionContextMismatchStatus(
      target.settingId,
      startMismatch.message,
    );
  }
  const mutationResult = await applyRevealMutationsWithLease({
    target,
    fallbackProjectConfigId,
    requestedActiveSectionId,
    executionContext,
  });
  if (!mutationResult.ok) {
    return mutationResult.status;
  }
  const mutationLease = mutationResult.lease;
  try {
    const deadlineMs = Date.now() + durationMs;

    let pluginRevealErrorMessage: string | null = null;
    if (target.strategy === "plugin_handler") {
      const pluginRevealResult = await revealWithPluginHandler(
        target,
        deadlineMs,
        executionContext,
      );
      const postPluginRevealMismatch =
        resolveRevealExecutionMismatch(executionContext);
      if (postPluginRevealMismatch !== null) {
        await rollbackRevealMutationLease(mutationLease);
        return buildExecutionContextMismatchStatus(
          target.settingId,
          postPluginRevealMismatch.message,
        );
      }
      if (pluginRevealResult.ok) {
        return {
          settingId: target.settingId,
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        };
      }
      pluginRevealErrorMessage = pluginRevealResult.errorMessage;
    }

    if (target.anchorId === null || target.anchorId === undefined) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} No fallback anchorId is available.`
          : `Setting ${target.settingId} is missing a reveal anchorId.`,
      };
    }

    const remainingMsForAnchor = deadlineMs - Date.now();
    if (remainingMsForAnchor <= 0) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} Reveal deadline exceeded before fallback anchor lookup.`
          : `Reveal deadline exceeded before locating anchor for ${target.settingId}.`,
      };
    }
    const anchorElement = await waitForAnchorElement({
      side: target.side,
      anchorId: target.anchorId,
      deadlineMs,
      executionContext,
    });
    const postAnchorLookupMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postAnchorLookupMismatch !== null) {
      await rollbackRevealMutationLease(mutationLease);
      return buildExecutionContextMismatchStatus(
        target.settingId,
        postAnchorLookupMismatch.message,
      );
    }
    if (!anchorElement) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} Fallback anchor was not found.`
          : `Could not find anchor ${target.anchorId} for ${target.settingId}.`,
      };
    }
    scrollIntoView(anchorElement);
    applyHighlight(anchorElement, durationMs);
    return {
      settingId: target.settingId,
      status: "revealed",
      errorCode: null,
      errorMessage: null,
    };
  } finally {
    await finalizeRevealMutationLease(mutationLease);
  }
}

async function applyRevealMutationsWithLease({
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
    const requestedSectionActivationResult =
      applyRequestedActiveSectionForReveal({
        requestedActiveSectionId,
        fallbackProjectConfigId,
        mutationDiff,
      });
    if (!requestedSectionActivationResult.ok) {
      return {
        ok: false,
        status: {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: requestedSectionActivationResult.errorMessage,
        },
      };
    }
    const opened = openPaneForRevealTarget(target, mutationDiff);
    if (!opened.ok) {
      return {
        ok: false,
        status: {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: opened.errorMessage,
        },
      };
    }
    const postPaneMismatch = resolveRevealExecutionMismatch(executionContext);
    if (postPaneMismatch !== null) {
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
        status: buildExecutionContextMismatchStatus(
          target.settingId,
          postPaneMismatch.message,
        ),
      };
    }
    applyRevealActivationSteps({
      target,
      fallbackProjectConfigId,
      mutationDiff,
    });
    const postActivationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postActivationMismatch !== null) {
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
        status: buildExecutionContextMismatchStatus(
          target.settingId,
          postActivationMismatch.message,
        ),
      };
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

async function rollbackRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    restoreRevealMutationSnapshotsIfOwned(mutationLease);
  });
}

async function finalizeRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    clearRevealMutationOwnershipForLease(mutationLease);
  });
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
    uiEditorVis: state.uiEditorVis,
    uiEditorTab: { ...state.uiEditorTab },
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
    activeIds: [...state.projectConfig.activeIds],
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
  if (mutationDiff.touchedUiEditorVis) {
    revealMutationOwnerForUiEditorVis = leaseId;
  }
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    revealMutationOwnerByUiEditorTabSectionType.set(sectionType, leaseId);
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
  useProjectState.setState((state) => {
    const projectConfigId = state.projectConfig.id;
    if (
      !mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.has(
        projectConfigId,
      )
    ) {
      return state;
    }
    if (
      !isRevealMutationOwnerMatch(
        revealMutationOwnerByProjectStateActiveIdsProjectConfigId.get(
          projectConfigId,
        ),
        leaseId,
      )
    ) {
      return state;
    }
    if (projectConfigId !== postMutationSnapshot.projectConfigId) {
      return state;
    }
    if (
      !areStringArraysEqual(
        state.projectConfig.activeIds,
        postMutationSnapshot.activeIds,
      )
    ) {
      return state;
    }
    state.projectConfig.activeIds = [...snapshot.activeIds];
    return state;
  });
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

function applyRequestedActiveSectionForReveal({
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
    areStringArraysEqual(projectState.projectConfig.activeIds, [
      requestedActiveSectionId,
    ])
  ) {
    return { ok: true };
  }
  useProjectState.setState((state) => {
    state.projectConfig.activeIds = [requestedActiveSectionId];
  });
  mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.add(
    projectConfigId,
  );
  return { ok: true };
}

function openPaneForRevealTarget(
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

async function revealWithPluginHandler(
  target: UISettingRevealTarget,
  deadlineMs: number,
  executionContext: UISettingRevealExecutionContext | null,
): Promise<PluginRevealResult> {
  if (!target.pluginId || !target.pluginRevealKey) {
    return {
      ok: false,
      errorMessage: null,
    };
  }
  let latestErrorMessage: string | null = null;
  while (Date.now() <= deadlineMs) {
    const revealExecutionMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (revealExecutionMismatch !== null) {
      return {
        ok: false,
        errorMessage: revealExecutionMismatch.message,
      };
    }
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    const tabExists = usePluginRuntimeStore
      .getState()
      .sortedPaneTabs.some((tab) => tab.tabKey === target.overviewTabKey);
    if (tabExists) {
      const handlerResult = await invokePluginRevealHandlerWithinDeadline({
        target,
        durationMs: remainingMs,
      });
      if (handlerResult.status === "handled") {
        return {
          ok: true,
          errorMessage: null,
        };
      }
      latestErrorMessage = handlerResult.message;
      if (handlerResult.status === "terminal_failure") {
        break;
      }
    }
    const postIterationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postIterationMismatch !== null) {
      return {
        ok: false,
        errorMessage: postIterationMismatch.message,
      };
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleep(Math.min(FIND_TARGET_INTERVAL_MS, deadlineMs - Date.now()));
  }
  if (latestErrorMessage === null) {
    latestErrorMessage = `Plugin pane for ${target.settingId} did not become available before reveal timeout.`;
  }
  return {
    ok: false,
    errorMessage: latestErrorMessage,
  };
}

function applyRevealActivationSteps({
  target,
  fallbackProjectConfigId,
  mutationDiff,
}: {
  target: UISettingRevealTarget;
  fallbackProjectConfigId: string;
  mutationDiff: RevealMutationDiff;
}): void {
  const activationSteps = target.revealActivationSteps;
  if (!Array.isArray(activationSteps) || activationSteps.length === 0) {
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
    let runInstructionsChanged = false;
    let projectAiChanged = false;

    for (const step of activationSteps) {
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
      }
    }

    if (!runInstructionsChanged && !projectAiChanged) {
      return state;
    }

    const nextState: Partial<typeof state> = {};
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
    return nextState;
  });
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

function areStringArraysEqual(
  left: Array<string>,
  right: Array<string>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
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

function getActiveSectionType(): SectionType | null {
  const projectState = useProjectState.getState();
  const activeSectionId = projectState.projectConfig.activeIds[0] ?? null;
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

async function waitForAnchorElement({
  side,
  anchorId,
  deadlineMs,
  executionContext,
}: {
  side: "left" | "right";
  anchorId: string;
  deadlineMs: number;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<HTMLElement | null> {
  while (Date.now() <= deadlineMs) {
    const revealExecutionMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (revealExecutionMismatch !== null) {
      return null;
    }
    const paneRoot = getPaneRoot(side);
    if (paneRoot) {
      const anchor = findSettingAnchor(paneRoot, anchorId);
      if (anchor) {
        return anchor;
      }
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleep(FIND_TARGET_INTERVAL_MS);
  }
  return null;
}

function buildProjectContextMismatchStatuses({
  reveals,
  requestedProjectConfigId,
  activeProjectConfigId,
}: {
  reveals: Array<UISettingRevealTarget>;
  requestedProjectConfigId: string;
  activeProjectConfigId: string;
}): Array<UISettingRevealResultStatus> {
  return reveals.map((target) => ({
    settingId: target.settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage:
      "UI setting reveal project mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  }));
}

function buildExecutionContextMismatchStatuses({
  reveals,
  errorMessage,
}: {
  reveals: Array<UISettingRevealTarget>;
  errorMessage: string;
}): Array<UISettingRevealResultStatus> {
  return reveals.map((target) =>
    buildExecutionContextMismatchStatus(target.settingId, errorMessage),
  );
}

function buildExecutionContextMismatchStatus(
  settingId: string,
  errorMessage: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  };
}

function resolveRevealExecutionMismatch(
  executionContext: UISettingRevealExecutionContext | null,
): { message: string } | null {
  if (executionContext === null) {
    return null;
  }
  if (!executionContext.isSocketGenerationActive()) {
    return {
      message:
        "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    };
  }
  const activeProjectConfigId = useProjectState
    .getState()
    .projectConfig.id.trim();
  if (activeProjectConfigId !== executionContext.requestedProjectConfigId) {
    return {
      message:
        "UI setting reveal execution context mismatch: requested project " +
        `${executionContext.requestedProjectConfigId} but active project is ` +
        `${activeProjectConfigId}.`,
    };
  }
  return null;
}

function buildRevealDeadlineExceededStatus(
  settingId: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage: `Reveal deadline exceeded before processing ${settingId}.`,
  };
}

async function invokePluginRevealHandlerWithinDeadline({
  target,
  durationMs,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
}): Promise<PluginRevealHandlerOutcome> {
  const abortController = new AbortController();
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<PluginRevealHandlerOutcome>((resolve) => {
    timeoutId = window.setTimeout(() => {
      abortController.abort();
      resolve({
        status: "terminal_failure",
        message: `Plugin reveal handler timed out for ${target.settingId}.`,
      });
    }, durationMs);
  });
  const handlerPromise = invokePluginSettingRevealHandler({
    pluginId: target.pluginId ?? "",
    revealKey: target.pluginRevealKey ?? "",
    settingId: target.settingId,
    paneId: target.paneId ?? null,
    durationMs,
    abortSignal: abortController.signal,
  })
    .then((result) => {
      if (result.ok) {
        return {
          status: "handled",
          message: null,
        } satisfies PluginRevealHandlerOutcome;
      }
      return {
        status: "terminal_failure",
        message: result.message ?? "Plugin reveal handler failed.",
      } satisfies PluginRevealHandlerOutcome;
    })
    .catch(() => ({
      status: "terminal_failure",
      message: "Plugin reveal handler failed.",
    }));
  const result = await Promise.race([handlerPromise, timeoutPromise]);
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
  return result;
}

function getPaneRoot(side: "left" | "right"): HTMLElement | null {
  if (side === "left") {
    return document.querySelector<HTMLElement>(
      '[data-testid="overview-tab-content-shell"]',
    );
  }
  return document.querySelector<HTMLElement>(
    '[data-testid="ui-editor-tab-content-shell"]',
  );
}

function findSettingAnchor(
  root: ParentNode,
  anchorId: string,
): HTMLElement | null {
  const escapedAnchorId = escapeForAttributeSelector(anchorId);
  const candidate = root.querySelector<HTMLElement>(
    `[data-setting-anchor="${escapedAnchorId}"]`,
  );
  if (candidate && candidate.dataset.settingAnchor === anchorId) {
    return candidate;
  }
  return null;
}

function escapeForAttributeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function scrollIntoView(target: HTMLElement): void {
  const reducedMotion = prefersReducedMotion();
  target.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

function applyHighlight(target: HTMLElement, durationMs: number): void {
  const existingTimeoutId = highlightTimeoutByElement.get(target);
  if (existingTimeoutId !== undefined) {
    window.clearTimeout(existingTimeoutId);
  }
  target.classList.add(HIGHLIGHT_CLASS_NAME);
  const timeoutId = window.setTimeout(() => {
    target.classList.remove(HIGHLIGHT_CLASS_NAME);
    highlightTimeoutByElement.delete(target);
  }, durationMs);
  highlightTimeoutByElement.set(target, timeoutId);
}

function normalizeDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_DURATION_MS;
  }
  return Math.min(durationMs, MAX_DURATION_MS);
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useLocalStorage, useProjectState } from "state/definitions";

import {
  UIEditorTabUIConfig,
  type UISettingRevealContent,
  type UISettingRevealTarget,
} from "utils/generatedTypes";

import {
  applyRequestedActiveSectionForReveal,
  clearRevealMutationOwnershipForLease,
  cloneStringArrayRecord,
  openPaneForRevealTarget,
  recordRevealMutationOwnership,
  restoreRevealMutationSnapshotsIfOwned,
  revealWithPluginHandler,
  runWithRevealMutationLock,
} from "./mutationOwnershipAndRestore";

import {
  applyHighlight,
  applyRevealActivationSteps,
  buildExecutionContextMismatchStatus,
  buildExecutionContextMismatchStatuses,
  buildProjectContextMismatchStatuses,
  buildRevealDeadlineExceededStatus,
  normalizeDurationMs,
  resolveRevealExecutionMismatch,
  scrollIntoView,
  waitForAnchorElement,
} from "./pluginRevealAndDom";

export const DEFAULT_DURATION_MS = 3000;

export const MAX_DURATION_MS = 10000;

export const FIND_TARGET_INTERVAL_MS = 50;

export const HIGHLIGHT_CLASS_NAME = "setta-ui-setting-reveal-highlight";

export const highlightTimeoutByElement = new WeakMap<HTMLElement, number>();

export const uiEditorTabNameValues = new Set<string>(
  Object.values(UIEditorTabUIConfig.names),
);

export type UISettingRevealResultStatus = {
  settingId: string;
  status: "revealed" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
};

export type OpenPaneResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errorMessage: string;
    };

export type PluginRevealResult = {
  ok: boolean;
  errorMessage: string | null;
};

export type PluginRevealHandlerOutcome =
  | { status: "handled"; message: null }
  | { status: "terminal_failure"; message: string };

export type UISettingRevealActivationStep =
  UISettingRevealTarget["revealActivationSteps"][number];

type ParsedUISettingRevealTargetFields = {
  settingId: string;
  side: string;
  overviewTabKey: string | null;
  uiEditorTabName: string | null;
  pluginId: string | null;
  paneId: string | null;
  strategy: string;
  anchorId: string | null;
  pluginRevealKey: string | null;
  revealActivationSteps: Array<UISettingRevealActivationStep>;
};

export type LocalStorageState = ReturnType<typeof useLocalStorage.getState>;

export type ProjectChatAuxViewState =
  | NonNullable<
      LocalStorageState["projectChatAuxViewByProjectConfigId"][string]
    >
  | "none";

export type RevealLocalStorageSnapshot = {
  overviewVis: LocalStorageState["overviewVis"];
  overviewTab: LocalStorageState["overviewTab"];
  uiEditorVis: LocalStorageState["uiEditorVis"];
  uiEditorTab: LocalStorageState["uiEditorTab"];
  projectChatAuxViewByProjectConfigId: LocalStorageState["projectChatAuxViewByProjectConfigId"];
  runInstructionsAccordionOpenValuesByProjectConfigId: LocalStorageState["runInstructionsAccordionOpenValuesByProjectConfigId"];
  projectAiSettingsAccordionOpenValuesByProjectConfigId: LocalStorageState["projectAiSettingsAccordionOpenValuesByProjectConfigId"];
};

export type RevealProjectStateSnapshot = {
  projectConfigId: string;
  activeIds: Array<string>;
};

export type RevealMutationDiff = {
  touchedOverviewVis: boolean;
  touchedOverviewTab: boolean;
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

type RevealMutationResult =
  | {
      ok: true;
      lease: RevealMutationLease;
    }
  | {
      ok: false;
      status: UISettingRevealResultStatus;
    };

type PluginRevealAttemptOutcome = {
  status: UISettingRevealResultStatus | null;
  pluginRevealErrorMessage: string | null;
};

export type PluginRevealLoopContext = {
  remainingMs: number;
  result: PluginRevealResult | null;
};

export type PluginRevealPendingResult = {
  latestErrorMessage: string | null;
  stop: boolean;
  result: PluginRevealResult | null;
};

export type PluginRevealIterationResult = {
  latestErrorMessage: string | null;
  result: PluginRevealResult | null;
  waitMs: number | null;
};

export type RevealActivationDraft = {
  nextRunInstructionsOpenValues: Array<string>;
  nextProjectAiOpenValues: Array<string>;
  nextProjectChatAuxView: ProjectChatAuxViewState;
  runInstructionsChanged: boolean;
  projectAiChanged: boolean;
  projectChatAuxViewChanged: boolean;
};

export type UISettingRevealExecutionContext = {
  requestId: string;
  requestedProjectConfigId: string;
  socketGeneration: number;
  isSocketGenerationActive: () => boolean;
};

let revealMutationSequence = 0;

const invalidUISettingRevealField = Symbol("invalidUISettingRevealField");

function isUISettingRevealRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUISettingRevealRequiredString(
  value: unknown,
): string | typeof invalidUISettingRevealField {
  if (typeof value === "string") {
    return value;
  }
  return invalidUISettingRevealField;
}

function parseUISettingRevealOptionalString(
  value: unknown,
): string | null | typeof invalidUISettingRevealField {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return invalidUISettingRevealField;
}

function parseUISettingRevealActivationStep(
  value: unknown,
): UISettingRevealActivationStep | typeof invalidUISettingRevealField {
  if (!isUISettingRevealRecord(value)) {
    return invalidUISettingRevealField;
  }
  const type = parseUISettingRevealRequiredString(value.type);
  if (type === invalidUISettingRevealField) {
    return invalidUISettingRevealField;
  }
  const itemValue = parseUISettingRevealRequiredString(value.itemValue);
  if (itemValue === invalidUISettingRevealField) {
    return invalidUISettingRevealField;
  }
  return {
    type,
    itemValue,
  };
}

function parseUISettingRevealActivationSteps(
  value: unknown,
): Array<UISettingRevealActivationStep> | typeof invalidUISettingRevealField {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return invalidUISettingRevealField;
  }
  const steps: Array<UISettingRevealActivationStep> = [];
  for (const entry of value) {
    const parsedStep = parseUISettingRevealActivationStep(entry);
    if (parsedStep === invalidUISettingRevealField) {
      return invalidUISettingRevealField;
    }
    steps.push(parsedStep);
  }
  return steps;
}

function hasInvalidUISettingRevealField(values: Array<unknown>): boolean {
  return values.some((value) => value === invalidUISettingRevealField);
}

function parseUISettingRevealTargetFields(
  value: Record<string, unknown>,
): ParsedUISettingRevealTargetFields | typeof invalidUISettingRevealField {
  const parsedFields = {
    settingId: parseUISettingRevealRequiredString(value.settingId),
    side: parseUISettingRevealRequiredString(value.side),
    overviewTabKey: parseUISettingRevealOptionalString(value.overviewTabKey),
    uiEditorTabName: parseUISettingRevealOptionalString(value.uiEditorTabName),
    pluginId: parseUISettingRevealOptionalString(value.pluginId),
    paneId: parseUISettingRevealOptionalString(value.paneId),
    strategy: parseUISettingRevealRequiredString(value.strategy),
    anchorId: parseUISettingRevealOptionalString(value.anchorId),
    pluginRevealKey: parseUISettingRevealOptionalString(value.pluginRevealKey),
    revealActivationSteps: parseUISettingRevealActivationSteps(
      value.revealActivationSteps,
    ),
  };
  if (hasInvalidUISettingRevealField(Object.values(parsedFields))) {
    return invalidUISettingRevealField;
  }
  return parsedFields as ParsedUISettingRevealTargetFields;
}

function parseUISettingRevealTargetValue(
  value: unknown,
): UISettingRevealTarget | typeof invalidUISettingRevealField {
  if (!isUISettingRevealRecord(value)) {
    return invalidUISettingRevealField;
  }
  const parsedFields = parseUISettingRevealTargetFields(value);
  if (parsedFields === invalidUISettingRevealField) {
    return invalidUISettingRevealField;
  }
  return parsedFields;
}

function parseUISettingRevealTargets(
  value: unknown,
): Array<UISettingRevealTarget> | typeof invalidUISettingRevealField {
  if (!Array.isArray(value)) {
    return invalidUISettingRevealField;
  }
  const targets: Array<UISettingRevealTarget> = [];
  for (const entry of value) {
    const parsedTarget = parseUISettingRevealTargetValue(entry);
    if (parsedTarget === invalidUISettingRevealField) {
      return invalidUISettingRevealField;
    }
    targets.push(parsedTarget);
  }
  return targets;
}

function parseUISettingRevealDuration(
  value: unknown,
): number | typeof invalidUISettingRevealField {
  if (value === undefined) {
    return DEFAULT_DURATION_MS;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return invalidUISettingRevealField;
}

// Keep this parser in normal frontend code. `UISettingRevealContent` is the
// owner contract; only this websocket payload needs runtime validation, so the
// generator should not own a bespoke schema runtime for it.
export function parseUISettingRevealContent(
  value: unknown,
): UISettingRevealContent | null {
  if (!isUISettingRevealRecord(value)) {
    return null;
  }
  const projectConfigId = parseUISettingRevealRequiredString(
    value.projectConfigId,
  );
  if (projectConfigId === invalidUISettingRevealField) {
    return null;
  }
  const chatId = parseUISettingRevealOptionalString(value.chatId);
  if (chatId === invalidUISettingRevealField) {
    return null;
  }
  const activeSectionId = parseUISettingRevealOptionalString(
    value.activeSectionId,
  );
  if (activeSectionId === invalidUISettingRevealField) {
    return null;
  }
  const reveals = parseUISettingRevealTargets(value.reveals);
  if (reveals === invalidUISettingRevealField) {
    return null;
  }
  const durationMs = parseUISettingRevealDuration(value.durationMs);
  if (durationMs === invalidUISettingRevealField) {
    return null;
  }
  const requestId = parseUISettingRevealRequiredString(value.requestId);
  if (requestId === invalidUISettingRevealField) {
    return null;
  }
  return {
    projectConfigId,
    chatId,
    activeSectionId,
    reveals,
    durationMs,
    requestId,
  };
}

function createEmptyRevealMutationDiff(): RevealMutationDiff {
  return {
    touchedOverviewVis: false,
    touchedOverviewTab: false,
    touchedUiEditorVis: false,
    touchedUiEditorTabSectionTypes: new Set<string>(),
    touchedProjectChatAuxViewProjectConfigIds: new Set<string>(),
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
  let shouldRollbackMutationLease = true;
  try {
    const deadlineMs = Date.now() + durationMs;
    const pluginOutcome = await maybeRevealSingleSettingWithPluginHandler({
      target,
      deadlineMs,
      executionContext,
    });
    if (pluginOutcome.status !== null) {
      shouldRollbackMutationLease = pluginOutcome.status.status !== "revealed";
      return pluginOutcome.status;
    }
    const anchorStatus = await revealSingleSettingWithAnchor({
      target,
      durationMs,
      deadlineMs,
      executionContext,
      pluginRevealErrorMessage: pluginOutcome.pluginRevealErrorMessage,
    });
    shouldRollbackMutationLease = anchorStatus.status !== "revealed";
    return anchorStatus;
  } finally {
    try {
      if (shouldRollbackMutationLease) {
        await rollbackRevealMutationLease(mutationLease);
      }
    } finally {
      await finalizeRevealMutationLease(mutationLease);
    }
  }
}

function buildRevealSuccessStatus(
  settingId: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "revealed",
    errorCode: null,
    errorMessage: null,
  };
}

function buildRevealFailureStatus(
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

function buildPluginFallbackFailureMessage({
  pluginRevealErrorMessage,
  defaultMessage,
  fallbackMessage,
}: {
  pluginRevealErrorMessage: string | null;
  defaultMessage: string;
  fallbackMessage: string;
}): string {
  if (pluginRevealErrorMessage === null) {
    return defaultMessage;
  }
  return `${pluginRevealErrorMessage} ${fallbackMessage}`;
}

async function maybeRevealSingleSettingWithPluginHandler({
  target,
  deadlineMs,
  executionContext,
}: {
  target: UISettingRevealTarget;
  deadlineMs: number;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<PluginRevealAttemptOutcome> {
  if (target.strategy !== "plugin_handler") {
    return {
      status: null,
      pluginRevealErrorMessage: null,
    };
  }
  const pluginRevealResult = await revealWithPluginHandler(
    target,
    deadlineMs,
    executionContext,
  );
  const postPluginRevealMismatch =
    resolveRevealExecutionMismatch(executionContext);
  if (postPluginRevealMismatch !== null) {
    return {
      status: buildExecutionContextMismatchStatus(
        target.settingId,
        postPluginRevealMismatch.message,
      ),
      pluginRevealErrorMessage: null,
    };
  }
  if (pluginRevealResult.ok) {
    return {
      status: buildRevealSuccessStatus(target.settingId),
      pluginRevealErrorMessage: null,
    };
  }
  return {
    status: null,
    pluginRevealErrorMessage: pluginRevealResult.errorMessage,
  };
}

async function revealSingleSettingWithAnchor({
  target,
  durationMs,
  deadlineMs,
  executionContext,
  pluginRevealErrorMessage,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  deadlineMs: number;
  executionContext: UISettingRevealExecutionContext | null;
  pluginRevealErrorMessage: string | null;
}): Promise<UISettingRevealResultStatus> {
  if (!target.anchorId) {
    return buildRevealFailureStatus(
      target.settingId,
      buildPluginFallbackFailureMessage({
        pluginRevealErrorMessage,
        defaultMessage: `Setting ${target.settingId} is missing a reveal anchorId.`,
        fallbackMessage: "No fallback anchorId is available.",
      }),
    );
  }
  const remainingMsForAnchor = deadlineMs - Date.now();
  if (remainingMsForAnchor <= 0) {
    return buildRevealFailureStatus(
      target.settingId,
      buildPluginFallbackFailureMessage({
        pluginRevealErrorMessage,
        defaultMessage: `Reveal deadline exceeded before locating anchor for ${target.settingId}.`,
        fallbackMessage:
          "Reveal deadline exceeded before fallback anchor lookup.",
      }),
    );
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
    return buildExecutionContextMismatchStatus(
      target.settingId,
      postAnchorLookupMismatch.message,
    );
  }
  if (!anchorElement) {
    return buildRevealFailureStatus(
      target.settingId,
      buildPluginFallbackFailureMessage({
        pluginRevealErrorMessage,
        defaultMessage: `Could not find anchor ${target.anchorId} for ${target.settingId}.`,
        fallbackMessage: "Fallback anchor was not found.",
      }),
    );
  }
  scrollIntoView(anchorElement);
  applyHighlight(anchorElement, durationMs);
  return buildRevealSuccessStatus(target.settingId);
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

export function setRevealMutationScalarOwnerIfTouched(
  wasTouched: boolean,
  leaseId: number,
  assignOwner: (leaseId: number) => void,
): void {
  if (!wasTouched) {
    return;
  }
  assignOwner(leaseId);
}

import { normalizeProjectAISettingsAccordionOpenValues } from "components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState";
import { normalizeRunInstructionsAccordionOpenValues } from "components/Panes/Overview/runInstructionsAccordionState";
import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { getActiveSectionUIIds } from "state/activeSectionUI";
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
import {
  restoreBackendAuthoritativeActiveSectionIds,
  setActiveSectionIds,
} from "./activeSections";

const DEFAULT_DURATION_MS = 3000;
const MAX_DURATION_MS = 10000;
const FIND_TARGET_INTERVAL_MS = 50;
const HIGHLIGHT_CLASS_NAME = "setta-ui-setting-reveal-highlight";
const WATCH_CODE_REVEAL_SETTING_IDS = new Set<string>([
  "core.watch_code.enabled",
  "core.watch_code.folders",
  "core.watch_code.files",
]);

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
  | { status: "terminal_failure"; message: string };
type UISettingRevealActivationStep =
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

type LocalStorageState = ReturnType<typeof useLocalStorage.getState>;
type ProjectChatAuxViewState =
  | NonNullable<
      LocalStorageState["projectChatAuxViewByProjectConfigId"][string]
    >
  | "none";
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
type PluginRevealAttemptOutcome = {
  status: UISettingRevealResultStatus | null;
  pluginRevealErrorMessage: string | null;
};
type PluginRevealLoopContext = {
  remainingMs: number;
  result: PluginRevealResult | null;
};
type PluginRevealPendingResult = {
  latestErrorMessage: string | null;
  stop: boolean;
  result: PluginRevealResult | null;
};
type RevealActivationDraft = {
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
    touchedWatchCodePortalOpen: false,
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

function clearRevealMutationScalarOwnerIfOwned({
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

function clearRevealMutationOwnershipForKeys(
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

function clearRevealMutationOwnershipForLease({
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
    wasTouched: mutationDiff.touchedWatchCodePortalOpen,
    ownerLeaseId: revealMutationOwnerForWatchCodePortalOpen,
    leaseId,
    clear: () => {
      revealMutationOwnerForWatchCodePortalOpen = null;
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

function shouldRestoreRevealLocalStorageValue<T>({
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

function restoreScalarRevealLocalStorageFieldsIfOwned({
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
      wasTouched: mutationDiff.touchedWatchCodePortalOpen,
      ownerLeaseId: revealMutationOwnerForWatchCodePortalOpen,
      leaseId,
      currentValue: state.watchCodePortalOpen,
      postMutationValue: postMutationSnapshot.watchCodePortalOpen,
    })
  ) {
    nextState.watchCodePortalOpen = snapshot.watchCodePortalOpen;
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

function restoreRevealUiEditorTabsIfOwned({
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

function restoreRevealStringRecordIfOwned({
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

function restoreRevealStringArrayRecordIfOwned({
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
  if (!canRevealWithPluginHandler(target)) {
    return {
      ok: false,
      errorMessage: null,
    };
  }
  let latestErrorMessage: string | null = null;
  while (true) {
    const loopContext = getPluginRevealLoopContext(
      deadlineMs,
      executionContext,
    );
    if (loopContext.result !== null) {
      return loopContext.result;
    }
    if (loopContext.remainingMs <= 0) {
      break;
    }
    const pendingResult = await attemptPendingPluginReveal({
      target,
      remainingMs: loopContext.remainingMs,
    });
    if (pendingResult.result !== null) {
      return pendingResult.result;
    }
    latestErrorMessage = pendingResult.latestErrorMessage ?? latestErrorMessage;
    const postAttemptContext = getPluginRevealLoopContext(
      deadlineMs,
      executionContext,
    );
    if (postAttemptContext.result !== null) {
      return postAttemptContext.result;
    }
    if (
      !shouldContinuePluginRevealPolling(
        pendingResult,
        postAttemptContext.remainingMs,
      )
    ) {
      break;
    }
    await sleep(
      Math.min(FIND_TARGET_INTERVAL_MS, postAttemptContext.remainingMs),
    );
  }
  latestErrorMessage ??= `Plugin pane for ${target.settingId} did not become available before reveal timeout.`;
  return {
    ok: false,
    errorMessage: latestErrorMessage,
  };
}

function canRevealWithPluginHandler(target: UISettingRevealTarget): boolean {
  return Boolean(target.pluginId) && Boolean(target.pluginRevealKey);
}

function shouldContinuePluginRevealPolling(
  pendingResult: PluginRevealPendingResult,
  remainingMs: number,
): boolean {
  return !pendingResult.stop && remainingMs > 0;
}

function getPluginRevealLoopContext(
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

function pluginRevealPaneTabExists(overviewTabKey: string | null): boolean {
  if (overviewTabKey === null) {
    return false;
  }
  return usePluginRuntimeStore
    .getState()
    .sortedPaneTabs.some((tab) => tab.tabKey === overviewTabKey);
}

async function attemptPendingPluginReveal({
  target,
  remainingMs,
}: {
  target: UISettingRevealTarget;
  remainingMs: number;
}): Promise<PluginRevealPendingResult> {
  if (!pluginRevealPaneTabExists(target.overviewTabKey)) {
    return {
      latestErrorMessage: null,
      stop: false,
      result: null,
    };
  }
  const handlerResult = await invokePluginRevealHandlerWithinDeadline({
    target,
    durationMs: remainingMs,
  });
  if (handlerResult.status === "handled") {
    return {
      latestErrorMessage: null,
      stop: false,
      result: {
        ok: true,
        errorMessage: null,
      },
    };
  }
  return {
    latestErrorMessage: handlerResult.message,
    stop: handlerResult.status === "terminal_failure",
    result: null,
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
    const activationDraft = createRevealActivationDraft(state, projectConfigId);
    for (const step of activationSteps ?? []) {
      applyRevealActivationStepToDraft(activationDraft, step);
    }
    const nextState = buildRevealActivationLocalStorageState({
      state,
      projectConfigId,
      activationDraft,
      mutationDiff,
      shouldOpenWatchCodePortal,
    });
    if (nextState === null) {
      return state;
    }
    return nextState;
  });
}

function createRevealActivationDraft(
  state: LocalStorageState,
  projectConfigId: string,
): RevealActivationDraft {
  return {
    nextRunInstructionsOpenValues:
      state.runInstructionsAccordionOpenValuesByProjectConfigId[
        projectConfigId
      ] ?? [],
    nextProjectAiOpenValues:
      state.projectAiSettingsAccordionOpenValuesByProjectConfigId[
        projectConfigId
      ] ?? [],
    nextProjectChatAuxView:
      state.projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none",
    runInstructionsChanged: false,
    projectAiChanged: false,
    projectChatAuxViewChanged: false,
  };
}

function applyRevealActivationStepToDraft(
  activationDraft: RevealActivationDraft,
  step: UISettingRevealActivationStep,
): void {
  if (step.type === "run_instructions_accordion_item") {
    const normalizedOpenValues = normalizeRunInstructionsAccordionOpenValues([
      ...activationDraft.nextRunInstructionsOpenValues,
      step.itemValue,
    ]);
    if (
      !areStringArraysEqual(
        normalizedOpenValues,
        activationDraft.nextRunInstructionsOpenValues,
      )
    ) {
      activationDraft.nextRunInstructionsOpenValues = normalizedOpenValues;
      activationDraft.runInstructionsChanged = true;
    }
    return;
  }
  if (step.type !== "project_ai_settings_accordion_item") {
    return;
  }
  const normalizedOpenValues = normalizeProjectAISettingsAccordionOpenValues([
    ...activationDraft.nextProjectAiOpenValues,
    step.itemValue,
  ]);
  if (
    !areStringArraysEqual(
      normalizedOpenValues,
      activationDraft.nextProjectAiOpenValues,
    )
  ) {
    activationDraft.nextProjectAiOpenValues = normalizedOpenValues;
    activationDraft.projectAiChanged = true;
  }
  if (activationDraft.nextProjectChatAuxView !== "ai_settings") {
    activationDraft.nextProjectChatAuxView = "ai_settings";
    activationDraft.projectChatAuxViewChanged = true;
  }
}

function buildRevealActivationLocalStorageState({
  state,
  projectConfigId,
  activationDraft,
  mutationDiff,
  shouldOpenWatchCodePortal,
}: {
  state: LocalStorageState;
  projectConfigId: string;
  activationDraft: RevealActivationDraft;
  mutationDiff: RevealMutationDiff;
  shouldOpenWatchCodePortal: boolean;
}): Partial<LocalStorageState> | null {
  const watchCodePortalOpenChanged =
    shouldOpenWatchCodePortal && !state.watchCodePortalOpen;
  if (
    !hasRevealActivationLocalStorageChanges(
      activationDraft,
      watchCodePortalOpenChanged,
    )
  ) {
    return null;
  }
  const nextState: Partial<LocalStorageState> = {};
  if (watchCodePortalOpenChanged) {
    nextState.watchCodePortalOpen = true;
    mutationDiff.touchedWatchCodePortalOpen = true;
  }
  if (activationDraft.runInstructionsChanged) {
    nextState.runInstructionsAccordionOpenValuesByProjectConfigId = {
      ...state.runInstructionsAccordionOpenValuesByProjectConfigId,
      [projectConfigId]: activationDraft.nextRunInstructionsOpenValues,
    };
    mutationDiff.touchedRunInstructionsProjectConfigIds.add(projectConfigId);
  }
  if (activationDraft.projectAiChanged) {
    nextState.projectAiSettingsAccordionOpenValuesByProjectConfigId = {
      ...state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
      [projectConfigId]: activationDraft.nextProjectAiOpenValues,
    };
    mutationDiff.touchedProjectAiProjectConfigIds.add(projectConfigId);
  }
  if (activationDraft.projectChatAuxViewChanged) {
    const nextProjectChatAuxViewByProjectConfigId =
      buildProjectChatAuxViewRevealState({
        currentProjectChatAuxViewByProjectConfigId:
          state.projectChatAuxViewByProjectConfigId,
        projectConfigId,
        nextProjectChatAuxView: activationDraft.nextProjectChatAuxView,
      });
    nextState.projectChatAuxViewByProjectConfigId =
      nextProjectChatAuxViewByProjectConfigId;
    mutationDiff.touchedProjectChatAuxViewProjectConfigIds.add(projectConfigId);
  }
  return nextState;
}

function hasRevealActivationLocalStorageChanges(
  activationDraft: RevealActivationDraft,
  watchCodePortalOpenChanged: boolean,
): boolean {
  return (
    activationDraft.runInstructionsChanged ||
    activationDraft.projectAiChanged ||
    watchCodePortalOpenChanged ||
    activationDraft.projectChatAuxViewChanged
  );
}

function buildProjectChatAuxViewRevealState({
  currentProjectChatAuxViewByProjectConfigId,
  projectConfigId,
  nextProjectChatAuxView,
}: {
  currentProjectChatAuxViewByProjectConfigId: LocalStorageState["projectChatAuxViewByProjectConfigId"];
  projectConfigId: string;
  nextProjectChatAuxView: ProjectChatAuxViewState;
}): LocalStorageState["projectChatAuxViewByProjectConfigId"] {
  const nextProjectChatAuxViewByProjectConfigId = {
    ...currentProjectChatAuxViewByProjectConfigId,
  };
  if (nextProjectChatAuxView === "none") {
    delete nextProjectChatAuxViewByProjectConfigId[projectConfigId];
    return nextProjectChatAuxViewByProjectConfigId;
  }
  nextProjectChatAuxViewByProjectConfigId[projectConfigId] =
    nextProjectChatAuxView;
  return nextProjectChatAuxViewByProjectConfigId;
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
    const paneRoot = getPaneRoot({ side, anchorId });
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

function getPaneRoot({
  side,
  anchorId,
}: {
  side: "left" | "right";
  anchorId: string;
}): HTMLElement | null {
  if (side === "left") {
    if (WATCH_CODE_REVEAL_SETTING_IDS.has(anchorId)) {
      const watchCodePortalRoot = document.querySelector<HTMLElement>(
        '[data-testid="rf__watch-code-settings-portal"]',
      );
      if (watchCodePortalRoot) {
        return watchCodePortalRoot;
      }
    }
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

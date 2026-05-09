import { normalizeProjectAISettingsAccordionOpenValues } from "components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState";

import { normalizeRunInstructionsAccordionOpenValues } from "components/Panes/Overview/runInstructionsAccordionState";

import { invokePluginSettingRevealHandler } from "plugins/runtime";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useLocalStorage, useProjectState } from "state/definitions";

import {
  type SectionType,
  type UISettingRevealTarget,
} from "utils/generatedTypes";

import {
  DEFAULT_DURATION_MS,
  FIND_TARGET_INTERVAL_MS,
  HIGHLIGHT_CLASS_NAME,
  LocalStorageState,
  MAX_DURATION_MS,
  PluginRevealHandlerOutcome,
  PluginRevealPendingResult,
  ProjectChatAuxViewState,
  RevealActivationDraft,
  RevealMutationDiff,
  UISettingRevealActivationStep,
  UISettingRevealExecutionContext,
  UISettingRevealResultStatus,
  highlightTimeoutByElement,
} from "./targetParsingAndReveal";

import { pluginRevealTargetCanRegisterHandler } from "./mutationOwnershipAndRestore";

export async function attemptPendingPluginReveal({
  target,
  remainingMs,
}: {
  target: UISettingRevealTarget;
  remainingMs: number;
}): Promise<PluginRevealPendingResult> {
  if (!pluginRevealTargetCanRegisterHandler(target)) {
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
  if (!Array.isArray(activationSteps) || activationSteps.length === 0) {
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
}: {
  state: LocalStorageState;
  projectConfigId: string;
  activationDraft: RevealActivationDraft;
  mutationDiff: RevealMutationDiff;
}): Partial<LocalStorageState> | null {
  if (!hasRevealActivationLocalStorageChanges(activationDraft)) {
    return null;
  }
  const nextState: Partial<LocalStorageState> = {};
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
): boolean {
  return (
    activationDraft.runInstructionsChanged ||
    activationDraft.projectAiChanged ||
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

export function resolveProjectConfigIdForActivation(
  fallbackProjectConfigId: string,
): string {
  const normalizedProjectConfigId = fallbackProjectConfigId.trim();
  if (normalizedProjectConfigId === "") {
    throw new Error("UI setting reveal content is missing projectConfigId.");
  }
  return normalizedProjectConfigId;
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

export function areOptionalStringArraysEqual(
  left: Array<string> | undefined,
  right: Array<string> | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return areStringArraysEqual(left, right);
}

export function getActiveSectionType(): SectionType | null {
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

export async function waitForAnchorElement({
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
    const paneRoot = getPaneRoot({ side });
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

export function buildProjectContextMismatchStatuses({
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

export function buildExecutionContextMismatchStatuses({
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

export function buildExecutionContextMismatchStatus(
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

export function resolveRevealExecutionMismatch(
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

export function buildRevealDeadlineExceededStatus(
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

function getPaneRoot({ side }: { side: "left" | "right" }): HTMLElement | null {
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

export function scrollIntoView(target: HTMLElement): void {
  const reducedMotion = prefersReducedMotion();
  target.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

export function applyHighlight(target: HTMLElement, durationMs: number): void {
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

export function normalizeDurationMs(durationMs: number): number {
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

export function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

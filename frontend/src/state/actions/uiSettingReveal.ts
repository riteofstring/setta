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

export async function receiveUISettingReveal(
  content: UISettingRevealContent,
): Promise<Array<UISettingRevealResultStatus>> {
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
  const durationMs = normalizeDurationMs(content.durationMs);
  const deadlineMs = Date.now() + durationMs;
  const statuses: Array<UISettingRevealResultStatus> = [];
  for (const revealTarget of content.reveals) {
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
      }),
    );
  }
  return statuses;
}

async function revealSingleSetting({
  target,
  durationMs,
  fallbackProjectConfigId,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  fallbackProjectConfigId: string;
}): Promise<UISettingRevealResultStatus> {
  const deadlineMs = Date.now() + durationMs;
  const opened = openPaneForRevealTarget(target);
  if (!opened.ok) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: opened.errorMessage,
    };
  }
  applyRevealActivationSteps({
    target,
    fallbackProjectConfigId,
  });

  let pluginRevealErrorMessage: string | null = null;
  if (target.strategy === "plugin_handler") {
    const pluginRevealResult = await revealWithPluginHandler(
      target,
      deadlineMs,
    );
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
  });
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
}

function openPaneForRevealTarget(
  target: UISettingRevealTarget,
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
  return { ok: true };
}

async function revealWithPluginHandler(
  target: UISettingRevealTarget,
  deadlineMs: number,
): Promise<PluginRevealResult> {
  if (!target.pluginId || !target.pluginRevealKey) {
    return {
      ok: false,
      errorMessage: null,
    };
  }
  let latestErrorMessage: string | null = null;
  while (Date.now() <= deadlineMs) {
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
}: {
  target: UISettingRevealTarget;
  fallbackProjectConfigId: string;
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
    }
    if (projectAiChanged) {
      nextState.projectAiSettingsAccordionOpenValuesByProjectConfigId = {
        ...state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        [projectConfigId]: nextProjectAiOpenValues,
      };
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
}: {
  side: "left" | "right";
  anchorId: string;
  deadlineMs: number;
}): Promise<HTMLElement | null> {
  while (Date.now() <= deadlineMs) {
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

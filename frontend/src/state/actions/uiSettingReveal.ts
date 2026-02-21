import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { useLocalStorage, useProjectState } from "state/definitions";
import {
  isOverviewTabKey,
  type OverviewTabKey,
  type UIEditorTabName,
  UIEditorTabNameEnum,
} from "utils/constants";
import type {
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";

const DEFAULT_DURATION_MS = 3000;
const MAX_DURATION_MS = 10000;
const FIND_TARGET_ATTEMPTS = 40;
const FIND_TARGET_INTERVAL_MS = 50;
const HIGHLIGHT_CLASS_NAME = "setta-ui-setting-reveal-highlight";

const highlightTimeoutByElement = new WeakMap<HTMLElement, number>();
const uiEditorTabNameValues = new Set<string>(Object.values(UIEditorTabNameEnum));

export type UISettingRevealResultStatus = {
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

export async function receiveUISettingReveal(
  content: UISettingRevealContent,
): Promise<Array<UISettingRevealResultStatus>> {
  const durationMs = normalizeDurationMs(content.durationMs);
  const statuses: Array<UISettingRevealResultStatus> = [];
  for (const revealTarget of content.reveals) {
    statuses.push(
      await revealSingleSetting({
        target: revealTarget,
        durationMs,
      }),
    );
  }
  return statuses;
}

async function revealSingleSetting({
  target,
  durationMs,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
}): Promise<UISettingRevealResultStatus> {
  const opened = openPaneForRevealTarget(target);
  if (!opened.ok) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: opened.errorMessage,
    };
  }

  let pluginHandlerFailed = false;
  if (target.strategy === "plugin_handler") {
    const pluginRevealOk = await revealWithPluginHandler(target, durationMs);
    if (pluginRevealOk) {
      return {
        settingId: target.settingId,
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      };
    }
    pluginHandlerFailed = true;
  }

  if (target.anchorId === null || target.anchorId === undefined) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: pluginHandlerFailed
        ? "Plugin reveal handler failed and no fallback anchorId is available."
        : `Setting ${target.settingId} is missing a reveal anchorId.`,
    };
  }

  const anchorElement = await waitForAnchorElement({
    side: target.side,
    anchorId: target.anchorId,
  });
  if (!anchorElement) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: pluginHandlerFailed
        ? "Plugin reveal handler failed and fallback anchor was not found."
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

function openPaneForRevealTarget(target: UISettingRevealTarget): OpenPaneResult {
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
  useLocalStorage.setState((state) => ({
    uiEditorVis: true,
    uiEditorTab: {
      ...state.uiEditorTab,
      [sectionType]: uiEditorTabName as UIEditorTabName,
    },
  }));
  return { ok: true };
}

async function revealWithPluginHandler(
  target: UISettingRevealTarget,
  durationMs: number,
): Promise<boolean> {
  if (!target.pluginId || !target.pluginRevealKey) {
    return false;
  }
  const tabExists = usePluginRuntimeStore
    .getState()
    .sortedPaneTabs.some((tab) => tab.tabKey === target.overviewTabKey);
  if (!tabExists) {
    return false;
  }
  try {
    const result = await invokePluginSettingRevealHandler({
      pluginId: target.pluginId,
      revealKey: target.pluginRevealKey,
      settingId: target.settingId,
      paneId: target.paneId ?? null,
      durationMs,
    });
    return result.ok;
  } catch {
    return false;
  }
}

function getActiveSectionType(): string | null {
  const projectState = useProjectState.getState();
  const activeSectionId = projectState.projectConfig.activeIds[0] ?? null;
  if (activeSectionId === null) {
    return null;
  }
  const variantId = projectState.projectConfig.sectionVariantMap[activeSectionId];
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
}: {
  side: "left" | "right";
  anchorId: string;
}): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < FIND_TARGET_ATTEMPTS; attempt += 1) {
    const paneRoot = getPaneRoot(side);
    if (paneRoot) {
      const anchor = findSettingAnchor(paneRoot, anchorId);
      if (anchor) {
        return anchor;
      }
    }
    await sleep(FIND_TARGET_INTERVAL_MS);
  }
  return null;
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
  const candidates = root.querySelectorAll<HTMLElement>("[data-setting-anchor]");
  for (const candidate of candidates) {
    if (candidate.dataset.settingAnchor === anchorId) {
      return candidate;
    }
  }
  return null;
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

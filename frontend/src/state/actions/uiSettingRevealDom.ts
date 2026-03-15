import {
  DEFAULT_DURATION_MS,
  FIND_TARGET_INTERVAL_MS,
  MAX_DURATION_MS,
  WATCH_CODE_REVEAL_SETTING_IDS,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
} from "./uiSettingRevealShared";

const HIGHLIGHT_CLASS_NAME = "setta-ui-setting-reveal-highlight";

const highlightTimeoutByElement = new WeakMap<HTMLElement, number>();

export async function waitForRevealAnchorElement({
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
      const anchor = findRevealSettingAnchor(paneRoot, anchorId);
      if (anchor) {
        return anchor;
      }
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleepForRevealPolling(FIND_TARGET_INTERVAL_MS);
  }
  return null;
}

export function findRevealSettingAnchor(
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

export function scrollRevealAnchorIntoView(target: HTMLElement): void {
  const reducedMotion = prefersReducedMotion();
  target.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

export function applyRevealHighlight(
  target: HTMLElement,
  durationMs: number,
): void {
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

export function normalizeRevealDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_DURATION_MS;
  }
  return Math.min(durationMs, MAX_DURATION_MS);
}

export function sleepForRevealPolling(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
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

function escapeForAttributeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

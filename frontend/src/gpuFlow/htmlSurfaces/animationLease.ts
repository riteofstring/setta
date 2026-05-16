import type { DirtyNodeReason } from "../dirtyTracking";

import {
  resolveElementSourceRect,
  unionHtmlSurfaceSourceRects,
  type HtmlSurfaceSourceRect,
} from "./sourceRects";

import {
  releaseHtmlSurfaceActivePaintSourceRectHint,
  setHtmlSurfaceActivePaintSourceRectHint,
} from "./paintSourceRectHints";

type HtmlSurfaceAnimationSourceRect = HtmlSurfaceSourceRect;

type HtmlSurfaceAnimationCaptureLeaseController = {
  begin(input: BeginHtmlSurfaceAnimationCaptureLeaseInput): void;
  cancel(surfaceId: string): void;
  destroy(): void;
  hasActiveLease(surfaceId: string): boolean;
  settle(input: SettleHtmlSurfaceAnimationCaptureLeaseInput): void;
};

type BeginHtmlSurfaceAnimationCaptureLeaseInput = {
  readonly reason?: DirtyNodeReason | undefined;
  readonly surfaceId: string;
  readonly target?: Element | null | undefined;
};

type SettleHtmlSurfaceAnimationCaptureLeaseInput = {
  readonly surfaceId: string;
  readonly target?: Element | null | undefined;
};

type HtmlSurfaceAnimationCaptureLeaseOptions = {
  readonly cancelAnimationFrame?: ((frameId: number) => void) | undefined;
  readonly getSourceElement: (surfaceId: string) => Element | null;
  readonly markDirty: (input: {
    readonly reason: DirtyNodeReason;
    readonly sourceRect?: HtmlSurfaceAnimationSourceRect | undefined;
    readonly surfaceId: string;
  }) => boolean;
  readonly maxDurationMs?: number | undefined;
  readonly maxFrames?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly requestAnimationFrame?:
    | ((callback: FrameRequestCallback) => number)
    | undefined;
  readonly settledFrameCount?: number | undefined;
};

type HtmlSurfaceAnimationCaptureLease = {
  readonly maxDurationMs: number;
  readonly maxFrames: number;
  readonly reason: DirtyNodeReason;
  readonly startedAt: number;
  readonly surfaceId: string;
  target: Element | null;
  fallbackEndAt: number;
  frameCount: number;
  previousSourceRect: HtmlSurfaceAnimationSourceRect | null;
  sourceElement: Element | null;
  settlingFrames: number;
};

const DEFAULT_ANIMATION_LEASE_MAX_DURATION_MS = 1_200;
const DEFAULT_ANIMATION_LEASE_MAX_FRAMES = 90;
const DEFAULT_ANIMATION_LEASE_SETTLED_FRAME_COUNT = 1;
const SETTLED_ANIMATION_CAPTURE_WINDOW_MS = 160;

export function createHtmlSurfaceAnimationCaptureLeaseController({
  cancelAnimationFrame = cancelGlobalAnimationFrame,
  getSourceElement,
  markDirty,
  maxDurationMs = DEFAULT_ANIMATION_LEASE_MAX_DURATION_MS,
  maxFrames = DEFAULT_ANIMATION_LEASE_MAX_FRAMES,
  now = getNow,
  requestAnimationFrame = requestGlobalAnimationFrame,
  settledFrameCount = DEFAULT_ANIMATION_LEASE_SETTLED_FRAME_COUNT,
}: HtmlSurfaceAnimationCaptureLeaseOptions): HtmlSurfaceAnimationCaptureLeaseController {
  const leases = new Map<string, HtmlSurfaceAnimationCaptureLease>();
  let frameHandle: number | null = null;

  const schedule = () => {
    if (frameHandle !== null || leases.size === 0) {
      return;
    }
    frameHandle = requestAnimationFrame(() => {
      frameHandle = null;
      captureActiveAnimationLeases();
    });
  };

  const stopFrame = () => {
    if (frameHandle === null) {
      return;
    }
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
  };

  const dirtyAnimationSurface = (
    lease: HtmlSurfaceAnimationCaptureLease,
    sourceElement: Element | null,
  ): boolean => {
    lease.frameCount += 1;
    const sourceRect = resolveAnimationLeaseDirtySourceRect(
      lease,
      sourceElement,
    );
    lease.sourceElement = sourceElement;
    if (sourceElement && sourceRect) {
      setHtmlSurfaceActivePaintSourceRectHint(sourceElement, sourceRect);
    }
    return markDirty({
      reason: lease.reason,
      ...(sourceRect ? { sourceRect } : {}),
      surfaceId: lease.surfaceId,
    });
  };

  const captureActiveAnimationLeases = () => {
    const currentTime = now();
    for (const lease of [...leases.values()]) {
      if (!captureAnimationLeaseFrame(lease, currentTime)) {
        releaseAnimationLeasePaintHint(lease);
        leases.delete(lease.surfaceId);
      }
    }

    schedule();
  };

  const captureAnimationLeaseFrame = (
    lease: HtmlSurfaceAnimationCaptureLease,
    currentTime: number,
  ): boolean => {
    const sourceElement = getSourceElement(lease.surfaceId);
    if (!sourceElement) {
      return false;
    }
    const hasRunningDomAnimation = hasRunningSourceAnimation(
      lease.target ?? sourceElement,
    );
    if (
      shouldStopAnimationLeaseBeforeCapture(
        lease,
        currentTime,
        hasRunningDomAnimation,
      )
    ) {
      return false;
    }
    if (!dirtyAnimationSurface(lease, sourceElement)) {
      return false;
    }
    return keepAnimationLeaseAfterCapture(lease, hasRunningDomAnimation);
  };

  return {
    begin({ reason = "animation", surfaceId, target }) {
      const currentTime = now();
      const sourceElement = getSourceElement(surfaceId);
      const resolvedTarget = target ?? sourceElement;
      const fallbackDurationMs = clampDurationMs(
        resolveSourceAnimationDurationMs(resolvedTarget),
        maxDurationMs,
      );
      const existing = leases.get(surfaceId);
      const lease: HtmlSurfaceAnimationCaptureLease = existing ?? {
        fallbackEndAt: currentTime,
        frameCount: 0,
        maxDurationMs,
        maxFrames,
        previousSourceRect: null,
        reason,
        settlingFrames: 0,
        sourceElement: sourceElement ?? null,
        startedAt: currentTime,
        surfaceId,
        target: null,
      };
      lease.target = resolvedTarget;
      lease.fallbackEndAt =
        currentTime +
        Math.max(fallbackDurationMs, SETTLED_ANIMATION_CAPTURE_WINDOW_MS);
      lease.previousSourceRect = null;
      lease.settlingFrames = 0;
      leases.set(surfaceId, lease);
      if (dirtyAnimationSurface(lease, sourceElement)) {
        schedule();
      } else {
        leases.delete(surfaceId);
      }
    },
    cancel(surfaceId) {
      const lease = leases.get(surfaceId);
      if (lease) {
        releaseAnimationLeasePaintHint(lease);
        leases.delete(surfaceId);
      }
      if (leases.size === 0) {
        stopFrame();
      }
    },
    destroy() {
      for (const lease of leases.values()) {
        releaseAnimationLeasePaintHint(lease);
      }
      leases.clear();
      stopFrame();
    },
    hasActiveLease(surfaceId) {
      return leases.has(surfaceId);
    },
    settle({ surfaceId, target }) {
      const lease = leases.get(surfaceId);
      if (!lease) {
        return;
      }
      lease.target = target ?? lease.target;
      lease.fallbackEndAt = Math.min(
        lease.fallbackEndAt,
        now() + SETTLED_ANIMATION_CAPTURE_WINDOW_MS,
      );
      lease.settlingFrames = Math.max(lease.settlingFrames, settledFrameCount);
      if (dirtyAnimationSurface(lease, getSourceElement(surfaceId))) {
        schedule();
      } else {
        releaseAnimationLeasePaintHint(lease);
        leases.delete(surfaceId);
      }
    },
  };
}

function releaseAnimationLeasePaintHint(
  lease: HtmlSurfaceAnimationCaptureLease,
) {
  if (lease.sourceElement) {
    releaseHtmlSurfaceActivePaintSourceRectHint(lease.sourceElement);
  }
}

function resolveAnimationLeaseDirtySourceRect(
  lease: HtmlSurfaceAnimationCaptureLease,
  sourceElement: Element | null,
): HtmlSurfaceAnimationSourceRect | undefined {
  const currentSourceRect = resolveAnimatedTargetSourceRect({
    sourceElement,
    target: lease.target,
  });
  const dirtySourceRect = currentSourceRect
    ? unionHtmlSurfaceSourceRects(lease.previousSourceRect, currentSourceRect)
    : undefined;
  lease.previousSourceRect = currentSourceRect ?? null;
  return dirtySourceRect;
}

function resolveAnimatedTargetSourceRect({
  sourceElement,
  target,
}: {
  readonly sourceElement: Element | null;
  readonly target: Element | null;
}): HtmlSurfaceAnimationSourceRect | undefined {
  return resolveElementSourceRect({ sourceElement, target });
}

function hasRunningSourceAnimation(source: Element): boolean {
  const getAnimations = source.getAnimations;
  if (typeof getAnimations !== "function") {
    return false;
  }
  return getAnimations.call(source, { subtree: true }).some((animation) => {
    const playbackState = (
      animation as { readonly playbackState?: string | undefined }
    ).playbackState;
    return playbackState !== "finished" && playbackState !== "idle";
  });
}

function shouldStopAnimationLeaseBeforeCapture(
  lease: HtmlSurfaceAnimationCaptureLease,
  currentTime: number,
  hasRunningDomAnimation: boolean,
): boolean {
  if (
    currentTime - lease.startedAt >= lease.maxDurationMs ||
    lease.frameCount >= lease.maxFrames
  ) {
    return true;
  }
  return (
    lease.settlingFrames <= 0 &&
    !hasRunningDomAnimation &&
    currentTime >= lease.fallbackEndAt
  );
}

function keepAnimationLeaseAfterCapture(
  lease: HtmlSurfaceAnimationCaptureLease,
  hasRunningDomAnimation: boolean,
): boolean {
  if (lease.settlingFrames <= 0 || hasRunningDomAnimation) {
    return true;
  }
  lease.settlingFrames -= 1;
  return lease.settlingFrames > 0;
}

function resolveSourceAnimationDurationMs(source: Element | null): number {
  if (!source || typeof globalThis.getComputedStyle !== "function") {
    return 0;
  }
  const style = globalThis.getComputedStyle(source);
  return Math.max(
    resolveCssTransitionDurationMs(style),
    resolveCssAnimationDurationMs(style),
  );
}

function resolveCssTransitionDurationMs(style: CSSStyleDeclaration): number {
  const durations = parseCssTimeList(style.transitionDuration);
  const delays = parseCssTimeList(style.transitionDelay);
  const count = Math.max(durations.length, delays.length);
  let maxDurationMs = 0;
  for (let index = 0; index < count; index += 1) {
    maxDurationMs = Math.max(
      maxDurationMs,
      valueAtRepeatingIndex(durations, index) +
        valueAtRepeatingIndex(delays, index),
    );
  }
  return maxDurationMs;
}

function resolveCssAnimationDurationMs(style: CSSStyleDeclaration): number {
  const durations = parseCssTimeList(style.animationDuration);
  const delays = parseCssTimeList(style.animationDelay);
  const iterations = parseCssIterationList(style.animationIterationCount);
  const count = Math.max(durations.length, delays.length, iterations.length);
  let maxDurationMs = 0;
  for (let index = 0; index < count; index += 1) {
    const iterationCount = valueAtRepeatingIndex(iterations, index);
    if (!Number.isFinite(iterationCount)) {
      return Number.POSITIVE_INFINITY;
    }
    maxDurationMs = Math.max(
      maxDurationMs,
      valueAtRepeatingIndex(delays, index) +
        valueAtRepeatingIndex(durations, index) * iterationCount,
    );
  }
  return maxDurationMs;
}

function parseCssTimeList(value: string): readonly number[] {
  return value.split(",").map(parseCssTimeMs);
}

function parseCssTimeMs(rawValue: string): number {
  const value = rawValue.trim();
  if (!value) {
    return 0;
  }
  if (value.endsWith("ms")) {
    return normalizeFiniteNumber(Number(value.slice(0, -2)));
  }
  if (value.endsWith("s")) {
    return normalizeFiniteNumber(Number(value.slice(0, -1)) * 1_000);
  }
  return normalizeFiniteNumber(Number(value));
}

function parseCssIterationList(value: string): readonly number[] {
  return value.split(",").map((item) => {
    const trimmed = item.trim();
    if (trimmed === "infinite") {
      return Number.POSITIVE_INFINITY;
    }
    return normalizeFiniteNumber(Number(trimmed || 1));
  });
}

function valueAtRepeatingIndex(
  values: readonly number[],
  index: number,
): number {
  if (values.length === 0) {
    return 0;
  }
  return values[index % values.length] ?? 0;
}

function clampDurationMs(durationMs: number, maxDurationMs: number): number {
  if (!Number.isFinite(durationMs)) {
    return maxDurationMs;
  }
  return Math.min(Math.max(0, durationMs), maxDurationMs);
}

function normalizeFiniteNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function requestGlobalAnimationFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error(
      "Setta HTML surface animation capture requires requestAnimationFrame.",
    );
  }
  return globalThis.requestAnimationFrame(callback);
}

function cancelGlobalAnimationFrame(frameId: number): void {
  if (typeof globalThis.cancelAnimationFrame !== "function") {
    throw new Error(
      "Setta HTML surface animation capture requires cancelAnimationFrame.",
    );
  }
  globalThis.cancelAnimationFrame(frameId);
}

function getNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

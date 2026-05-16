import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type { GpuFrameReason } from "./gpuRenderer";
import {
  gpuViewportToTuple,
  normalizeGpuViewport,
  panGpuViewportBy,
  zoomGpuViewportBy,
  type GpuPoint,
  type GpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "./viewportMath";
import type { GpuViewportRuntimeCommandOptions } from "./viewportRuntimeRegistry";
import type { GpuFlowViewportStoreApi } from "./viewportStore";

export type GpuFlowRuntimeSceneInput = {
  readonly source: "react";
  readonly sceneVersion: number;
};

export type GpuFlowViewportOverlayManager = {
  applyViewport(viewport: GpuViewportTuple): void;
};

export type GpuFlowViewportRuntimeFrameResult = {
  readonly viewportChanged: boolean;
  readonly viewportFrame: boolean;
};

export type GpuFlowViewportRuntimeOptions = {
  readonly observerPublishIntervalMs?: number | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly store: GpuFlowViewportStoreApi;
};

export type GpuFlowViewportRuntime = {
  applyOverlayTransforms(): void;
  applyViewportCommand(
    viewport: GpuViewportInput,
    options?: GpuViewportRuntimeCommandOptions,
  ): boolean;
  cancelViewportTransition(): boolean;
  connectStore(): void;
  destroy(): void;
  disconnectStore(): void;
  enqueuePan(delta: GpuPoint): boolean;
  enqueueZoomByFactorAtPoint(input: {
    readonly factor: number;
    readonly point: GpuPoint;
  }): boolean;
  flushObserverSnapshot(): void;
  getViewport(): GpuViewport;
  getViewportTuple(): GpuViewportTuple;
  registerOverlayManager(manager: GpuFlowViewportOverlayManager): () => void;
  runFrame(timestampMs: DOMHighResTimeStamp): GpuFlowViewportRuntimeFrameResult;
  setFrameRequester(
    requestFrame: ((reason: GpuFrameReason) => void) | undefined,
  ): void;
};

type PendingGpuViewportInput =
  | {
      readonly delta: GpuPoint;
      readonly kind: "pan";
      readonly queuedAtMs: number;
    }
  | {
      readonly factor: number;
      readonly kind: "zoom";
      readonly point: GpuPoint;
      readonly queuedAtMs: number;
    };

type ActiveGpuViewportTransition = {
  readonly durationMs: number;
  readonly from: GpuViewport;
  startTimeMs: number | null;
  readonly to: GpuViewport;
};

type GpuFlowObserverSnapshotPublishResult = {
  readonly action:
    | "active-interaction-deferred"
    | "not-requested"
    | "published"
    | "throttled";
  readonly elapsedMs: number | null;
  readonly publishDurationMs: number | null;
};

const DEFAULT_OBSERVER_PUBLISH_INTERVAL_MS = 500;
const NO_OBSERVER_SNAPSHOT_PUBLISH: GpuFlowObserverSnapshotPublishResult = {
  action: "not-requested",
  elapsedMs: null,
  publishDurationMs: null,
};

export function createGpuFlowViewportRuntime({
  observerPublishIntervalMs = DEFAULT_OBSERVER_PUBLISH_INTERVAL_MS,
  requestFrame,
  store,
}: GpuFlowViewportRuntimeOptions): GpuFlowViewportRuntime {
  return new DefaultGpuFlowViewportRuntime({
    observerPublishIntervalMs,
    requestFrame,
    store,
  });
}

class DefaultGpuFlowViewportRuntime implements GpuFlowViewportRuntime {
  private destroyed = false;
  private frameRequester: ((reason: GpuFrameReason) => void) | undefined;
  private readonly observerPublishIntervalMs: number;
  private readonly overlayManagers = new Set<GpuFlowViewportOverlayManager>();
  private readonly pendingInputs: PendingGpuViewportInput[] = [];
  private publishingObserverSnapshot = false;
  private readonly store: GpuFlowViewportStoreApi;
  private transition: ActiveGpuViewportTransition | null = null;
  private transitionCompletionHandle: ReturnType<typeof setTimeout> | null =
    null;
  private unsubscribeStore: (() => void) | null = null;
  private viewportFramePending = false;
  private viewportFrameRetryHandle: number | null = null;
  private viewport: GpuViewportTuple;
  private lastObserverPublishMs = Number.NEGATIVE_INFINITY;

  constructor({
    observerPublishIntervalMs,
    requestFrame,
    store,
  }: GpuFlowViewportRuntimeOptions & {
    readonly observerPublishIntervalMs: number;
  }) {
    this.frameRequester = requestFrame;
    this.observerPublishIntervalMs = normalizeFiniteNonNegative(
      "observer publish interval",
      observerPublishIntervalMs,
    );
    this.store = store;
    this.viewport = gpuViewportToTuple(store.getState().transform);
  }

  connectStore(): void {
    if (this.unsubscribeStore) {
      return;
    }
    this.destroyed = false;
    this.viewport = gpuViewportToTuple(this.store.getState().transform);
    this.unsubscribeStore = this.store.subscribe((state, previousState) => {
      if (
        this.destroyed ||
        this.publishingObserverSnapshot ||
        state.transform === previousState.transform
      ) {
        return;
      }
      this.pendingInputs.length = 0;
      this.cancelRuntimeTransition();
      this.viewport = gpuViewportToTuple(state.transform);
      this.applyOverlayTransforms();
      this.requestViewportFrame();
    });
  }

  disconnectStore(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  setFrameRequester(
    requestFrame: ((reason: GpuFrameReason) => void) | undefined,
  ): void {
    this.frameRequester = requestFrame;
  }

  getViewport(): GpuViewport {
    return normalizeGpuViewport(this.viewport);
  }

  getViewportTuple(): GpuViewportTuple {
    return this.viewport;
  }

  enqueuePan(delta: GpuPoint): boolean {
    assertFiniteNumber("pan delta x", delta.x);
    assertFiniteNumber("pan delta y", delta.y);
    if (delta.x === 0 && delta.y === 0) {
      return false;
    }
    this.cancelRuntimeTransition();
    this.pendingInputs.push({
      delta: { x: delta.x, y: delta.y },
      kind: "pan",
      queuedAtMs: performanceNow(),
    });
    this.requestViewportFrame();
    return true;
  }

  enqueueZoomByFactorAtPoint({
    factor,
    point,
  }: {
    readonly factor: number;
    readonly point: GpuPoint;
  }): boolean {
    assertFinitePositive("zoom factor", factor);
    assertFiniteNumber("zoom point x", point.x);
    assertFiniteNumber("zoom point y", point.y);
    if (factor === 1) {
      return false;
    }
    this.cancelRuntimeTransition();
    this.pendingInputs.push({
      factor,
      kind: "zoom",
      point: { x: point.x, y: point.y },
      queuedAtMs: performanceNow(),
    });
    this.requestViewportFrame();
    return true;
  }

  applyViewportCommand(
    viewport: GpuViewportInput,
    options: GpuViewportRuntimeCommandOptions = {},
  ): boolean {
    const nextViewport = gpuViewportToTuple(viewport);
    const durationMs = normalizeFiniteNonNegative(
      "viewport command duration",
      options.durationMs ?? 0,
    );
    this.pendingInputs.length = 0;
    this.cancelRuntimeTransition();
    if (durationMs === 0) {
      if (areGpuViewportTuplesEqual(this.viewport, nextViewport)) {
        return false;
      }
      this.viewport = nextViewport;
      this.applyOverlayTransforms();
      this.publishObserverSnapshot({ force: true });
      this.requestViewportFrame();
      return true;
    }

    const from = normalizeGpuViewport(this.viewport);
    const to = normalizeGpuViewport(nextViewport);
    if (areGpuViewportsEqual(from, to)) {
      return false;
    }
    const transition = {
      durationMs,
      from,
      startTimeMs: null,
      to,
    };
    this.transition = transition;
    this.scheduleTransitionCompletion(transition);
    this.store
      .getState()
      .setViewportInteractionFlags({ viewportAnimating: true });
    this.requestViewportFrame();
    return true;
  }

  cancelViewportTransition(): boolean {
    const canceled = this.cancelRuntimeTransition();
    if (canceled) {
      this.store
        .getState()
        .setViewportInteractionFlags({ viewportAnimating: false });
    }
    return canceled;
  }

  runFrame(
    timestampMs: DOMHighResTimeStamp,
  ): GpuFlowViewportRuntimeFrameResult {
    if (this.destroyed) {
      return { viewportChanged: false, viewportFrame: false };
    }
    const frameStartedAtMs = performanceNow();
    this.viewportFramePending = false;
    this.cancelViewportFrameRetry();
    let viewportChanged = false;
    let inputConsumeMs = 0;
    let observerSnapshotPublish = NO_OBSERVER_SNAPSHOT_PUBLISH;
    let overlayMs = 0;
    const inputStats = summarizePendingGpuViewportInputs(
      this.pendingInputs,
      frameStartedAtMs,
    );
    const inputFrame = this.pendingInputs.length > 0;
    if (inputFrame) {
      const inputConsumeStartedAtMs = performanceNow();
      viewportChanged = this.consumePendingInput() || viewportChanged;
      inputConsumeMs = performanceNow() - inputConsumeStartedAtMs;
    }
    const transitionFrame = this.transition !== null;
    if (this.transition) {
      viewportChanged = this.runTransitionFrame(timestampMs) || viewportChanged;
    }
    if (viewportChanged) {
      const overlayStartedAtMs = performanceNow();
      this.applyOverlayTransforms();
      overlayMs = performanceNow() - overlayStartedAtMs;
      observerSnapshotPublish = this.publishObserverSnapshotWhenIdle({
        force: false,
        timestampMs,
      });
    }
    this.postViewportRuntimeFrameChromeReproEvent({
      inputConsumeMs,
      inputFrame,
      inputStats,
      observerSnapshotPublish,
      overlayMs,
      runtimeFrameMs: performanceNow() - frameStartedAtMs,
      transitionFrame,
      viewportChanged,
    });
    return {
      viewportChanged,
      viewportFrame: inputFrame || viewportChanged,
    };
  }

  flushObserverSnapshot(): void {
    this.publishObserverSnapshot({ force: true });
  }

  registerOverlayManager(manager: GpuFlowViewportOverlayManager): () => void {
    this.overlayManagers.add(manager);
    manager.applyViewport(this.viewport);
    return () => {
      this.overlayManagers.delete(manager);
    };
  }

  applyOverlayTransforms(): void {
    for (const manager of this.overlayManagers) {
      manager.applyViewport(this.viewport);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.pendingInputs.length = 0;
    this.cancelViewportTransition();
    this.destroyed = true;
    this.clearTransitionCompletionTimer();
    this.cancelViewportFrameRetry();
    this.overlayManagers.clear();
    this.disconnectStore();
  }

  private consumePendingInput(): boolean {
    const inputs = this.pendingInputs.splice(0);
    let nextViewport = this.viewport;
    for (const input of inputs) {
      if (input.kind === "pan") {
        nextViewport = gpuViewportToTuple(
          panGpuViewportBy(nextViewport, input.delta),
        );
        continue;
      }
      const state = this.store.getState();
      nextViewport = gpuViewportToTuple(
        zoomGpuViewportBy({
          factor: input.factor,
          maxZoom: state.maxZoom,
          minZoom: state.minZoom,
          point: input.point,
          viewport: nextViewport,
        }),
      );
    }
    if (areGpuViewportTuplesEqual(this.viewport, nextViewport)) {
      return false;
    }
    this.viewport = nextViewport;
    return true;
  }

  private runTransitionFrame(timestampMs: DOMHighResTimeStamp): boolean {
    const transition = this.transition;
    if (!transition) {
      return false;
    }
    if (transition.startTimeMs === null) {
      transition.startTimeMs = timestampMs;
    }
    const elapsedMs = Math.max(0, timestampMs - transition.startTimeMs);
    const progress = Math.min(1, elapsedMs / transition.durationMs);
    const nextViewport = gpuViewportToTuple(
      interpolateGpuViewport(
        transition.from,
        transition.to,
        easeGpuViewportTransition(progress),
      ),
    );
    const changed = !areGpuViewportTuplesEqual(this.viewport, nextViewport);
    this.viewport = nextViewport;
    if (progress >= 1) {
      this.transition = null;
      this.clearTransitionCompletionTimer();
      this.store
        .getState()
        .setViewportInteractionFlags({ viewportAnimating: false });
      this.publishObserverSnapshot({ force: true, timestampMs });
      return changed;
    }
    this.requestViewportFrame();
    return changed;
  }

  private publishObserverSnapshot({
    force,
    timestampMs = performanceNow(),
  }: {
    readonly force: boolean;
    readonly timestampMs?: number | undefined;
  }): GpuFlowObserverSnapshotPublishResult {
    const elapsedMs = Number.isFinite(this.lastObserverPublishMs)
      ? timestampMs - this.lastObserverPublishMs
      : null;
    if (
      !force &&
      elapsedMs !== null &&
      elapsedMs < this.observerPublishIntervalMs
    ) {
      return {
        action: "throttled",
        elapsedMs: roundChromeReproMs(elapsedMs),
        publishDurationMs: null,
      };
    }
    this.lastObserverPublishMs = timestampMs;
    this.publishingObserverSnapshot = true;
    const publishStartedAtMs = performanceNow();
    try {
      this.store.getState().setTransform(this.viewport);
    } finally {
      this.publishingObserverSnapshot = false;
    }
    return {
      action: "published",
      elapsedMs: elapsedMs === null ? null : roundChromeReproMs(elapsedMs),
      publishDurationMs: roundChromeReproMs(
        performanceNow() - publishStartedAtMs,
      ),
    };
  }

  private publishObserverSnapshotWhenIdle({
    force,
    timestampMs = performanceNow(),
  }: {
    readonly force: boolean;
    readonly timestampMs?: number | undefined;
  }): GpuFlowObserverSnapshotPublishResult {
    if (this.store.getState().viewportInteractionActive) {
      const elapsedMs = Number.isFinite(this.lastObserverPublishMs)
        ? timestampMs - this.lastObserverPublishMs
        : null;
      return {
        action: "active-interaction-deferred",
        elapsedMs: elapsedMs === null ? null : roundChromeReproMs(elapsedMs),
        publishDurationMs: null,
      };
    }
    return this.publishObserverSnapshot({ force, timestampMs });
  }

  private postViewportRuntimeFrameChromeReproEvent({
    inputConsumeMs,
    inputFrame,
    inputStats,
    observerSnapshotPublish,
    overlayMs,
    runtimeFrameMs,
    transitionFrame,
    viewportChanged,
  }: {
    readonly inputConsumeMs: number;
    readonly inputFrame: boolean;
    readonly inputStats: ReturnType<typeof summarizePendingGpuViewportInputs>;
    readonly observerSnapshotPublish: GpuFlowObserverSnapshotPublishResult;
    readonly overlayMs: number;
    readonly runtimeFrameMs: number;
    readonly transitionFrame: boolean;
    readonly viewportChanged: boolean;
  }) {
    if (
      !isChromeReproActive() ||
      (!inputFrame && !transitionFrame && !viewportChanged)
    ) {
      return;
    }
    const publicStoreViewport = normalizeGpuViewport(
      this.store.getState().transform,
    );
    const runtimeViewport = normalizeGpuViewport(this.viewport);
    postChromeReproEvent("gpu-flow-viewport-runtime-frame", {
      inputConsumeMs: roundChromeReproMs(inputConsumeMs),
      inputFrame,
      observerPublishAction: observerSnapshotPublish.action,
      observerPublishDurationMs: observerSnapshotPublish.publishDurationMs,
      observerPublishElapsedMs: observerSnapshotPublish.elapsedMs,
      observerPublishIntervalMs: this.observerPublishIntervalMs,
      overlayMs: roundChromeReproMs(overlayMs),
      publicStoreViewport:
        roundGpuFlowViewportForChromeRepro(publicStoreViewport),
      runtimeFrameMs: roundChromeReproMs(runtimeFrameMs),
      runtimeViewport: roundGpuFlowViewportForChromeRepro(runtimeViewport),
      transitionFrame,
      viewportChanged,
      ...inputStats,
    });
  }

  private cancelRuntimeTransition(): boolean {
    if (!this.transition) {
      return false;
    }
    this.transition = null;
    this.clearTransitionCompletionTimer();
    this.store
      .getState()
      .setViewportInteractionFlags({ viewportAnimating: false });
    return true;
  }

  private scheduleTransitionCompletion(
    transition: ActiveGpuViewportTransition,
  ) {
    this.clearTransitionCompletionTimer();
    this.transitionCompletionHandle = setTimeout(() => {
      if (this.destroyed || this.transition !== transition) {
        return;
      }
      this.transitionCompletionHandle = null;
      this.transition = null;
      this.viewport = gpuViewportToTuple(transition.to);
      this.applyOverlayTransforms();
      this.store
        .getState()
        .setViewportInteractionFlags({ viewportAnimating: false });
      this.publishObserverSnapshot({ force: true });
      this.requestViewportFrame();
    }, transition.durationMs + 50);
  }

  private clearTransitionCompletionTimer() {
    if (this.transitionCompletionHandle === null) {
      return;
    }
    clearTimeout(this.transitionCompletionHandle);
    this.transitionCompletionHandle = null;
  }

  private requestViewportFrame() {
    if (this.viewportFramePending) {
      this.frameRequester?.("viewport");
      this.scheduleViewportFrameRetry();
      return;
    }
    this.viewportFramePending = true;
    this.frameRequester?.("viewport");
    this.scheduleViewportFrameRetry();
  }

  private scheduleViewportFrameRetry() {
    if (
      this.viewportFrameRetryHandle !== null ||
      typeof globalThis.requestAnimationFrame !== "function"
    ) {
      return;
    }
    this.viewportFrameRetryHandle = globalThis.requestAnimationFrame(
      (timestampMs) => {
        this.viewportFrameRetryHandle = null;
        if (this.destroyed || !this.viewportFramePending) {
          return;
        }
        const result = this.runFrame(timestampMs);
        if (result.viewportFrame) {
          this.frameRequester?.("viewport");
        }
        if (this.viewportFramePending) {
          this.scheduleViewportFrameRetry();
        }
      },
    );
  }

  private cancelViewportFrameRetry() {
    if (
      this.viewportFrameRetryHandle === null ||
      typeof globalThis.cancelAnimationFrame !== "function"
    ) {
      this.viewportFrameRetryHandle = null;
      return;
    }
    globalThis.cancelAnimationFrame(this.viewportFrameRetryHandle);
    this.viewportFrameRetryHandle = null;
  }
}

function interpolateGpuViewport(
  from: GpuViewport,
  to: GpuViewport,
  progress: number,
): GpuViewport {
  return {
    x: interpolateNumber(from.x, to.x, progress),
    y: interpolateNumber(from.y, to.y, progress),
    zoom: interpolateNumber(from.zoom, to.zoom, progress),
  };
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function easeGpuViewportTransition(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function areGpuViewportsEqual(left: GpuViewport, right: GpuViewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function areGpuViewportTuplesEqual(
  left: GpuViewportTuple,
  right: GpuViewportTuple,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function summarizePendingGpuViewportInputs(
  inputs: readonly PendingGpuViewportInput[],
  nowMs: number,
) {
  let maxInputAgeMs = 0;
  let panInputCount = 0;
  let zoomInputCount = 0;
  for (const input of inputs) {
    maxInputAgeMs = Math.max(maxInputAgeMs, nowMs - input.queuedAtMs);
    if (input.kind === "pan") {
      panInputCount += 1;
    } else {
      zoomInputCount += 1;
    }
  }
  return {
    maxInputAgeMs:
      inputs.length === 0 ? null : roundChromeReproMs(maxInputAgeMs),
    panInputCount,
    pendingInputCount: inputs.length,
    zoomInputCount,
  };
}

function roundGpuFlowViewportForChromeRepro(viewport: GpuViewport) {
  return {
    x: roundChromeReproMs(viewport.x),
    y: roundChromeReproMs(viewport.y),
    zoom: roundChromeReproMs(viewport.zoom),
  };
}

function normalizeFiniteNonNegative(name: string, value: number): number {
  assertFiniteNumber(name, value);
  if (value < 0) {
    throw new Error(`${name} must be non-negative.`);
  }
  return value;
}

function assertFinitePositive(name: string, value: number) {
  assertFiniteNumber(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be positive.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}

function performanceNow(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

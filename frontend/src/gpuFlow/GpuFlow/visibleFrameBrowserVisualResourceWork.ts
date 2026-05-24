import type {
  GpuFlowBrowserVisualResourceWorkRequest,
  GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
} from "./visibleFrameContentPlan";

export type GpuFlowBrowserVisualResourceWorkOutcome =
  | "blocked"
  | "held-previous";

export type GpuFlowBrowserVisualResourceReadinessState =
  | "preparing"
  | "ready"
  | "requested";

export type GpuFlowBrowserVisualResourceWakeupSource =
  | "blocked-publication"
  | "deferred-watchdog"
  | "immediate-frame-request";

export type GpuFlowBrowserVisualResourceWorkSnapshot = Omit<
  GpuFlowBrowserVisualResourceWorkRequest,
  "debtAgeFrames" | "readinessState" | "wakeupSource"
> & {
  readonly debtAgeFrames: number;
  readonly debtAgeMs: number;
  readonly firstRequestedAtMs: number;
  readonly lastUpdatedAtMs: number;
  readonly outcome: GpuFlowBrowserVisualResourceWorkOutcome;
  readonly readinessState: GpuFlowBrowserVisualResourceReadinessState;
  readonly wakeupSource: GpuFlowBrowserVisualResourceWakeupSource;
};

const browserVisualResourceWorkByCanvas = new WeakMap<
  HTMLCanvasElement,
  Map<string, GpuFlowBrowserVisualResourceWorkSnapshot>
>();

export function recordGpuFlowBrowserVisualResourceWorkRequested({
  candidateResourceWork,
  nowMs,
  outcome,
  runtimeCanvas,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualResourceWorkOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const workByKey = getGpuFlowBrowserVisualResourceWorkMap(runtimeCanvas);
  for (const item of candidateResourceWork.workItems) {
    const existing = workByKey.get(item.candidateResourceKey);
    workByKey.set(
      item.candidateResourceKey,
      Object.freeze({
        ...item,
        debtAgeFrames: (existing?.debtAgeFrames ?? item.debtAgeFrames) + 1,
        debtAgeMs: Math.max(0, nowMs - (existing?.firstRequestedAtMs ?? nowMs)),
        firstRequestedAtMs: existing?.firstRequestedAtMs ?? nowMs,
        lastUpdatedAtMs: nowMs,
        outcome,
        readinessState: "requested" as const,
        wakeupSource: "blocked-publication" as const,
      }),
    );
  }
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [...workByKey.values()],
  });
}

export function recordGpuFlowBrowserVisualResourceWorkPreparationState({
  candidateResourceWork,
  nowMs,
  readinessState,
  runtimeCanvas,
  wakeupSource,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly nowMs: number;
  readonly readinessState: GpuFlowBrowserVisualResourceReadinessState;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly wakeupSource: GpuFlowBrowserVisualResourceWakeupSource;
}): void {
  const workByKey = getGpuFlowBrowserVisualResourceWorkMap(runtimeCanvas);
  for (const item of candidateResourceWork.workItems) {
    const existing = workByKey.get(item.candidateResourceKey);
    if (!existing) {
      continue;
    }
    workByKey.set(
      item.candidateResourceKey,
      Object.freeze({
        ...existing,
        debtAgeMs: Math.max(0, nowMs - existing.firstRequestedAtMs),
        lastUpdatedAtMs: nowMs,
        readinessState,
        wakeupSource,
      }),
    );
  }
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [...workByKey.values()],
  });
}

export function clearGpuFlowBrowserVisualResourceWork(
  runtimeCanvas: HTMLCanvasElement,
): void {
  browserVisualResourceWorkByCanvas.delete(runtimeCanvas);
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [],
  });
}

function getGpuFlowBrowserVisualResourceWorkMap(
  runtimeCanvas: HTMLCanvasElement,
): Map<string, GpuFlowBrowserVisualResourceWorkSnapshot> {
  const existing = browserVisualResourceWorkByCanvas.get(runtimeCanvas);
  if (existing) {
    return existing;
  }
  const workByKey = new Map<string, GpuFlowBrowserVisualResourceWorkSnapshot>();
  browserVisualResourceWorkByCanvas.set(runtimeCanvas, workByKey);
  return workByKey;
}

function emitGpuFlowBrowserVisualResourceWorkSnapshots({
  runtimeCanvas,
  snapshots,
}: {
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly snapshots: readonly GpuFlowBrowserVisualResourceWorkSnapshot[];
}): void {
  const ownerWindow = getGpuFlowRuntimeCanvasWindow(runtimeCanvas);
  if (!ownerWindow) {
    return;
  }
  const view = ownerWindow as typeof ownerWindow & {
    __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: GpuFlowBrowserVisualResourceWorkSnapshot[];
  };
  view.__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__ = [...snapshots];
  runtimeCanvas.dispatchEvent(
    new CustomEvent("setta-gpu-flow-browser-visual-resource-work", {
      detail: snapshots,
    }),
  );
}

function getGpuFlowRuntimeCanvasWindow(
  runtimeCanvas: HTMLCanvasElement,
): (Window & typeof globalThis) | null {
  return runtimeCanvas.ownerDocument?.defaultView ?? null;
}

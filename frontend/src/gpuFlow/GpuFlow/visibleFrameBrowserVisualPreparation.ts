import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { getGpuFlowCommittedSurfacePublishabilityActorIds } from "./visibleFrameBlockedCandidate";
import { isGpuFlowBrowserVisualPreparationResourceKey } from "./visibleFrameBrowserVisualResourceKeys";
import {
  recordGpuFlowBrowserVisualResourceWorkPreparationState,
  recordGpuFlowBrowserVisualResourceWorkRequested,
  type GpuFlowBrowserVisualResourceWorkOutcome,
} from "./visibleFrameBrowserVisualResourceWork";
import type {
  GpuFlowVisibleFrameBudgetBroker,
  GpuFlowVisibleFrameBudgetDebtRequest,
} from "./visibleFrameBudgetBroker";
import type { GpuFlowCommittedSurfaceBlockedCandidateResourceWork } from "./visibleFrameContentPlan";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;
type OptionalGpuFlowBrowserVisualTextCoverageProof =
  | GpuFlowBrowserVisualTextCoverageProof
  | null
  | undefined;
type GpuFlowBrowserVisualResourcePreparationBudgetState =
  | "deferred"
  | "selected"
  | "unmanaged";

const browserVisualResourceWorkFrameTimers = new WeakMap<
  GpuSurfaceHandle,
  number
>();
const GPU_FLOW_BROWSER_VISUAL_DEFERRED_WORK_WAKEUP_MS =
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2;

export function scheduleGpuFlowBrowserVisualResourcePreparation({
  budgetBroker,
  budgetSelectedResourceKeys = [],
  candidateFrame,
  candidateResourceWork,
  deferResolutionUpdates = false,
  outcome,
  publicationDecision,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly budgetSelectedResourceKeys?: readonly string[] | undefined;
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly deferResolutionUpdates?: boolean | undefined;
  readonly outcome: GpuFlowBrowserVisualResourceWorkOutcome;
  readonly publicationDecision?:
    | Pick<
        GpuFlowVisiblePublicationDecision,
        "debt" | "lane" | "schedulerState"
      >
    | undefined;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  const hasBudgetSelectedBrowserVisualResource =
    budgetSelectedResourceKeys.some(
      isGpuFlowBrowserVisualPreparationResourceKey,
    );
  if (candidateFrame === null) {
    return;
  }
  if (candidateResourceWork === null) {
    if (hasBudgetSelectedBrowserVisualResource) {
      requestGpuFlowBrowserVisualResourceWorkFrame({
        candidateResourceWork: null,
        deferWakeup: false,
        runtimeCanvas,
        surfaceRef,
      });
    }
    return;
  }
  recordGpuFlowBrowserVisualResourceWorkRequested({
    candidateResourceWork,
    nowMs: candidateResourceWork.timestamp,
    outcome,
    runtimeCanvas,
  });
  const budgetState = selectGpuFlowBrowserVisualResourcePreparationBudgetState({
    budgetBroker,
    candidateResourceWork,
    deferResolutionUpdates,
    publicationDecision,
  });
  requestGpuFlowBrowserVisualResourceWorkFrame({
    candidateResourceWork,
    deferWakeup: shouldDeferGpuFlowBrowserVisualResourcePreparationWakeup({
      budgetState,
      candidateFrame,
      candidateResourceWork,
      hasBudgetSelectedBrowserVisualResource,
    }),
    runtimeCanvas,
    surfaceRef,
  });
}

function shouldDeferGpuFlowBrowserVisualResourcePreparationWakeup({
  budgetState,
  candidateFrame,
  candidateResourceWork,
  hasBudgetSelectedBrowserVisualResource,
}: {
  readonly budgetState: GpuFlowBrowserVisualResourcePreparationBudgetState;
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly hasBudgetSelectedBrowserVisualResource: boolean;
}): boolean {
  if (
    budgetState === "selected" ||
    hasBudgetSelectedBrowserVisualResource
  ) {
    return false;
  }
  return (
    candidateResourceWork.deferWakeup ||
    budgetState === "deferred" ||
    shouldWaitForGpuFlowBrowserVisualRepairSignal(candidateFrame)
  );
}

export function createGpuFlowBrowserVisualResourcePreparationDebtRequests({
  candidateResourceWork,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
}): readonly GpuFlowVisibleFrameBudgetDebtRequest[] {
  return Object.freeze(
    candidateResourceWork.workItems.map((item) =>
      Object.freeze({
        debtAgeFrames: item.debtAgeFrames,
        deadlineFrame: item.debtAgeFrames + 1,
        estimatedCostMs:
          estimateGpuFlowBrowserVisualResourcePreparationCostMs(item),
        id: item.candidateResourceKey,
        ownerFrameId: item.ownerFrameId,
        preparationLane: "browser-visual" as const,
        priority: "safety" as const,
        resourceState: item.readinessState,
      }),
    ),
  );
}

export function clearGpuFlowBrowserVisualResourcePreparation({
  runtimeCanvas,
  surface,
}: {
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  if (!surface) {
    return;
  }
  const timer = browserVisualResourceWorkFrameTimers.get(surface);
  if (timer === undefined) {
    return;
  }
  getGpuFlowRuntimeCanvasWindow(runtimeCanvas)?.clearTimeout(timer);
  browserVisualResourceWorkFrameTimers.delete(surface);
}

function requestGpuFlowBrowserVisualResourceWorkFrame({
  candidateResourceWork,
  deferWakeup,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly deferWakeup: boolean;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  const surface = surfaceRef.current;
  if (!surface) {
    return;
  }
  if (!deferWakeup) {
    clearGpuFlowBrowserVisualResourcePreparation({
      runtimeCanvas,
      surface,
    });
    if (candidateResourceWork !== null) {
      recordGpuFlowBrowserVisualResourceWorkPreparationState({
        candidateResourceWork,
        nowMs: candidateResourceWork.timestamp,
        readinessState: "ready",
        runtimeCanvas,
        wakeupSource: "immediate-frame-request",
      });
    }
    surface.requestFrame("texture-upload");
    return;
  }
  if (candidateResourceWork === null) {
    return;
  }
  recordGpuFlowBrowserVisualResourceWorkPreparationState({
    candidateResourceWork,
    nowMs: candidateResourceWork.timestamp,
    readinessState: "preparing",
    runtimeCanvas,
    wakeupSource: "deferred-watchdog",
  });
  if (browserVisualResourceWorkFrameTimers.has(surface)) {
    return;
  }
  const ownerWindow = getGpuFlowRuntimeCanvasWindow(runtimeCanvas);
  if (!ownerWindow) {
    recordGpuFlowBrowserVisualResourceWorkPreparationState({
      candidateResourceWork,
      nowMs: candidateResourceWork.timestamp,
      readinessState: "ready",
      runtimeCanvas,
      wakeupSource: "immediate-frame-request",
    });
    surface.requestFrame("texture-upload");
    return;
  }
  const timer = ownerWindow.setTimeout(() => {
    browserVisualResourceWorkFrameTimers.delete(surface);
    recordGpuFlowBrowserVisualResourceWorkPreparationState({
      candidateResourceWork,
      nowMs:
        candidateResourceWork.timestamp +
        GPU_FLOW_BROWSER_VISUAL_DEFERRED_WORK_WAKEUP_MS,
      readinessState: "ready",
      runtimeCanvas,
      wakeupSource: "deferred-watchdog",
    });
    surface.requestFrame("texture-upload");
  }, GPU_FLOW_BROWSER_VISUAL_DEFERRED_WORK_WAKEUP_MS);
  browserVisualResourceWorkFrameTimers.set(surface, timer);
}

function selectGpuFlowBrowserVisualResourcePreparationBudgetState({
  budgetBroker,
  candidateResourceWork,
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly budgetBroker: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision:
    | Pick<
        GpuFlowVisiblePublicationDecision,
        "debt" | "lane" | "schedulerState"
      >
    | undefined;
}): GpuFlowBrowserVisualResourcePreparationBudgetState {
  if (!budgetBroker || !publicationDecision) {
    return "unmanaged";
  }
  const requestedDebt =
    createGpuFlowBrowserVisualResourcePreparationDebtRequests({
      candidateResourceWork,
    });
  if (requestedDebt.length === 0) {
    return "unmanaged";
  }
  const decision = budgetBroker.selectFrameBudget({
    deferResolutionUpdates,
    publicationDecision,
    requestedDebt,
  });
  return requestedDebt.some((debt) =>
    decision.preparationBudget.selectedDebtIds.includes(debt.id),
  )
    ? "selected"
    : "deferred";
}

function estimateGpuFlowBrowserVisualResourcePreparationCostMs(
  item: GpuFlowCommittedSurfaceBlockedCandidateResourceWork["workItems"][number],
): number {
  switch (item.representationKind) {
    case "blocked-awaiting-browser-visual":
      return 1.5;
    case "blocked-awaiting-live-host":
      return 0.75;
    default:
      return 1;
  }
}

function shouldWaitForGpuFlowBrowserVisualRepairSignal(
  frame: GpuFlowCommittedSurfaceFrame,
): boolean {
  const blockingActorIds = new Set(
    getGpuFlowCommittedSurfacePublishabilityActorIds(frame),
  );
  return frame.actorGenerations.some(
    (actor) =>
      blockingActorIds.has(actor.actorId) &&
      (actor.kind === "dom-control" ||
        actor.kind === "dom-island" ||
        isGpuFlowBrowserVisualRepairableTextCoverageProof(
          actor.textCoverageProof,
        )),
  );
}

function isGpuFlowBrowserVisualRepairableTextCoverageProof(
  textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof,
): boolean {
  if (!textCoverage || !("readinessReason" in textCoverage)) {
    return false;
  }
  return (
    textCoverage.readinessReason === "snapshot-pending" ||
    textCoverage.readinessReason === "live-dom-budget"
  );
}

function getGpuFlowRuntimeCanvasWindow(
  runtimeCanvas: HTMLCanvasElement,
): (Window & typeof globalThis) | null {
  return runtimeCanvas.ownerDocument?.defaultView ?? null;
}

import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  applyGpuFlowProjectionDebugAttributes,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";

type GpuFlowCommittedSurfacePublicationGateResult =
  | { readonly kind: "publish" }
  | { readonly kind: "blocked" }
  | {
      readonly kind: "held-previous";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

type GpuFlowBrowserVisualStarvationOutcome = "blocked" | "held-previous";

type GpuFlowBrowserVisualStarvationReport = {
  readonly actorId: string;
  readonly actorKind: string;
  readonly ageMs: number;
  readonly blockedFrameCount: number;
  readonly blockedReason: string;
  readonly budget: "browser-visual-coverage";
  readonly generationId: string;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly pendingWorkId: string;
  readonly requiredRepresentation: string;
  readonly visibleActorCount: number;
};

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;

type GpuFlowBrowserVisualStarvationDebt = {
  readonly actorIdsKey: string;
  readonly firstBlockedAtMs: number;
  readonly frameCount: number;
};

const browserVisualStarvationDebtByCanvas = new WeakMap<
  HTMLCanvasElement,
  GpuFlowBrowserVisualStarvationDebt
>();

export function resolveGpuFlowCommittedSurfacePublicationGate({
  committedGpuNativeVisuals,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  publishedCommittedSurfaceFrame,
  publishedRetainedFrame,
  previousRetainedDisplayFrame,
  retainedDisplayFrameRef,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: MutableRefObject<RetainedDisplayFrame | null>;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): GpuFlowCommittedSurfacePublicationGateResult {
  if (
    !publishedCommittedSurfaceFrame ||
    publishedCommittedSurfaceFrame.publishability.kind === "publishable"
  ) {
    clearGpuFlowBrowserVisualStarvationDebt(runtimeCanvas);
    return { kind: "publish" };
  }
  retainedDisplayFrameRef.current = previousRetainedDisplayFrame;
  if (publishedCommittedSurfaceFrame.publishability.kind === "true-hole") {
    recordGpuFlowBrowserVisualStarvation({
      frame: publishedCommittedSurfaceFrame,
      nowMs: liveProjectionSample.timestamp,
      outcome: "blocked",
      runtimeCanvas,
    });
    throw new Error(
      `GPU Flow committed surface frame has true-hole browser visual coverage: ${getGpuFlowCommittedSurfacePublishabilityActorIds(
        publishedCommittedSurfaceFrame,
      ).join(", ")}.`,
    );
  }
  surfaceRef.current?.requestFrame("texture-upload");
  if (
    publishedCommittedSurfaceFrame.publishability.kind !== "hold-previous" ||
    !heldPreviousProjectionState
  ) {
    recordGpuFlowBrowserVisualStarvation({
      frame: publishedCommittedSurfaceFrame,
      nowMs: liveProjectionSample.timestamp,
      outcome: "blocked",
      runtimeCanvas,
    });
    return { kind: "blocked" };
  }
  recordGpuFlowBrowserVisualStarvation({
    frame: publishedCommittedSurfaceFrame,
    nowMs: liveProjectionSample.timestamp,
    outcome: "held-previous",
    runtimeCanvas,
  });
  const visibleProjectionState =
    createGpuFlowVisibleProjectionStateForRetainedPublication({
      committedGpuNativeVisuals,
      frameReasons,
      heldPreviousProjectionState,
      heldPreviousReason: "browser-visual-coverage-missing",
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame: undefined,
      publishedRetainedFrame,
      retainedDisplayOutcomeKind: "hold-previous",
    });
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: visibleProjectionState.debugState,
  });
  return { kind: "held-previous", visibleProjectionState };
}

function clearGpuFlowBrowserVisualStarvationDebt(
  runtimeCanvas: HTMLCanvasElement,
): void {
  browserVisualStarvationDebtByCanvas.delete(runtimeCanvas);
}

function recordGpuFlowBrowserVisualStarvation({
  frame,
  nowMs,
  outcome,
  runtimeCanvas,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const actorIds = getGpuFlowCommittedSurfacePublishabilityActorIds(frame);
  const actorIdsKey = actorIds.join("\n");
  const previousDebt = browserVisualStarvationDebtByCanvas.get(runtimeCanvas);
  const debt =
    previousDebt?.actorIdsKey === actorIdsKey
      ? {
          actorIdsKey,
          firstBlockedAtMs: previousDebt.firstBlockedAtMs,
          frameCount: previousDebt.frameCount + 1,
        }
      : {
          actorIdsKey,
          firstBlockedAtMs: nowMs,
          frameCount: 1,
        };
  browserVisualStarvationDebtByCanvas.set(runtimeCanvas, debt);
  const reports = createGpuFlowBrowserVisualStarvationReports({
    debt,
    frame,
    nowMs,
    outcome,
  });
  emitGpuFlowBrowserVisualStarvationReports({
    reports,
    runtimeCanvas,
  });
  if (
    isGpuFlowBrowserVisualStarvationFailFastRuntime() &&
    isGpuFlowBrowserVisualStarvationBudgetExceeded({
      ageMs: Math.max(0, nowMs - debt.firstBlockedAtMs),
      frameCount: debt.frameCount,
    })
  ) {
    throw new Error(
      `GPU Flow browser visual actor starvation exceeded budget: ${JSON.stringify(
        reports,
      )}`,
    );
  }
}

function createGpuFlowBrowserVisualStarvationReports({
  debt,
  frame,
  nowMs,
  outcome,
}: {
  readonly debt: GpuFlowBrowserVisualStarvationDebt;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
}): readonly GpuFlowBrowserVisualStarvationReport[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const ageMs = Math.max(0, nowMs - debt.firstBlockedAtMs);
  const visibleActorCount =
    frame.projectionHorizon.obligations.visibleActorIds.length;
  return Object.freeze(
    getGpuFlowCommittedSurfacePublishabilityActorIds(frame).map((actorId) =>
      createGpuFlowBrowserVisualStarvationReport({
        actor: actorById.get(actorId),
        actorId,
        ageMs,
        blockedFrameCount: debt.frameCount,
        frame,
        outcome,
        visibleActorCount,
      }),
    ),
  );
}

function createGpuFlowBrowserVisualStarvationReport({
  actor,
  actorId,
  ageMs,
  blockedFrameCount,
  frame,
  outcome,
  visibleActorCount,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string;
  readonly ageMs: number;
  readonly blockedFrameCount: number;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly visibleActorCount: number;
}): GpuFlowBrowserVisualStarvationReport {
  const textCoverage = actor?.textCoverageProof;
  return Object.freeze({
    actorId,
    actorKind: actor?.kind ?? "unknown",
    ageMs,
    blockedFrameCount,
    blockedReason: getGpuFlowBrowserVisualBlockedReason({
      frame,
      textCoverage,
    }),
    budget: "browser-visual-coverage",
    generationId: actor?.generationId ?? "unknown",
    outcome,
    pendingWorkId: getGpuFlowBrowserVisualPendingWorkId({
      actor,
      actorId,
      textCoverage,
    }),
    requiredRepresentation: getGpuFlowBrowserVisualRequiredRepresentation({
      frame,
      textCoverage,
    }),
    visibleActorCount,
  });
}

function getGpuFlowBrowserVisualBlockedReason({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: GpuFlowBrowserVisualTextCoverageProof | undefined;
}): string {
  if (textCoverage?.readinessReason) {
    return textCoverage.readinessReason;
  }
  return frame.publishability.reason ?? "browser-visual-coverage-missing";
}

function getGpuFlowBrowserVisualPendingWorkId({
  actor,
  actorId,
  textCoverage,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string;
  readonly textCoverage: GpuFlowBrowserVisualTextCoverageProof | undefined;
}): string {
  if (textCoverage?.snapshotCacheKeyRevision) {
    return [actorId, textCoverage.snapshotCacheKeyRevision].join("|");
  }
  if (textCoverage?.visualGenerationId) {
    return [actorId, textCoverage.visualGenerationId].join("|");
  }
  return [actorId, actor?.generationId ?? "unknown"].join("|");
}

function getGpuFlowBrowserVisualRequiredRepresentation({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: GpuFlowBrowserVisualTextCoverageProof | undefined;
}): string {
  return textCoverage?.projectionCoverage ?? frame.publishability.kind;
}

function getGpuFlowCommittedSurfacePublishabilityActorIds(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorIds
    : frame.publishability.blockingActorIds;
}

function emitGpuFlowBrowserVisualStarvationReports({
  reports,
  runtimeCanvas,
}: {
  readonly reports: readonly GpuFlowBrowserVisualStarvationReport[];
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const ownerWindow = runtimeCanvas.ownerDocument.defaultView;
  if (!ownerWindow) {
    return;
  }
  const view = ownerWindow as typeof ownerWindow & {
    __SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__?: GpuFlowBrowserVisualStarvationReport[];
  };
  const existingReports =
    view.__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__ ?? [];
  view.__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__ = [
    ...existingReports,
    ...reports,
  ];
  for (const report of reports) {
    runtimeCanvas.dispatchEvent(
      new CustomEvent("setta-gpu-flow-browser-visual-starvation", {
        detail: report,
      }),
    );
  }
}

function isGpuFlowBrowserVisualStarvationBudgetExceeded({
  ageMs,
  frameCount,
}: {
  readonly ageMs: number;
  readonly frameCount: number;
}): boolean {
  return (
    frameCount >
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames ||
    ageMs > DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousMs
  );
}

function isGpuFlowBrowserVisualStarvationFailFastRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}

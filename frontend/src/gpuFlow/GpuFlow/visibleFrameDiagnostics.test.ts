/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  recordGpuFlowBlockedVisiblePublication,
  recordGpuFlowVisibleFrameBlocked,
  recordGpuFlowVisibleFrameHeld,
} from "./visibleFrameDiagnostics";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowCommittedSurfacePublicationCandidateInput,
  type GpuFlowCommittedSurfacePublicationEffect,
} from "./visibleFrameContentPlan";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./visibleFramePublicationTestUtils";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFrameTypes";

const prepareCommittedSurfacePublicationFramePlanForTest =
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisiblePublicationContentDecisionKernel(),
  });

describe("GPU Flow committed surface publication effect executor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__;
    delete (
      window as typeof window & {
        __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__;
  });

  it("emits browser visual starvation reports for blocked actor coverage", () => {
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();
    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("nonpublishable");
    if (result.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable publication candidate.");
    }
    expect(result.blockedPublicationCandidate.frozenFrameId).toBe(
      GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    );
    expect(result.candidateFrame.displayFrameId).toBe(2);
    expect(result.preservePreparationSnapshot).toBe(true);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(readStarvationReports()).toEqual([]);
    applyPublicationEffect(result.effect, { canvas, requestFrame });
    expect(requestFrame).not.toHaveBeenCalled();
    expect(readStarvationReports()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        actorKind: "dom-control",
        blockedFrameCount: 1,
        blockedReason: "snapshot-pending",
        budget: "browser-visual-coverage",
        generationId: "generation-a",
        outcome: "blocked",
        pendingWorkId: "actor-a|snapshot-key",
        requiredRepresentation: "blocked-awaiting-browser-visual",
        visibleActorCount: 1,
      }),
    ]);
    expect(readBlockedVisiblePublicationEvents()).toEqual([]);
  });

  it("uses a deferred watchdog while waiting for browser visual repair signals during motion-heavy publication", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        deferBrowserVisualRetry: true,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("nonpublishable");
    applyPublicationEffect(result.effect, { canvas, requestFrame });
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2 - 1,
    );
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("rejects unbranded publication effect tokens", () => {
    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        timestamp: 10,
      }),
    );
    const canvas = document.createElement("canvas");

    expect(() =>
      recordGpuFlowVisibleFrameBlocked({
        effect: result.effect,
        runtimeCanvas: canvas,
        surfaceRef: {
          current: { requestFrame: vi.fn() } as unknown as GpuSurfaceHandle,
        },
        token: {} as Parameters<
          typeof recordGpuFlowVisibleFrameBlocked
        >[0]["token"],
      }),
    ).toThrow(/blocked publication token/);
  });

  it("records rejected held-prepared candidates as blocked effects", () => {
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    recordGpuFlowVisibleFrameBlocked({
      effect: {
        candidateFrame: blockedCommittedSurfaceFrame(),
        deferRetry: false,
        kind: "rejected-candidate",
        timestamp: 12,
      },
      runtimeCanvas: canvas,
      surfaceRef: {
        current: { requestFrame } as unknown as GpuSurfaceHandle,
      },
      token: blockedPublicationToken(),
    });

    expect(readStarvationReports()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        outcome: "blocked",
      }),
    ]);
  });

  it("treats publish effects as no-op inputs for blocked or held outcomes owned by other proofs", () => {
    const blockedCanvas = document.createElement("canvas");
    const heldCanvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    recordGpuFlowVisibleFrameBlocked({
      effect: { kind: "publish" },
      runtimeCanvas: blockedCanvas,
      surfaceRef: {
        current: { requestFrame } as unknown as GpuSurfaceHandle,
      },
      token: blockedPublicationToken(),
    });
    recordGpuFlowVisibleFrameHeld({
      effect: { kind: "publish" },
      runtimeCanvas: heldCanvas,
      surfaceRef: {
        current: { requestFrame } as unknown as GpuSurfaceHandle,
      },
      token: heldPreviousPublicationToken(),
    });

    expect(requestFrame).not.toHaveBeenCalled();
    expect(readStarvationReports()).toEqual([]);
  });

  it("records cold-start shell blocked publication without a committed candidate frame", () => {
    const canvas = document.createElement("canvas");
    const token = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "coverage-missing",
        },
      ],
      frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      projectionSample: {
        id: 9,
      } as Parameters<
        typeof createGpuFlowVisibleFrameBlockedPublicationTokenForTest
      >[0]["projectionSample"],
    });

    recordGpuFlowBlockedVisiblePublication({
      frame: null,
      publicationCompletion: {
        debt: { content: true, maintenance: false, motion: false },
        outcome: "blocked",
      },
      publicationDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["texture-upload"],
        sample: { id: 9 },
        schedulerState: "content-catchup",
      } as unknown as Parameters<
        typeof recordGpuFlowBlockedVisiblePublication
      >[0]["publicationDecision"],
      runtimeCanvas: canvas,
      token,
    });

    expect(readBlockedVisiblePublicationEvents()).toEqual([
      expect.objectContaining({
        blockedReasons: [
          {
            actorId: null,
            family: "retained-projection",
            reason: "coverage-missing",
          },
        ],
        candidateFrameId: null,
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        publicationLane: "content",
        projectionSampleId: 9,
        remainingDebt: { content: true, maintenance: false, motion: false },
        schedulerOutcome: "blocked",
        schedulerState: "content-catchup",
      }),
    ]);
  });

  it("rejects blocked publication records for a different selected sample", () => {
    const canvas = document.createElement("canvas");
    const token = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "coverage-missing",
        },
      ],
      frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      projectionSample: {
        id: 9,
      } as Parameters<
        typeof createGpuFlowVisibleFrameBlockedPublicationTokenForTest
      >[0]["projectionSample"],
    });

    expect(() =>
      recordGpuFlowBlockedVisiblePublication({
        frame: null,
        publicationCompletion: {
          debt: { content: true, maintenance: false, motion: false },
          outcome: "blocked",
        },
        publicationDecision: {
          debt: { content: false, maintenance: false, motion: false },
          lane: "content",
          rawReasons: ["texture-upload"],
          sample: { id: 10 },
          schedulerState: "content-catchup",
        } as unknown as Parameters<
          typeof recordGpuFlowBlockedVisiblePublication
        >[0]["publicationDecision"],
        runtimeCanvas: canvas,
        token,
      }),
    ).toThrow(/blocked token for the selected projection sample/);
    expect(readBlockedVisiblePublicationEvents()).toEqual([]);
  });

  it("rejects blocked publication records without a blocked scheduler completion", () => {
    const canvas = document.createElement("canvas");

    expect(() =>
      recordGpuFlowBlockedVisiblePublication({
        frame: null,
        publicationCompletion: {
          debt: { content: true, maintenance: false, motion: false },
          outcome: "commit",
        },
        publicationDecision: {
          debt: { content: false, maintenance: false, motion: false },
          lane: "content",
          rawReasons: ["texture-upload"],
          sample: { id: 9 },
          schedulerState: "content-catchup",
        } as unknown as Parameters<
          typeof recordGpuFlowBlockedVisiblePublication
        >[0]["publicationDecision"],
        runtimeCanvas: canvas,
        token: createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
          blockedReasons: [
            {
              actorId: null,
              family: "retained-projection",
              reason: "coverage-missing",
            },
          ],
          frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
          projectionSample: {
            id: 9,
          } as Parameters<
            typeof createGpuFlowVisibleFrameBlockedPublicationTokenForTest
          >[0]["projectionSample"],
        }),
      }),
    ).toThrow(/blocked scheduler completion/);
    expect(readBlockedVisiblePublicationEvents()).toEqual([]);
  });

  it("fails loudly in test runtime when browser visual coverage starves beyond budget", () => {
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();
    for (
      let index = 0;
      index < DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames;
      index += 1
    ) {
      expect(() =>
        applyPublicationEffect(
          prepareGpuFlowCommittedSurfacePublicationCandidate(
            publicationCandidateInput({
              timestamp: index,
            }),
          ).effect,
          { canvas, requestFrame },
        ),
      ).not.toThrow();
    }

    expect(() =>
      applyPublicationEffect(
        prepareGpuFlowCommittedSurfacePublicationCandidate(
          publicationCandidateInput({
            timestamp:
              DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames,
          }),
        ).effect,
        { canvas, requestFrame },
      ),
    ).toThrow(/browser visual actor starvation exceeded budget/);
  });
});

function publicationCandidateInput({
  deferBrowserVisualRetry = false,
  timestamp,
}: {
  readonly deferBrowserVisualRetry?: boolean | undefined;
  readonly timestamp: number;
}): GpuFlowCommittedSurfacePublicationCandidateInput {
  const retainedFrame = {} as RetainedDisplayFrame;
  return {
    committedGpuNativeVisuals: undefined,
    deferBrowserVisualRetry,
    frameReasons: ["manual"],
    heldPreviousProjectionState: null,
    liveProjectionSample: { id: 1, timestamp },
    publicationLane: "content",
    publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame(),
    publishedRetainedFrame: retainedFrame,
  } as unknown as GpuFlowCommittedSurfacePublicationCandidateInput;
}

function prepareGpuFlowCommittedSurfacePublicationCandidate(
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) {
  return prepareCommittedSurfacePublicationFramePlanForTest(input).candidate;
}

function applyPublicationEffect(
  effect: GpuFlowCommittedSurfacePublicationEffect,
  {
    canvas,
    requestFrame,
  }: {
    readonly canvas: HTMLCanvasElement;
    readonly requestFrame: (reason: GpuFrameReason) => void;
  },
): void {
  recordGpuFlowVisibleFrameBlocked({
    effect,
    runtimeCanvas: canvas,
    surfaceRef: {
      current: { requestFrame } as unknown as GpuSurfaceHandle,
    },
    token: blockedPublicationToken(),
  });
}

function blockedPublicationToken() {
  return createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
    blockedReasons: [
      {
        actorId: "actor-a",
        family: "browser-visual",
        reason: "snapshot-pending",
      },
    ],
    frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    projectionSample: {
      id: 1,
    } as Parameters<
      typeof createGpuFlowVisibleFrameBlockedPublicationTokenForTest
    >[0]["projectionSample"],
  });
}

function heldPreviousPublicationToken() {
  return createGpuFlowVisibleFrameHoldPreviousTokenForTest({
    committedFrameId: 2,
    holdAgeFrames: 1,
    holdAgeMs: 16,
    projectionSample: {
      id: 1,
    } as Parameters<
      typeof createGpuFlowVisibleFrameHoldPreviousTokenForTest
    >[0]["projectionSample"],
  });
}

function blockedCommittedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [
      {
        actorId: "actor-a",
        generationId: "generation-a",
        kind: "dom-control",
        textCoverageProof: {
          projectionCoverage: "blocked-awaiting-browser-visual",
          readinessReason: "snapshot-pending",
          snapshotCacheKeyRevision: "snapshot-key",
          visualGenerationId: "visual-a",
        },
      },
    ],
    displayFrameId: 2,
    projectionHorizon: {
      obligations: {
        visibleActorIds: ["actor-a"],
      },
    },
    publishability: {
      blockingActorIds: ["actor-a"],
      kind: "hold-previous",
      reason: "visible-dom-control-not-projected",
      status: "blocked",
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function readStarvationReports(): readonly unknown[] {
  return (
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__?: readonly unknown[];
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__ ?? []
  );
}

function readBlockedVisiblePublicationEvents(): readonly unknown[] {
  return (
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly unknown[];
      }
    ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? []
  );
}

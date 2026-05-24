/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
  type GpuFlowCommittedSurfacePublicationCandidateInput,
} from "./visibleFrameContentPlan";
import {
  recordGpuFlowBlockedVisiblePublication,
  recordGpuFlowVisibleFrameBlocked,
  recordGpuFlowVisibleFrameHeld,
  recordGpuFlowVisibleFramePresented,
} from "./visibleFrameDiagnostics";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameCommitPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./visibleFrameTestUtils";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFrameTypes";

const prepareCommittedSurfacePublicationFramePlanForTest =
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisiblePublicationContentDecisionKernel(),
  });

describe("GPU Flow visible frame blocked candidate diagnostics", () => {
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
        __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__;
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
    expect(readBrowserVisualResourceWork()).toEqual([]);
    applyBlockedCandidate(result.candidateFrame, result.resourceWork, {
      canvas,
      requestFrame,
    });
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
    expect(readBrowserVisualResourceWork()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        blockedReason: "snapshot-pending",
        candidateResourceKey:
          "browser-visual:actor-a:text-like-dom-control:snapshot-pending:snapshot-key",
        ownerFrameId: 2,
        readinessState: "preparing",
        representationKind: "blocked-awaiting-browser-visual",
        sourceHostIdentity: "actor-a",
        wakeupSource: "deferred-watchdog",
      }),
    ]);
    expect(readBlockedVisiblePublicationEvents()).toEqual([]);
  });

  it("uses a deferred watchdog while waiting for browser visual repair signals during motion-heavy publication", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();
    const surface = { requestFrame } as unknown as GpuSurfaceHandle;

    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        deferBrowserVisualWakeup: true,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("nonpublishable");
    if (result.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable publication candidate.");
    }
    applyBlockedCandidate(result.candidateFrame, result.resourceWork, {
      canvas,
      requestFrame,
    });
    expect(requestFrame).not.toHaveBeenCalled();
    expect(readBrowserVisualResourceWork()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        readinessState: "preparing",
        wakeupSource: "deferred-watchdog",
      }),
    ]);
    vi.advanceTimersByTime(
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2 - 1,
    );
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(readBrowserVisualResourceWork()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        readinessState: "ready",
        wakeupSource: "deferred-watchdog",
      }),
    ]);
  });

  it("keeps browser visual repair work alive across motion-only commits", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();
    const surface = { requestFrame } as unknown as GpuSurfaceHandle;

    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        deferBrowserVisualWakeup: true,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("nonpublishable");
    if (result.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable publication candidate.");
    }
    applyBlockedCandidate(result.candidateFrame, result.resourceWork, {
      canvas,
      requestFrame,
      surface,
    });

    recordGpuFlowVisibleFramePresented({
      committedSurfaceFrame: null,
      runtimeCanvas: canvas,
      surfaceRef: { current: surface },
      token: commitPublicationToken(),
    });

    expect(readBrowserVisualResourceWork()).toEqual([
      expect.objectContaining({
        actorId: "actor-a",
        readinessState: "preparing",
      }),
    ]);
    vi.advanceTimersByTime(
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2,
    );
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("clears browser visual repair work after a committed surface frame presents", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();
    const surface = { requestFrame } as unknown as GpuSurfaceHandle;

    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        deferBrowserVisualWakeup: true,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("nonpublishable");
    if (result.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable publication candidate.");
    }
    applyBlockedCandidate(result.candidateFrame, result.resourceWork, {
      canvas,
      requestFrame,
      surface,
    });

    recordGpuFlowVisibleFramePresented({
      committedSurfaceFrame: result.candidateFrame,
      runtimeCanvas: canvas,
      surfaceRef: { current: surface },
      token: commitPublicationToken(),
    });

    expect(readBrowserVisualResourceWork()).toEqual([]);
    vi.advanceTimersByTime(
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2,
    );
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");
  });

  it("rejects unbranded blocked candidate tokens", () => {
    const result = prepareGpuFlowCommittedSurfacePublicationCandidate(
      publicationCandidateInput({
        timestamp: 10,
      }),
    );
    const canvas = document.createElement("canvas");
    if (result.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable publication candidate.");
    }

    expect(() =>
      recordGpuFlowVisibleFrameBlocked({
        candidateFrame: result.candidateFrame,
        candidateResourceWork: result.resourceWork,
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

  it("records held-prepared candidates as blocked outcomes", () => {
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    recordGpuFlowVisibleFrameBlocked({
      candidateFrame: blockedCommittedSurfaceFrame(),
      candidateResourceWork: {
        deferWakeup: false,
        timestamp: 12,
        workItems: [],
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

  it("records required actor-family manifest diagnostics on blocked publication events", () => {
    const canvas = document.createElement("canvas");

    recordGpuFlowBlockedVisiblePublication({
      frame: blockedCommittedSurfaceFrame(),
      publicationCompletion: {
        debt: { content: true, maintenance: false, motion: false },
        outcome: "blocked",
      },
      publicationDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["texture-upload"],
        sample: { id: 1 },
        schedulerState: "content-catchup",
      } as unknown as Parameters<
        typeof recordGpuFlowBlockedVisiblePublication
      >[0]["publicationDecision"],
      runtimeCanvas: canvas,
      token: blockedPublicationToken(),
    });

    expect(readBlockedVisiblePublicationEvents()).toEqual([
      expect.objectContaining({
        actorManifest: expect.objectContaining({
          blockedActorsByFamily: { "browser-text-snapshot": 1 },
          blockedDebt: { content: true, maintenance: false, motion: false },
          committedFrameId: 2,
          missingActorsByFamily: { "browser-text-snapshot": 1 },
          readyActorsByFamily: {
            "accessibility-exposure": 1,
            "debug-snapshot": 1,
            edges: 1,
            grid: 1,
            "hit-generation": 1,
            "public-runtime-state": 1,
            "scene-background": 1,
            "viewport-portal": 1,
          },
          requiredActorsByFamily: {
            "accessibility-exposure": 1,
            "browser-text-snapshot": 1,
            "debug-snapshot": 1,
            edges: 1,
            grid: 1,
            "hit-generation": 1,
            "public-runtime-state": 1,
            "scene-background": 1,
            "viewport-portal": 1,
          },
          visibleOutcome: "blocked",
        }),
      }),
    ]);
  });

  it("treats missing blocked candidates as no-op inputs for blocked or held outcomes owned by other proofs", () => {
    const blockedCanvas = document.createElement("canvas");
    const heldCanvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    recordGpuFlowVisibleFrameBlocked({
      candidateFrame: null,
      candidateResourceWork: null,
      runtimeCanvas: blockedCanvas,
      surfaceRef: {
        current: { requestFrame } as unknown as GpuSurfaceHandle,
      },
      token: blockedPublicationToken(),
    });
    recordGpuFlowVisibleFrameHeld({
      candidateFrame: null,
      candidateResourceWork: null,
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
        applyPreparedBlockedCandidate(
          prepareGpuFlowCommittedSurfacePublicationCandidate(
            publicationCandidateInput({
              timestamp: index,
            }),
          ),
          { canvas, requestFrame },
        ),
      ).not.toThrow();
    }

    expect(() =>
      applyPreparedBlockedCandidate(
        prepareGpuFlowCommittedSurfacePublicationCandidate(
          publicationCandidateInput({
            timestamp:
              DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames,
          }),
        ),
        { canvas, requestFrame },
      ),
    ).toThrow(/browser visual actor starvation exceeded budget/);
  });
});

function publicationCandidateInput({
  deferBrowserVisualWakeup = false,
  timestamp,
}: {
  readonly deferBrowserVisualWakeup?: boolean | undefined;
  readonly timestamp: number;
}): GpuFlowCommittedSurfacePublicationCandidateInput {
  const retainedFrame = {} as RetainedDisplayFrame;
  return {
    committedGpuNativeVisuals: undefined,
    deferBrowserVisualWakeup,
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

function applyPreparedBlockedCandidate(
  candidate: ReturnType<
    typeof prepareGpuFlowCommittedSurfacePublicationCandidate
  >,
  output: {
    readonly canvas: HTMLCanvasElement;
    readonly requestFrame: (reason: GpuFrameReason) => void;
  },
): void {
  if (candidate.kind !== "nonpublishable") {
    throw new Error("Expected nonpublishable committed surface candidate.");
  }
  applyBlockedCandidate(
    candidate.candidateFrame,
    candidate.resourceWork,
    output,
  );
}

function applyBlockedCandidate(
  candidateFrame: GpuFlowCommittedSurfaceFrame,
  candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
  {
    canvas,
    requestFrame,
    surface = { requestFrame } as unknown as GpuSurfaceHandle,
  }: {
    readonly canvas: HTMLCanvasElement;
    readonly requestFrame: (reason: GpuFrameReason) => void;
    readonly surface?: GpuSurfaceHandle | undefined;
  },
): void {
  recordGpuFlowVisibleFrameBlocked({
    candidateFrame,
    candidateResourceWork,
    runtimeCanvas: canvas,
    surfaceRef: { current: surface },
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

function commitPublicationToken() {
  return createGpuFlowVisibleFrameCommitPublicationTokenForTest({
    frame: publishableCommittedSurfaceFrame(3),
    projectionSample: {
      id: 1,
    } as Parameters<
      typeof createGpuFlowVisibleFrameCommitPublicationTokenForTest
    >[0]["projectionSample"],
  });
}

function publishableCommittedSurfaceFrame(
  displayFrameId: number,
): GpuFlowCommittedSurfaceFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      obligations: {
        visibleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function blockedCommittedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 2;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [
      {
        actorFamily: "text-like-dom-control",
        actorId: "actor-a",
        generationId: "generation-a",
        kind: "dom-control",
        mountReadiness: "not-required",
        projectionReadiness: "not-required",
        textCoverageProof: {
          projectionCoverage: "blocked-awaiting-browser-visual",
          readinessReason: "snapshot-pending",
          snapshotCacheKeyRevision: "snapshot-key",
          visualGenerationId: "visual-a",
        },
        visibleNonempty: true,
      },
    ],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
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

function readBrowserVisualResourceWork(): readonly unknown[] {
  return (
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: readonly unknown[];
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__ ?? []
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

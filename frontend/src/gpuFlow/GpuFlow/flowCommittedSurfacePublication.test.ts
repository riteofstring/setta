/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { resolveGpuFlowCommittedSurfacePublicationGate } from "./flowCommittedSurfacePublication";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";

describe("GPU Flow committed surface publication gate", () => {
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
    const result = resolveGpuFlowCommittedSurfacePublicationGate(
      gateInput({
        canvas,
        requestFrame,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") {
      throw new Error("Expected blocked publication result.");
    }
    expect(result.token.transactionId).toBe(
      "blocked:frame-cold-start-shell:browser-visual:sample-1",
    );
    expect(result.token.frozenFrame).toEqual({
      frame: {
        id: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
        input: "disabled",
        kind: "cold-start-shell",
        reason: "browser-visual-publication-blocked-before-first-commit",
      },
      frameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      kind: "cold-start-shell",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
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
    expect(readBlockedVisiblePublicationEvents()).toEqual([
      expect.objectContaining({
        blockedReasons: [
          {
            actorId: "actor-a",
            family: "dom-control",
            reason: "snapshot-pending",
          },
        ],
        candidateFrameId: 2,
        frozenFrame: result.token.frozenFrame,
        frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
        projectionSampleId: 1,
        tokenTransactionId:
          "blocked:frame-cold-start-shell:browser-visual:sample-1",
      }),
    ]);
  });

  it("defers browser visual retry frames during motion-heavy publication", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const requestFrame = vi.fn();

    const result = resolveGpuFlowCommittedSurfacePublicationGate(
      gateInput({
        canvas,
        deferBrowserVisualRetry: true,
        requestFrame,
        timestamp: 10,
      }),
    );

    expect(result.kind).toBe("blocked");
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(159);
    expect(requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
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
        resolveGpuFlowCommittedSurfacePublicationGate(
          gateInput({
            canvas,
            requestFrame,
            timestamp: index,
          }),
        ),
      ).not.toThrow();
    }

    expect(() =>
      resolveGpuFlowCommittedSurfacePublicationGate(
        gateInput({
          canvas,
          requestFrame,
          timestamp:
            DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames,
        }),
      ),
    ).toThrow(/browser visual actor starvation exceeded budget/);
  });
});

function gateInput({
  canvas,
  deferBrowserVisualRetry = false,
  requestFrame,
  timestamp,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly deferBrowserVisualRetry?: boolean | undefined;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly timestamp: number;
}): Parameters<typeof resolveGpuFlowCommittedSurfacePublicationGate>[0] {
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
    previousRetainedDisplayFrame: retainedFrame,
    retainedDisplayFrameRef: { current: retainedFrame },
    runtimeCanvas: canvas,
    surfaceRef: {
      current: { requestFrame } as unknown as GpuSurfaceHandle,
    },
  } as unknown as Parameters<
    typeof resolveGpuFlowCommittedSurfacePublicationGate
  >[0];
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

/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { resolveGpuFlowCommittedSurfacePublicationGate } from "./flowCommittedSurfacePublication";

describe("GPU Flow committed surface publication gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__;
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

    expect(result).toEqual({ kind: "blocked" });
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
  requestFrame,
  timestamp,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly timestamp: number;
}): Parameters<typeof resolveGpuFlowCommittedSurfacePublicationGate>[0] {
  const retainedFrame = {} as RetainedDisplayFrame;
  return {
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState: null,
    liveProjectionSample: { timestamp },
    publicationLane: "content",
    publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame(),
    publishedRetainedFrame: retainedFrame,
    previousRetainedDisplayFrame: retainedFrame,
    retainedDisplayFrameRef: { current: retainedFrame },
    runtimeCanvas: canvas,
    surfaceRef: {
      current: { requestFrame } as unknown as GpuSurfaceHandle,
    },
  } as Parameters<typeof resolveGpuFlowCommittedSurfacePublicationGate>[0];
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

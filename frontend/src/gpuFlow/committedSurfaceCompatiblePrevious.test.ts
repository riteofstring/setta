import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceBrowserVisualReadiness,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import { createGpuFlowDomControlCompatiblePreviousProof } from "./GpuFlow/domControlPlaneCompatibility";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

type GpuFlowCommittedSurfaceActor =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
type GpuFlowCommittedSurfaceDomControlSource =
  GpuFlowCommittedSurfaceFrame["retainedRuntimeFrame"]["descriptors"]["domControlSources"][number];

describe("GPU Flow committed surface compatible-previous coverage", () => {
  it("publishes compatible-previous DOM-control coverage from a prior committed frame", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame();

    expectCompatiblePreviousDomControlActor({ actor, frame });
    expectCompatiblePreviousSurfaceCoverage({ actor, frame });
  });

  it("publishes compatible-previous DOM-control coverage while the current snapshot is pending", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame({
      readiness: "blocked-awaiting-snapshot",
    });

    expectCompatiblePreviousDomControlActor({ actor, frame });
    expectCompatiblePreviousSurfaceCoverage({ actor, frame });
  });

  it("publishes compatible-previous DOM-control coverage while the current live host is pending", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame({
      readiness: "blocked-awaiting-live-host",
      visualPolicy: "live-dom",
    });

    expectCompatiblePreviousDomControlActor({ actor, frame });
    expectCompatiblePreviousSurfaceCoverage({ actor, frame });
  });

  it("does not publish compatible-previous DOM-control coverage beyond the frame-age budget", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame({
      retainedFrameId: 14,
      previousRetainedFrameId: 10,
    });

    expectBlockedCompatiblePreviousDomControlActor({ actor, frame });
  });

  it("does not publish compatible-previous DOM-control coverage beyond the millisecond-age budget", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame({
      publishedAtMs: 250,
      previousPublishedAtMs: 0,
    });

    expectBlockedCompatiblePreviousDomControlActor({ actor, frame });
  });
});

function createCompatiblePreviousCommittedSurfaceFrame({
  publishedAtMs,
  previousPublishedAtMs,
  previousRetainedFrameId = 13,
  readiness = "compatible-previous",
  retainedFrameId = 14,
  visualPolicy = "blocked-awaiting-browser-visual",
}: {
  readonly publishedAtMs?: number | undefined;
  readonly previousPublishedAtMs?: number | undefined;
  readonly previousRetainedFrameId?: number | undefined;
  readonly readiness?:
    | "blocked-awaiting-live-host"
    | "blocked-awaiting-snapshot"
    | "compatible-previous";
  readonly retainedFrameId?: number | undefined;
  readonly visualPolicy?: GpuFlowCommittedSurfaceDomControlSource["visualPolicy"];
} = {}): {
  readonly actor: GpuFlowCommittedSurfaceActor | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
} {
  const previousRetainedRuntimeFrame = createRuntimeFrame({
    frameId: previousRetainedFrameId,
    scrollRevision: 1,
    scrollY: 0,
  });
  const previousCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
    browserVisualReadiness: createReadyBrowserVisualReadiness(
      previousRetainedRuntimeFrame,
    ),
    retainedDisplayFrame: fakeRetainedDisplayFrame({
      id: previousRetainedFrameId,
      publishedAtMs: previousPublishedAtMs,
      retainedRuntimeFrame: previousRetainedRuntimeFrame,
    }),
  });
  const retainedRuntimeFrame = withDomControlVisualPolicy(
    createRuntimeFrame({
      frameId: retainedFrameId,
      scrollRevision: 1,
      scrollY: 0,
    }),
    visualPolicy,
  );
  const frame = createGpuFlowCommittedSurfaceFrame({
    browserVisualReadiness:
      readiness === "compatible-previous"
        ? createCompatiblePreviousBrowserVisualReadiness({
            retainedRuntimeFrame,
            previousRetainedRuntimeFrame,
          })
        : createBlockedBrowserVisualReadiness(retainedRuntimeFrame, readiness),
    previousCommittedSurfaceFrame,
    retainedDisplayFrame: fakeRetainedDisplayFrame({
      id: retainedFrameId,
      publishedAtMs,
      retainedRuntimeFrame,
    }),
  });
  return {
    actor: frame.actorGenerations.find(
      (candidate) => candidate.kind === "dom-control",
    ),
    frame,
  };
}

function expectCompatiblePreviousDomControlActor({
  actor,
  frame,
}: {
  readonly actor: GpuFlowCommittedSurfaceActor | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  expect(actor).toBeDefined();
  const committedActor = actor as GpuFlowCommittedSurfaceActor;
  expectCompatiblePreviousBrowserVisual(committedActor);
  expectCompatiblePreviousTextCoverage(committedActor);
  expectCompatiblePreviousFramePublication({ actor: committedActor, frame });
}

function expectBlockedCompatiblePreviousDomControlActor({
  actor,
  frame,
}: {
  readonly actor: GpuFlowCommittedSurfaceActor | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  expect(actor).toBeDefined();
  expect(actor?.browserVisual?.coverageState).toBe("blocked-awaiting-snapshot");
  expect(actor?.textCoverageProof).toEqual(
    expect.objectContaining({
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    }),
  );
  expect(frame.displayCompleteness.status).toBe("complete");
  expect(frame.publishability.kind).toBe("publishable");
  expect(frame.surfaceTransaction).toEqual(
    expect.objectContaining({
      id: "committed-surface:14:retained:14",
    }),
  );
}

function expectCompatiblePreviousBrowserVisual(
  actor: GpuFlowCommittedSurfaceActor,
): void {
  expect(actor.browserVisual).toEqual(
    expect.objectContaining({
      coverageState: "compatible-previous-ready",
      representation: expect.objectContaining({
        kind: "compatible-previous",
      }),
      representationKind: "compatible-previous",
      resourceHandles: [
        {
          id: actor.actorId,
          kind: "source",
        },
      ],
    }),
  );
}

function expectCompatiblePreviousTextCoverage(
  actor: GpuFlowCommittedSurfaceActor,
): void {
  expect(actor.textCoverageProof).toEqual(
    expect.objectContaining({
      compatiblePreviousProof: expect.objectContaining({
        actorFamily: "text-like-dom-control",
        actorId: actor.actorId,
        budgetState: "within-budget",
        canonicalActorId: actor.canonicalActorId,
        clipChainRevision: actor.clipChainRevision,
        hitMappingCompatible: true,
        hitTargetId: actor.controlId,
        maxProofAgeFrames: 2,
        maxProofAgeMs: 120,
        previousActorGenerationId: expect.any(String),
        previousContentFrameId: 13,
        previousProjectionSampleRevision: expect.any(String),
        previousTransactionId: "committed-surface:13:retained:13",
        previousVisualGenerationId: actor.visualGenerationId,
        proofAgeFrames: 1,
        proofAgeMs: 1,
        protectedResourceIds: [`source:${actor.actorId}`],
        reasonCode: "same-value-and-geometry",
        requestedActorGenerationId: actor.generationId,
        requestedProjectionSampleRevision: actor.liveMotionSampleId,
        requestedVisualGenerationId: actor.visualGenerationId,
        resourceHandles: [
          {
            id: actor.actorId,
            kind: "source",
          },
        ],
        retainedScrollCompatible: true,
        retainedSurfaceId: actor.ownerSurfaceId,
        semanticGenerationId: actor.semanticGenerationId,
      }),
      previousVisualGenerationId: actor.visualGenerationId,
      projectionCoverage: "compatible-previous",
    }),
  );
}

function expectCompatiblePreviousFramePublication({
  actor,
  frame,
}: {
  readonly actor: GpuFlowCommittedSurfaceActor;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  expect(frame.displayCompleteness.status).toBe("complete");
  expect(frame.publishability.kind).toBe("publishable");
  expect(frame.projectionHorizon.textActorCoverage).toEqual(
    expect.objectContaining({
      compatiblePreviousActorIds: [actor.actorId],
    }),
  );
}

function expectCompatiblePreviousSurfaceCoverage({
  actor,
  frame,
}: {
  readonly actor: GpuFlowCommittedSurfaceActor | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  expect(frame.surfaceTransaction).toEqual(
    expect.objectContaining({
      hitIndex: expect.objectContaining({
        id: "committed-hit:14",
        generationIds: expect.arrayContaining([expect.any(String)]),
      }),
      id: "committed-surface:14:retained:14",
    }),
  );
  expect(frame.surfaceTransaction?.coverageProof.compatibleCoverage).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        surfaceId: `dom-control:${actor?.actorId}`,
      }),
    ]),
  );
  expect(frame.browserVisualSurfaceFragment.compatibleCoverage).toEqual([
    expect.objectContaining({
      fidelity: "compatible",
      resourceHandles: [
        {
          id: actor?.actorId,
          kind: "source",
        },
      ],
      surfaceId: `dom-control:${actor?.actorId}`,
    }),
  ]);
  expect(frame.browserVisualSurfaceFragment.blockingSurfaceIds).toEqual([]);
}

function createRuntimeFrame({
  activeControl = false,
  frameId,
  scrollRevision = frameId,
  scrollY = frameId,
  value = "hello",
  viewport = [0, 0, 1],
}: {
  readonly activeControl?: boolean | undefined;
  readonly frameId: number;
  readonly scrollRevision?: number | undefined;
  readonly scrollY?: number | undefined;
  readonly value?: string | undefined;
  readonly viewport?: [number, number, number] | undefined;
}) {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 1,
    frameId,
    scene: sceneWithRetainedContentSurface(value, activeControl),
    scrollOffsets: new Map([
      ["dict-a:param-content:unpinned", { x: 0, y: scrollY }],
    ]),
    scrollRevision,
    scrollRevisions: new Map([
      ["dict-a:param-content:unpinned", scrollRevision],
    ]),
    viewport,
    viewportZoomBucket: 1,
  });
}

function withDomControlVisualPolicy(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
  visualPolicy: GpuFlowCommittedSurfaceDomControlSource["visualPolicy"],
): ReturnType<typeof createRuntimeFrame> {
  return {
    ...retainedRuntimeFrame,
    descriptors: {
      ...retainedRuntimeFrame.descriptors,
      domControlSources: retainedRuntimeFrame.descriptors.domControlSources.map(
        (control) => ({
          ...control,
          projectionVisibility: "viewport-visible" as const,
          snapshotSurfaceId: null,
          visualPolicy,
        }),
      ),
    },
  };
}

function fakeRetainedDisplayFrame({
  id,
  publishedAtMs = id,
  retainedRuntimeFrame,
}: {
  readonly id: number;
  readonly publishedAtMs?: number | undefined;
  readonly retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>;
}): RetainedDisplayFrame {
  return {
    diagnostics: {
      publishedAtMs,
      transactionOutcome: "publish-exact",
    },
    flatSurfaces: [],
    id,
    retainedRuntimeFrame,
    surfaceActorSnapshots: [],
    surfaceTransaction: {
      activeDomIslandTransaction: {
        islands: [],
        mode: "none",
      },
      coverageProof: {
        blockingGenerationIds: [],
        blockingSurfaceIds: [],
        compatibilityProof: {
          compatibleForActiveDomIsland: true,
          compatibleForClipChain: true,
          compatibleForHitTesting: true,
          compatibleForMotion: true,
          compatibleForSourceWindow: true,
          compatibleForVisuals: true,
          rejectedCandidates: [],
        },
        compatibleCoverage: [],
        exactCoverage: [],
        protectedResourceHandles: [],
        rendererBuckets: [],
        trueHoleRects: [],
        visibleRects: [],
        zOrder: [],
      },
      desiredSurfaceGenerations: [],
      diagnostics: {
        hold: null,
        publishedAtMs,
      },
      drawCommands: [],
      followUpWorkRequests: [],
      hitIndex: {
        generationIds: [],
        id: `retained-hit:${id}`,
      },
      id: `retained:${id}`,
      motionFrame: {
        activeIslands: [],
        retainedScrollOffset: null,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      protectedResourceHandles: [],
      rendererBuckets: [],
      zOrder: [],
    },
  } as unknown as RetainedDisplayFrame;
}

function createReadyBrowserVisualReadiness(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
): GpuFlowCommittedSurfaceBrowserVisualReadiness {
  return {
    domControlReadinessByActorId: new Map(
      retainedRuntimeFrame.descriptors.domControlSources.map((control) => [
        control.sourceId,
        {
          coverageState: "live-host-ready" as const,
          resourceHandles: [{ id: control.sourceId, kind: "source" as const }],
        },
      ]),
    ),
    domIslandReadinessByActorId: new Map(),
  };
}

function createBlockedBrowserVisualReadiness(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
  coverageState:
    | "blocked-awaiting-live-host"
    | "blocked-awaiting-snapshot" = "blocked-awaiting-snapshot",
): GpuFlowCommittedSurfaceBrowserVisualReadiness {
  return {
    domControlReadinessByActorId: new Map(
      retainedRuntimeFrame.descriptors.domControlSources.map((control) => [
        control.sourceId,
        { coverageState },
      ]),
    ),
    domIslandReadinessByActorId: new Map(),
  };
}

function createCompatiblePreviousBrowserVisualReadiness({
  previousRetainedRuntimeFrame,
  retainedRuntimeFrame,
}: {
  readonly previousRetainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>;
  readonly retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>;
}): GpuFlowCommittedSurfaceBrowserVisualReadiness {
  const previousControlById = new Map(
    previousRetainedRuntimeFrame.descriptors.domControlSources.map(
      (control) => [control.sourceId, control],
    ),
  );
  return {
    domControlReadinessByActorId: new Map(
      retainedRuntimeFrame.descriptors.domControlSources.map((control) => {
        const previous = previousControlById.get(control.sourceId);
        const compatibilityProof = previous
          ? createGpuFlowDomControlCompatiblePreviousProof({
              current: control,
              previous,
            })
          : null;
        return [
          control.sourceId,
          compatibilityProof
            ? {
                compatibilityProof,
                coverageState: "compatible-previous-ready" as const,
              }
            : { coverageState: "blocked-awaiting-snapshot" as const },
        ];
      }),
    ),
    domIslandReadinessByActorId: new Map(),
  };
}

function sceneWithRetainedContentSurface(
  value: string,
  activeControl = false,
): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurface(value, activeControl)],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedContentSurface(
  value: string,
  activeControl = false,
): GpuContentSurface {
  const rect = { height: 120, width: 240, x: 10, y: 20 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: {
            commitPolicy: "native-island",
            defaultDisplayValue: "",
            displayValue: value,
            editorKind: "text",
            kind: "text-like",
            policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
            renderOwner: "dom-owned",
            rendererFamily: "text-like",
          },
          controlKind: "text-like",
          depth: 0,
          id: "param-a",
          label: "Param A",
          state: activeControl ? { nativeControlActive: true } : undefined,
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 2,
  };
}

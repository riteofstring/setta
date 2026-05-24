import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type {
  ProtectedSurfaceResourceHandle,
  SurfaceResourceHandle,
} from "../surfaceCompositor/surfaceCoverage";
import type { GpuFlowBrowserVisualActorCandidate } from "./browserVisualActorRuntime";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisibleFrameResourceGraph,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionDigest,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceGraph";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameCommitPublicationTokenForTest,
} from "./visibleFrameTestUtils";

describe("GPU Flow visible frame resource graph proofs", () => {
  it("reports null frames as protected empty resource sets", () => {
    expect(
      createGpuFlowVisiblePublicationResourceProtectionReport(null),
    ).toEqual({
      missingResourceKeys: [],
      protected: true,
      protectedResourceKeys: [],
      requiredResourceKeys: [],
    });
  });

  it("derives required and protected resources from one transaction proof surface", () => {
    const exactPage = resourceHandle("page", "exact-page");
    const compatiblePage = resourceHandle("page", "compatible-page");
    const frame = committedSurfaceFrame({
      compatibleSurfaceResourceHandles: [compatiblePage],
      exactSurfaceResourceHandles: [exactPage],
      protectedResourceHandles: [protectedResource(exactPage)],
    });

    expect(
      createGpuFlowVisiblePublicationResourceProtectionReport(frame),
    ).toEqual({
      missingResourceKeys: ["page:compatible-page"],
      protected: false,
      protectedResourceKeys: ["page:exact-page"],
      requiredResourceKeys: ["page:exact-page", "page:compatible-page"],
    });
  });

  it("turns missing protected resources into blocked visible reasons", () => {
    const frame = committedSurfaceFrame({
      exactSurfaceResourceHandles: [resourceHandle("texture", "actor-texture")],
      protectedResourceHandles: [],
    });

    expect(
      createGpuFlowVisiblePublicationResourceBlockedReasons(frame),
    ).toEqual([
      {
        actorId: null,
        family: "resource-protection",
        reason: "missing-protected-resource:texture:actor-texture",
      },
    ]);
  });

  it("rejects commit protection reports with missing resources", () => {
    const report = createGpuFlowVisiblePublicationResourceProtectionReport(
      committedSurfaceFrame({
        exactSurfaceResourceHandles: [resourceHandle("source", "source-a")],
        protectedResourceHandles: [],
      }),
    );

    expect(() =>
      assertGpuFlowVisiblePublicationResourcesProtected(report),
    ).toThrow(/requires protected resources.*source:source-a/);
  });

  it("creates stable resource protection digests for proof commit proofs", () => {
    const report = createGpuFlowVisiblePublicationResourceProtectionReport(
      committedSurfaceFrame({
        exactSurfaceResourceHandles: [resourceHandle("source", "source-b")],
        protectedResourceHandles: [
          protectedResource(resourceHandle("source", "source-b")),
          protectedResource(resourceHandle("texture", "extra-texture")),
        ],
      }),
    );

    expect(
      createGpuFlowVisiblePublicationResourceProtectionDigest(report),
    ).toBe(
      JSON.stringify({
        missingResourceKeys: [],
        protected: true,
        protectedResourceKeys: ["source:source-b", "texture:extra-texture"],
        requiredResourceKeys: ["source:source-b"],
      }),
    );
  });

  it("owns prepared candidate resources and active editor pins", () => {
    const registry = createGpuFlowVisibleFrameResourceGraph();
    const surfaceTexture = resourceHandle("texture", "surface-texture");
    const frame = committedSurfaceFrame({
      displayFrameId: 41,
      exactSurfaceResourceHandles: [surfaceTexture],
      protectedResourceHandles: [protectedResource(surfaceTexture)],
    });

    registry.registerPreparedCommittedSurfaceFrame({
      browserVisualCandidate: browserVisualCandidate({
        controls: [
          domControl({ active: true, sourceId: "row-a" }),
          domControl({
            sourceId: "row-b",
            snapshotSurfaceId: "snapshot-row-b",
          }),
        ],
        frameId: frame.displayFrameId,
        islands: [{ id: "island-a" }],
        mountedControlIds: ["row-a"],
        snapshotControlIds: ["row-b"],
      }),
      frame,
    });

    expect(registry.getSnapshot()).toEqual({
      activeEditorPins: ["row-a"],
      candidateResourceKeys: [
        "texture:surface-texture",
        "dom-control:row-a",
        "dom-control-snapshot:snapshot-row-b",
        "dom-island:island-a",
      ],
      committedFrameId: null,
      committedResourceKeys: [],
      pendingCandidateFrameIds: [41],
    });
  });

  it("commits one candidate, records committed resources, and releases loser candidates", () => {
    const registry = createGpuFlowVisibleFrameResourceGraph();
    const loserResource = resourceHandle("page", "loser-page");
    const winnerResource = resourceHandle("page", "winner-page");
    const loserFrame = committedSurfaceFrame({
      displayFrameId: 51,
      exactSurfaceResourceHandles: [loserResource],
      protectedResourceHandles: [protectedResource(loserResource)],
    });
    const winnerFrame = committedSurfaceFrame({
      displayFrameId: 52,
      exactSurfaceResourceHandles: [winnerResource],
      protectedResourceHandles: [protectedResource(winnerResource)],
    });
    const loserCandidate = browserVisualCandidate({
      controls: [domControl({ sourceId: "loser-control" })],
      frameId: loserFrame.displayFrameId,
      mountedControlIds: ["loser-control"],
    });
    const winnerCandidate = browserVisualCandidate({
      controls: [domControl({ active: true, sourceId: "winner-control" })],
      frameId: winnerFrame.displayFrameId,
      mountedControlIds: ["winner-control"],
    });
    registry.registerPreparedCommittedSurfaceFrame({
      browserVisualCandidate: loserCandidate,
      frame: loserFrame,
    });
    registry.registerPreparedCommittedSurfaceFrame({
      browserVisualCandidate: winnerCandidate,
      frame: winnerFrame,
    });

    const committedCandidates: GpuFlowBrowserVisualActorCandidate[] = [];
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: winnerFrame,
      projectionSample: liveProjectionSample(52),
    });
    const result = registry.commitPreparedCommittedSurfaceFrame({
      commitBrowserVisualCandidate: ({ candidate }) => {
        committedCandidates.push(candidate);
      },
      frame: winnerFrame,
      publishCommittedSurfaceFrame: () => true,
      token,
    });

    expect(committedCandidates).toEqual([winnerCandidate]);
    expect(result).toEqual({
      activeEditorPins: ["winner-control"],
      published: true,
      releasedCandidateResourceKeys: [
        "page:loser-page",
        "dom-control:loser-control",
      ],
      releasedCommittedResourceKeys: [],
    });
    expect(registry.getSnapshot()).toEqual({
      activeEditorPins: [],
      candidateResourceKeys: [],
      committedFrameId: 52,
      committedResourceKeys: ["page:winner-page"],
      pendingCandidateFrameIds: [],
    });
  });

  it("releases candidate resources on abort without changing the committed owner", () => {
    const registry = createGpuFlowVisibleFrameResourceGraph();
    const candidateResource = resourceHandle("texture", "candidate-texture");
    const frame = committedSurfaceFrame({
      displayFrameId: 61,
      exactSurfaceResourceHandles: [candidateResource],
      protectedResourceHandles: [protectedResource(candidateResource)],
    });
    const candidate = browserVisualCandidate({
      controls: [domControl({ active: true, sourceId: "candidate-control" })],
      frameId: frame.displayFrameId,
      mountedControlIds: ["candidate-control"],
    });
    registry.registerPreparedCommittedSurfaceFrame({
      browserVisualCandidate: candidate,
      frame,
    });
    const abortedCandidates: GpuFlowBrowserVisualActorCandidate[] = [];

    const result = registry.abortPreparedCommittedSurfaceFrame({
      abortBrowserVisualCandidate: ({ candidate }) => {
        abortedCandidates.push(candidate);
      },
      frame,
      preservePreparationSnapshot: false,
      stageBrowserVisualCandidate: () => {
        throw new Error("Unexpected preserved candidate staging.");
      },
      token: createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
        blockedReasons: [
          {
            actorId: "candidate-control",
            family: "browser-visual",
            reason: "snapshot-pending",
          },
        ],
        frozenFrameId: frame.displayFrameId,
        projectionSample: liveProjectionSample(61),
      }),
    });

    expect(abortedCandidates).toEqual([candidate]);
    expect(result).toEqual({
      activeEditorPins: ["candidate-control"],
      releasedCandidateResourceKeys: [
        "texture:candidate-texture",
        "dom-control:candidate-control",
      ],
    });
    expect(registry.getSnapshot()).toEqual({
      activeEditorPins: [],
      candidateResourceKeys: [],
      committedFrameId: null,
      committedResourceKeys: [],
      pendingCandidateFrameIds: [],
    });
  });
});

function committedSurfaceFrame({
  actorResourceHandles = [],
  compatiblePreviousResourceHandles = [],
  compatibleSurfaceResourceHandles = [],
  displayFrameId = 1,
  exactSurfaceResourceHandles = [],
  protectedResourceHandles = [],
}: {
  readonly actorResourceHandles?: readonly SurfaceResourceHandle[] | undefined;
  readonly compatiblePreviousResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly compatibleSurfaceResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly displayFrameId?: number | undefined;
  readonly exactSurfaceResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly protectedResourceHandles?:
    | readonly ProtectedSurfaceResourceHandle[]
    | undefined;
}): GpuFlowCommittedSurfaceFrame {
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
  const actorGenerations =
    actorResourceHandles.length > 0 ||
    compatiblePreviousResourceHandles.length > 0
      ? [
          {
            browserVisual: {
              resourceHandles: actorResourceHandles,
            },
            textCoverageProof: {
              compatiblePreviousProof: {
                resourceHandles: compatiblePreviousResourceHandles,
              },
              projectionCoverage: "compatible-previous",
            },
          },
        ]
      : [];
  const surfaceTransaction = {
    activeDomIslandTransaction: {
      islands: [],
      mode: "none",
    },
    coverageProof: {
      blockingGenerationIds: [],
      blockingSurfaceIds: [],
      compatibleCoverage: [
        {
          resourceHandles: compatibleSurfaceResourceHandles,
        },
      ],
      exactCoverage: [
        {
          resourceHandles: exactSurfaceResourceHandles,
        },
      ],
      protectedResourceHandles,
      rendererBuckets: [],
      trueHoleRects: [],
      visibleRects: [],
      zOrder: [],
    },
    desiredSurfaceGenerations: [],
    diagnostics: {},
    drawCommands: [],
    followUpWorkRequests: [],
    hitIndex: {
      generationIds: [],
      id: `hit:${displayFrameId}`,
    },
    id: `surface-transaction:${displayFrameId}`,
    motionFrame: {},
    protectedResourceHandles,
    rendererBuckets: [],
    zOrder: [],
  };
  return {
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      actorGenerations:
        actorGenerations as unknown as GpuFlowCommittedSurfaceFrame["actorGenerations"],
      coherence,
      displayFrameId,
      surfaceTransaction:
        surfaceTransaction as unknown as GpuFlowCommittedSurfaceFrame["surfaceTransaction"],
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function browserVisualCandidate({
  controls = [],
  frameId,
  islands = [],
  mountedControlIds = [],
  snapshotControlIds = [],
}: {
  readonly controls?: readonly ReturnType<typeof domControl>[] | undefined;
  readonly frameId: number;
  readonly islands?: readonly { readonly id: string }[] | undefined;
  readonly mountedControlIds?: readonly string[] | undefined;
  readonly snapshotControlIds?: readonly string[] | undefined;
}): GpuFlowBrowserVisualActorCandidate {
  const controlById = new Map(
    controls.map((control) => [control.sourceId, control]),
  );
  return {
    id: `candidate:${frameId}`,
    presentationEvidence: {},
    readiness: {
      domControlReadinessByActorId: new Map(),
      domIslandReadinessByActorId: new Map(),
    },
    snapshot: {
      domControls: {
        assignments: [],
        controlById,
        controls,
        mountedControls: controls.filter((control) =>
          mountedControlIds.includes(control.sourceId),
        ),
        snapshotControls: controls.filter((control) =>
          snapshotControlIds.includes(control.sourceId),
        ),
        sourceRevision: `source:${frameId}`,
      },
      domIslands: {
        islands,
      },
      frameIds: {
        committedFrameId: frameId,
        runtimeFrameId: frameId,
      },
      publicationToken: null,
    },
  } as unknown as GpuFlowBrowserVisualActorCandidate;
}

function domControl({
  active = false,
  caret = "hidden",
  composition = "inactive",
  selection = "none",
  snapshotSurfaceId = null,
  sourceId,
}: {
  readonly active?: boolean | undefined;
  readonly caret?: "hidden" | "visible" | undefined;
  readonly composition?: "active" | "inactive" | undefined;
  readonly selection?: "collapsed" | "none" | "range" | undefined;
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly sourceId: string;
}) {
  return {
    active,
    snapshotSurfaceId,
    sourceId,
    textCoverageState: {
      caret,
      composition,
      selection,
    },
    visualSemantics: {
      accessibility: active
        ? "active-browser-editor"
        : "visual-only-aria-hidden",
    },
  };
}

function liveProjectionSample(id: number): GpuFlowLiveProjectionSample {
  return {
    id,
    retainedScrollOffsets: new Map(),
    timestamp: id * 16,
    viewport: [0, 0, 1],
  } as unknown as GpuFlowLiveProjectionSample;
}

function resourceHandle(
  kind: SurfaceResourceHandle["kind"],
  id: string,
): SurfaceResourceHandle {
  return { id, kind };
}

function protectedResource(
  handle: SurfaceResourceHandle,
): ProtectedSurfaceResourceHandle {
  return {
    ...handle,
    reason: "published-transaction",
  };
}

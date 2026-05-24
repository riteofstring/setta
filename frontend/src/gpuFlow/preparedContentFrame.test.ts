import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import { createGpuFlowDomControlCompatiblePreviousProof } from "./GpuFlow/domControlPlaneCompatibility";
import type { HtmlSurfaceSolidRoundedRectVisual } from "./htmlSurfaces/visualScene";
import {
  assertGpuFlowPreparedContentFrameCoherent,
  createGpuFlowPreparedContentFrame,
  createGpuFlowPreparedContentFrameRenderSignature,
  createGpuFlowPreparedContentPresentationProof,
  createGpuFlowStartupPreparedContentFrame,
  type GpuFlowPreparedContentBrowserVisualReadiness,
  type GpuFlowPreparedContentFrame,
} from "./preparedContentFrame";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("GPU Flow prepared content frame", () => {
  it("requires runtime-proven DOM-control coverage before reporting actor readiness", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 3 });
    const frame = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame,
    });

    const domControlActors = frame.actorGenerations.filter(
      (actor) => actor.kind === "dom-control",
    );
    expect(domControlActors).toHaveLength(1);
    const domControlActor = domControlActors[0];
    if (!domControlActor) {
      throw new Error("Expected a prepared DOM-control actor.");
    }
    expect(JSON.parse(domControlActor.canonicalActorId)).toEqual({
      actorFamily: "text-like-dom-control",
      ownerIdentity: "param-a",
      ownerSurfaceId: "dict-a:param-content:unpinned",
      representationRole: "browser-text-control",
    });
    expect(domControlActor.generationClassification).toEqual(
      expect.objectContaining({
        contentGenerationId: domControlActor.contentGenerationId,
        projectionGenerationId: domControlActor.layoutProjectionGenerationId,
        representationRole: "browser-text-control",
        semanticGenerationId: domControlActor.semanticGenerationId,
        visualGenerationId: domControlActor.visualGenerationId,
      }),
    );
    expect(domControlActor).toEqual(
      expect.objectContaining({
        ownerSurfaceId: "dict-a:param-content:unpinned",
        projectionReadiness: "not-required",
        retainedScrollRevision: 3,
        rowId: "param-a",
        actorFamily: "text-like-dom-control",
        accessibilityProjection: "browser-dom",
        activationPolicy: "requires-current-visual",
        browserVisual: expect.objectContaining({
          coverageExemption: null,
          coverageRequired: {
            reason: "value-text",
            required: true,
          },
          coverageState: "blocked-awaiting-live-host",
          nonemptyReason: "value-text",
          representationKind: "blocked",
          visibilityReason: "visible",
        }),
        textCoverageProof: expect.objectContaining({
          activationPolicy: "requires-current-visual",
          focusable: false,
          pointerSemantics: "retained-activation-model",
          projectionCoverage: "blocked-awaiting-live-host",
          readinessReason: "live-dom-budget",
          rendererSource: "browser-dom",
          role: "text-like",
          selectable: "none",
        }),
        wheelPolicy: "retained-scroll-or-editor-scroll",
      }),
    );
    expect(frame.displayCompleteness.status).toBe("startup");
    expect(frame.surfaceTransaction).toBeNull();
    expect(frame.displayCompleteness.blockingActorIds).toEqual([
      "retained-dom-control:dict-a:param-content:unpinned:param-a",
    ]);
    expect(frame.browserVisualSurfaceFragment).toEqual(
      expect.objectContaining({
        blockingSurfaceIds: [
          "dom-control:retained-dom-control:dict-a:param-content:unpinned:param-a",
        ],
        compatibleCoverage: [],
        exactCoverage: [],
        visibleRects: [
          expect.objectContaining({
            height: expect.any(Number),
            width: expect.any(Number),
          }),
        ],
      }),
    );
    expect(frame.browserVisualSurfaceFragment.actorSnapshots).toHaveLength(1);
    expect(frame.displayCompleteness.visibleNonemptyDomControlCount).toBe(1);
    expect(frame.publishability).toEqual(
      expect.objectContaining({
        kind: "block-first-publication",
        status: "startup",
        textActorCount: 1,
        textActorExactCoverageCount: 0,
        visibleNonemptyTextActorCount: 1,
      }),
    );
    expect(
      frame.projectionHorizon.actorFamilyCoverage.domControlActorIds,
    ).toEqual(["retained-dom-control:dict-a:param-content:unpinned:param-a"]);
    expect(frame.projectionHorizon.viewport.overscanCssPx).toBe(720);
    expect(frame.projectionHorizon.textActorCoverage).toEqual({
      blockedAwaitingBrowserVisualActorIds: [],
      blockedAwaitingLiveHostActorIds: [
        "retained-dom-control:dict-a:param-content:unpinned:param-a",
      ],
      compatiblePreviousActorIds: [],
      exactLiveDomActorIds: [],
      exactSnapshotActorIds: [],
      trueHoleActorIds: [],
    });
  });

  it("uses the prepared GPU-native visual set when publishing actors", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 12 });
    const frame = createGpuFlowPreparedContentFrame({
      gpuNativeVisuals: [nativeVisual("switch-animation")],
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 12,
        retainedRuntimeFrame,
      }),
    });

    const nativeActors = frame.actorGenerations.filter(
      (actor) => actor.kind === "gpu-native-visual",
    );
    expect(nativeActors).toHaveLength(1);
    expect(nativeActors[0]).toEqual(
      expect.objectContaining({
        actorId: "switch-animation:native-visual:0",
        flowRect: { height: 8, width: 24, x: 4, y: 6 },
        ownerSurfaceId: "switch-animation",
        retainedScrollRevision: 12,
        valueStyleRevision: "3|10,20,30,0.5",
      }),
    );
    expect(frame.diagnostics.gpuNativeVisualActorCount).toBe(1);
  });

  it("uses the published display frame id for every visible prepared content family", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 7 });
    const frame = createGpuFlowPreparedContentFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 7,
        retainedRuntimeFrame,
      }),
    });

    expect(frame.coherence).toEqual(
      expect.objectContaining({
        canvasRetainedFrameId: 7,
        debugSnapshotFrameId: 7,
        domControlPreparedFrameId: 7,
        domIslandPreparedFrameId: 7,
        gpuNativeVisualPreparedFrameId: 7,
        hitGenerationId: "prepared-hit:7",
        htmlTextureOverlayPreparedFrameId: 7,
        retainedScrollRevision: 7,
      }),
    );
  });

  it("includes actor generations in the render signature", () => {
    const first = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 8 }),
    });
    const second = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        value: "changed",
      }),
    });

    expect(createGpuFlowPreparedContentFrameRenderSignature(first)).not.toBe(
      createGpuFlowPreparedContentFrameRenderSignature(second),
    );
    expect(
      first.actorGenerations.find((actor) => actor.kind === "dom-control")
        ?.visualGenerationId,
    ).not.toBe(
      second.actorGenerations.find((actor) => actor.kind === "dom-control")
        ?.visualGenerationId,
    );
  });

  it("keeps viewport-only motion out of the prepared render signature", () => {
    const first = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 8,
        scrollRevision: 3,
        scrollY: 12,
        viewport: [0, 0, 1],
      }),
    });
    const second = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        scrollRevision: 3,
        scrollY: 12,
        viewport: [40, -20, 1.25],
      }),
    });

    expect(createGpuFlowPreparedContentFrameRenderSignature(first)).toBe(
      createGpuFlowPreparedContentFrameRenderSignature(second),
    );
  });

  it("splits passive actor content identity from retained scroll projection identity", () => {
    const first = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 8,
        scrollRevision: 3,
        scrollY: 12,
      }),
    });
    const second = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        scrollRevision: 4,
        scrollY: 18,
      }),
    });
    const firstControl = findPreparedDomControlActor(first);
    const secondControl = findPreparedDomControlActor(second);

    expect(firstControl.contentGenerationId).toBe(
      secondControl.contentGenerationId,
    );
    expect(firstControl.canonicalActorId).toBe(secondControl.canonicalActorId);
    expect(firstControl.generationClassification.contentGenerationId).toBe(
      secondControl.generationClassification.contentGenerationId,
    );
    expect(firstControl.layoutProjectionGenerationId).not.toBe(
      secondControl.layoutProjectionGenerationId,
    );
    expect(
      firstControl.generationClassification.projectionGenerationId,
    ).not.toBe(secondControl.generationClassification.projectionGenerationId);
  });

  it("rejects visible frame id drift across prepared content families", () => {
    const frame = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 4 }),
    });
    const drifted: GpuFlowPreparedContentFrame = {
      ...frame,
      coherence: {
        ...frame.coherence,
        domControlPreparedFrameId: 5,
      },
    };

    expect(() => assertGpuFlowPreparedContentFrameCoherent(drifted)).toThrow(
      /incoherent visible frame ids/,
    );
  });

  it("rejects presentation proofs that do not match the actor manifest", () => {
    const frame = createGpuFlowStartupPreparedContentFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 4 }),
    });
    const staleProof: GpuFlowPreparedContentFrame = {
      ...frame,
      presentationProof: createGpuFlowPreparedContentPresentationProof({
        actorGenerations: [],
        browserVisualSurfaceFragment: frame.browserVisualSurfaceFragment,
        coherence: frame.coherence,
        displayFrameId: frame.displayFrameId,
        surfaceTransaction: frame.surfaceTransaction,
      }),
    };

    expect(() => assertGpuFlowPreparedContentFrameCoherent(staleProof)).toThrow(
      /actor manifest and browser visual resources/,
    );
  });

  it("keeps blocked passive visible DOM-control actors as publishable browser visual debt", () => {
    const retainedRuntimeFrame = createBlockedRuntimeFrame({ frameId: 5 });
    const frame = createGpuFlowPreparedContentFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 5,
        retainedRuntimeFrame,
      }),
    });

    expect(() =>
      assertGpuFlowPreparedContentFrameCoherent(frame),
    ).not.toThrow();
    expect(frame.displayCompleteness.status).toBe("complete");
    expect(frame.displayCompleteness.blockingActorIds).toEqual([]);
    expect(frame.publishability).toEqual(
      expect.objectContaining({
        kind: "publishable",
        status: "publishable",
      }),
    );
    expect(
      frame.projectionHorizon.textActorCoverage
        .blockedAwaitingBrowserVisualActorIds.length,
    ).toBeGreaterThan(0);
  });

  it("blocks active visible DOM-control actors until live host coverage is ready", () => {
    const retainedRuntimeFrame = createRuntimeFrame({
      activeControl: true,
      frameId: 20,
    });
    const frame = createGpuFlowPreparedContentFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 20,
        retainedRuntimeFrame,
      }),
    });
    const actor = findPreparedDomControlActor(frame);

    expect(actor.active).toBe(true);
    expect(actor.browserVisual?.coverageState).toBe(
      "blocked-awaiting-live-host",
    );
    expect(frame.displayCompleteness.status).toBe("blocked");
    expect(frame.displayCompleteness.blockingActorIds).toEqual([actor.actorId]);
    expect(frame.publishability).toEqual(
      expect.objectContaining({
        kind: "hold-previous",
        reason: "visible-dom-control-not-projected",
        status: "blocked",
      }),
    );
    expect(frame.surfaceTransaction).toBeNull();
  });

  it("does not chain compatible-previous DOM-control coverage beyond one prepared frame", () => {
    const previousPreparedContentFrame =
      createCompatiblePreviousPreparedContentFrame().frame;
    const retainedRuntimeFrame = withDomControlVisualPolicy(
      createRuntimeFrame({
        frameId: 17,
        scrollRevision: 1,
        scrollY: 0,
      }),
      "blocked-awaiting-browser-visual",
    );
    const frame = createGpuFlowPreparedContentFrame({
      previousPreparedContentFrame,
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 17,
        retainedRuntimeFrame,
      }),
    });
    const actor = frame.actorGenerations.find(
      (candidate) => candidate.kind === "dom-control",
    );

    expect(actor?.browserVisual?.coverageState).toBe(
      "blocked-awaiting-snapshot",
    );
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
        id: "prepared-content:17:retained:17",
      }),
    );
  });

  it("does not publish compatible-previous coverage from a previously blocked actor", () => {
    const previousRetainedRuntimeFrame = withDomControlVisualPolicy(
      createRuntimeFrame({
        frameId: 15,
        scrollRevision: 1,
        scrollY: 0,
      }),
      "blocked-awaiting-browser-visual",
    );
    const previousPreparedContentFrame = createGpuFlowPreparedContentFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 15,
        retainedRuntimeFrame: previousRetainedRuntimeFrame,
      }),
    });
    const retainedRuntimeFrame = withDomControlVisualPolicy(
      createRuntimeFrame({
        frameId: 16,
        scrollRevision: 1,
        scrollY: 0,
      }),
      "blocked-awaiting-browser-visual",
    );
    const frame = createGpuFlowPreparedContentFrame({
      previousPreparedContentFrame,
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 16,
        retainedRuntimeFrame,
      }),
    });
    const actor = frame.actorGenerations.find(
      (candidate) => candidate.kind === "dom-control",
    );

    expect(actor?.browserVisual?.coverageState).toBe(
      "blocked-awaiting-snapshot",
    );
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
        id: "prepared-content:16:retained:16",
      }),
    );
    expect(frame.browserVisualSurfaceFragment.blockingSurfaceIds).toEqual([
      `dom-control:${actor?.actorId}`,
    ]);
    expect(frame.browserVisualSurfaceFragment.exactCoverage).toEqual([]);
    expect(frame.browserVisualSurfaceFragment.compatibleCoverage).toEqual([]);
  });

  it("reports typed publishability and retained-scroll horizon diagnostics", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 6 });
    const frame = createGpuFlowPreparedContentFrame({
      browserVisualReadiness:
        createReadyBrowserVisualReadiness(retainedRuntimeFrame),
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 6,
        retainedRuntimeFrame,
      }),
    });

    expect(frame.publishability.kind).toBe("publishable");
    expect(frame.surfaceTransaction).toEqual(
      expect.objectContaining({
        hitIndex: expect.objectContaining({
          id: "prepared-hit:6",
        }),
        id: "prepared-content:6:retained:6",
      }),
    );
    expect(frame.surfaceTransaction?.coverageProof.exactCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surfaceId:
            "dom-control:retained-dom-control:dict-a:param-content:unpinned:param-a",
        }),
      ]),
    );
    expect(frame.browserVisualSurfaceFragment.exactCoverage).toEqual([
      expect.objectContaining({
        fidelity: "exact",
        resourceHandles: [
          {
            id: "retained-dom-control:dict-a:param-content:unpinned:param-a",
            kind: "source",
          },
        ],
        surfaceId:
          "dom-control:retained-dom-control:dict-a:param-content:unpinned:param-a",
      }),
    ]);
    expect(frame.browserVisualSurfaceFragment.blockingSurfaceIds).toEqual([]);
    expect(frame.projectionHorizon.retainedScrollSurfaces[0]).toEqual(
      expect.objectContaining({
        preparedScrollRange: {
          x: { max: 720, min: 0 },
          y: { max: 726, min: 0 },
        },
        surfaceId: "dict-a:param-content:unpinned",
      }),
    );
    expect(frame.projectionHorizon.textActorCoverage.trueHoleActorIds).toEqual(
      [],
    );
  });

  it("blocks prepared publication when retained coverage still has true holes", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 19 });
    const retainedSurfaceId = "dict-a:param-content:unpinned";
    const frame = createGpuFlowPreparedContentFrame({
      browserVisualReadiness:
        createReadyBrowserVisualReadiness(retainedRuntimeFrame),
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 19,
        retainedRuntimeFrame,
        trueHoleSurfaceIds: [retainedSurfaceId],
      }),
    });

    expect(frame.publishability).toEqual(
      expect.objectContaining({
        actorFamily: "retained-page",
        actorIds: [retainedSurfaceId],
        kind: "true-hole",
        reason: "retained-surface-true-hole",
        status: "blocked",
      }),
    );
    expect(frame.surfaceTransaction).toBeNull();
    expect(frame.presentationProof.surfaceTransactionDigest).toBeNull();
  });

  it("protects exact snapshot DOM-control textures by evictable surface id", () => {
    const retainedRuntimeFrame = withDomControlSnapshotPolicy(
      createRuntimeFrame({ frameId: 18 }),
      "snapshot-a",
    );
    const control = requireFirstDomControlSource(retainedRuntimeFrame);
    const snapshotHandle = {
      actorId: control.sourceId,
      contentGenerationId: control.snapshotCacheKeyRevision,
      id: "snapshot-a",
      kind: "texture" as const,
      projectionGenerationId: "projection:snapshot-a",
      resourceGenerationId: "snapshot-a:content-revision",
    };
    const frame = createGpuFlowPreparedContentFrame({
      browserVisualReadiness: {
        domControlReadinessByActorId: new Map([
          [
            control.sourceId,
            {
              coverageState: "exact-snapshot-ready",
              resourceHandles: [snapshotHandle],
            },
          ],
        ]),
        domIslandReadinessByActorId: new Map(),
      },
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 18,
        retainedRuntimeFrame,
      }),
    });

    expect(frame.publishability.kind).toBe("publishable");
    expect(frame.browserVisualSurfaceFragment.exactCoverage).toEqual([
      expect.objectContaining({
        resourceHandles: [snapshotHandle],
      }),
    ]);
    expect(frame.surfaceTransaction?.protectedResourceHandles).toEqual(
      expect.arrayContaining([
        {
          actorId: control.sourceId,
          contentGenerationId: control.snapshotCacheKeyRevision,
          id: "snapshot-a",
          kind: "texture",
          projectionGenerationId: "projection:snapshot-a",
          reason: "presented-transaction",
          resourceGenerationId: "snapshot-a:content-revision",
        },
      ]),
    );
  });

  it("keeps runtime-projected outside-viewport DOM controls in the visible actor manifest", () => {
    const retainedRuntimeFrame = withDomControlVisualPolicy(
      createRuntimeFrame({ frameId: 19 }),
      "outside-viewport",
      "outside-viewport",
    );
    const control = requireFirstDomControlSource(retainedRuntimeFrame);
    const frame = createGpuFlowPreparedContentFrame({
      browserVisualReadiness: {
        domControlReadinessByActorId: new Map([
          [
            control.sourceId,
            {
              coverageState: "live-host-ready",
              projectionCoverageRequired: true,
              resourceHandles: [
                { id: control.sourceId, kind: "source" as const },
              ],
            },
          ],
        ]),
        domIslandReadinessByActorId: new Map(),
      },
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 19,
        retainedRuntimeFrame,
      }),
    });

    const actor = frame.actorGenerations.find(
      (candidate) => candidate.actorId === control.sourceId,
    );
    expect(actor).toEqual(
      expect.objectContaining({
        browserVisual: expect.objectContaining({
          coverageRequired: { reason: "value-text", required: true },
          coverageState: "live-host-ready",
          visibilityReason: "visible",
        }),
        visibleNonempty: true,
      }),
    );
    expect(frame.displayCompleteness.visibleNonemptyDomControlCount).toBe(1);
    expect(frame.browserVisualSurfaceFragment.exactCoverage).toEqual([
      expect.objectContaining({
        surfaceId: `dom-control:${control.sourceId}`,
      }),
    ]);
  });
});

function createCompatiblePreviousPreparedContentFrame({
  presentedAtMs,
  previousPresentedAtMs,
  previousRetainedFrameId = 13,
  readiness = "compatible-previous",
  retainedFrameId = 14,
  visualPolicy = "blocked-awaiting-browser-visual",
}: {
  readonly presentedAtMs?: number | undefined;
  readonly previousPresentedAtMs?: number | undefined;
  readonly previousRetainedFrameId?: number | undefined;
  readonly readiness?:
    | "blocked-awaiting-live-host"
    | "blocked-awaiting-snapshot"
    | "compatible-previous";
  readonly retainedFrameId?: number | undefined;
  readonly visualPolicy?: GpuFlowPreparedContentDomControlSource["visualPolicy"];
} = {}): {
  readonly actor:
    | GpuFlowPreparedContentFrame["actorGenerations"][number]
    | undefined;
  readonly frame: GpuFlowPreparedContentFrame;
} {
  const previousRetainedRuntimeFrame = createRuntimeFrame({
    frameId: previousRetainedFrameId,
    scrollRevision: 1,
    scrollY: 0,
  });
  const previousPreparedContentFrame = createGpuFlowPreparedContentFrame({
    browserVisualReadiness: createReadyBrowserVisualReadiness(
      previousRetainedRuntimeFrame,
    ),
    retainedDisplayFrame: fakeRetainedDisplayFrame({
      id: previousRetainedFrameId,
      presentedAtMs: previousPresentedAtMs,
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
  const frame = createGpuFlowPreparedContentFrame({
    browserVisualReadiness:
      readiness === "compatible-previous"
        ? createCompatiblePreviousBrowserVisualReadiness({
            retainedRuntimeFrame,
            previousRetainedRuntimeFrame,
          })
        : createBlockedBrowserVisualReadiness(retainedRuntimeFrame, readiness),
    previousPreparedContentFrame,
    retainedDisplayFrame: fakeRetainedDisplayFrame({
      id: retainedFrameId,
      presentedAtMs,
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

type GpuFlowPreparedContentActor =
  GpuFlowPreparedContentFrame["actorGenerations"][number];
type GpuFlowPreparedContentDomControlSource =
  GpuFlowPreparedContentFrame["retainedRuntimeFrame"]["descriptors"]["domControlSources"][number];

function findPreparedDomControlActor(
  frame: GpuFlowPreparedContentFrame,
): GpuFlowPreparedContentActor {
  const actor = frame.actorGenerations.find(
    (candidate) => candidate.kind === "dom-control",
  );
  if (!actor) {
    throw new Error("Expected prepared DOM-control actor.");
  }
  return actor;
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

function createBlockedRuntimeFrame({ frameId }: { readonly frameId: number }) {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 1,
    frameId,
    scene: sceneWithManyRetainedRows(),
    scrollOffsets: new Map(),
    scrollRevision: frameId,
    viewport: [0, 0, 1],
    viewportSize: { height: 3_200, width: 320 },
    viewportZoomBucket: 1,
  });
}

function requireFirstDomControlSource(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
) {
  const control = retainedRuntimeFrame.descriptors.domControlSources[0];
  if (!control) {
    throw new Error("Expected a retained DOM-control source.");
  }
  return control;
}

function withDomControlVisualPolicy(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
  visualPolicy: GpuFlowPreparedContentDomControlSource["visualPolicy"],
  projectionVisibility: GpuFlowPreparedContentDomControlSource["projectionVisibility"] = "viewport-visible",
): ReturnType<typeof createRuntimeFrame> {
  return {
    ...retainedRuntimeFrame,
    descriptors: {
      ...retainedRuntimeFrame.descriptors,
      domControlSources: retainedRuntimeFrame.descriptors.domControlSources.map(
        (control) => ({
          ...control,
          projectionVisibility,
          snapshotSurfaceId: null,
          visualPolicy,
        }),
      ),
    },
  };
}

function withDomControlSnapshotPolicy(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
  snapshotSurfaceId: string,
): ReturnType<typeof createRuntimeFrame> {
  return {
    ...retainedRuntimeFrame,
    descriptors: {
      ...retainedRuntimeFrame.descriptors,
      domControlSources: retainedRuntimeFrame.descriptors.domControlSources.map(
        (control) => ({
          ...control,
          projectionVisibility: "viewport-visible" as const,
          snapshotSurfaceId,
          visualPolicy: "snapshot" as const,
        }),
      ),
    },
  };
}

function fakeRetainedDisplayFrame({
  id,
  presentedAtMs = id,
  retainedRuntimeFrame,
  trueHoleSurfaceIds = [],
}: {
  readonly id: number;
  readonly presentedAtMs?: number | undefined;
  readonly retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>;
  readonly trueHoleSurfaceIds?: readonly string[] | undefined;
}): RetainedDisplayFrame {
  const trueHoleRects = trueHoleSurfaceIds.map((_, index) => ({
    height: 8,
    width: 8,
    x: index * 8,
    y: 0,
  }));
  return {
    diagnostics: {
      presentedAtMs,
      transactionOutcome: "present-exact",
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
        blockingGenerationIds: trueHoleSurfaceIds.map(
          (surfaceId) => `${surfaceId}:missing-generation`,
        ),
        blockingSurfaceIds: trueHoleSurfaceIds,
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
        trueHoleRects,
        visibleRects: [],
        zOrder: [],
      },
      desiredSurfaceGenerations: [],
      diagnostics: {
        hold: null,
        presentedAtMs,
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
): GpuFlowPreparedContentBrowserVisualReadiness {
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
    domIslandReadinessByActorId: new Map(
      retainedRuntimeFrame.descriptors.nativeDomIslands.map((island) => [
        island.id,
        {
          coverageState: "live-host-ready" as const,
          resourceHandles: [
            { id: island.id, kind: "native-dom-island" as const },
          ],
        },
      ]),
    ),
  };
}

function createBlockedBrowserVisualReadiness(
  retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>,
  coverageState:
    | "blocked-awaiting-live-host"
    | "blocked-awaiting-snapshot" = "blocked-awaiting-snapshot",
): GpuFlowPreparedContentBrowserVisualReadiness {
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
}): GpuFlowPreparedContentBrowserVisualReadiness {
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

function nativeVisual(surfaceId: string): HtmlSurfaceSolidRoundedRectVisual {
  return {
    color: { a: 0.5, b: 30, g: 20, r: 10 },
    kind: "solid-rounded-rect",
    radius: 3,
    rect: { height: 8, width: 24, x: 4, y: 6 },
    surfaceId,
    zIndex: 9,
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

function sceneWithManyRetainedRows(): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurfaceWithRows(120)],
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
            defaultDisplayValue: "",
            displayValue: value,
            editorKind: "text",
            kind: "text-like",
            policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
            renderOwner: "dom-owned",
            rendererFamily: "text-like",
            commitPolicy: "native-island",
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

function retainedContentSurfaceWithRows(rowCount: number): GpuContentSurface {
  const rect = { height: rowCount * 28, width: 240, x: 10, y: 20 };
  return {
    ...retainedContentSurface("hello"),
    clipRect: rect,
    rect,
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: rowCount }, (_, index) => ({
        control: {
          defaultDisplayValue: "",
          displayValue: `value-${index}`,
          editorKind: "text" as const,
          kind: "text-like" as const,
          policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
          renderOwner: "dom-owned" as const,
          rendererFamily: "text-like",
          commitPolicy: "native-island" as const,
        },
        controlKind: "text-like" as const,
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
  };
}

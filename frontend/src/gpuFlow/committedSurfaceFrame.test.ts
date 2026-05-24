import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import {
  assertGpuFlowCommittedSurfaceFrameCoherent,
  createGpuFlowCommittedSurfaceFrame,
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  createGpuFlowCommittedSurfacePresentationProof,
  createGpuFlowStartupCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceBrowserVisualReadiness,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import { createGpuFlowDomControlCompatiblePreviousProof } from "./GpuFlow/domControlPlaneCompatibility";
import type { HtmlSurfaceSolidRoundedRectVisual } from "./htmlSurfaces/visualScene";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("GPU Flow committed surface frame", () => {
  it("requires runtime-proven DOM-control coverage before reporting actor readiness", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 3 });
    const frame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame,
    });

    const domControlActors = frame.actorGenerations.filter(
      (actor) => actor.kind === "dom-control",
    );
    expect(domControlActors).toHaveLength(1);
    const domControlActor = domControlActors[0];
    if (!domControlActor) {
      throw new Error("Expected a committed DOM-control actor.");
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

  it("uses the committed GPU-native visual set when publishing actors", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 12 });
    const frame = createGpuFlowCommittedSurfaceFrame({
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

  it("uses the published display frame id for every visible committed surface family", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 7 });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 7,
        retainedRuntimeFrame,
      }),
    });

    expect(frame.coherence).toEqual(
      expect.objectContaining({
        canvasRetainedFrameId: 7,
        debugSnapshotFrameId: 7,
        domControlCommittedFrameId: 7,
        domIslandCommittedFrameId: 7,
        gpuNativeVisualCommittedFrameId: 7,
        hitGenerationId: "committed-hit:7",
        htmlTextureOverlayCommittedFrameId: 7,
        retainedScrollRevision: 7,
      }),
    );
  });

  it("includes actor generations in the render signature", () => {
    const first = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 8 }),
    });
    const second = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        value: "changed",
      }),
    });

    expect(createGpuFlowCommittedSurfaceFrameRenderSignature(first)).not.toBe(
      createGpuFlowCommittedSurfaceFrameRenderSignature(second),
    );
    expect(
      first.actorGenerations.find((actor) => actor.kind === "dom-control")
        ?.visualGenerationId,
    ).not.toBe(
      second.actorGenerations.find((actor) => actor.kind === "dom-control")
        ?.visualGenerationId,
    );
  });

  it("keeps viewport-only motion out of the committed render signature", () => {
    const first = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 8,
        scrollRevision: 3,
        scrollY: 12,
        viewport: [0, 0, 1],
      }),
    });
    const second = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        scrollRevision: 3,
        scrollY: 12,
        viewport: [40, -20, 1.25],
      }),
    });

    expect(createGpuFlowCommittedSurfaceFrameRenderSignature(first)).toBe(
      createGpuFlowCommittedSurfaceFrameRenderSignature(second),
    );
  });

  it("splits passive actor content identity from retained scroll projection identity", () => {
    const first = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 8,
        scrollRevision: 3,
        scrollY: 12,
      }),
    });
    const second = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({
        frameId: 9,
        scrollRevision: 4,
        scrollY: 18,
      }),
    });
    const firstControl = findCommittedDomControlActor(first);
    const secondControl = findCommittedDomControlActor(second);

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

  it("rejects visible frame id drift across committed surface families", () => {
    const frame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 4 }),
    });
    const drifted: GpuFlowCommittedSurfaceFrame = {
      ...frame,
      coherence: {
        ...frame.coherence,
        domControlCommittedFrameId: 5,
      },
    };

    expect(() => assertGpuFlowCommittedSurfaceFrameCoherent(drifted)).toThrow(
      /incoherent visible frame ids/,
    );
  });

  it("rejects presentation proofs that do not match the actor manifest", () => {
    const frame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 4 }),
    });
    const staleProof: GpuFlowCommittedSurfaceFrame = {
      ...frame,
      presentationProof: createGpuFlowCommittedSurfacePresentationProof({
        actorGenerations: [],
        browserVisualSurfaceFragment: frame.browserVisualSurfaceFragment,
        coherence: frame.coherence,
        displayFrameId: frame.displayFrameId,
        surfaceTransaction: frame.surfaceTransaction,
      }),
    };

    expect(() =>
      assertGpuFlowCommittedSurfaceFrameCoherent(staleProof),
    ).toThrow(/actor manifest and browser visual resources/);
  });

  it("keeps blocked passive visible DOM-control actors as publishable browser visual debt", () => {
    const retainedRuntimeFrame = createBlockedRuntimeFrame({ frameId: 5 });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 5,
        retainedRuntimeFrame,
      }),
    });

    expect(() =>
      assertGpuFlowCommittedSurfaceFrameCoherent(frame),
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
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 20,
        retainedRuntimeFrame,
      }),
    });
    const actor = findCommittedDomControlActor(frame);

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

  it("publishes compatible-previous DOM-control coverage from a prior committed frame", () => {
    const { actor, frame } = createCompatiblePreviousCommittedSurfaceFrame();

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

  it("does not chain compatible-previous DOM-control coverage beyond one committed frame", () => {
    const previousCommittedSurfaceFrame =
      createCompatiblePreviousCommittedSurfaceFrame().frame;
    const retainedRuntimeFrame = withDomControlVisualPolicy(
      createRuntimeFrame({
        frameId: 17,
        scrollRevision: 1,
        scrollY: 0,
      }),
      "blocked-awaiting-browser-visual",
    );
    const frame = createGpuFlowCommittedSurfaceFrame({
      previousCommittedSurfaceFrame,
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
        id: "committed-surface:17:retained:17",
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
    const previousCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
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
    const frame = createGpuFlowCommittedSurfaceFrame({
      previousCommittedSurfaceFrame,
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
        id: "committed-surface:16:retained:16",
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
    const frame = createGpuFlowCommittedSurfaceFrame({
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
          id: "committed-hit:6",
        }),
        id: "committed-surface:6:retained:6",
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
    const frame = createGpuFlowCommittedSurfaceFrame({
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
          reason: "published-transaction",
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
    const frame = createGpuFlowCommittedSurfaceFrame({
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

function createCompatiblePreviousCommittedSurfaceFrame({
  publishedAtMs,
  previousPublishedAtMs,
  previousRetainedFrameId = 13,
  retainedFrameId = 14,
}: {
  readonly publishedAtMs?: number | undefined;
  readonly previousPublishedAtMs?: number | undefined;
  readonly previousRetainedFrameId?: number | undefined;
  readonly retainedFrameId?: number | undefined;
} = {}): {
  readonly actor:
    | GpuFlowCommittedSurfaceFrame["actorGenerations"][number]
    | undefined;
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
    "blocked-awaiting-browser-visual",
  );
  const frame = createGpuFlowCommittedSurfaceFrame({
    browserVisualReadiness: createCompatiblePreviousBrowserVisualReadiness({
      retainedRuntimeFrame,
      previousRetainedRuntimeFrame,
    }),
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

type GpuFlowCommittedSurfaceActor =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
type GpuFlowCommittedSurfaceDomControlSource =
  GpuFlowCommittedSurfaceFrame["retainedRuntimeFrame"]["descriptors"]["domControlSources"][number];

function findCommittedDomControlActor(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowCommittedSurfaceActor {
  const actor = frame.actorGenerations.find(
    (candidate) => candidate.kind === "dom-control",
  );
  if (!actor) {
    throw new Error("Expected committed DOM-control actor.");
  }
  return actor;
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
        previousCommittedFrameId: 13,
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
  readonly actor:
    | GpuFlowCommittedSurfaceFrame["actorGenerations"][number]
    | undefined;
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
  visualPolicy: GpuFlowCommittedSurfaceDomControlSource["visualPolicy"],
  projectionVisibility: GpuFlowCommittedSurfaceDomControlSource["projectionVisibility"] = "viewport-visible",
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

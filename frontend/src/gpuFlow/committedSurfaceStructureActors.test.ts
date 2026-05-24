import { describe, expect, it } from "vitest";

import { createGpuFlowCommittedSurfaceFrame } from "./committedSurfaceFrame";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuFlowScene, GpuSectionSceneNode } from "./scene";
import type { SurfaceActorSnapshot } from "./surfaceCompositor/surfaceActor";
import type { GpuRect } from "./viewportMath";

describe("GPU Flow committed surface structure actors", () => {
  it("promotes retained flat HTML textures into committed surface actors", () => {
    const retainedRuntimeFrame = createEmptyRuntimeFrame({ frameId: 11 });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        flatSurfaces: [flatHtmlSurface("dict-a:param-content:unpinned")],
        id: 11,
        retainedRuntimeFrame,
      }),
    });

    const htmlTextureActors = frame.actorGenerations.filter(
      (actor) => actor.kind === "html-texture",
    );
    expect(htmlTextureActors).toHaveLength(1);
    expect(htmlTextureActors[0]).toEqual(
      expect.objectContaining({
        actorId: "dict-a:param-content:unpinned:html-texture:0",
        flowRect: { height: 40, width: 120, x: 10, y: 20 },
        ownerSurfaceId: "dict-a:param-content:unpinned",
        retainedScrollRevision: 11,
        sourceRect: { height: 38, width: 118, x: 1, y: 2 },
        zOrder: 6,
      }),
    );
    expect(frame.diagnostics.htmlTextureActorCount).toBe(1);
  });

  it("promotes visible section shell, header, and body clips into committed actors", () => {
    const retainedRuntimeFrame = createSectionRuntimeFrame({
      frameId: 17,
      viewportSize: { height: 120, width: 300 },
    });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 17,
        retainedRuntimeFrame,
      }),
    });

    const sectionActors = frame.actorGenerations.filter((actor) =>
      actor.actorId.startsWith("settings:"),
    );
    expect(sectionActors.map((actor) => actor.actorFamily)).toEqual([
      "section-shell",
      "section-header",
      "section-body-clip",
    ]);
    expect(sectionActors).toEqual([
      expect.objectContaining({
        actorFamily: "section-shell",
        actorId: "settings:section-shell",
        flowRect: { height: 80, width: 240, x: 10, y: 20 },
        kind: "html-texture",
        ownerSurfaceId: "settings",
        sourceRect: { height: 80, width: 240, x: 0, y: 0 },
        visibleNonempty: true,
      }),
      expect.objectContaining({
        actorFamily: "section-header",
        actorId: "settings:section-header",
        flowRect: { height: 32, width: 240, x: 10, y: 20 },
        kind: "html-texture",
        ownerSurfaceId: "settings",
        sourceRect: { height: 32, width: 240, x: 0, y: 0 },
        visibleNonempty: true,
      }),
      expect.objectContaining({
        actorFamily: "section-body-clip",
        actorId: "settings:section-body-clip",
        flowRect: { height: 48, width: 240, x: 10, y: 52 },
        kind: "html-texture",
        ownerSurfaceId: "settings",
        sourceRect: { height: 48, width: 240, x: 0, y: 32 },
        visibleNonempty: true,
      }),
    ]);
    expect(frame.projectionHorizon.obligations.visibleActorIds).toEqual([
      "settings:section-body-clip",
      "settings:section-header",
      "settings:section-shell",
    ]);
  });

  it("does not require off-viewport section structure actors for presentation", () => {
    const retainedRuntimeFrame = createSectionRuntimeFrame({
      frameId: 19,
      section: sectionSceneNode({
        bodyRect: { height: 48, width: 240, x: 10, y: 452 },
        worldRect: { height: 80, width: 240, x: 10, y: 420 },
      }),
      viewportSize: { height: 120, width: 300 },
    });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 19,
        retainedRuntimeFrame,
      }),
    });

    expect(
      frame.actorGenerations.filter((actor) =>
        actor.actorId.startsWith("settings:"),
      ),
    ).toEqual([]);
    expect(frame.projectionHorizon.obligations.visibleActorIds).toEqual([]);
  });

  it("does not create section structure actors for sections absent from the rendered node layer", () => {
    const retainedRuntimeFrame = createSectionRuntimeFrame({
      frameId: 20,
      renderedSceneNodeIds: ["other-section"],
      viewportSize: { height: 120, width: 300 },
    });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 20,
        retainedRuntimeFrame,
      }),
    });

    expect(
      frame.actorGenerations.filter((actor) =>
        actor.actorId.startsWith("settings:"),
      ),
    ).toEqual([]);
    expect(frame.projectionHorizon.obligations.visibleActorIds).toEqual([]);
  });

  it("marks visible retained page snapshots as required retained-page actors", () => {
    const retainedRuntimeFrame = createEmptyRuntimeFrame({ frameId: 21 });
    const frame = createGpuFlowCommittedSurfaceFrame({
      retainedDisplayFrame: fakeRetainedDisplayFrame({
        id: 21,
        retainedRuntimeFrame,
        surfaceActorSnapshots: [retainedPageSnapshot()],
      }),
    });

    const retainedPageActor = frame.actorGenerations.find(
      (actor) => actor.actorFamily === "retained-page",
    );
    expect(retainedPageActor).toEqual(
      expect.objectContaining({
        actorFamily: "retained-page",
        actorId: "dict-a:param-content:unpinned",
        ownerSurfaceId: "dict-a:param-content:unpinned",
        visibleNonempty: true,
      }),
    );
    expect(frame.projectionHorizon.obligations.visibleActorIds).toContain(
      "dict-a:param-content:unpinned",
    );
  });
});

function createSectionRuntimeFrame({
  frameId,
  renderedSceneNodeIds,
  section = sectionSceneNode(),
  viewportSize,
}: {
  readonly frameId: number;
  readonly renderedSceneNodeIds?: readonly string[] | undefined;
  readonly section?: GpuSectionSceneNode | undefined;
  readonly viewportSize?:
    | { readonly height: number; readonly width: number }
    | undefined;
}) {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 1,
    frameId,
    renderedSceneNodeIds,
    scene: sceneWithSection(section),
    scrollOffsets: new Map(),
    scrollRevision: frameId,
    scrollRevisions: new Map(),
    viewport: [0, 0, 1],
    viewportSize,
    viewportZoomBucket: 1,
  });
}

function createEmptyRuntimeFrame({ frameId }: { readonly frameId: number }) {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 1,
    frameId,
    scene: emptyScene(),
    scrollOffsets: new Map(),
    scrollRevision: frameId,
    scrollRevisions: new Map(),
    viewport: [0, 0, 1],
    viewportZoomBucket: 1,
  });
}

function fakeRetainedDisplayFrame({
  flatSurfaces = [],
  id,
  retainedRuntimeFrame,
  surfaceActorSnapshots = [],
}: {
  readonly flatSurfaces?: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly id: number;
  readonly retainedRuntimeFrame: ReturnType<
    typeof createGpuRetainedRuntimeFrame
  >;
  readonly surfaceActorSnapshots?: readonly SurfaceActorSnapshot[] | undefined;
}): RetainedDisplayFrame {
  return {
    diagnostics: {
      publishedAtMs: id,
      transactionOutcome: "publish-exact",
    },
    flatSurfaces,
    id,
    retainedRuntimeFrame,
    surfaceActorSnapshots,
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
        publishedAtMs: id,
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

function retainedPageSnapshot(): SurfaceActorSnapshot {
  const surfaceId = "dict-a:param-content:unpinned";
  const rect = { height: 80, width: 120, x: 10, y: 20 };
  return {
    actor: {
      currentGenerationId: "retained-page-generation-a",
      kind: "retained-parameter-content",
      rendererBucket: "retained-content",
      sourceKey: "retained-page-source-a",
      sourcePolicy: "retained-display-list",
      surfaceId,
    },
    generation: {
      activeDomIsland: null,
      clipRect: rect,
      contentVersion: "content-a",
      fidelity: "exact",
      flowRect: rect,
      generationId: "retained-page-generation-a",
      hitIndex: { entries: [], generationId: "retained-page-hit-a" },
      paintReadiness: "ready",
      rendererBucket: "retained-content",
      sourceKey: "retained-page-source-a",
      sourceWindow: {
        contentToTextureKey: "retained-page-content-a",
        sourceRect: { height: 80, width: 120, x: 0, y: 0 },
      },
      surfaceId,
      textureReadiness: "ready",
      visualVersion: "visual-a",
      zIndex: 5,
    },
  };
}

function flatHtmlSurface(surfaceId: string): HtmlSurfaceFlatVisual {
  return {
    height: 40,
    kind: "flat",
    surfaceId,
    texture: {
      cssHeight: 40,
      cssWidth: 120,
      surfaceId,
      textureContentKey: "content-a",
      textureSourceRect: { height: 38, width: 118, x: 1, y: 2 },
      zoomBucket: 1,
    } as HtmlSurfaceFlatVisual["texture"],
    width: 120,
    x: 10,
    y: 20,
    zIndex: 6,
  };
}

function emptyScene(): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function sceneWithSection(section: GpuSectionSceneNode): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 4,
    sections: [section],
  };
}

function sectionSceneNode({
  bodyRect,
  worldRect,
}: {
  readonly bodyRect?: GpuRect | undefined;
  readonly worldRect?: GpuRect | undefined;
} = {}): GpuSectionSceneNode {
  const sectionWorldRect = worldRect ?? { height: 80, width: 240, x: 10, y: 20 };
  const sectionBodyRect =
    bodyRect ?? { height: 48, width: 240, x: 10, y: 52 };
  return {
    bodyRect: sectionBodyRect,
    childLayout: { gap: { x: 0, y: 0 } },
    childSectionIds: [],
    childViewportRect: null,
    chromeRect: sectionWorldRect,
    clipRect: sectionWorldRect,
    contentRenderer: { kind: "canvas-content", surfaceId: "settings:body" },
    dirty: [],
    height: sectionWorldRect.height,
    interactionLayer: "content",
    layoutMode: "none",
    localRect: {
      height: sectionWorldRect.height,
      width: sectionWorldRect.width,
      x: 0,
      y: 0,
    },
    nodeId: "settings",
    parentSectionId: null,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId: "settings",
    textureContentKey: "settings-shell",
    width: sectionWorldRect.width,
    worldRect: sectionWorldRect,
    x: sectionWorldRect.x,
    y: sectionWorldRect.y,
    zIndex: 2,
  };
}

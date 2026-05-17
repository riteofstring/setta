import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import {
  assertGpuFlowCommittedSurfaceFrameCoherent,
  createGpuFlowCommittedSurfaceFrame,
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  createGpuFlowStartupCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("GPU Flow committed surface frame", () => {
  it("promotes retained DOM controls into committed DOM-control actors", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 3 });
    const frame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame,
    });

    const domControlActors = frame.actorGenerations.filter(
      (actor) => actor.kind === "dom-control",
    );
    expect(domControlActors).toHaveLength(1);
    expect(domControlActors[0]).toEqual(
      expect.objectContaining({
        ownerSurfaceId: "dict-a:param-content:unpinned",
        projectionReadiness: "ready",
        retainedScrollRevision: 3,
        rowId: "param-a",
        wheelPolicy: "retained-scroll-or-editor-scroll",
      }),
    );
    expect(frame.displayCompleteness.status).toBe("complete");
    expect(frame.displayCompleteness.visibleNonemptyDomControlCount).toBe(1);
  });

  it("promotes retained flat HTML textures into committed surface actors", () => {
    const retainedRuntimeFrame = createRuntimeFrame({ frameId: 11 });
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
        hitGenerationId: "retained-hit:7",
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

  it("rejects visible nonempty DOM-control actors that are not projected", () => {
    const frame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: createRuntimeFrame({ frameId: 5 }),
    });
    const blockingActor = frame.actorGenerations.find(
      (actor) => actor.kind === "dom-control",
    );
    if (!blockingActor) {
      throw new Error("Missing DOM-control actor.");
    }
    const blocked: GpuFlowCommittedSurfaceFrame = {
      ...frame,
      actorGenerations: [
        {
          ...blockingActor,
          mountReadiness: "not-required",
          projectionReadiness: "not-required",
        },
        ...frame.actorGenerations.filter(
          (actor) => actor.actorId !== blockingActor.actorId,
        ),
      ],
      displayCompleteness: {
        blockingActorIds: [blockingActor.actorId],
        projectedVisibleNonemptyDomControlCount: 0,
        status: "startup",
        visibleNonemptyDomControlCount: 1,
      },
    };

    expect(() => assertGpuFlowCommittedSurfaceFrameCoherent(blocked)).toThrow(
      /unprojected visible nonempty DOM controls/,
    );
  });
});

function createRuntimeFrame({
  frameId,
  value = "hello",
}: {
  readonly frameId: number;
  readonly value?: string | undefined;
}) {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 1,
    frameId,
    scene: sceneWithRetainedContentSurface(value),
    scrollOffsets: new Map([
      ["dict-a:param-content:unpinned", { x: 0, y: frameId }],
    ]),
    scrollRevision: frameId,
    viewport: [0, 0, 1],
    viewportZoomBucket: 1,
  });
}

function fakeRetainedDisplayFrame({
  flatSurfaces = [],
  id,
  retainedRuntimeFrame,
}: {
  readonly flatSurfaces?: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly id: number;
  readonly retainedRuntimeFrame: ReturnType<typeof createRuntimeFrame>;
}): RetainedDisplayFrame {
  return {
    diagnostics: {
      transactionOutcome: "publish-exact",
    },
    flatSurfaces,
    id,
    retainedRuntimeFrame,
    surfaceActorSnapshots: [],
    surfaceTransaction: {
      hitIndex: {
        id: `retained-hit:${id}`,
      },
    },
  } as RetainedDisplayFrame;
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

function sceneWithRetainedContentSurface(value: string): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurface(value)],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedContentSurface(value: string): GpuContentSurface {
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
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 2,
  };
}

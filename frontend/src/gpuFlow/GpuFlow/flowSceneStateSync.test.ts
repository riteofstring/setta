import { describe, expect, it } from "vitest";

import { createHtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";
import { createGpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import {
  selectGpuFlowSceneStateFrameReason,
  syncGpuFlowNodeLayerSceneState,
} from "./flowSceneStateSync";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

describe("GPU flow scene state sync", () => {
  it("requests content publication when the retained scene object changes", () => {
    const previousScene = scene("previous");
    const nextScene = scene("next");

    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene,
        previousScene,
      }),
    ).toBe("manual");
  });

  it("requests critical content publication when a retained DOM control becomes active", () => {
    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene: retainedDomControlScene(true),
        previousScene: retainedDomControlScene(false),
      }),
    ).toBe("dom-control-activation");
  });

  it("keeps viewport-only frames for non-scene state sync", () => {
    const currentScene = scene("current");

    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene: currentScene,
        previousScene: currentScene,
      }),
    ).toBe("viewport");
  });

  it("preserves published visual scene during matching-viewport scene state sync", () => {
    const currentScene = retainedDomControlScene(false);
    const rowHoverTarget = {
      rowId: "param-a",
      surfaceId: "surface-a",
    };
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 4,
      rowHoverTarget,
      scene: currentScene,
      scrollOffsets: new Map(),
      scrollRevision: 1,
      viewport: [0, 0, 1],
      viewportSize: { height: 28, width: 160 },
      viewportZoomBucket: 1,
    });
    const rowHoverSurfaceId = "surface-a:row-hover:param-a";
    const visualScene = createHtmlSurfaceVisualScene({
      solidRoundedRectSurfaces:
        retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    });
    const nodeLayerRef: { current: GpuFlowNodeLayerState } = {
      current: {
        htmlSurfaceNativeVisuals: [],
        retainedRuntimeFrame,
        scene: currentScene,
        viewport: [11, 22, 1],
        visualScene,
        visualSceneViewport: [11, 22, 1],
      } as GpuFlowNodeLayerState,
    };
    const frameReasons: string[] = [];

    syncSceneStateForTest({
      nodeLayerRef,
      onRequestFrame: (reason) => frameReasons.push(reason),
      scene: currentScene,
      viewport: [11, 22, 1],
    });

    expect(
      nodeLayerRef.current.visualScene?.solidRoundedRectSurfaces.map(
        (surface) => surface.surfaceId,
      ),
    ).toContain(rowHoverSurfaceId);
    expect(nodeLayerRef.current.visualSceneViewport).toEqual([11, 22, 1]);
    expect(frameReasons).toEqual(["viewport"]);
  });

  it("drops published visual scene during changed-viewport scene state sync", () => {
    const currentScene = retainedDomControlScene(false);
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 4,
      scene: currentScene,
      scrollOffsets: new Map(),
      scrollRevision: 1,
      viewport: [0, 0, 1],
      viewportSize: { height: 28, width: 160 },
      viewportZoomBucket: 1,
    });
    const nodeLayerRef: { current: GpuFlowNodeLayerState } = {
      current: {
        retainedRuntimeFrame,
        scene: currentScene,
        viewport: [11, 22, 1],
        visualScene: createHtmlSurfaceVisualScene({
          solidRoundedRectSurfaces: [
            {
              color: { a: 1, b: 0, g: 0, r: 0 },
              kind: "solid-rounded-rect",
              radius: 0,
              rect: { height: 10, width: 10, x: 0, y: 0 },
              surfaceId: "surface-a:row-hover:param-a",
              zIndex: 0,
            },
          ],
        }),
        visualSceneViewport: [11, 22, 1],
      } as GpuFlowNodeLayerState,
    };

    syncSceneStateForTest({
      nodeLayerRef,
      scene: currentScene,
      viewport: [0, 0, 1],
    });

    expect(nodeLayerRef.current.visualScene).toBeUndefined();
    expect(nodeLayerRef.current.visualSceneViewport).toBeUndefined();
  });
});

function syncSceneStateForTest({
  nodeLayerRef,
  onRequestFrame = () => undefined,
  scene,
  viewport,
}: {
  readonly nodeLayerRef: { current: GpuFlowNodeLayerState };
  readonly onRequestFrame?: (reason: string) => void;
  readonly scene: GpuFlowScene;
  readonly viewport: GpuFlowNodeLayerState["viewport"];
}) {
  syncGpuFlowNodeLayerSceneState({
    activeRetainedContentRuntimeState: createGpuRetainedContentRuntimeState(),
    edgeInteraction: undefined,
    edgePalette: undefined,
    edgeReconnect: undefined,
    edgeScene: undefined,
    edges: undefined,
    forceVisibleNodeIds: undefined,
    grid: undefined,
    htmlSurfaceNativeVisuals: [],
    htmlSurfaceOverlays: [],
    htmlSurfaceRendererRef: { current: null },
    marginCssPx: undefined,
    nodeDomTransformSyncCacheRef: {
      current: {
        previousVisibleNodeIds: new Set(),
        stateByNodeId: new Map(),
      },
    },
    nodeLayerRef,
    nodes: undefined,
    nodeTextureMemoryBudgetBytes: undefined,
    nodeTextureTileDimensionPx: undefined,
    retainedContentPageManagerRef: { current: null },
    scene,
    sourceInteractionProjector: { destroy: () => undefined } as never,
    surfaceRef: {
      current: {
        requestFrame: onRequestFrame,
      },
    } as never,
    textureManagerRef: { current: null },
    transformOnlyPaintNodeIdsRef: { current: new Set() },
    uploadBudget: undefined,
    viewport,
    visibleNodeIdsRef: { current: new Set() },
  });
}

function scene(id: string): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: id.length,
    sections: [],
  };
}

function retainedDomControlScene(active: boolean): GpuFlowScene {
  return {
    ...scene(active ? "active" : "passive"),
    contentSurfaces: [
      {
        clipRect: { height: 28, width: 160, x: 0, y: 0 },
        id: "surface-a",
        ownerSectionId: "section-a",
        rect: { height: 28, width: 160, x: 0, y: 0 },
        renderer: { kind: "canvas-content", surfaceId: "surface-a" },
        retainedScene: createGpuRetainedRowContentScene({
          controlWidth: 40,
          id: "surface-a",
          ownerSectionId: "section-a",
          rowHeight: 28,
          rows: [
            {
              control: {
                commitPolicy: "native-island",
                defaultDisplayValue: "",
                displayValue: "value",
                editorKind: "text",
                kind: "text-like",
                policy: {
                  editorKind: "text",
                  language: null,
                  linePolicy: "single-line",
                  maxVisibleLines: 1,
                  minVisibleLines: 1,
                  wrapLines: false,
                },
                renderOwner: "dom-owned",
                rendererFamily: "text-like",
              },
              controlKind: "text-like",
              depth: 0,
              id: "param-a",
              label: "Param A",
              state: active
                ? {
                    domControlActivation: {
                      clientPoint: { x: 24, y: 12 },
                      kind: "pointer",
                    },
                    nativeControlActive: true,
                  }
                : undefined,
            },
          ],
          scrollOffset: { x: 0, y: 0 },
          viewportRect: { height: 28, width: 160, x: 0, y: 0 },
        }),
        zIndex: 0,
      },
    ],
  };
}

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { createGpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuFlowRetainedContentNodeLayerState } from "./retainedContentControllerSurfaceUpdates";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";

describe("sampleGpuFlowRetainedContentRuntimeScene", () => {
  it("re-applies retained row hover state when the scene is regenerated", () => {
    const target = {
      rowId: "param-0",
      surfaceId: "dict-a:param-content:unpinned",
    };
    const nodeLayerRef = {
      current: {
        retainedContentRowHoverTarget: target,
        scene: retainedContentScene(),
      } satisfies GpuFlowRetainedContentNodeLayerState,
    };

    const result = sampleGpuFlowRetainedContentRuntimeScene({
      nodeLayerRef,
      retainedContentRuntimeState: createGpuRetainedContentRuntimeState(),
    });

    expect(result.changed).toBe(true);
    expect(readRowHovered(nodeLayerRef.current.scene)).toBe(true);
    expect(nodeLayerRef.current.htmlSurfaceNativeVisuals).toEqual([
      expect.objectContaining({
        rect: { height: 28, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned:row-hover:param-0",
      }),
    ]);

    nodeLayerRef.current = {
      ...nodeLayerRef.current,
      htmlSurfaceNativeVisuals: [],
      scene: retainedContentScene(),
    };

    const regeneratedResult = sampleGpuFlowRetainedContentRuntimeScene({
      nodeLayerRef,
      retainedContentRuntimeState: createGpuRetainedContentRuntimeState(),
    });

    expect(regeneratedResult.changed).toBe(true);
    expect(readRowHovered(nodeLayerRef.current.scene)).toBe(true);
    expect(nodeLayerRef.current.htmlSurfaceNativeVisuals).toEqual([
      expect.objectContaining({
        surfaceId: "dict-a:param-content:unpinned:row-hover:param-0",
      }),
    ]);
  });
});

function readRowHovered(scene: GpuFlowScene | undefined): boolean {
  return Boolean(scene?.contentSurfaces[0]?.retainedScene?.rows[0]?.state.hovered);
}

function retainedContentScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
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
      controlWidth: 40,
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-0",
          label: "Param 0",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}

function textLikeControlDescriptor(): GpuRetainedContentControlDescriptor {
  return {
    commitPolicy: "native-island",
    defaultDisplayValue: "",
    displayValue: "Value 0",
    editorKind: "text",
    kind: "text-like",
    policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
    rendererFamily: "text-like",
  };
}

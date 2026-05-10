import { describe, expect, it } from "vitest";
import {
  applyGpuRetainedContentRuntimeStateToScene,
  createGpuRetainedContentRuntimeState,
  setGpuRetainedContentRuntimeScrollOffset,
} from "./retainedContentRuntimeState";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content runtime state", () => {
  it("keeps retained row positions at the live runtime scroll after a stale structural scene refresh", () => {
    const runtimeState = createGpuRetainedContentRuntimeState();
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset: { x: 0, y: 56 },
      state: runtimeState,
      surfaceId: "surface-a",
    });

    const refreshedScene = retainedRuntimeStateScene({ scrollY: 0 });
    const resolvedScene = applyGpuRetainedContentRuntimeStateToScene({
      scene: refreshedScene,
      state: runtimeState,
    });

    const resolvedSurface = resolvedScene?.contentSurfaces[0];
    const visibleRow = resolvedSurface?.retainedScene?.rows.find(
      (row) => row.id === "row-2",
    );
    expect(resolvedSurface?.retainedScene?.scrollOffset).toEqual({
      x: 0,
      y: 56,
    });
    expect(visibleRow?.projectedRect.y).toBe(0);
  });

  it("uses an explicit reset key to clear retained runtime scroll for reused surfaces", () => {
    const runtimeState = createGpuRetainedContentRuntimeState();
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset: { x: 0, y: 56 },
      state: runtimeState,
      surfaceId: "surface-a",
    });

    applyGpuRetainedContentRuntimeStateToScene({
      scene: retainedRuntimeStateScene({ resetKey: "section-a", scrollY: 0 }),
      state: runtimeState,
    });
    const resolvedScene = applyGpuRetainedContentRuntimeStateToScene({
      scene: retainedRuntimeStateScene({ resetKey: "section-b", scrollY: 0 }),
      state: runtimeState,
    });

    expect(
      resolvedScene?.contentSurfaces[0]?.retainedScene?.scrollOffset,
    ).toEqual({
      x: 0,
      y: 0,
    });
  });
});

function retainedRuntimeStateScene({
  resetKey = "section-a",
  scrollY,
}: {
  readonly resetKey?: string | undefined;
  readonly scrollY: number;
}): GpuFlowScene {
  return {
    contentSurfaces: [retainedRuntimeStateSurface({ resetKey, scrollY })],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedRuntimeStateSurface({
  resetKey,
  scrollY,
}: {
  readonly resetKey: string;
  readonly scrollY: number;
}): GpuContentSurface {
  const rect = { height: 84, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "surface-a",
    },
    retainedScrollResetKey: resetKey,
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: Array.from({ length: 8 }, (_, index) => ({
        controlKind: null,
        depth: 0,
        id: `row-${index}`,
        label: `Row ${index}`,
      })),
      scrollOffset: { x: 0, y: scrollY },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}

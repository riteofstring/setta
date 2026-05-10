import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import {
  areGpuRetainedContentRowHoverTargetsEqual,
  getGpuRetainedContentRowHoverVisuals,
} from "./retainedContentRowHover";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("getGpuRetainedContentRowHoverVisuals", () => {
  it("creates a transient hover visual for the targeted retained row", () => {
    const scene = flowScene();

    const visuals = getGpuRetainedContentRowHoverVisuals({
      scene,
      target: { rowId: "param-a", surfaceId: "dict-a:param-content" },
    });

    expect(visuals).toHaveLength(1);
    expect(visuals[0]).toMatchObject({
      kind: "solid-rounded-rect",
      radius: 0,
      rect: { height: 28, width: 240, x: 12, y: 34 },
      surfaceId: "dict-a:param-content:row-hover:param-a",
      zIndex: 7,
    });
    expect(visuals[0]?.color.a).toBe(1);
    expect(visuals[0]?.color.r).toBeCloseTo(239 / 255);
    expect(visuals[0]?.color.g).toBeCloseTo(246 / 255);
    expect(visuals[0]?.color.b).toBe(1);
    expect(getRowHoverStates(scene)).toEqual({
      "param-a": false,
      "param-b": false,
    });
  });

  it("clips the hover visual to the retained viewport", () => {
    const scene = flowScene();
    const surface = getRetainedSurface(scene);
    const clippedScene = {
      ...scene,
      contentSurfaces: [
        {
          ...surface,
          clipRect: { height: 20, width: 240, x: 12, y: 48 },
        },
      ],
    };

    const visuals = getGpuRetainedContentRowHoverVisuals({
      scene: clippedScene,
      target: { rowId: "param-a", surfaceId: "dict-a:param-content" },
    });

    expect(visuals).toHaveLength(1);
    expect(visuals[0]?.rect).toEqual({
      height: 14,
      width: 240,
      x: 12,
      y: 48,
    });
  });

  it("returns no visual without a visible matching row", () => {
    expect(
      getGpuRetainedContentRowHoverVisuals({
        scene: flowScene(),
        target: { rowId: "missing", surfaceId: "dict-a:param-content" },
      }),
    ).toEqual([]);
    expect(
      getGpuRetainedContentRowHoverVisuals({
        scene: flowScene(),
        target: null,
      }),
    ).toEqual([]);
  });
});

describe("areGpuRetainedContentRowHoverTargetsEqual", () => {
  it("compares retained row hover targets by surface and row", () => {
    expect(
      areGpuRetainedContentRowHoverTargetsEqual(
        { rowId: "param-a", surfaceId: "surface-a" },
        { rowId: "param-a", surfaceId: "surface-a" },
      ),
    ).toBe(true);
    expect(
      areGpuRetainedContentRowHoverTargetsEqual(
        { rowId: "param-a", surfaceId: "surface-a" },
        { rowId: "param-b", surfaceId: "surface-a" },
      ),
    ).toBe(false);
    expect(areGpuRetainedContentRowHoverTargetsEqual(null, null)).toBe(true);
  });
});

function flowScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: rect,
    id: "dict-a:param-content",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-a",
          label: "Param A",
        },
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-b",
          label: "Param B",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function getRetainedSurface(scene: GpuFlowScene): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const surface = scene.contentSurfaces[0];
  if (!surface?.retainedScene) {
    throw new Error("Missing retained surface.");
  }
  return surface as GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  };
}

function getRowHoverStates(scene: GpuFlowScene): Record<string, boolean> {
  return Object.fromEntries(
    getRetainedSurface(scene).retainedScene.rows.map((row) => [
      row.id,
      row.state.hovered,
    ]),
  );
}

function textLikeControlDescriptor() {
  return {
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
    rendererFamily: "text-like",
    commitPolicy: "native-island" as const,
  };
}

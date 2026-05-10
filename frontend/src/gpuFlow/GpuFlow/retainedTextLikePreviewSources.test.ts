import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "../retainedContentScene";
import type { GpuFlowScene } from "../scene";
import { getGpuRetainedTextLikePreviewSources } from "./retainedTextLikePreviewSources";

describe("getGpuRetainedTextLikePreviewSources", () => {
  it("derives visible passive editor previews from retained row geometry", () => {
    const sources = getGpuRetainedTextLikePreviewSources(scene());

    expect(sources).toEqual([
      expect.objectContaining({
        code: "alpha",
        defaultValue: "",
        height: 24,
        language: "python",
        linePolicy: "single-line",
        rowId: "param-a",
        sectionId: "section-a",
        sourceHeight: 24,
        sourceId: "retained-text-like-preview:surface-a:param-a",
        sourceWidth: 80,
        surfaceId: "surface-a",
        textureSourceRect: {
          height: 24,
          width: 70,
          x: 0,
          y: 0,
        },
        width: 70,
        wrapLines: false,
        x: 130,
        y: 20,
        zIndex: 8,
      }),
    ]);
  });
});

function scene(): GpuFlowScene {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 80,
    id: "surface-a",
    ownerSectionId: "section-a",
    rowHeight: 24,
    rows: [row("param-a", "alpha"), row("param-b", "beta", true)],
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 48, width: 200, x: 0, y: 0 },
  });
  return {
    contentSurfaces: [
      {
        clipRect: { height: 200, width: 200, x: 0, y: 0 },
        id: "surface-a",
        ownerSectionId: "section-a",
        rect: { height: 48, width: 200, x: 10, y: 20 },
        renderer: { kind: "canvas-content", surfaceId: "surface-a" },
        retainedScene,
        zIndex: 7,
      },
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function row(
  id: string,
  displayValue: string,
  nativeControlActive = false,
): GpuRetainedContentRowInput {
  return {
    control: {
      commitPolicy: "native-island" as const,
      defaultDisplayValue: "",
      displayValue,
      editorKind: "text" as const,
      kind: "text-like" as const,
      policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
      rendererFamily: "text-like",
    },
    controlKind: "text-like",
    depth: 0,
    id,
    label: id,
    state: nativeControlActive ? { nativeControlActive: true } : {},
  };
}

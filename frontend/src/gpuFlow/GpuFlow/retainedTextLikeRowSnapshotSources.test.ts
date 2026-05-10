import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "../retainedContentScene";
import type { GpuFlowScene } from "../scene";
import { getGpuRetainedTextLikeRowSnapshotSources } from "./retainedTextLikeRowSnapshotSources";

describe("getGpuRetainedTextLikeRowSnapshotSources", () => {
  it("derives row-owned passive editor snapshots from retained row geometry", () => {
    const sources = getGpuRetainedTextLikeRowSnapshotSources(scene());

    expect(sources).toEqual([
      expect.objectContaining({
        code: "alpha",
        defaultValue: "",
        disabled: false,
        error: false,
        language: "python",
        linePolicy: "single-line",
        rowId: "param-a",
        sectionId: "section-a",
        sourceHeight: 24,
        sourceId: "retained-text-like-row-snapshot:surface-a:param-a",
        sourceWidth: 80,
        surfaceId: "surface-a",
        targetRectCss: {
          height: 24,
          width: 80,
          x: 120,
          y: 0,
        },
        wrapLines: false,
      }),
    ]);
  });

  it("keeps row source keys independent from retained scroll offsets inside the same cache window", () => {
    const firstSource = getGpuRetainedTextLikeRowSnapshotSources(
      scene({ rowCount: 20, scrollY: 7 }),
    )[0];
    const nextSource = getGpuRetainedTextLikeRowSnapshotSources(
      scene({ rowCount: 20, scrollY: 15 }),
    )[0];

    expect(firstSource?.sourceKey).toBe(nextSource?.sourceKey);
    expect(firstSource?.targetRectCss).toEqual(nextSource?.targetRectCss);
  });
});

function scene({
  rowCount = 2,
  scrollY = 0,
}: {
  readonly rowCount?: number | undefined;
  readonly scrollY?: number | undefined;
} = {}): GpuFlowScene {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 80,
    id: "surface-a",
    ownerSectionId: "section-a",
    rowHeight: 24,
    rows: Array.from({ length: rowCount }, (_, index) =>
      row(
        `param-${String.fromCharCode(97 + index)}`,
        index === 0 ? "alpha" : `value-${index}`,
        index === 1,
      ),
    ),
    scrollOffset: { x: 0, y: scrollY },
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

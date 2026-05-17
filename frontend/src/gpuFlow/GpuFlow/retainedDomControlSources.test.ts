/* @vitest-environment jsdom */

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "../retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import { getGpuRetainedDomControlSources } from "./retainedDomControlSources";

describe("getGpuRetainedDomControlSources", () => {
  it("derives DOM-plane descriptors from retained row geometry", () => {
    const sources = getGpuRetainedDomControlSources(scene({ rowCount: 1 }));

    expect(sources).toEqual([
      expect.objectContaining({
        active: false,
        defaultValue: "",
        disabled: false,
        error: false,
        language: "python",
        layerSlot: "dom-control-plane",
        lifecycleState: "passive-projected",
        linePolicy: "single-line",
        rowId: "param-a",
        sectionId: "section-a",
        sourceId: "retained-dom-control:surface-a:param-a",
        sourceRectCssPx: {
          height: 24,
          width: 80,
          x: 0,
          y: 0,
        },
        surfaceId: "surface-a",
        value: "alpha",
        viewportRectCssPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 20,
        },
        worldRectFlowPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 20,
        },
        wrapLines: false,
      }),
    ]);
  });

  it("keeps row source keys independent from retained scroll offsets inside the same cache window", () => {
    const firstSource = getGpuRetainedDomControlSources(
      scene({ rowCount: 20, scrollY: 7 }),
    )[0];
    const nextSource = getGpuRetainedDomControlSources(
      scene({ rowCount: 20, scrollY: 15 }),
    )[0];

    expect(firstSource?.sourceKey).toBe(nextSource?.sourceKey);
    expect(firstSource?.sourceRectCssPx).toEqual(nextSource?.sourceRectCssPx);
  });

  it("marks active DOM-owned rows as active DOM-plane controls", () => {
    const source = getGpuRetainedDomControlSources(
      scene({ activeSecondRow: true, rowCount: 2 }),
    ).find((candidate) => candidate.rowId === "param-b");

    expect(source).toEqual(
      expect.objectContaining({
        active: true,
        layerSlot: "active-dom-control-plane",
        lifecycleState: "active-projected",
        viewportRectCssPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 44,
        },
      }),
    );
  });

  it("projects DOM-plane descriptor geometry through the retained runtime viewport", () => {
    const runtimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: scene({ activeSecondRow: true, rowCount: 2 }),
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [5, 7, 2],
      viewportZoomBucket: 2,
    });
    const source = runtimeFrame.descriptors.domControlSources.find(
      (candidate) => candidate.rowId === "param-b",
    );

    expect(source?.viewportRectCssPx).toEqual({
      height: 48,
      width: 160,
      x: 265,
      y: 95,
    });
  });
});

function scene({
  activeSecondRow = false,
  firstValue = "alpha",
  rowCount = 2,
  scrollY = 0,
}: {
  readonly activeSecondRow?: boolean | undefined;
  readonly firstValue?: string | undefined;
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
        index === 0 ? firstValue : `value-${index}`,
        activeSecondRow && index === 1,
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
      renderOwner: "dom-owned",
      rendererFamily: "text-like",
    },
    controlKind: "text-like",
    depth: 0,
    id,
    label: id,
    state: nativeControlActive ? { nativeControlActive: true } : {},
  };
}

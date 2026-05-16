/* @vitest-environment jsdom */

import { act, createElement, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "../retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import {
  getGpuRetainedTextLikeRowSnapshotSources,
  useGpuFlowRetainedTextLikeRowSnapshotSources,
  type GpuRetainedTextLikeRowSnapshotSource,
} from "./retainedTextLikeRowSnapshotSources";

let root: Root | null = null;

describe("getGpuRetainedTextLikeRowSnapshotSources", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

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

  it("requests a canvas paint when retained snapshot contents change without remounting", () => {
    const requestFrame = vi.fn();
    const requestPaint = vi.fn();
    const surface: GpuSurfaceHandle = {
      getRuntime: () => null,
      requestFrame,
      requestPaint,
    };

    renderHookHarness(
      createElement(SnapshotPaintHarness, {
        scene: scene({ firstValue: "alpha" }),
        surface,
      }),
    );
    requestFrame.mockClear();
    requestPaint.mockClear();

    renderHookHarness(
      createElement(SnapshotPaintHarness, {
        scene: scene({ firstValue: "bravo" }),
        surface,
      }),
    );

    expect(requestPaint).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledWith("manual");
  });
});

function scene({
  firstValue = "alpha",
  rowCount = 2,
  scrollY = 0,
}: {
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

function SnapshotPaintHarness({
  scene,
  surface,
}: {
  readonly scene: GpuFlowScene;
  readonly surface: GpuSurfaceHandle;
}) {
  const elementBySourceIdRef = useRef(new Map<string, HTMLElement>());
  const surfaceRef = useRef<GpuSurfaceHandle | null>(surface);
  surfaceRef.current = surface;
  const { retainedTextLikeRowSnapshotSourceElement } =
    useGpuFlowRetainedTextLikeRowSnapshotSources({
      elementBySourceIdRef,
      renderSnapshot: renderSnapshot,
      retainedRuntimeFrame: createGpuRetainedRuntimeFrame({
        devicePixelRatioBucket: 1,
        frameId: 1,
        scene,
        scrollOffsets: new Map(),
        scrollRevision: 0,
        viewport: [0, 0, 1],
        viewportZoomBucket: 1,
      }),
      surfaceRef,
    });
  return createElement("div", null, retainedTextLikeRowSnapshotSourceElement);
}

function renderSnapshot(source: GpuRetainedTextLikeRowSnapshotSource) {
  return createElement("span", null, source.code);
}

function renderHookHarness(element: ReactElement): void {
  if (!root) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root?.render(element));
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

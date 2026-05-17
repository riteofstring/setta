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
  getGpuRetainedDomControlSources,
  useGpuFlowRetainedDomControlSources,
  type GpuRetainedDomControlRenderer,
} from "./retainedDomControlSources";

let root: Root | null = null;

describe("getGpuRetainedDomControlSources", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("derives row-owned passive editor sources from retained row geometry", () => {
    const sources = getGpuRetainedDomControlSources(scene({ rowCount: 1 }));

    expect(sources).toEqual([
      expect.objectContaining({
        active: false,
        defaultValue: "",
        disabled: false,
        error: false,
        language: "python",
        linePolicy: "single-line",
        lifecycleState: "passive-texture-pending",
        layerSlot: "passive-dom-control",
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
        textureRectCssPx: {
          height: 24,
          width: 80,
          x: 120,
          y: 0,
        },
        value: "alpha",
        viewportRectCssPx: {
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
    expect(firstSource?.textureRectCssPx).toEqual(nextSource?.textureRectCssPx);
  });

  it("publishes active projected sources for DOM-owned active rows", () => {
    const source = getGpuRetainedDomControlSources(
      scene({ activeSecondRow: true, rowCount: 2 }),
    ).find((candidate) => candidate.rowId === "param-b");

    expect(source).toEqual(
      expect.objectContaining({
        active: true,
        layerSlot: "active-projected-source",
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

  it("projects active source geometry through the retained runtime viewport", () => {
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

  it("marks active projected source hosts as interactive", () => {
    const requestFrame = vi.fn();
    const requestPaint = vi.fn();
    const surface: GpuSurfaceHandle = {
      getRuntime: () => null,
      requestFrame,
      requestPaint,
    };

    renderHookHarness(
      createElement(DomControlPaintHarness, {
        scene: scene({ activeSecondRow: true, rowCount: 2 }),
        surface,
      }),
    );

    const activeHost = document.querySelector<HTMLElement>(
      '[data-gpu-flow-retained-row-id="param-b"]',
    );
    expect(activeHost?.dataset.gpuFlowRetainedDomControlLifecycle).toBe(
      "active-projected",
    );
    expect(
      activeHost?.getAttribute("data-gpu-flow-projected-interaction"),
    ).toBe("true");
    expect(activeHost?.parentElement?.className).toContain("setta-gpu-flow");
    expect(activeHost?.style.pointerEvents).toBe("auto");
  });

  it("requests a canvas paint when retained DOM-control contents change without remounting", () => {
    const requestFrame = vi.fn();
    const requestPaint = vi.fn();
    const surface: GpuSurfaceHandle = {
      getRuntime: () => null,
      requestFrame,
      requestPaint,
    };

    renderHookHarness(
      createElement(DomControlPaintHarness, {
        scene: scene({ firstValue: "alpha", rowCount: 1 }),
        surface,
      }),
    );
    requestFrame.mockClear();
    requestPaint.mockClear();

    renderHookHarness(
      createElement(DomControlPaintHarness, {
        scene: scene({ firstValue: "bravo" }),
        surface,
      }),
    );

    expect(requestPaint).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledWith("manual");
  });

  it("requests a frame when a retained DOM-control source reaches paint readiness", () => {
    const requestFrame = vi.fn();
    const requestPaint = vi.fn();
    const surface: GpuSurfaceHandle = {
      getRuntime: () => null,
      requestFrame,
      requestPaint,
    };
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });

    renderHookHarness(
      createElement(DomControlPaintHarness, {
        scene: scene({ firstValue: "alpha" }),
        surface,
      }),
    );
    requestFrame.mockClear();
    requestPaint.mockClear();

    act(() => {
      for (const callback of rafCallbacks.splice(0)) {
        callback(performance.now());
      }
    });
    expect(requestFrame).not.toHaveBeenCalled();
    expect(requestPaint).not.toHaveBeenCalled();

    act(() => {
      for (const callback of rafCallbacks.splice(0)) {
        callback(performance.now());
      }
    });

    expect(requestPaint).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledWith("manual");
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

function DomControlPaintHarness({
  scene,
  surface,
}: {
  readonly scene: GpuFlowScene;
  readonly surface: GpuSurfaceHandle;
}) {
  const elementBySourceIdRef = useRef(new Map<string, HTMLElement>());
  const surfaceRef = useRef<GpuSurfaceHandle | null>(surface);
  surfaceRef.current = surface;
  const { retainedDomControlSourceElement } =
    useGpuFlowRetainedDomControlSources({
      elementBySourceIdRef,
      renderSource,
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
  return createElement("div", null, retainedDomControlSourceElement);
}

const renderSource: GpuRetainedDomControlRenderer = (source) =>
  createElement("span", null, source.value);

function renderHookHarness(element: ReactElement): void {
  if (!root) {
    const host = document.createElement("div");
    host.className = "setta-gpu-flow";
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

/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuViewportInput, GpuViewportTuple } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlowDomControlPlane } from "./domControlPlane";

let root: Root | null = null;

describe("GPU flow DOM control projection runtime", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    delete (window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean })
      .__SETTA_CHROME_REPRO_ACTIVE__;
    document.body.replaceChildren();
  });

  it("projects mounted hosts on viewport motion without React mount selection", () => {
    const controls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          retainedRuntimeFrame={retainedRuntimeFrame(controls)}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    const mountedBefore = mountedRowIds();

    act(() => {
      viewportRuntime.applyOverlayTransforms([0, -280, 1]);
    });

    expect(mountedBefore.length).toBeGreaterThan(0);
    expect(mountedRowIds()).toEqual(mountedBefore);
  });

  it("uses identical DOM-control host selection when Chrome repro capture is active", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );
    const normalMounted = renderMountedRowIds({
      controls,
      chromeReproActive: false,
    });

    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();

    const recorderMounted = renderMountedRowIds({
      controls,
      chromeReproActive: true,
    });

    expect(recorderMounted.length).toBeGreaterThan(0);
    expect(recorderMounted).toEqual(normalMounted);
  });

  it("tracks committed-frame store updates when React semantic rendering dedupes", () => {
    const firstControls = [domControl({ index: 0 })];
    const nextControls = [domControl({ index: 1 })];
    const firstRuntimeFrame = retainedRuntimeFrame(firstControls, 1);
    const nextRuntimeFrame = retainedRuntimeFrame(nextControls, 2);
    const committedSurfaceRuntime = createGpuFlowCommittedSurfaceRuntime(
      committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    );
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          retainedRuntimeFrame={firstRuntimeFrame}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    expect(mountedRowIds()).toEqual(["row-0"]);

    act(() => {
      committedSurfaceRuntime.publishCommittedContentFrame(
        committedSurfaceFrame({
          displayFrameId: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      );
    });

    expect(mountedRowIds()).toEqual(["row-1"]);
    expect(
      document.querySelector<HTMLElement>(
        "[data-gpu-flow-dom-control-plane='true']",
      )?.dataset.gpuFlowDomControlPlaneCommittedFrameId,
    ).toBe("2");
  });
});

function renderMountedRowIds({
  chromeReproActive,
  controls,
}: {
  readonly chromeReproActive: boolean;
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
}): readonly string[] {
  (window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean })
    .__SETTA_CHROME_REPRO_ACTIVE__ = chromeReproActive;
  const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
  const viewportStore = createGpuFlowViewportStore({
    height: 60,
    transform: [0, 0, 1],
    width: 400,
  });
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);

  act(() => {
    root?.render(
      <GpuFlowDomControlPlane
        committedFrameId={1}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input data-row-id={control.rowId} readOnly value={control.value} />
        )}
        retainedRuntimeFrame={retainedRuntimeFrame(controls)}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />,
    );
  });

  return mountedRowIds();
}

function createMockViewportRuntime(
  initialViewport: GpuViewportTuple,
): GpuFlowViewportRuntime {
  let viewport = initialViewport;
  const overlayManagers: Array<{
    readonly applyViewport: (viewport: GpuViewportTuple) => void;
  }> = [];
  return {
    applyOverlayTransforms(nextViewport: GpuViewportInput = viewport) {
      viewport = normalizeViewportTuple(nextViewport);
      for (const manager of overlayManagers) {
        manager.applyViewport(viewport);
      }
    },
    getViewportTuple() {
      return viewport;
    },
    registerOverlayManager(manager) {
      overlayManagers.push(manager);
      manager.applyViewport(viewport);
      return () => {
        const index = overlayManagers.indexOf(manager);
        if (index >= 0) {
          overlayManagers.splice(index, 1);
        }
      };
    },
  } as unknown as GpuFlowViewportRuntime;
}

function normalizeViewportTuple(viewport: GpuViewportInput): GpuViewportTuple {
  return Array.isArray(viewport)
    ? [viewport[0], viewport[1], viewport[2]]
    : [viewport.x, viewport.y, viewport.zoom];
}

function retainedRuntimeFrame(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  frameId = 1,
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: controls,
    },
    frameId,
  } as GpuRetainedRuntimeFrame;
}

function committedSurfaceFrame({
  displayFrameId,
  retainedRuntimeFrame,
}: {
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    displayFrameId,
    retainedRuntimeFrame,
    sceneRevision: 1,
  } as GpuFlowCommittedSurfaceFrame;
}

function mountedRowIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-control='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomControlRowId ?? "");
}

function domControl({
  active = false,
  index,
}: {
  readonly active?: boolean | undefined;
  readonly index: number;
}): GpuRetainedDomControlSourceDescriptor {
  const rect = { height: 24, width: 273, x: 0, y: index * 28 };
  const snapshotCacheKey = {
    appThemeRevision: "theme",
    codeMirrorThemeRevision: "codemirror-theme",
    cssStyleRevision: "value-style",
    defaultValue: "",
    devicePixelRatioBucket: 1,
    disabled: false,
    editorExtensionGeneration: "text|single-line|nowrap",
    editorKind: "text" as const,
    error: false,
    fontGeneration: "fonts",
    language: null,
    linePolicy: "single-line" as const,
    measuredLayoutMode: "single-line" as const,
    placeholder: "",
    rendererFamily: "text-like",
    sourceHeight: rect.height,
    sourceWidth: rect.width,
    syntaxGeneration: "plain-text",
    value: "",
    wrapLines: false,
    zoomBucket: 1,
  };
  return {
    active,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: rect,
    controlId: `control-${index}`,
    controlRectSurfaceCssPx: rect,
    defaultValue: "",
    disabled: false,
    editorKind: "text",
    error: false,
    geometryRevision: "geometry",
    interactionPolicy: GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
    language: null,
    layerSlot: "dom-control-plane",
    lifecycleState: active ? "active" : "passive-projected",
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    projectionVisibility: "viewport-visible",
    rendererFamily: "text-like",
    role: "text-like",
    rowId: `row-${index}`,
    sectionClipRectFlowPx: { height: 10_000, width: 400, x: 0, y: 0 },
    sectionId: "section",
    sectionScrollOffset: { x: 0, y: 0 },
    sectionScrollRevision: 0,
    snapshotCacheKey,
    snapshotCacheKeyRevision: JSON.stringify(snapshotCacheKey),
    snapshotSurfaceId: null,
    sourceId: `source-${index}`,
    sourceKey: `source-${index}`,
    sourceRectCssPx: rect,
    surfaceId: "surface",
    value: "",
    valueStyleKey: "value-style",
    valueStyleRevision: "value-style",
    viewportRectCssPx: rect,
    viewportSampleRevision: "viewport",
    visualPolicy: "live-dom",
    visualSemantics: {
      accessibility: "visual-only-aria-hidden",
      focusable: false,
      pointer: "retained-activation-model",
      selectable: "none",
    },
    worldRectFlowPx: rect,
    wrapLines: false,
    zOrder: index,
  };
}

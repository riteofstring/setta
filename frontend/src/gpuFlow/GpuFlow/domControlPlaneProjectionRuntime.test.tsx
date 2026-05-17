/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
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
    document.body.replaceChildren();
  });

  it("projects mounted hosts on viewport motion without React mount selection", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
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
});

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
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: controls,
    },
    frameId: 1,
  } as GpuRetainedRuntimeFrame;
}

function mountedRowIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-control='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomControlRowId ?? "");
}

function domControl({
  index,
}: {
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
    active: false,
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
    lifecycleState: "passive-projected",
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

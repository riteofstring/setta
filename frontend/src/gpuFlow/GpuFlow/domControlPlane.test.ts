/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import {
  filterGpuFlowDomControlPlaneMountedControls,
  resolveGpuFlowDomControlPlaneProjectionAssignments,
} from "./domControlPlane";

describe("GPU flow DOM control plane", () => {
  it("mounts visible readable retained DOM controls before overscan controls", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(mounted.length).toBeGreaterThan(24);
    expect(mounted.length).toBeLessThanOrEqual(32);
    expect(mounted.map((control) => control.rowId)).toContain("row-12");
    expect(mounted.map((control) => control.rowId)).not.toContain("row-60");
  });

  it("keeps active retained DOM controls mounted outside the inactive budget", () => {
    const controls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 100 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(mounted.length).toBeGreaterThan(24);
    expect(mounted.length).toBeLessThanOrEqual(32);
    expect(mounted.some((control) => control.active)).toBe(true);
  });

  it("pins active retained DOM controls even outside the projection horizon", () => {
    const controls = [
      domControl({ active: true, index: 500 }),
      ...Array.from({ length: 100 }, (_, index) => domControl({ index })),
    ];

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });

    expect(mounted.map((control) => control.rowId)).toContain("row-500");
  });

  it("reports explicit projection coverage states for non-live controls", () => {
    const assignments = resolveGpuFlowDomControlPlaneProjectionAssignments({
      controls: [
        domControl({ index: 0 }),
        domControl({ index: 1, visualPolicy: "snapshot" }),
        domControl({
          index: 2,
          visualPolicy: "blocked-awaiting-browser-visual",
        }),
        domControl({ index: 3, visualPolicy: "clipped-empty" }),
      ],
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });

    expect(
      new Map(
        assignments.map((assignment) => [
          assignment.control.rowId,
          assignment.coverageState,
        ]),
      ),
    ).toEqual(
      new Map([
        ["row-0", "live"],
        ["row-1", "snapshot"],
        ["row-2", "blocked-awaiting-browser-visual"],
        ["row-3", "true-hole"],
      ]),
    );
  });

  it("uses the provided viewport size for deterministic candidate selection", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });

    expect(mounted.map((control) => control.rowId)).toContain("row-0");
    expect(mounted.map((control) => control.rowId)).not.toContain("row-12");
  });

  it("prepares near-future live hosts inside the retained projection horizon", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });

    expect(mounted.map((control) => control.rowId)).toContain("row-8");
  });

  it("biases near-future live hosts in the retained scroll direction", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: () => ({ x: 0, y: 280 }),
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });
    const mountedRowIds = mounted.map((control) => control.rowId);

    expect(mountedRowIds).toEqual(
      expect.arrayContaining(["row-10", "row-12", "row-20"]),
    );
    expect(mountedRowIds).not.toContain("row-4");
  });

  it("keeps small-scene live DOM controls mounted across projection-only viewport moves", () => {
    const controls = Array.from({ length: 4 }, (_, index) =>
      domControl({ index: index * 50 }),
    );

    const mounted = filterGpuFlowDomControlPlaneMountedControls({
      controls,
      getRetainedScrollOffset: undefined,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 60, width: 400 },
    });

    expect(mounted.map((control) => control.rowId)).toEqual([
      "row-0",
      "row-50",
      "row-100",
      "row-150",
    ]);
  });
});

function domControl({
  active = false,
  index,
  visualPolicy = "live-dom",
}: {
  readonly active?: boolean | undefined;
  readonly index: number;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
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
    lifecycleState: active ? "active-projected" : "passive-projected",
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    rendererFamily: "text-like",
    role: "text-like",
    rowId: `row-${index}`,
    sectionClipRectFlowPx: { height: 10_000, width: 400, x: 0, y: 0 },
    sectionId: "section",
    sectionScrollOffset: { x: 0, y: 0 },
    sectionScrollRevision: 0,
    sourceId: `source-${index}`,
    sourceKey: `source-${index}`,
    sourceRectCssPx: rect,
    projectionVisibility: "viewport-visible",
    snapshotSurfaceId: null,
    snapshotCacheKey,
    snapshotCacheKeyRevision: JSON.stringify(snapshotCacheKey),
    surfaceId: "surface",
    value: "",
    valueStyleKey: "value-style",
    valueStyleRevision: "value-style",
    viewportRectCssPx: rect,
    viewportSampleRevision: "viewport",
    visualPolicy,
    visualSemantics: active
      ? {
          accessibility: "active-browser-editor",
          focusable: true,
          pointer: "active-browser-editor",
          selectable: "browser-editor",
        }
      : {
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

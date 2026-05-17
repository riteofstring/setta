import { describe, expect, it } from "vitest";

import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import {
  createBrowserVisualSurfaceTransactionFragment,
  createDomControlBrowserVisualActor,
  createDomIslandBrowserVisualActor,
} from "./browserVisualActorAdapter";

describe("browser visual actor adapter", () => {
  it("publishes live DOM-control coverage through shared surface entries", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({ value: "hello" }),
      {
        representationReadiness: {
          coverageState: "live-host-ready",
          resourceHandles: [{ id: "source-a", kind: "source" }],
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageExemption: null,
        coverageRequired: { reason: "value-text", required: true },
        coverageState: "live-host-ready",
        nonemptyReason: "value-text",
        representationKind: "passive-live-display",
        visibilityReason: "visible",
      }),
    );
    expect(fragment.exactCoverage).toHaveLength(1);
    expect(fragment.trueHoleRects).toEqual([]);
    expect(fragment.protectedResourceHandles).toEqual([
      expect.objectContaining({
        kind: "source",
        reason: "interactive-source",
      }),
    ]);
  });

  it("blocks live DOM-control coverage until runtime host readiness is proven", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({ value: "hello" }),
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor.coverageState).toBe("blocked-awaiting-live-host");
    expect(actor.representationKind).toBe("blocked");
    expect(fragment.exactCoverage).toEqual([]);
    expect(fragment.blockingSurfaceIds).toEqual([actor.surfaceId]);
  });

  it("does not require coverage for overscan-only DOM controls", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        projectionVisibility: "overscan-visible",
        value: "hello",
        visualPolicy: "outside-viewport",
      }),
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageExemption: { reason: "outside-viewport" },
        coverageRequired: { reason: "none", required: false },
        coverageState: "coverage-exempt",
        visibilityReason: "outside-viewport",
      }),
    );
    expect(fragment.blockingSurfaceIds).toEqual([]);
    expect(fragment.exactCoverage).toEqual([]);
  });

  it("lets runtime projection exempt stale viewport-visible DOM controls", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({ value: "hello" }),
      {
        representationReadiness: { coverageState: "coverage-exempt" },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageExemption: null,
        coverageRequired: { reason: "none", required: false },
        coverageState: "coverage-exempt",
        visibilityReason: "visible",
      }),
    );
    expect(fragment.blockingSurfaceIds).toEqual([]);
    expect(fragment.exactCoverage).toEqual([]);
  });

  it("turns blocked visible DOM-control coverage into transaction-blocking holes", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        value: "hello",
        visualPolicy: "blocked-awaiting-browser-visual",
      }),
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor.coverageState).toBe("blocked-awaiting-snapshot");
    expect(fragment.exactCoverage).toEqual([]);
    expect(fragment.blockingSurfaceIds).toEqual([actor.surfaceId]);
    expect(fragment.trueHoleRects).toEqual([actor.flowRect]);
  });

  it("publishes snapshot DOM-control coverage as exact texture coverage", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        snapshotSurfaceId: "snapshot-a",
        value: "hello",
        visualPolicy: "snapshot",
      }),
      {
        representationReadiness: {
          coverageState: "exact-snapshot-ready",
          resourceHandles: [{ id: "snapshot-a", kind: "texture" }],
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor.coverageState).toBe("exact-snapshot-ready");
    expect(fragment.exactCoverage[0]?.resourceHandles).toEqual([
      expect.objectContaining({
        id: expect.stringContaining("snapshot-a"),
        kind: "texture",
      }),
    ]);
  });

  it("requires coverage for empty visible controls with caret or selection state", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        textCoverageState: {
          caret: "visible",
          composition: "inactive",
          selection: "collapsed",
        },
        value: "",
      }),
      {
        representationReadiness: {
          coverageState: "live-host-ready",
          resourceHandles: [{ id: "source-a", kind: "source" }],
        },
      },
    );

    expect(actor).toEqual(
      expect.objectContaining({
        coverageRequired: { reason: "selection-caret", required: true },
        nonemptyReason: "selection-caret",
      }),
    );
  });

  it("keys active composition into DOM-control visual generation", () => {
    const inactiveActor = createDomControlBrowserVisualActor(
      domControl({ value: "" }),
    );
    const composingActor = createDomControlBrowserVisualActor(
      domControl({
        textCoverageState: {
          caret: "visible",
          composition: "active",
          selection: "collapsed",
        },
        value: "",
      }),
    );

    expect(composingActor.visualGenerationId).not.toBe(
      inactiveActor.visualGenerationId,
    );
    expect(composingActor.generationId).toContain(
      composingActor.visualGenerationId,
    );
  });

  it("uses exact snapshot coverage for live DOM controls when runtime falls back to a snapshot", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        sourceId: "source-live-overflow",
        value: "hello",
      }),
      {
        representationReadiness: {
          coverageState: "exact-snapshot-ready",
          resourceHandles: [
            {
              id: "retained-dom-control-snapshot:source-live-overflow",
              kind: "texture",
            },
          ],
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageState: "exact-snapshot-ready",
        representation: expect.objectContaining({
          kind: "passive-snapshot",
          snapshotId: "retained-dom-control-snapshot:source-live-overflow",
        }),
        representationKind: "passive-snapshot",
      }),
    );
    expect(fragment.exactCoverage[0]?.resourceHandles).toEqual([
      expect.objectContaining({
        id: "retained-dom-control-snapshot:source-live-overflow",
        kind: "texture",
      }),
    ]);
  });

  it("publishes compatible previous DOM-control coverage through shared compatible entries", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        value: "hello",
        visualPolicy: "blocked-awaiting-browser-visual",
      }),
      {
        compatiblePreviousProof: {
          previousTransactionId: "transaction-a",
          previousVisualGenerationId: "visual-a",
          reasonCode: "same-value-and-geometry",
          resourceHandles: [{ id: "source-a", kind: "source" }],
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageState: "compatible-previous-ready",
        representation: expect.objectContaining({
          kind: "compatible-previous",
          previousTransactionId: "transaction-a",
        }),
        representationKind: "compatible-previous",
      }),
    );
    expect(fragment.compatibleCoverage).toEqual([
      expect.objectContaining({
        fidelity: "compatible",
        resourceHandles: [expect.objectContaining({ kind: "source" })],
      }),
    ]);
    expect(fragment.trueHoleRects).toEqual([]);
  });

  it("keeps DOM-control and DOM-island z-order and clipping in one transaction fragment", () => {
    const control = createDomControlBrowserVisualActor(
      domControl({
        clipRect: { height: 18, width: 120, x: 12, y: 14 },
        sourceId: "source-control",
        value: "hello",
        worldRect: { height: 24, width: 180, x: 8, y: 12 },
        zOrder: 3,
      }),
      {
        representationReadiness: {
          coverageState: "live-host-ready",
          resourceHandles: [{ id: "source-control", kind: "source" }],
        },
      },
    );
    const island = createDomIslandBrowserVisualActor(
      {
        clipOwnerId: "section-a",
        contentRect: { height: 32, width: 160, x: 0, y: 0 },
        id: "island-a",
        kind: "retained-content-control",
        ownerSectionId: "section-a",
        rect: { height: 32, width: 160, x: 24, y: 18 },
        source: { kind: "custom" },
        zIndex: 9,
      },
      {
        representationReadiness: {
          coverageState: "live-host-ready",
          resourceHandles: [{ id: "island-a", kind: "native-dom-island" }],
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([
      control,
      island,
    ]);

    expect(fragment.zOrder).toEqual([control.surfaceId, island.surfaceId]);
    expect(fragment.visibleRects).toEqual([control.flowRect, island.flowRect]);
    expect(fragment.activeIslands).toEqual([island.island]);
    expect(fragment.exactCoverage).toEqual([
      expect.objectContaining({
        coverageRect: control.flowRect,
        surfaceId: control.surfaceId,
        zIndex: 3,
      }),
      expect.objectContaining({
        coverageRect: island.flowRect,
        surfaceId: island.surfaceId,
        zIndex: 9,
      }),
    ]);
    expect(control.clipRect).toEqual({ height: 18, width: 120, x: 12, y: 14 });
    expect(island.clipRect).toEqual(island.flowRect);
  });
});

const DEFAULT_TEXT_COVERAGE_STATE = {
  caret: "hidden",
  composition: "inactive",
  selection: "none",
} as const;

function domControl({
  clipRect,
  projectionVisibility = "viewport-visible",
  snapshotSurfaceId = null,
  sourceId = "source-a",
  textCoverageState,
  value = "",
  visualPolicy = "live-dom",
  worldRect,
  zOrder = 2,
}: {
  readonly clipRect?: GpuRetainedDomControlSourceDescriptor["clipRectSurfaceCssPx"];
  readonly projectionVisibility?:
    | GpuRetainedDomControlSourceDescriptor["projectionVisibility"]
    | undefined;
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly sourceId?: string | undefined;
  readonly textCoverageState?:
    | GpuRetainedDomControlSourceDescriptor["textCoverageState"]
    | undefined;
  readonly value?: string | undefined;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
  readonly worldRect?: GpuRetainedDomControlSourceDescriptor["worldRectFlowPx"];
  readonly zOrder?: number | undefined;
}): GpuRetainedDomControlSourceDescriptor {
  const rects = createDomControlTestRects({ clipRect, worldRect });
  const resolvedTextCoverageState =
    textCoverageState ?? DEFAULT_TEXT_COVERAGE_STATE;
  const textCoverageRevision = JSON.stringify(resolvedTextCoverageState);
  return {
    active: false,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: rects.clipRect,
    controlId: "control-a",
    defaultValue: "",
    disabled: false,
    error: false,
    geometryRevision: "geometry",
    projectionVisibility,
    snapshotCacheKey: {
      placeholder: "",
    },
    snapshotCacheKeyRevision: "snapshot-key",
    snapshotSurfaceId,
    sourceId,
    sourceKey: "source-key",
    sourceRectCssPx: { height: 24, width: 180, x: 0, y: 0 },
    textCoverageRevision,
    textCoverageState: resolvedTextCoverageState,
    value,
    valueStyleRevision: "value-style",
    visualPolicy,
    worldRectFlowPx: rects.worldRect,
    zOrder,
  } as GpuRetainedDomControlSourceDescriptor;
}

function createDomControlTestRects({
  clipRect,
  worldRect,
}: {
  readonly clipRect:
    | GpuRetainedDomControlSourceDescriptor["clipRectSurfaceCssPx"]
    | undefined;
  readonly worldRect:
    | GpuRetainedDomControlSourceDescriptor["worldRectFlowPx"]
    | undefined;
}) {
  const rect = { height: 24, width: 180, x: 4, y: 8 };
  return {
    clipRect: clipRect ?? rect,
    worldRect: worldRect ?? rect,
  };
}

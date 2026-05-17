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
    );
    const island = createDomIslandBrowserVisualActor({
      clipOwnerId: "section-a",
      contentRect: { height: 32, width: 160, x: 0, y: 0 },
      id: "island-a",
      kind: "retained-content-control",
      ownerSectionId: "section-a",
      rect: { height: 32, width: 160, x: 24, y: 18 },
      source: { kind: "custom" },
      zIndex: 9,
    });
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

function domControl({
  clipRect,
  snapshotSurfaceId = null,
  sourceId = "source-a",
  value = "",
  visualPolicy = "live-dom",
  worldRect,
  zOrder = 2,
}: {
  readonly clipRect?: GpuRetainedDomControlSourceDescriptor["clipRectSurfaceCssPx"];
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly sourceId?: string | undefined;
  readonly value?: string | undefined;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
  readonly worldRect?: GpuRetainedDomControlSourceDescriptor["worldRectFlowPx"];
  readonly zOrder?: number | undefined;
}): GpuRetainedDomControlSourceDescriptor {
  const rect = { height: 24, width: 180, x: 4, y: 8 };
  return {
    active: false,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: clipRect ?? rect,
    controlId: "control-a",
    defaultValue: "",
    disabled: false,
    error: false,
    geometryRevision: "geometry",
    projectionVisibility: "viewport-visible",
    snapshotCacheKey: {
      placeholder: "",
    },
    snapshotCacheKeyRevision: "snapshot-key",
    snapshotSurfaceId,
    sourceId,
    sourceKey: "source-key",
    sourceRectCssPx: { height: 24, width: 180, x: 0, y: 0 },
    value,
    valueStyleRevision: "value-style",
    visualPolicy,
    worldRectFlowPx: worldRect ?? rect,
    zOrder,
  } as GpuRetainedDomControlSourceDescriptor;
}

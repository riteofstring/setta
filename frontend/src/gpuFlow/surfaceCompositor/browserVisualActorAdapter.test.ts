import { describe, expect, it } from "vitest";

import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import {
  createBrowserVisualSurfaceTransactionFragment,
  createDomControlBrowserVisualActor,
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
});

function domControl({
  snapshotSurfaceId = null,
  value = "",
  visualPolicy = "live-dom",
}: {
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly value?: string | undefined;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
}): GpuRetainedDomControlSourceDescriptor {
  const rect = { height: 24, width: 180, x: 4, y: 8 };
  return {
    active: false,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: rect,
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
    sourceId: "source-a",
    sourceKey: "source-key",
    sourceRectCssPx: { height: 24, width: 180, x: 0, y: 0 },
    value,
    valueStyleRevision: "value-style",
    visualPolicy,
    worldRectFlowPx: rect,
    zOrder: 2,
  } as GpuRetainedDomControlSourceDescriptor;
}

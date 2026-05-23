import { describe, expect, it } from "vitest";

import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import {
  createBrowserVisualSurfaceTransactionFragment,
  createDomControlBrowserVisualActor,
  createDomIslandBrowserVisualActor,
} from "./browserVisualActorAdapter";
import type { BrowserVisualActorCompatiblePreviousProof } from "./browserVisualActorProofTypes";

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
        proof: {
          actualInteraction: "inactive-visual-only",
          actualVisual: "exact-live-host",
          requiredInteraction: "inactive-visual-only",
          requiredVisual: "browser-visual",
        },
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

  it("publishes promoted snapshot DOM-control coverage from exact live hosts", () => {
    const control = domControl({
      snapshotSurfaceId: "snapshot-a",
      value: "hello",
      visualPolicy: "snapshot",
    });
    const actor = createDomControlBrowserVisualActor(control, {
      representationReadiness: {
        coverageState: "live-host-ready",
        resourceHandles: [{ id: control.sourceId, kind: "source" }],
      },
    });
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageState: "live-host-ready",
        representation: expect.objectContaining({
          hostId: expect.stringContaining(control.sourceId),
          kind: "passive-live-display",
        }),
        representationKind: "passive-live-display",
      }),
    );
    expect(fragment.exactCoverage[0]?.resourceHandles).toEqual([
      expect.objectContaining({
        id: control.sourceId,
        kind: "source",
      }),
    ]);
  });

  it("uses versioned snapshot resource handles when runtime readiness omits handles", () => {
    const control = domControl({
      snapshotSurfaceId: "snapshot-versioned",
      value: "hello",
      visualPolicy: "snapshot",
    });
    const actor = createDomControlBrowserVisualActor(control, {
      representationReadiness: {
        coverageState: "exact-snapshot-ready",
      },
    });
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(fragment.exactCoverage[0]?.resourceHandles).toEqual([
      expect.objectContaining({
        actorId: control.sourceId,
        contentGenerationId: control.snapshotCacheKeyRevision,
        id: "snapshot-versioned",
        kind: "texture",
        projectionGenerationId: expect.any(String),
        resourceGenerationId: expect.any(String),
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

  it("keeps pending overflow fallbacks on the snapshot repair path", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        sourceId: "source-live-overflow",
        value: "hello",
      }),
      {
        representationReadiness: {
          coverageState: "blocked-awaiting-snapshot",
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageState: "blocked-awaiting-snapshot",
        representation: expect.objectContaining({
          kind: "blocked",
          reason: "snapshot-pending",
        }),
        representationKind: "blocked",
      }),
    );
    expect(fragment.blockingSurfaceIds).toEqual([actor.surfaceId]);
    expect(fragment.exactCoverage).toEqual([]);
  });

  it("publishes compatible previous DOM-control coverage through shared compatible entries", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        value: "hello",
        visualPolicy: "blocked-awaiting-browser-visual",
      }),
      {
        compatiblePreviousProof: compatiblePreviousProof(),
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageState: "compatible-previous-ready",
        proof: {
          actualInteraction: "inactive-visual-only",
          actualVisual: "compatible-previous",
          requiredInteraction: "inactive-visual-only",
          requiredVisual: "browser-visual",
        },
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

  it("does not use compatible previous coverage for active DOM-control editors", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        active: true,
        value: "hello",
        visualPolicy: "blocked-awaiting-browser-visual",
      }),
      {
        compatiblePreviousProof: compatiblePreviousProof({
          focusState: "active",
        }),
        representationReadiness: {
          coverageState: "blocked-awaiting-live-host",
        },
      },
    );
    const fragment = createBrowserVisualSurfaceTransactionFragment([actor]);

    expect(actor).toEqual(
      expect.objectContaining({
        coverageRequired: { reason: "active-editor", required: true },
        coverageState: "blocked-awaiting-live-host",
        proof: {
          actualInteraction: "blocked",
          actualVisual: "blocked",
          requiredInteraction: "active-editor-live",
          requiredVisual: "browser-visual",
        },
        representationKind: "blocked",
      }),
    );
    expect(fragment.compatibleCoverage).toEqual([]);
    expect(fragment.blockingSurfaceIds).toEqual([actor.surfaceId]);
  });

  it("does not publish active DOM-control editors from snapshot readiness", () => {
    const actor = createDomControlBrowserVisualActor(
      domControl({
        active: true,
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

    expect(actor).toEqual(
      expect.objectContaining({
        coverageRequired: { reason: "active-editor", required: true },
        coverageState: "blocked-awaiting-live-host",
        representation: expect.objectContaining({
          kind: "blocked",
          reason: "live-dom-budget",
        }),
        representationKind: "blocked",
      }),
    );
    expect(fragment.exactCoverage).toEqual([]);
    expect(fragment.blockingSurfaceIds).toEqual([actor.surfaceId]);
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
    expect(island.proof).toEqual({
      actualInteraction: "live-hit-compatible",
      actualVisual: "exact-live-host",
      requiredInteraction: "live-hit-compatible",
      requiredVisual: "browser-visual",
    });
    expect(island.clipRect).toEqual(island.flowRect);
  });
});

const DEFAULT_TEXT_COVERAGE_STATE = {
  caret: "hidden",
  composition: "inactive",
  selection: "none",
} as const;

function compatiblePreviousProof(
  proof: Partial<BrowserVisualActorCompatiblePreviousProof> = {},
): BrowserVisualActorCompatiblePreviousProof {
  return {
    activationPolicy: "requires-current-visual",
    actorFamily: "text-like-dom-control",
    actorId: "source-a",
    budgetState: "within-budget",
    canonicalActorId:
      '{"actorFamily":"text-like-dom-control","ownerIdentity":"control-a","ownerSurfaceId":"surface-a","representationRole":"browser-text-control"}',
    clipChainRevision: "clip",
    controlKind: "input",
    displayRevision: "value-style",
    flowRect: { height: 24, width: 180, x: 4, y: 8 },
    focusState: "inactive",
    hitMappingCompatible: true,
    hitTargetId: "control-a",
    maxProofAgeFrames: 2,
    maxProofAgeMs: 120,
    previousActorGenerationId: "actor-generation-a",
    previousCommittedFrameId: 12,
    previousProjectionSampleRevision: "viewport-a",
    previousTransactionId: "transaction-a",
    previousVisualGenerationId: "visual-a",
    proofAgeFrames: 1,
    proofAgeMs: 32,
    protectedResourceIds: ["source:source-a"],
    reasonCode: "same-value-and-geometry",
    requestedActorGenerationId: "actor-generation-b",
    requestedProjectionSampleRevision: "viewport-b",
    requestedVisualGenerationId: "visual-b",
    resourceHandles: [{ id: "source-a", kind: "source" as const }],
    retainedScrollCompatible: true,
    retainedSurfaceId: "surface-a",
    semanticGenerationId: "semantic-a",
    ...proof,
  };
}

function domControl({
  active = false,
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
  readonly active?: boolean | undefined;
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
    active,
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
    visualSemantics: {
      accessibility: "visual-only-aria-hidden",
      focusable: false,
      pointer: "retained-activation-model",
      selectable: "none",
    },
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

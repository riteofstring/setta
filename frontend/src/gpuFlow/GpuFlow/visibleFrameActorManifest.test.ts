import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceActorGeneration,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createSectionStructureActors } from "../committedSurfaceSectionActors";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import {
  createGpuFlowVisibleFrameActorManifest,
  createGpuFlowVisibleFrameActorProofsForManifest,
} from "./visibleFrameActorManifest";
import { createGpuFlowContentFrameId } from "./visibleFrameTypes";

describe("GPU Flow visible frame actor manifest", () => {
  it("blocks missing section structure actors required by the retained scene", () => {
    const frame = committedSurfaceFrame({
      actorGenerations: [],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });

    expect(
      manifest.entries
        .filter((entry) => entry.source === "blocked-reason")
        .map(({ actorId, family, readinessProof }) => ({
          actorId,
          family,
          readinessProof,
        })),
    ).toEqual([
      {
        actorId: "settings:section-shell",
        family: "section-shell",
        readinessProof: "missing-section-structure-actor",
      },
      {
        actorId: "settings:section-header",
        family: "section-header",
        readinessProof: "missing-section-structure-actor",
      },
      {
        actorId: "settings:section-body-clip",
        family: "section-body-clip",
        readinessProof: "missing-section-structure-actor",
      },
    ]);
    expect(manifest.requiredActors).toEqual(
      expect.arrayContaining([
        { actorId: "settings:section-shell", family: "section-shell" },
        { actorId: "settings:section-header", family: "section-header" },
        { actorId: "settings:section-body-clip", family: "section-body-clip" },
      ]),
    );
  });

  it("uses committed section structure actors when they are present", () => {
    const runtimeFrame = retainedRuntimeFrame();
    const frame = committedSurfaceFrame({
      actorGenerations: createSectionStructureActors(runtimeFrame),
      retainedRuntimeFrame: runtimeFrame,
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });

    expect(
      manifest.entries.filter(
        (entry) =>
          entry.source === "blocked-reason" &&
          entry.readinessProof === "missing-section-structure-actor",
      ),
    ).toEqual([]);
    expect(
      manifest.entries
        .filter((entry) => entry.family.startsWith("section-"))
        .map(({ actorId, family, source }) => ({ actorId, family, source })),
    ).toEqual([
      {
        actorId: "settings:section-shell",
        family: "section-shell",
        source: "committed-actor",
      },
      {
        actorId: "settings:section-header",
        family: "section-header",
        source: "committed-actor",
      },
      {
        actorId: "settings:section-body-clip",
        family: "section-body-clip",
        source: "committed-actor",
      },
    ]);
  });

  it("treats passive live DOM budget misses as maintenance beside an active editor", () => {
    const activeEditor = textActor({
      active: true,
      actorId: "active-editor",
      generationId: "active-generation",
      projectionCoverage: "exact-live-dom",
    });
    const passiveBudgetMiss = textActor({
      active: false,
      actorId: "passive-live-dom",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-live-host",
      readinessReason: "live-dom-budget",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [activeEditor, passiveBudgetMiss],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });
    const proofs = createGpuFlowVisibleFrameActorProofsForManifest({
      contentFrameId: createGpuFlowContentFrameId("content-a"),
      frame,
      manifest,
      projectionSampleId: "projection-a",
    });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-live-dom")
        ?.requirement,
    ).toBe("maintenance");
    expect(manifest.requiredActors).toContainEqual({
      actorId: "active-editor",
      family: "active-editor",
    });
    expect(manifest.requiredActors).not.toContainEqual({
      actorId: "passive-live-dom",
      family: "browser-text-control",
    });
    expect(
      proofs.find((proof) => proof.actorId === "passive-live-dom"),
    ).toMatchObject({
      family: "browser-text-control",
      proof: "blocked",
      reason: "live-dom-budget",
      requirement: "maintenance",
    });
  });

  it("treats passive snapshot-pending actors as maintenance beside an active editor", () => {
    const activeEditor = textActor({
      active: true,
      actorId: "active-editor",
      generationId: "active-generation",
      projectionCoverage: "exact-live-dom",
    });
    const passiveSnapshotPending = textActor({
      active: false,
      actorId: "passive-snapshot",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [activeEditor, passiveSnapshotPending],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });
    const proofs = createGpuFlowVisibleFrameActorProofsForManifest({
      contentFrameId: createGpuFlowContentFrameId("content-a"),
      frame,
      manifest,
      projectionSampleId: "projection-a",
    });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-snapshot")
        ?.requirement,
    ).toBe("maintenance");
    expect(manifest.requiredActors).toContainEqual({
      actorId: "active-editor",
      family: "active-editor",
    });
    expect(manifest.requiredActors).not.toContainEqual({
      actorId: "passive-snapshot",
      family: "browser-text-snapshot",
    });
    expect(
      proofs.find((proof) => proof.actorId === "passive-snapshot"),
    ).toMatchObject({
      family: "browser-text-snapshot",
      proof: "blocked",
      reason: "snapshot-pending",
      requirement: "maintenance",
    });
  });

  it("treats passive snapshot-pending actors as maintenance after startup", () => {
    const passiveSnapshotPending = textActor({
      active: false,
      actorId: "passive-snapshot",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [passiveSnapshotPending],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });
    const proofs = createGpuFlowVisibleFrameActorProofsForManifest({
      contentFrameId: createGpuFlowContentFrameId("content-a"),
      frame,
      manifest,
      projectionSampleId: "projection-a",
    });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-snapshot")
        ?.requirement,
    ).toBe("maintenance");
    expect(manifest.requiredActors).not.toContainEqual({
      actorId: "passive-snapshot",
      family: "browser-text-snapshot",
    });
    expect(
      proofs.find((proof) => proof.actorId === "passive-snapshot"),
    ).toMatchObject({
      family: "browser-text-snapshot",
      proof: "blocked",
      reason: "snapshot-pending",
      requirement: "maintenance",
    });
  });

  it("keeps passive snapshot-pending actors required during startup", () => {
    const passiveSnapshotPending = textActor({
      active: false,
      actorId: "passive-snapshot",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [passiveSnapshotPending],
      retainedRuntimeFrame: retainedRuntimeFrame(),
      startup: true,
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-snapshot")
        ?.requirement,
    ).toBe("required");
    expect(manifest.requiredActors).toContainEqual({
      actorId: "passive-snapshot",
      family: "browser-text-snapshot",
    });
  });

  it("keeps fault-injected passive snapshot-pending actors required", () => {
    const passiveSnapshotPending = textActor({
      active: false,
      actorId: "passive-snapshot",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessFaultInjected: true,
      readinessReason: "snapshot-pending",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [passiveSnapshotPending],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-snapshot")
        ?.requirement,
    ).toBe("required");
    expect(manifest.requiredActors).toContainEqual({
      actorId: "passive-snapshot",
      family: "browser-text-snapshot",
    });
  });

  it("keeps fault-injected passive live DOM budget actors required", () => {
    const passiveBudgetMiss = textActor({
      active: false,
      actorId: "passive-live-dom",
      generationId: "passive-generation",
      projectionCoverage: "blocked-awaiting-live-host",
      readinessFaultInjected: true,
      readinessReason: "live-dom-budget",
    });
    const frame = committedSurfaceFrame({
      actorGenerations: [passiveBudgetMiss],
      retainedRuntimeFrame: retainedRuntimeFrame(),
    });

    const manifest = createGpuFlowVisibleFrameActorManifest({ frame });

    expect(
      manifest.entries.find((entry) => entry.actorId === "passive-live-dom")
        ?.requirement,
    ).toBe("required");
    expect(manifest.requiredActors).toContainEqual({
      actorId: "passive-live-dom",
      family: "browser-text-control",
    });
  });
});

function textActor({
  active,
  actorId,
  generationId,
  projectionCoverage,
  readinessFaultInjected = false,
  readinessReason,
}: {
  readonly active: boolean;
  readonly actorId: string;
  readonly generationId: string;
  readonly projectionCoverage:
    | "blocked-awaiting-browser-visual"
    | "blocked-awaiting-live-host"
    | "exact-live-dom";
  readonly readinessFaultInjected?: boolean | undefined;
  readonly readinessReason?: "live-dom-budget" | "snapshot-pending" | undefined;
}): GpuFlowCommittedSurfaceActorGeneration {
  const representationKind =
    projectionCoverage === "blocked-awaiting-browser-visual"
      ? "passive-snapshot"
      : active
        ? "active-editor"
        : "live-dom";
  return {
    active,
    actorFamily: "text-like-dom-control",
    actorId,
    browserVisual: {
      coverageRequired: {
        reason: active ? "active-editor" : "visible",
        required: true,
      },
      ...(readinessFaultInjected ? { readinessFaultInjected: true } : {}),
      representationKind,
      resourceHandles: [],
    },
    clipChainRevision: "clip",
    clipRect: rect(0, 0, 20, 10),
    contentGenerationId: `${generationId}:content`,
    flowRect: rect(0, 0, 20, 10),
    generationId,
    kind: "dom-control",
    layoutProjectionGenerationId: `${generationId}:projection`,
    mountReadiness:
      projectionCoverage === "exact-live-dom" ? "ready" : "blocked",
    readinessGenerationId: `${generationId}:readiness`,
    sourceRect: rect(0, 0, 20, 10),
    textCoverageProof:
      projectionCoverage === "exact-live-dom"
        ? { projectionCoverage }
        : { projectionCoverage, readinessReason },
    visibleNonempty: true,
    zOrder: 1,
  } as unknown as GpuFlowCommittedSurfaceActorGeneration;
}

function committedSurfaceFrame({
  actorGenerations,
  retainedRuntimeFrame,
  startup = false,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly startup?: boolean | undefined;
}): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 77;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      actorGenerations,
      coherence,
      displayFrameId,
      surfaceTransaction: null,
    }),
    retainedDisplayFrame: startup ? null : {},
    retainedRuntimeFrame,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function retainedRuntimeFrame(): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      renderedSceneNodeIds: ["settings"],
      sceneSections: [
        {
          bodyRect: rect(0, 32, 200, 88),
          childLayout: { gap: { x: 0, y: 0 } },
          childSectionIds: [],
          childViewportRect: null,
          chromeRect: rect(0, 0, 200, 120),
          clipRect: rect(0, 0, 200, 120),
          contentRenderer: { kind: "canvas-content", surfaceId: "settings" },
          dirty: [],
          height: 120,
          id: "settings",
          interactionLayer: "content",
          layoutMode: "none",
          localRect: rect(0, 0, 200, 120),
          parentSectionId: null,
          portAnchors: [],
          resizePolicy: {
            aspectRatio: false,
            aspectRatioExtraHeight: 0,
            aspectRatioExtraWidth: 0,
            directions: [],
            locked: false,
            maxHeight: 1000,
            maxWidth: 1000,
            minHeight: 1,
            minWidth: 1,
          },
          scrollOffset: { x: 0, y: 0 },
          sectionId: "settings",
          textureContentKey: "settings-shell",
          width: 200,
          worldRect: rect(0, 0, 200, 120),
          x: 0,
          y: 0,
        },
      ],
      sourceSurfaces: [{ ownerSectionId: "settings" }],
    },
    input: {
      sceneRevision: 12,
      viewport: [0, 0, 1],
      viewportSize: { height: 200, width: 300 },
    },
  } as unknown as GpuRetainedRuntimeFrame;
}

function rect(x: number, y: number, width: number, height: number) {
  return { height, width, x, y };
}

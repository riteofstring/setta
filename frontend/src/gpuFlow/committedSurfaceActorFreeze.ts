import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceActorGenerationInput,
  GpuFlowCommittedSurfaceBrowserVisualContract,
} from "./committedSurfaceFrame";
import {
  createGpuFlowCanonicalActorId,
  createGpuFlowCommittedSurfaceActorGenerationClassification,
  getGpuFlowCommittedSurfaceActorRepresentationRole,
} from "./committedSurfaceActorIdentity";
import type { GpuRect } from "./viewportMath";

export function freezeActor(
  actor: GpuFlowCommittedSurfaceActorGenerationInput,
): GpuFlowCommittedSurfaceActorGeneration {
  const actorFamily = actor.actorFamily ?? actor.kind;
  const representationRole = getGpuFlowCommittedSurfaceActorRepresentationRole({
    actorFamily,
    kind: actor.kind,
  });
  const semanticGenerationId =
    actor.semanticGenerationId ?? actor.contentGenerationId;
  const visualGenerationId = actor.visualGenerationId ?? actor.generationId;
  return Object.freeze({
    ...actor,
    accessibilityProjection: actor.accessibilityProjection ?? "none",
    activationPolicy: actor.activationPolicy ?? "none",
    actorFamily,
    browserVisual: freezeOptionalBrowserVisualContract(actor.browserVisual),
    canonicalActorId: createGpuFlowCanonicalActorId({
      actorFamily,
      actorId: actor.actorId,
      controlId: actor.controlId,
      islandId: actor.islandId,
      ownerSurfaceId: actor.ownerSurfaceId,
      representationRole,
      rowId: actor.rowId,
    }),
    clipRect: freezeRect(actor.clipRect),
    flowRect: freezeRect(actor.flowRect),
    generationClassification:
      createGpuFlowCommittedSurfaceActorGenerationClassification({
        browserVisualRepresentationKind:
          actor.browserVisual?.representationKind ?? null,
        contentGenerationId: actor.contentGenerationId,
        layoutProjectionGenerationId: actor.layoutProjectionGenerationId,
        readinessGenerationId: actor.readinessGenerationId,
        representationRole,
        semanticGenerationId,
        visualGenerationId,
      }),
    retainedScrollOffset: freezeOptionalRetainedScrollOffset(
      actor.retainedScrollOffset,
    ),
    semanticGenerationId,
    sourceRect: freezeRect(actor.sourceRect),
    textCoverageProof: freezeOptionalTextCoverageProof(actor.textCoverageProof),
    textSnapshotCacheKeyRevision: actor.textSnapshotCacheKeyRevision ?? null,
    visualGenerationId,
  });
}

function freezeOptionalBrowserVisualContract(
  contract: GpuFlowCommittedSurfaceActorGenerationInput["browserVisual"],
): GpuFlowCommittedSurfaceBrowserVisualContract | null {
  return contract ? freezeBrowserVisualContract(contract) : null;
}

function freezeOptionalRetainedScrollOffset(
  retainedScrollOffset: GpuFlowCommittedSurfaceActorGenerationInput["retainedScrollOffset"],
): GpuFlowCommittedSurfaceActorGeneration["retainedScrollOffset"] {
  return retainedScrollOffset
    ? Object.freeze({ ...retainedScrollOffset })
    : null;
}

function freezeOptionalTextCoverageProof(
  textCoverageProof: GpuFlowCommittedSurfaceActorGenerationInput["textCoverageProof"],
): GpuFlowCommittedSurfaceActorGeneration["textCoverageProof"] {
  if (!textCoverageProof) {
    return null;
  }
  if (textCoverageProof.projectionCoverage !== "compatible-previous") {
    return Object.freeze({ ...textCoverageProof });
  }
  const compatiblePreviousProof = textCoverageProof.compatiblePreviousProof;
  return Object.freeze({
    ...textCoverageProof,
    compatiblePreviousProof: Object.freeze({
      ...compatiblePreviousProof,
      flowRect: freezeRect(compatiblePreviousProof.flowRect),
      resourceHandles: Object.freeze(
        compatiblePreviousProof.resourceHandles.map((handle) =>
          Object.freeze({ ...handle }),
        ),
      ),
      protectedResourceIds: Object.freeze([
        ...compatiblePreviousProof.protectedResourceIds,
      ]),
    }),
  });
}

function freezeBrowserVisualContract(
  contract: GpuFlowCommittedSurfaceBrowserVisualContract,
): GpuFlowCommittedSurfaceBrowserVisualContract {
  return Object.freeze({
    ...contract,
    coverageExemption: contract.coverageExemption
      ? Object.freeze({ ...contract.coverageExemption })
      : null,
    coverageRequired: Object.freeze({ ...contract.coverageRequired }),
    resourceHandles: Object.freeze(
      contract.resourceHandles.map((handle) => Object.freeze({ ...handle })),
    ),
  });
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

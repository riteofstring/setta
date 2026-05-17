import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceActorGenerationInput,
  GpuFlowCommittedSurfaceBrowserVisualContract,
} from "./committedSurfaceFrame";
import type { GpuRect } from "./viewportMath";

export function freezeActor(
  actor: GpuFlowCommittedSurfaceActorGenerationInput,
): GpuFlowCommittedSurfaceActorGeneration {
  const semanticGenerationId =
    actor.semanticGenerationId ?? actor.contentGenerationId;
  const visualGenerationId = actor.visualGenerationId ?? actor.generationId;
  return Object.freeze({
    ...actor,
    accessibilityProjection: actor.accessibilityProjection ?? "none",
    activationPolicy: actor.activationPolicy ?? "none",
    actorFamily: actor.actorFamily ?? actor.kind,
    browserVisual: freezeOptionalBrowserVisualContract(actor.browserVisual),
    clipRect: freezeRect(actor.clipRect),
    flowRect: freezeRect(actor.flowRect),
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
  return textCoverageProof ? Object.freeze({ ...textCoverageProof }) : null;
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

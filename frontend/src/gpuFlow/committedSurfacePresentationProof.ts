import {
  assertGpuFlowBrowserVisualSurfaceFragment,
} from "./committedSurfaceBrowserVisualFragment";
import {
  assertGpuFlowCommittedSurfaceCompleteness,
  createGpuFlowCommittedSurfaceCompleteness,
} from "./committedSurfaceCompleteness";
import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import {
  assertGpuFlowContentFramePublishability,
  assertGpuFlowProjectionHorizon,
  createGpuFlowContentFramePublishability,
  createGpuFlowProjectionHorizon,
} from "./committedSurfaceFrameProjection";
import { createGpuFlowJsonDigest } from "./gpuFlowDigest";
import type { SurfaceResourceHandle } from "./surfaceCompositor/surfaceCoverage";
import type { SurfaceDisplayTransaction } from "./surfaceCompositor/surfaceTransaction";
import type { BrowserVisualSurfaceTransactionFragment } from "./surfaceCompositor/browserVisualActorAdapter";

export type GpuFlowCommittedSurfaceCoherence = {
  readonly canvasRetainedFrameId: number;
  readonly clipChainRevision: string;
  readonly debugSnapshotFrameId: number;
  readonly domControlCommittedFrameId: number;
  readonly domIslandCommittedFrameId: number;
  readonly gpuNativeVisualCommittedFrameId: number;
  readonly hitGenerationId: string;
  readonly htmlTextureOverlayCommittedFrameId: number;
  readonly retainedScrollRevision: number;
};

export type GpuFlowCommittedSurfacePresentationProof = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGeneration: {
    readonly canvasRetainedFrameId: number;
    readonly debugSnapshotFrameId: number;
    readonly exposable: true;
    readonly gpuNativeVisualCommittedFrameId: number;
    readonly htmlTextureOverlayCommittedFrameId: number;
    readonly prepared: true;
    readonly presentationBatchId: string;
  };
  readonly domGenerationEvidence: GpuFlowCommittedSurfaceDomPresentationEvidence;
  readonly domGeneration: {
    readonly browserVisualCommittedFrameId: number;
    readonly domControlCommittedFrameId: number;
    readonly domIslandCommittedFrameId: number;
    readonly exposable: true;
    readonly presentationBatchId: string;
    readonly staged: true;
  };
  readonly surfaceTransactionDigest: string | null;
};

export type GpuFlowCommittedSurfaceDomPresentationEvidence = {
  readonly browserVisualCandidateId: string;
  readonly committedFrameId: number;
  readonly domControlMountedCount: number;
  readonly domControlSnapshotCount: number;
  readonly domIslandCount: number;
  readonly exposable: boolean;
  readonly runtimeFrameId: number;
  readonly source: "browser-visual-runtime-candidate" | "startup";
  readonly staged: boolean;
};

type GpuFlowCommittedSurfacePresentationProofValidationCache = {
  readonly actorGenerations: GpuFlowCommittedSurfaceFrame["actorGenerations"];
  readonly browserVisualSurfaceFragment: GpuFlowCommittedSurfaceFrame["browserVisualSurfaceFragment"];
  readonly coherence: GpuFlowCommittedSurfaceFrame["coherence"];
  readonly displayFrameId: GpuFlowCommittedSurfaceFrame["displayFrameId"];
  readonly presentationProof: GpuFlowCommittedSurfacePresentationProof;
  readonly surfaceTransaction: GpuFlowCommittedSurfaceFrame["surfaceTransaction"];
};

const actorManifestDigestCache = new WeakMap<
  readonly GpuFlowCommittedSurfaceActorGeneration[],
  string
>();
const browserVisualFragmentDigestCache = new WeakMap<
  BrowserVisualSurfaceTransactionFragment,
  string
>();
const surfaceTransactionDigestCache = new WeakMap<
  SurfaceDisplayTransaction,
  string
>();
const presentationProofValidationCache = new WeakMap<
  GpuFlowCommittedSurfaceFrame,
  GpuFlowCommittedSurfacePresentationProofValidationCache
>();

export function assertGpuFlowCommittedSurfaceFrameCoherent(
  frame: GpuFlowCommittedSurfaceFrame,
): void {
  assertGpuFlowCommittedSurfaceFamilyFrameIds(frame);
  assertGpuFlowCommittedSurfacePresentationProof(frame);
  assertGpuFlowCommittedSurfaceRetainedScrollRevision(frame);
  const expectedCompleteness = createGpuFlowCommittedSurfaceCompleteness({
    actorGenerations: frame.actorGenerations,
    startup: frame.retainedDisplayFrame === null,
  });
  assertGpuFlowCommittedSurfaceCompleteness(
    frame.displayCompleteness,
    expectedCompleteness,
  );
  assertGpuFlowBrowserVisualSurfaceFragment({
    actorGenerations: frame.actorGenerations,
    browserVisualSurfaceFragment: frame.browserVisualSurfaceFragment,
  });
  assertGpuFlowContentFramePublishability(
    frame.publishability,
    createGpuFlowContentFramePublishability({
      actorGenerations: frame.actorGenerations,
      displayCompleteness: expectedCompleteness,
      startup: frame.retainedDisplayFrame === null,
      transactionOutcome: frame.diagnostics.transactionOutcome,
    }),
  );
  assertGpuFlowProjectionHorizon(
    frame.projectionHorizon,
    createGpuFlowProjectionHorizon({
      actorGenerations: frame.actorGenerations,
      displayFrameId: frame.displayFrameId,
    }),
  );
}

export function createGpuFlowCommittedSurfacePresentationProof({
  actorGenerations = [],
  browserVisualSurfaceFragment = null,
  coherence,
  displayFrameId,
  domGenerationEvidence = createGpuFlowStartupDomPresentationEvidence({
    displayFrameId,
  }),
  surfaceTransaction = null,
}: {
  readonly actorGenerations?:
    | readonly GpuFlowCommittedSurfaceActorGeneration[]
    | undefined;
  readonly browserVisualSurfaceFragment?:
    | BrowserVisualSurfaceTransactionFragment
    | null
    | undefined;
  readonly coherence: GpuFlowCommittedSurfaceCoherence;
  readonly displayFrameId: number;
  readonly domGenerationEvidence?:
    | GpuFlowCommittedSurfaceDomPresentationEvidence
    | undefined;
  readonly surfaceTransaction?: SurfaceDisplayTransaction | null | undefined;
}): GpuFlowCommittedSurfacePresentationProof {
  assertGpuFlowDomPresentationEvidenceFrame({
    displayFrameId,
    evidence: domGenerationEvidence,
  });
  const batchId = createGpuFlowCommittedSurfacePresentationBatchId({
    coherence,
    domGenerationEvidence,
    displayFrameId,
  });
  return Object.freeze({
    actorManifestDigest: createGpuFlowCommittedSurfaceActorManifestDigest(
      actorGenerations,
    ),
    batchId,
    browserVisualFragmentDigest:
      browserVisualSurfaceFragment === null
        ? null
        : createGpuFlowCommittedSurfacePresentationBrowserVisualFragmentDigest(
            browserVisualSurfaceFragment,
          ),
    canvasGeneration: Object.freeze({
      canvasRetainedFrameId: coherence.canvasRetainedFrameId,
      debugSnapshotFrameId: coherence.debugSnapshotFrameId,
      exposable: true as const,
      gpuNativeVisualCommittedFrameId:
        coherence.gpuNativeVisualCommittedFrameId,
      htmlTextureOverlayCommittedFrameId:
        coherence.htmlTextureOverlayCommittedFrameId,
      prepared: true as const,
      presentationBatchId: batchId,
    }),
    domGenerationEvidence: Object.freeze({ ...domGenerationEvidence }),
    domGeneration: Object.freeze({
      browserVisualCommittedFrameId: displayFrameId,
      domControlCommittedFrameId: coherence.domControlCommittedFrameId,
      domIslandCommittedFrameId: coherence.domIslandCommittedFrameId,
      exposable: true as const,
      presentationBatchId: batchId,
      staged: true as const,
    }),
    surfaceTransactionDigest:
      surfaceTransaction === null
        ? null
        : createGpuFlowCommittedSurfacePresentationSurfaceTransactionDigest(
            surfaceTransaction,
          ),
  });
}

export function assertGpuFlowCommittedSurfacePresentationProof(
  frame: GpuFlowCommittedSurfaceFrame,
): void {
  if (hasCachedGpuFlowCommittedSurfacePresentationProofValidation(frame)) {
    return;
  }
  const proof = frame.presentationProof;
  assertGpuFlowPresentationProofExists(proof);
  assertGpuFlowDomPresentationGeneration(proof);
  assertGpuFlowDomPresentationEvidence(proof);
  assertGpuFlowCanvasPresentationGeneration(proof);
  assertGpuFlowPresentedFrameIds({ frame, proof });
  const expected = createGpuFlowCommittedSurfacePresentationProof({
    actorGenerations: frame.actorGenerations,
    browserVisualSurfaceFragment: frame.browserVisualSurfaceFragment,
    coherence: frame.coherence,
    displayFrameId: frame.displayFrameId,
    domGenerationEvidence: frame.presentationProof.domGenerationEvidence,
    surfaceTransaction: frame.surfaceTransaction,
  });
  assertGpuFlowPresentationBatch({ expected, proof });
  assertGpuFlowPresentationGenerations({ expected, proof });
  assertGpuFlowPresentationDigests({ expected, proof });
  presentationProofValidationCache.set(frame, {
    actorGenerations: frame.actorGenerations,
    browserVisualSurfaceFragment: frame.browserVisualSurfaceFragment,
    coherence: frame.coherence,
    displayFrameId: frame.displayFrameId,
    presentationProof: proof,
    surfaceTransaction: frame.surfaceTransaction,
  });
}

export function createGpuFlowCommittedSurfaceDomPresentationEvidence({
  browserVisualCandidateId,
  committedFrameId,
  domControlMountedCount,
  domControlSnapshotCount,
  domIslandCount,
  exposable,
  runtimeFrameId,
  source,
  staged,
}: GpuFlowCommittedSurfaceDomPresentationEvidence): GpuFlowCommittedSurfaceDomPresentationEvidence {
  return Object.freeze({
    browserVisualCandidateId,
    committedFrameId,
    domControlMountedCount,
    domControlSnapshotCount,
    domIslandCount,
    exposable,
    runtimeFrameId,
    source,
    staged,
  });
}

export function createGpuFlowCommittedSurfaceActorManifestDigest(
  actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[],
): string {
  const cached = actorManifestDigestCache.get(actorGenerations);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest(
    "committed-surface-actor-manifest",
    actorGenerations.map((actor) => ({
      accessibilityProjection: actor.accessibilityProjection,
      activationPolicy: actor.activationPolicy,
      active: actor.active,
      actorFamily: actor.actorFamily,
      actorId: actor.actorId,
      browserVisual:
        actor.browserVisual === null
          ? null
          : {
              coverageExemption: actor.browserVisual.coverageExemption,
              coverageRequired: actor.browserVisual.coverageRequired,
              coverageState: actor.browserVisual.coverageState,
              nonemptyReason: actor.browserVisual.nonemptyReason,
              proof: actor.browserVisual.proof,
              representationKind: actor.browserVisual.representationKind,
              resourceHandles: actor.browserVisual.resourceHandles.map(
                createGpuFlowCommittedSurfaceResourceHandleDigest,
              ),
              visibilityReason: actor.browserVisual.visibilityReason,
            },
      canonicalActorId: actor.canonicalActorId,
      clipChainRevision: actor.clipChainRevision,
      clipRect: actor.clipRect,
      contentGenerationId: actor.contentGenerationId,
      controlId: actor.controlId,
      focusIdentity: actor.focusIdentity,
      flowRect: actor.flowRect,
      generationClassification: actor.generationClassification,
      generationId: actor.generationId,
      islandId: actor.islandId,
      kind: actor.kind,
      layoutProjectionGenerationId: actor.layoutProjectionGenerationId,
      liveMotionSampleId: actor.liveMotionSampleId,
      mountReadiness: actor.mountReadiness,
      ownerSurfaceId: actor.ownerSurfaceId,
      pointerEvents: actor.pointerEvents,
      projectionReadiness: actor.projectionReadiness,
      readinessGenerationId: actor.readinessGenerationId,
      retainedScrollOffset: actor.retainedScrollOffset,
      retainedScrollRevision: actor.retainedScrollRevision,
      rowId: actor.rowId,
      semanticGenerationId: actor.semanticGenerationId,
      sourceRect: actor.sourceRect,
      textCoverageProof: actor.textCoverageProof,
      textSnapshotCacheKeyRevision: actor.textSnapshotCacheKeyRevision,
      valueStyleRevision: actor.valueStyleRevision,
      visibleNonempty: actor.visibleNonempty,
      visualGenerationId: actor.visualGenerationId,
      wheelPolicy: actor.wheelPolicy,
      zOrder: actor.zOrder,
    })),
  );
  actorManifestDigestCache.set(actorGenerations, digest);
  return digest;
}

function hasCachedGpuFlowCommittedSurfacePresentationProofValidation(
  frame: GpuFlowCommittedSurfaceFrame,
): boolean {
  const cached = presentationProofValidationCache.get(frame);
  return Boolean(
    cached &&
      cached.actorGenerations === frame.actorGenerations &&
      cached.browserVisualSurfaceFragment ===
        frame.browserVisualSurfaceFragment &&
      cached.coherence === frame.coherence &&
      cached.displayFrameId === frame.displayFrameId &&
      cached.presentationProof === frame.presentationProof &&
      cached.surfaceTransaction === frame.surfaceTransaction,
  );
}

function assertGpuFlowCommittedSurfaceFamilyFrameIds(
  frame: GpuFlowCommittedSurfaceFrame,
): void {
  const committedFrameIds = [
    frame.coherence.canvasRetainedFrameId,
    frame.coherence.debugSnapshotFrameId,
    frame.coherence.domControlCommittedFrameId,
    frame.coherence.domIslandCommittedFrameId,
    frame.coherence.gpuNativeVisualCommittedFrameId,
    frame.coherence.htmlTextureOverlayCommittedFrameId,
  ];
  if (committedFrameIds.some((frameId) => frameId !== frame.displayFrameId)) {
    throw new Error(
      "GPU Flow committed surface frame has incoherent visible frame ids.",
    );
  }
}

function assertGpuFlowCommittedSurfaceRetainedScrollRevision(
  frame: GpuFlowCommittedSurfaceFrame,
): void {
  if (
    frame.coherence.retainedScrollRevision !==
    frame.retainedRuntimeFrame.input.scrollRevision
  ) {
    throw new Error(
      "GPU Flow committed surface frame has an incoherent retained scroll revision.",
    );
  }
}

function assertGpuFlowPresentationProofExists(
  proof: GpuFlowCommittedSurfacePresentationProof | null | undefined,
): asserts proof is GpuFlowCommittedSurfacePresentationProof {
  if (!proof) {
    throw new Error(
      "GPU Flow committed surface frame requires a DOM/canvas presentation proof.",
    );
  }
}

function assertGpuFlowDomPresentationGeneration(
  proof: GpuFlowCommittedSurfacePresentationProof,
): void {
  if (
    proof.domGeneration.staged !== true ||
    proof.domGeneration.exposable !== true
  ) {
    throw new Error(
      "GPU Flow committed surface presentation proof requires DOM generation staged and exposable.",
    );
  }
}

function assertGpuFlowDomPresentationEvidence(
  proof: GpuFlowCommittedSurfacePresentationProof,
): void {
  const evidence = proof.domGenerationEvidence;
  if (!evidence) {
    throw new Error(
      "GPU Flow committed surface presentation proof requires DOM runtime presentation evidence.",
    );
  }
  assertGpuFlowDomPresentationEvidenceFrame({
    displayFrameId: proof.domGeneration.browserVisualCommittedFrameId,
    evidence,
  });
}

function assertGpuFlowDomPresentationEvidenceFrame({
  displayFrameId,
  evidence,
}: {
  readonly displayFrameId: number;
  readonly evidence: GpuFlowCommittedSurfaceDomPresentationEvidence;
}): void {
  if (evidence.committedFrameId !== displayFrameId) {
    throw new Error(
      "GPU Flow committed surface DOM presentation evidence requires the same committed frame id.",
    );
  }
}

function assertGpuFlowCanvasPresentationGeneration(
  proof: GpuFlowCommittedSurfacePresentationProof,
): void {
  if (
    proof.canvasGeneration.prepared !== true ||
    proof.canvasGeneration.exposable !== true
  ) {
    throw new Error(
      "GPU Flow committed surface presentation proof requires canvas generation prepared and exposable.",
    );
  }
}

function assertGpuFlowPresentedFrameIds({
  frame,
  proof,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly proof: GpuFlowCommittedSurfacePresentationProof;
}): void {
  const presentedFrameIds = [
    proof.domGeneration.browserVisualCommittedFrameId,
    proof.domGeneration.domControlCommittedFrameId,
    proof.domGeneration.domIslandCommittedFrameId,
    proof.canvasGeneration.canvasRetainedFrameId,
    proof.canvasGeneration.debugSnapshotFrameId,
    proof.canvasGeneration.gpuNativeVisualCommittedFrameId,
    proof.canvasGeneration.htmlTextureOverlayCommittedFrameId,
  ];
  if (presentedFrameIds.some((frameId) => frameId !== frame.displayFrameId)) {
    throw new Error(
      "GPU Flow committed surface presentation proof requires DOM and canvas generations for the same committed frame.",
    );
  }
}

function assertGpuFlowPresentationBatch({
  expected,
  proof,
}: {
  readonly expected: GpuFlowCommittedSurfacePresentationProof;
  readonly proof: GpuFlowCommittedSurfacePresentationProof;
}): void {
  if (
    proof.batchId !== proof.domGeneration.presentationBatchId ||
    proof.batchId !== proof.canvasGeneration.presentationBatchId ||
    proof.batchId !== expected.batchId
  ) {
    throw new Error(
      "GPU Flow committed surface presentation proof requires DOM and canvas generations in the same presentation batch.",
    );
  }
}

function assertGpuFlowPresentationGenerations({
  expected,
  proof,
}: {
  readonly expected: GpuFlowCommittedSurfacePresentationProof;
  readonly proof: GpuFlowCommittedSurfacePresentationProof;
}): void {
  const actualGenerationIds = createGpuFlowPresentationGenerationIds(proof);
  const expectedGenerationIds = createGpuFlowPresentationGenerationIds(expected);
  if (
    actualGenerationIds.some(
      (frameId, index) => frameId !== expectedGenerationIds[index],
    )
  ) {
    throw new Error(
      "GPU Flow committed surface presentation proof does not match the committed frame generations.",
    );
  }
}

function assertGpuFlowPresentationDigests({
  expected,
  proof,
}: {
  readonly expected: GpuFlowCommittedSurfacePresentationProof;
  readonly proof: GpuFlowCommittedSurfacePresentationProof;
}): void {
  if (
    proof.actorManifestDigest !== expected.actorManifestDigest ||
    proof.browserVisualFragmentDigest !==
      expected.browserVisualFragmentDigest ||
    !areGpuFlowDomPresentationEvidenceEqual(
      proof.domGenerationEvidence,
      expected.domGenerationEvidence,
    ) ||
    proof.surfaceTransactionDigest !== expected.surfaceTransactionDigest
  ) {
    throw new Error(
      "GPU Flow committed surface presentation proof does not match the committed actor manifest and browser visual resources.",
    );
  }
}

function areGpuFlowDomPresentationEvidenceEqual(
  left: GpuFlowCommittedSurfaceDomPresentationEvidence,
  right: GpuFlowCommittedSurfaceDomPresentationEvidence,
): boolean {
  return (
    left.browserVisualCandidateId === right.browserVisualCandidateId &&
    left.committedFrameId === right.committedFrameId &&
    left.domControlMountedCount === right.domControlMountedCount &&
    left.domControlSnapshotCount === right.domControlSnapshotCount &&
    left.domIslandCount === right.domIslandCount &&
    left.exposable === right.exposable &&
    left.runtimeFrameId === right.runtimeFrameId &&
    left.source === right.source &&
    left.staged === right.staged
  );
}

function createGpuFlowPresentationGenerationIds(
  proof: GpuFlowCommittedSurfacePresentationProof,
): readonly number[] {
  return [
    proof.domGeneration.browserVisualCommittedFrameId,
    proof.domGeneration.domControlCommittedFrameId,
    proof.domGeneration.domIslandCommittedFrameId,
    proof.canvasGeneration.canvasRetainedFrameId,
    proof.canvasGeneration.debugSnapshotFrameId,
    proof.canvasGeneration.gpuNativeVisualCommittedFrameId,
    proof.canvasGeneration.htmlTextureOverlayCommittedFrameId,
  ];
}

function createGpuFlowCommittedSurfaceResourceHandleDigest(
  handle: SurfaceResourceHandle,
): readonly [
  SurfaceResourceHandle["kind"],
  string,
  string | null,
  string | null,
  string | null,
  string | null,
] {
  return [
    handle.kind,
    handle.id,
    handle.actorId ?? null,
    handle.contentGenerationId ?? null,
    handle.projectionGenerationId ?? null,
    handle.resourceGenerationId ?? null,
  ];
}

function createGpuFlowCommittedSurfacePresentationBrowserVisualFragmentDigest(
  fragment: BrowserVisualSurfaceTransactionFragment,
): string {
  const cached = browserVisualFragmentDigestCache.get(fragment);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest("committed-surface-browser-visual", {
    activeIslandIds: fragment.activeIslands.map((island) => island.islandId),
    actorGenerations: fragment.actorSnapshots.map(
      (snapshot) => snapshot.generation.generationId,
    ),
    blockingGenerationIds: fragment.blockingGenerationIds,
    blockingSurfaceIds: fragment.blockingSurfaceIds,
    compatibleCoverage: fragment.compatibleCoverage.map((entry) => [
      entry.surfaceId,
      entry.generationId,
    ]),
    exactCoverage: fragment.exactCoverage.map((entry) => [
      entry.surfaceId,
      entry.generationId,
    ]),
    protectedResourceHandles: fragment.protectedResourceHandles.map(
      (handle) => [handle.kind, handle.id, handle.reason],
    ),
    rendererBucketCount: fragment.rendererBuckets.length,
    trueHoleRectCount: fragment.trueHoleRects.length,
    visibleRectCount: fragment.visibleRects.length,
    zOrderCount: fragment.zOrder.length,
  });
  browserVisualFragmentDigestCache.set(fragment, digest);
  return digest;
}

function createGpuFlowCommittedSurfacePresentationSurfaceTransactionDigest(
  transaction: SurfaceDisplayTransaction,
): string {
  const cached = surfaceTransactionDigestCache.get(transaction);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest(
    "committed-surface-transaction",
    {
      desiredSurfaceGenerationCount:
        transaction.desiredSurfaceGenerations.length,
      drawCommandCount: transaction.drawCommands.length,
      hitGenerationCount: transaction.hitIndex.generationIds.length,
      hitIndexId: transaction.hitIndex.id,
      id: transaction.id,
      protectedResourceHandles: transaction.protectedResourceHandles.map(
        (handle) => [handle.kind, handle.id, handle.reason],
      ),
      rendererBucketCount: transaction.rendererBuckets.length,
      zOrderCount: transaction.zOrder.length,
    },
  );
  surfaceTransactionDigestCache.set(transaction, digest);
  return digest;
}

function createGpuFlowCommittedSurfacePresentationBatchId({
  coherence,
  domGenerationEvidence,
  displayFrameId,
}: {
  readonly coherence: GpuFlowCommittedSurfaceCoherence;
  readonly domGenerationEvidence: GpuFlowCommittedSurfaceDomPresentationEvidence;
  readonly displayFrameId: number;
}): string {
  return [
    "presentation",
    displayFrameId,
    coherence.canvasRetainedFrameId,
    coherence.domControlCommittedFrameId,
    coherence.domIslandCommittedFrameId,
    coherence.gpuNativeVisualCommittedFrameId,
    coherence.htmlTextureOverlayCommittedFrameId,
    coherence.debugSnapshotFrameId,
    coherence.clipChainRevision,
    coherence.retainedScrollRevision,
    domGenerationEvidence.browserVisualCandidateId,
    domGenerationEvidence.runtimeFrameId,
    domGenerationEvidence.staged ? "dom-staged" : "dom-not-staged",
    domGenerationEvidence.exposable ? "dom-exposable" : "dom-blocked",
  ].join(":");
}

function createGpuFlowStartupDomPresentationEvidence({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowCommittedSurfaceDomPresentationEvidence {
  return createGpuFlowCommittedSurfaceDomPresentationEvidence({
    browserVisualCandidateId: `startup-browser-visual:${displayFrameId}`,
    committedFrameId: displayFrameId,
    domControlMountedCount: 0,
    domControlSnapshotCount: 0,
    domIslandCount: 0,
    exposable: true,
    runtimeFrameId: displayFrameId,
    source: "startup",
    staged: true,
  });
}

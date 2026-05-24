import { createGpuFlowJsonDigest } from "./gpuFlowDigest";
import { assertGpuFlowBrowserVisualSurfaceFragment } from "./preparedContentBrowserVisualFragment";
import {
  assertGpuFlowPreparedContentCompleteness,
  createGpuFlowPreparedContentCompleteness,
} from "./preparedContentCompleteness";
import type {
  GpuFlowPreparedContentActorGeneration,
  GpuFlowPreparedContentFrame,
} from "./preparedContentFrame";
import {
  assertGpuFlowContentFramePublishability,
  assertGpuFlowProjectionHorizon,
  createGpuFlowContentFramePublishability,
  createGpuFlowPreparedContentRetainedTrueHoleActorIds,
  createGpuFlowProjectionHorizon,
} from "./preparedContentFrameProjection";
import type { BrowserVisualSurfaceTransactionFragment } from "./surfaceCompositor/browserVisualActorAdapter";
import type { SurfaceResourceHandle } from "./surfaceCompositor/surfaceCoverage";
import type { SurfaceDisplayTransaction } from "./surfaceCompositor/surfaceTransaction";

export type GpuFlowPreparedContentCoherence = {
  readonly canvasRetainedFrameId: number;
  readonly clipChainRevision: string;
  readonly debugSnapshotFrameId: number;
  readonly domControlPreparedFrameId: number;
  readonly domIslandPreparedFrameId: number;
  readonly gpuNativeVisualPreparedFrameId: number;
  readonly hitGenerationId: string;
  readonly htmlTextureOverlayPreparedFrameId: number;
  readonly retainedScrollRevision: number;
};

export type GpuFlowPreparedContentPresentationProof = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGeneration: {
    readonly canvasRetainedFrameId: number;
    readonly debugSnapshotFrameId: number;
    readonly exposable: true;
    readonly gpuNativeVisualPreparedFrameId: number;
    readonly htmlTextureOverlayPreparedFrameId: number;
    readonly prepared: true;
    readonly presentationBatchId: string;
  };
  readonly domGenerationEvidence: GpuFlowPreparedContentDomPresentationEvidence;
  readonly domGeneration: {
    readonly browserVisualPreparedFrameId: number;
    readonly domControlPreparedFrameId: number;
    readonly domIslandPreparedFrameId: number;
    readonly exposable: true;
    readonly presentationBatchId: string;
    readonly staged: true;
  };
  readonly surfaceTransactionDigest: string | null;
};

export type GpuFlowPreparedContentDomPresentationEvidence = {
  readonly browserVisualCandidateId: string;
  readonly preparedFrameId: number;
  readonly domControlMountedCount: number;
  readonly domControlSnapshotCount: number;
  readonly domIslandCount: number;
  readonly exposable: boolean;
  readonly runtimeFrameId: number;
  readonly source: "browser-visual-runtime-candidate" | "startup";
  readonly staged: boolean;
};

type GpuFlowPreparedContentPresentationProofValidationCache = {
  readonly actorGenerations: GpuFlowPreparedContentFrame["actorGenerations"];
  readonly browserVisualSurfaceFragment: GpuFlowPreparedContentFrame["browserVisualSurfaceFragment"];
  readonly coherence: GpuFlowPreparedContentFrame["coherence"];
  readonly displayFrameId: GpuFlowPreparedContentFrame["displayFrameId"];
  readonly presentationProof: GpuFlowPreparedContentPresentationProof;
  readonly surfaceTransaction: GpuFlowPreparedContentFrame["surfaceTransaction"];
};

const actorManifestDigestCache = new WeakMap<
  readonly GpuFlowPreparedContentActorGeneration[],
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
  GpuFlowPreparedContentFrame,
  GpuFlowPreparedContentPresentationProofValidationCache
>();

export function assertGpuFlowPreparedContentFrameCoherent(
  frame: GpuFlowPreparedContentFrame,
): void {
  assertGpuFlowPreparedContentFamilyFrameIds(frame);
  assertGpuFlowPreparedContentPresentationProof(frame);
  assertGpuFlowPreparedContentRetainedScrollRevision(frame);
  const expectedCompleteness = createGpuFlowPreparedContentCompleteness({
    actorGenerations: frame.actorGenerations,
    startup: frame.retainedDisplayFrame === null,
  });
  assertGpuFlowPreparedContentCompleteness(
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
      retainedSurfaceTrueHoleActorIds:
        createGpuFlowPreparedContentRetainedTrueHoleActorIds(
          frame.retainedDisplayFrame,
        ),
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

export function createGpuFlowPreparedContentPresentationProof({
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
    | readonly GpuFlowPreparedContentActorGeneration[]
    | undefined;
  readonly browserVisualSurfaceFragment?:
    | BrowserVisualSurfaceTransactionFragment
    | null
    | undefined;
  readonly coherence: GpuFlowPreparedContentCoherence;
  readonly displayFrameId: number;
  readonly domGenerationEvidence?:
    | GpuFlowPreparedContentDomPresentationEvidence
    | undefined;
  readonly surfaceTransaction?: SurfaceDisplayTransaction | null | undefined;
}): GpuFlowPreparedContentPresentationProof {
  assertGpuFlowDomPresentationEvidenceFrame({
    displayFrameId,
    evidence: domGenerationEvidence,
  });
  const batchId = createGpuFlowPreparedContentPresentationBatchId({
    coherence,
    domGenerationEvidence,
    displayFrameId,
  });
  return Object.freeze({
    actorManifestDigest:
      createGpuFlowPreparedContentActorManifestDigest(actorGenerations),
    batchId,
    browserVisualFragmentDigest:
      browserVisualSurfaceFragment === null
        ? null
        : createGpuFlowPreparedContentPresentationBrowserVisualFragmentDigest(
            browserVisualSurfaceFragment,
          ),
    canvasGeneration: Object.freeze({
      canvasRetainedFrameId: coherence.canvasRetainedFrameId,
      debugSnapshotFrameId: coherence.debugSnapshotFrameId,
      exposable: true as const,
      gpuNativeVisualPreparedFrameId: coherence.gpuNativeVisualPreparedFrameId,
      htmlTextureOverlayPreparedFrameId:
        coherence.htmlTextureOverlayPreparedFrameId,
      prepared: true as const,
      presentationBatchId: batchId,
    }),
    domGenerationEvidence: Object.freeze({ ...domGenerationEvidence }),
    domGeneration: Object.freeze({
      browserVisualPreparedFrameId: displayFrameId,
      domControlPreparedFrameId: coherence.domControlPreparedFrameId,
      domIslandPreparedFrameId: coherence.domIslandPreparedFrameId,
      exposable: true as const,
      presentationBatchId: batchId,
      staged: true as const,
    }),
    surfaceTransactionDigest:
      surfaceTransaction === null
        ? null
        : createGpuFlowPreparedContentPresentationSurfaceTransactionDigest(
            surfaceTransaction,
          ),
  });
}

export function assertGpuFlowPreparedContentPresentationProof(
  frame: GpuFlowPreparedContentFrame,
): void {
  if (hasCachedGpuFlowPreparedContentPresentationProofValidation(frame)) {
    return;
  }
  const proof = frame.presentationProof;
  assertGpuFlowPresentationProofExists(proof);
  assertGpuFlowDomPresentationGeneration(proof);
  assertGpuFlowDomPresentationEvidence(proof);
  assertGpuFlowCanvasPresentationGeneration(proof);
  assertGpuFlowPresentedFrameIds({ frame, proof });
  const expected = createGpuFlowPreparedContentPresentationProof({
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

export function createGpuFlowPreparedContentDomPresentationEvidence({
  browserVisualCandidateId,
  preparedFrameId,
  domControlMountedCount,
  domControlSnapshotCount,
  domIslandCount,
  exposable,
  runtimeFrameId,
  source,
  staged,
}: GpuFlowPreparedContentDomPresentationEvidence): GpuFlowPreparedContentDomPresentationEvidence {
  return Object.freeze({
    browserVisualCandidateId,
    preparedFrameId,
    domControlMountedCount,
    domControlSnapshotCount,
    domIslandCount,
    exposable,
    runtimeFrameId,
    source,
    staged,
  });
}

export function createGpuFlowPreparedContentActorManifestDigest(
  actorGenerations: readonly GpuFlowPreparedContentActorGeneration[],
): string {
  const cached = actorManifestDigestCache.get(actorGenerations);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest(
    "prepared-content-frame-actor-manifest",
    actorGenerations.map(createGpuFlowPreparedContentActorManifestEntry),
  );
  actorManifestDigestCache.set(actorGenerations, digest);
  return digest;
}

function createGpuFlowPreparedContentActorManifestEntry(
  actor: GpuFlowPreparedContentActorGeneration,
) {
  return [
    actor.actorId,
    actor.canonicalActorId,
    actor.kind,
    actor.actorFamily,
    actor.generationClassification,
    actor.generationId,
    actor.contentGenerationId,
    actor.layoutProjectionGenerationId,
    actor.readinessGenerationId,
    actor.semanticGenerationId,
    actor.visualGenerationId,
    actor.clipChainRevision,
    actor.liveMotionSampleId,
    actor.ownerSurfaceId,
    actor.controlId,
    actor.islandId,
    actor.rowId,
    actor.focusIdentity,
    actor.active,
    actor.pointerEvents,
    actor.mountReadiness,
    actor.projectionReadiness,
    actor.visibleNonempty,
    actor.retainedScrollRevision,
    actor.valueStyleRevision,
    actor.textSnapshotCacheKeyRevision,
    actor.wheelPolicy,
    actor.zOrder,
    actor.browserVisual === null
      ? null
      : [
          actor.browserVisual.coverageState,
          actor.browserVisual.coverageRequired?.required ?? null,
          actor.browserVisual.coverageRequired?.reason ?? null,
          actor.browserVisual.coverageExemption?.reason ?? null,
          actor.browserVisual.nonemptyReason,
          actor.browserVisual.proof
            ? [
                actor.browserVisual.proof.actualInteraction,
                actor.browserVisual.proof.actualVisual,
                actor.browserVisual.proof.requiredInteraction,
                actor.browserVisual.proof.requiredVisual,
              ]
            : null,
          actor.browserVisual.representationKind,
          actor.browserVisual.resourceHandles.map(
            createGpuFlowPreparedContentResourceHandleDigest,
          ),
          actor.browserVisual.visibilityReason,
        ],
  ] as const;
}

function hasCachedGpuFlowPreparedContentPresentationProofValidation(
  frame: GpuFlowPreparedContentFrame,
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

function assertGpuFlowPreparedContentFamilyFrameIds(
  frame: GpuFlowPreparedContentFrame,
): void {
  const preparedFrameIds = [
    frame.coherence.canvasRetainedFrameId,
    frame.coherence.debugSnapshotFrameId,
    frame.coherence.domControlPreparedFrameId,
    frame.coherence.domIslandPreparedFrameId,
    frame.coherence.gpuNativeVisualPreparedFrameId,
    frame.coherence.htmlTextureOverlayPreparedFrameId,
  ];
  if (preparedFrameIds.some((frameId) => frameId !== frame.displayFrameId)) {
    throw new Error(
      "GPU Flow prepared content frame has incoherent visible frame ids.",
    );
  }
}

function assertGpuFlowPreparedContentRetainedScrollRevision(
  frame: GpuFlowPreparedContentFrame,
): void {
  if (
    frame.coherence.retainedScrollRevision !==
    frame.retainedRuntimeFrame.input.scrollRevision
  ) {
    throw new Error(
      "GPU Flow prepared content frame has an incoherent retained scroll revision.",
    );
  }
}

function assertGpuFlowPresentationProofExists(
  proof: GpuFlowPreparedContentPresentationProof | null | undefined,
): asserts proof is GpuFlowPreparedContentPresentationProof {
  if (!proof) {
    throw new Error(
      "GPU Flow prepared content frame requires a DOM/canvas presentation proof.",
    );
  }
}

function assertGpuFlowDomPresentationGeneration(
  proof: GpuFlowPreparedContentPresentationProof,
): void {
  if (
    proof.domGeneration.staged !== true ||
    proof.domGeneration.exposable !== true
  ) {
    throw new Error(
      "GPU Flow prepared content presentation proof requires DOM generation staged and exposable.",
    );
  }
}

function assertGpuFlowDomPresentationEvidence(
  proof: GpuFlowPreparedContentPresentationProof,
): void {
  const evidence = proof.domGenerationEvidence;
  if (!evidence) {
    throw new Error(
      "GPU Flow prepared content presentation proof requires DOM runtime presentation evidence.",
    );
  }
  assertGpuFlowDomPresentationEvidenceFrame({
    displayFrameId: proof.domGeneration.browserVisualPreparedFrameId,
    evidence,
  });
}

function assertGpuFlowDomPresentationEvidenceFrame({
  displayFrameId,
  evidence,
}: {
  readonly displayFrameId: number;
  readonly evidence: GpuFlowPreparedContentDomPresentationEvidence;
}): void {
  if (evidence.preparedFrameId !== displayFrameId) {
    throw new Error(
      "GPU Flow prepared content DOM presentation evidence requires the same prepared frame id.",
    );
  }
}

function assertGpuFlowCanvasPresentationGeneration(
  proof: GpuFlowPreparedContentPresentationProof,
): void {
  if (
    proof.canvasGeneration.prepared !== true ||
    proof.canvasGeneration.exposable !== true
  ) {
    throw new Error(
      "GPU Flow prepared content presentation proof requires canvas generation prepared and exposable.",
    );
  }
}

function assertGpuFlowPresentedFrameIds({
  frame,
  proof,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly proof: GpuFlowPreparedContentPresentationProof;
}): void {
  const presentedFrameIds = [
    proof.domGeneration.browserVisualPreparedFrameId,
    proof.domGeneration.domControlPreparedFrameId,
    proof.domGeneration.domIslandPreparedFrameId,
    proof.canvasGeneration.canvasRetainedFrameId,
    proof.canvasGeneration.debugSnapshotFrameId,
    proof.canvasGeneration.gpuNativeVisualPreparedFrameId,
    proof.canvasGeneration.htmlTextureOverlayPreparedFrameId,
  ];
  if (presentedFrameIds.some((frameId) => frameId !== frame.displayFrameId)) {
    throw new Error(
      "GPU Flow prepared content presentation proof requires DOM and canvas generations for the same prepared frame.",
    );
  }
}

function assertGpuFlowPresentationBatch({
  expected,
  proof,
}: {
  readonly expected: GpuFlowPreparedContentPresentationProof;
  readonly proof: GpuFlowPreparedContentPresentationProof;
}): void {
  if (
    proof.batchId !== proof.domGeneration.presentationBatchId ||
    proof.batchId !== proof.canvasGeneration.presentationBatchId ||
    proof.batchId !== expected.batchId
  ) {
    throw new Error(
      "GPU Flow prepared content presentation proof requires DOM and canvas generations in the same presentation batch.",
    );
  }
}

function assertGpuFlowPresentationGenerations({
  expected,
  proof,
}: {
  readonly expected: GpuFlowPreparedContentPresentationProof;
  readonly proof: GpuFlowPreparedContentPresentationProof;
}): void {
  const actualGenerationIds = createGpuFlowPresentationGenerationIds(proof);
  const expectedGenerationIds =
    createGpuFlowPresentationGenerationIds(expected);
  if (
    actualGenerationIds.some(
      (frameId, index) => frameId !== expectedGenerationIds[index],
    )
  ) {
    throw new Error(
      "GPU Flow prepared content presentation proof does not match the prepared frame generations.",
    );
  }
}

function assertGpuFlowPresentationDigests({
  expected,
  proof,
}: {
  readonly expected: GpuFlowPreparedContentPresentationProof;
  readonly proof: GpuFlowPreparedContentPresentationProof;
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
      "GPU Flow prepared content presentation proof does not match the prepared actor manifest and browser visual resources.",
    );
  }
}

function areGpuFlowDomPresentationEvidenceEqual(
  left: GpuFlowPreparedContentDomPresentationEvidence,
  right: GpuFlowPreparedContentDomPresentationEvidence,
): boolean {
  return (
    left.browserVisualCandidateId === right.browserVisualCandidateId &&
    left.preparedFrameId === right.preparedFrameId &&
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
  proof: GpuFlowPreparedContentPresentationProof,
): readonly number[] {
  return [
    proof.domGeneration.browserVisualPreparedFrameId,
    proof.domGeneration.domControlPreparedFrameId,
    proof.domGeneration.domIslandPreparedFrameId,
    proof.canvasGeneration.canvasRetainedFrameId,
    proof.canvasGeneration.debugSnapshotFrameId,
    proof.canvasGeneration.gpuNativeVisualPreparedFrameId,
    proof.canvasGeneration.htmlTextureOverlayPreparedFrameId,
  ];
}

function createGpuFlowPreparedContentResourceHandleDigest(
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

function createGpuFlowPreparedContentPresentationBrowserVisualFragmentDigest(
  fragment: BrowserVisualSurfaceTransactionFragment,
): string {
  const cached = browserVisualFragmentDigestCache.get(fragment);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest("prepared-content-browser-visual", {
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

function createGpuFlowPreparedContentPresentationSurfaceTransactionDigest(
  transaction: SurfaceDisplayTransaction,
): string {
  const cached = surfaceTransactionDigestCache.get(transaction);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowJsonDigest("prepared-content-transaction", {
    desiredSurfaceGenerationCount: transaction.desiredSurfaceGenerations.length,
    drawCommandCount: transaction.drawCommands.length,
    hitGenerationCount: transaction.hitIndex.generationIds.length,
    hitIndexId: transaction.hitIndex.id,
    id: transaction.id,
    protectedResourceHandles: transaction.protectedResourceHandles.map(
      (handle) => [handle.kind, handle.id, handle.reason],
    ),
    rendererBucketCount: transaction.rendererBuckets.length,
    zOrderCount: transaction.zOrder.length,
  });
  surfaceTransactionDigestCache.set(transaction, digest);
  return digest;
}

function createGpuFlowPreparedContentPresentationBatchId({
  coherence,
  domGenerationEvidence,
  displayFrameId,
}: {
  readonly coherence: GpuFlowPreparedContentCoherence;
  readonly domGenerationEvidence: GpuFlowPreparedContentDomPresentationEvidence;
  readonly displayFrameId: number;
}): string {
  return [
    "presentation",
    displayFrameId,
    coherence.canvasRetainedFrameId,
    coherence.domControlPreparedFrameId,
    coherence.domIslandPreparedFrameId,
    coherence.gpuNativeVisualPreparedFrameId,
    coherence.htmlTextureOverlayPreparedFrameId,
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
}): GpuFlowPreparedContentDomPresentationEvidence {
  return createGpuFlowPreparedContentDomPresentationEvidence({
    browserVisualCandidateId: `startup-browser-visual:${displayFrameId}`,
    preparedFrameId: displayFrameId,
    domControlMountedCount: 0,
    domControlSnapshotCount: 0,
    domIslandCount: 0,
    exposable: true,
    runtimeFrameId: displayFrameId,
    source: "startup",
    staged: true,
  });
}

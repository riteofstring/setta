import {
  createGpuFlowPrimitiveSequenceDigest,
  type GpuFlowDigestPrimitive,
} from "./gpuFlowDigest";
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
  assertGpuFlowContentFramePresentability,
  assertGpuFlowProjectionHorizon,
  createGpuFlowContentFramePresentability,
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
  assertGpuFlowContentFramePresentability(
    frame.presentability,
    createGpuFlowContentFramePresentability({
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
  const digest = createGpuFlowPrimitiveSequenceDigest(
    "prepared-content-frame-actor-manifest",
    createGpuFlowPreparedContentActorManifestDigestFields(actorGenerations),
  );
  actorManifestDigestCache.set(actorGenerations, digest);
  return digest;
}

function* createGpuFlowPreparedContentActorManifestDigestFields(
  actorGenerations: readonly GpuFlowPreparedContentActorGeneration[],
): Iterable<GpuFlowDigestPrimitive> {
  for (const actor of actorGenerations) {
    yield "actor";
    yield actor.actorId;
    yield actor.canonicalActorId;
    yield actor.kind;
    yield actor.actorFamily;
    yield actor.generationClassification;
    yield actor.generationId;
    yield actor.semanticGenerationId;
    yield actor.visualGenerationId;
    yield actor.clipChainRevision;
    yield actor.mountReadiness;
    yield actor.projectionReadiness;
    const browserVisual = actor.browserVisual;
    if (browserVisual === null) {
      yield null;
      continue;
    }
    yield "browser-visual";
    yield browserVisual.coverageState;
    yield browserVisual.coverageRequired?.required ?? null;
    yield browserVisual.coverageRequired?.reason ?? null;
    if (browserVisual.proof) {
      yield "proof";
      yield browserVisual.proof.actualInteraction;
      yield browserVisual.proof.actualVisual;
      yield browserVisual.proof.requiredInteraction;
      yield browserVisual.proof.requiredVisual;
    } else {
      yield null;
    }
    yield browserVisual.representationKind;
    for (const handle of browserVisual.resourceHandles) {
      yield* createGpuFlowPreparedContentResourceHandleDigestFields(handle);
    }
  }
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

function* createGpuFlowPreparedContentResourceHandleDigestFields(
  handle: SurfaceResourceHandle,
): Iterable<GpuFlowDigestPrimitive> {
  yield "resource";
  yield handle.kind;
  yield handle.id;
  yield handle.actorId ?? null;
  yield handle.contentGenerationId ?? null;
  yield handle.projectionGenerationId ?? null;
  yield handle.resourceGenerationId ?? null;
}

function createGpuFlowPreparedContentPresentationBrowserVisualFragmentDigest(
  fragment: BrowserVisualSurfaceTransactionFragment,
): string {
  const cached = browserVisualFragmentDigestCache.get(fragment);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowPrimitiveSequenceDigest(
    "prepared-content-browser-visual",
    createGpuFlowPreparedContentBrowserVisualFragmentDigestFields(fragment),
  );
  browserVisualFragmentDigestCache.set(fragment, digest);
  return digest;
}

function* createGpuFlowPreparedContentBrowserVisualFragmentDigestFields(
  fragment: BrowserVisualSurfaceTransactionFragment,
): Iterable<GpuFlowDigestPrimitive> {
  yield "active-islands";
  for (const island of fragment.activeIslands) {
    yield island.islandId;
  }
  yield "actor-generations";
  for (const snapshot of fragment.actorSnapshots) {
    yield snapshot.generation.generationId;
  }
  yield "blocking-generations";
  for (const generationId of fragment.blockingGenerationIds) {
    yield generationId;
  }
  yield "blocking-surfaces";
  for (const surfaceId of fragment.blockingSurfaceIds) {
    yield surfaceId;
  }
  yield "compatible-coverage";
  for (const entry of fragment.compatibleCoverage) {
    yield entry.surfaceId;
    yield entry.generationId;
  }
  yield "exact-coverage";
  for (const entry of fragment.exactCoverage) {
    yield entry.surfaceId;
    yield entry.generationId;
  }
  yield "protected-resources";
  for (const handle of fragment.protectedResourceHandles) {
    yield handle.kind;
    yield handle.id;
    yield handle.reason;
  }
  yield "counts";
  yield fragment.rendererBuckets.length;
  yield fragment.trueHoleRects.length;
  yield fragment.visibleRects.length;
  yield fragment.zOrder.length;
}

function createGpuFlowPreparedContentPresentationSurfaceTransactionDigest(
  transaction: SurfaceDisplayTransaction,
): string {
  const cached = surfaceTransactionDigestCache.get(transaction);
  if (cached !== undefined) {
    return cached;
  }
  const digest = createGpuFlowPrimitiveSequenceDigest(
    "prepared-content-transaction",
    createGpuFlowPreparedContentPresentationSurfaceTransactionDigestFields(
      transaction,
    ),
  );
  surfaceTransactionDigestCache.set(transaction, digest);
  return digest;
}

function* createGpuFlowPreparedContentPresentationSurfaceTransactionDigestFields(
  transaction: SurfaceDisplayTransaction,
): Iterable<GpuFlowDigestPrimitive> {
  yield transaction.id;
  yield transaction.hitIndex.id;
  yield transaction.desiredSurfaceGenerations.length;
  yield transaction.drawCommands.length;
  yield transaction.hitIndex.generationIds.length;
  yield transaction.rendererBuckets.length;
  yield transaction.zOrder.length;
  for (const handle of transaction.protectedResourceHandles) {
    yield handle.kind;
    yield handle.id;
    yield handle.reason;
  }
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

import {
  isChromeReproActive,
  postChromeReproEvent,
} from "state/actions/chromeRepro";

import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  createGpuFlowVisibleFramePresentationTransactionReport,
  type GpuFlowVisibleFramePresentationOutcome,
  type GpuFlowVisibleFramePublicationTransactionProof,
  type GpuFlowVisibleFrameReducerCompletion,
} from "./visibleFrameCoordinator";
import type { GpuFlowPresentationPairProof } from "./visibleFramePresentationAuthorityProofs";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";

type GpuFlowVisibleFramePresentationReducerCompletion =
  GpuFlowVisibleFrameReducerCompletion;
type GpuFlowVisibleFramePresentationTransactionReport = ReturnType<
  typeof createGpuFlowVisibleFramePresentationTransactionReport
>;
type GpuFlowVisibleFramePresentationTransactionReportToken =
  GpuFlowVisibleFramePresentationTransactionReport["token"];
type GpuFlowVisibleTransactionReport =
  GpuFlowVisibleFramePresentationTransactionReport["visibleTransaction"];
type GpuFlowVisibleFramePresentationActorProof =
  GpuFlowVisibleFramePresentationTransactionReport["actorProofs"][number];

const CHROME_REPRO_DIGEST_PREVIEW_LENGTH = 64;
const CHROME_REPRO_ACTOR_PROOF_SAMPLE_LIMIT = 8;

export function postGpuFlowVisibleFramePresentationOutcomeChromeReproEvent({
  completion,
  outcome,
  previousContentFrameId,
  reducerDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisibleFramePresentationReducerCompletion;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly previousContentFrameId: number | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (!isChromeReproActive()) {
    return;
  }
  postChromeReproEvent(
    "gpu-flow-visible-frame-presentation-outcome",
    createGpuFlowVisibleFramePresentationOutcomeChromeReproPayload({
      completion,
      outcome,
      previousContentFrameId,
      reducerDecision,
      transactionProof,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisibleFramePresentationOutcomeChromeReproPayload({
  completion,
  outcome,
  previousContentFrameId,
  reducerDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisibleFramePresentationReducerCompletion;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly previousContentFrameId: number | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const report = createGpuFlowVisibleFramePresentationTransactionReport({
    completion,
    outcome,
    previousContentFrameId,
    reducerDecision,
    transactionProof,
    visibleProjectionState,
  });
  return createBoundedGpuFlowVisibleFramePresentationOutcomeChromeReproPayload(
    report,
  );
}

function createBoundedGpuFlowVisibleFramePresentationOutcomeChromeReproPayload(
  report: GpuFlowVisibleFramePresentationTransactionReport,
) {
  const {
    actorProofDigest,
    actorProofs,
    presentableFrameProof,
    resourceProtection,
    token,
    visibleTransaction,
    ...rest
  } = report;
  return {
    ...rest,
    actorProofCount: actorProofs.length,
    actorProofDigest: summarizeChromeReproDigest(actorProofDigest),
    actorProofSamples: actorProofs
      .slice(0, CHROME_REPRO_ACTOR_PROOF_SAMPLE_LIMIT)
      .map(summarizeChromeReproActorProof),
    presentableFrameProof: summarizeChromeReproPresentableFrameProof(
      presentableFrameProof,
    ),
    resourceProtection:
      summarizeChromeReproResourceProtection(resourceProtection),
    token: summarizeChromeReproOutcomeToken(token),
    visibleTransaction:
      summarizeChromeReproVisibleTransaction(visibleTransaction),
  };
}

function summarizeChromeReproDigest(value: string | null) {
  if (value === null) {
    return null;
  }
  return {
    length: value.length,
    preview: value.slice(0, CHROME_REPRO_DIGEST_PREVIEW_LENGTH),
    truncated: value.length > CHROME_REPRO_DIGEST_PREVIEW_LENGTH,
  };
}

function summarizeChromeReproActorProof(
  proof: GpuFlowVisibleFramePresentationActorProof,
) {
  return {
    actorId: proof.actorId,
    actualInteractionProof: proof.actualInteractionProof,
    actualVisualProof: proof.actualVisualProof,
    browserVisualRepresentation:
      proof.browserVisualRepresentation === null
        ? null
        : {
            actorId: proof.browserVisualRepresentation.actorId,
            hostId:
              "hostId" in proof.browserVisualRepresentation
                ? proof.browserVisualRepresentation.hostId
                : null,
            kind: proof.browserVisualRepresentation.kind,
            previousTransactionId:
              "previousTransactionId" in proof.browserVisualRepresentation
                ? proof.browserVisualRepresentation.previousTransactionId
                : null,
          },
    canonicalActorId: proof.canonicalActorId,
    compatiblePreviousBudgetState: proof.compatiblePreviousBudgetState,
    ownerFamily: proof.ownerFamily,
    ownerSurfaceId: proof.ownerSurfaceId,
    proofState: proof.proofState,
    remainingDebt: proof.remainingDebt,
    requiredInteractionRepresentation: proof.requiredInteractionRepresentation,
    requiredVisualRepresentation: proof.requiredVisualRepresentation,
    sampledVisualEvidence: proof.sampledVisualEvidence,
  };
}

function summarizeChromeReproResourceProtection(
  resourceProtection: GpuFlowVisibleFramePresentationTransactionReport["resourceProtection"],
) {
  return {
    ...resourceProtection,
    missingResourceKeys: summarizeChromeReproStringList(
      resourceProtection.missingResourceKeys,
    ),
    missingResourceKeyCount: resourceProtection.missingResourceKeys.length,
    protectedResourceKeys: summarizeChromeReproStringList(
      resourceProtection.protectedResourceKeys,
    ),
    protectedResourceKeyCount: resourceProtection.protectedResourceKeys.length,
    requiredResourceKeys: summarizeChromeReproStringList(
      resourceProtection.requiredResourceKeys,
    ),
    requiredResourceKeyCount: resourceProtection.requiredResourceKeys.length,
  };
}

function summarizeChromeReproPresentableFrameProof(
  presentableFrameProof: GpuFlowVisibleFramePresentationTransactionReport["presentableFrameProof"],
) {
  if (presentableFrameProof === null) {
    return null;
  }
  return {
    ...presentableFrameProof,
    resourceProtectionDigest: summarizeChromeReproDigest(
      presentableFrameProof.resourceProtectionDigest,
    ),
  };
}

function summarizeChromeReproOutcomeToken(
  token: GpuFlowVisibleFramePresentationTransactionReportToken,
):
  | GpuFlowVisibleFramePresentationTransactionReportToken
  | Record<string, unknown> {
  if ("presentationPairProof" in token) {
    return {
      preparedContentFrameId: token.preparedContentFrameId,
      presentationPairProof: summarizeChromeReproPresentationProof(
        token.presentationPairProof,
      ),
      projectionSampleId: token.projectionSampleId,
      resourceProtectionDigest: summarizeChromeReproDigest(
        token.resourceProtectionDigest ?? null,
      ),
      transactionId: token.transactionId,
    };
  }
  if ("frozenFrame" in token) {
    const { frozenFrame, ...rest } = token;
    return {
      ...rest,
      frozenFrame: {
        frameId: frozenFrame.frameId,
        kind: frozenFrame.kind,
      },
    };
  }
  return token;
}

function summarizeChromeReproVisibleTransaction(
  visibleTransaction: GpuFlowVisibleTransactionReport,
) {
  const { presentableFrame, presentationProof, token, ...rest } =
    visibleTransaction;
  return {
    ...rest,
    presentableFrame:
      presentableFrame === null
        ? null
        : summarizeChromeReproPresentableFrame(presentableFrame),
    presentationProof:
      presentationProof === null
        ? null
        : summarizeChromeReproPresentationProof(presentationProof),
    token: summarizeChromeReproOutcomeToken(token),
  };
}

function summarizeChromeReproPresentableFrame(
  presentableFrame: NonNullable<
    GpuFlowVisibleTransactionReport["presentableFrame"]
  >,
) {
  const { presentationPairProof, ...digestFields } = presentableFrame;
  return {
    ...summarizeChromeReproStringRecord(digestFields),
    presentationPairProof: summarizeChromeReproPresentationProof(
      presentationPairProof,
    ),
  };
}

function summarizeChromeReproPresentationProof(
  proof:
    | GpuFlowPresentationPairProof
    | NonNullable<GpuFlowVisibleTransactionReport["presentationProof"]>,
) {
  return {
    actorManifestDigest: summarizeChromeReproDigest(proof.actorManifestDigest),
    batchId: summarizeChromeReproDigest(proof.batchId),
    browserVisualFragmentDigest: summarizeChromeReproDigest(
      proof.browserVisualFragmentDigest,
    ),
    canvasGeneration: summarizeChromeReproScalarRecord(proof.canvasGeneration),
    canvasGenerationEvidence: summarizeChromeReproScalarRecord(
      proof.canvasGenerationEvidence,
    ),
    domTransformEvidence: summarizeChromeReproDomTransformEvidence(
      proof.domTransformEvidence,
    ),
    domGeneration: summarizeChromeReproScalarRecord(proof.domGeneration),
    domGenerationEvidence: summarizeChromeReproScalarRecord(
      proof.domGenerationEvidence,
    ),
    projectionSampleId: proof.projectionSampleId,
    surfaceTransactionDigest: summarizeChromeReproDigest(
      proof.surfaceTransactionDigest,
    ),
    textureEvictionPrepared: proof.textureEvictionEvidence?.prepared ?? false,
  };
}

function summarizeChromeReproStringRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "string" ? summarizeChromeReproDigest(value) : value,
    ]),
  );
}

function summarizeChromeReproDomTransformEvidence(
  evidence: GpuFlowPresentationPairProof["domTransformEvidence"],
) {
  return {
    preparedContentFrameId: evidence.preparedContentFrameId,
    prepared: evidence.prepared,
    projectionSampleId: evidence.projectionSampleId,
  };
}

function summarizeChromeReproStringList(values: readonly string[]) {
  return values.slice(0, 16).map(summarizeChromeReproDigest);
}

function summarizeChromeReproScalarRecord(
  record: Record<string, ChromeReproScalar>,
) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? summarizeChromeReproStringList(value)
        : typeof value === "string"
          ? summarizeChromeReproDigest(value)
          : value,
    ]),
  );
}

type ChromeReproScalar = boolean | null | number | readonly string[] | string;

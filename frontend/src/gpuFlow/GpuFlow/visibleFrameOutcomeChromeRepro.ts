import {
  isChromeReproActive,
  postChromeReproEvent,
} from "state/actions/chromeRepro";

import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowVisiblePublicationTransactionReport,
  type GpuFlowVisibleFramePublicationTransactionProof,
  type GpuFlowVisiblePublicationCompletion,
  type GpuFlowVisiblePublicationOutcome,
} from "./visibleFrameKernel";

type GpuFlowVisiblePublicationSchedulerCompletion =
  GpuFlowVisiblePublicationCompletion;
type GpuFlowVisiblePublicationTransactionReport = ReturnType<
  typeof createGpuFlowVisiblePublicationTransactionReport
>;
type GpuFlowVisiblePublicationTransactionReportToken =
  GpuFlowVisiblePublicationTransactionReport["token"];
type GpuFlowVisibleTransactionReport =
  GpuFlowVisiblePublicationTransactionReport["visibleTransaction"];
type GpuFlowVisiblePublicationActorProof =
  GpuFlowVisiblePublicationTransactionReport["actorProofs"][number];

const CHROME_REPRO_DIGEST_PREVIEW_LENGTH = 64;
const CHROME_REPRO_ACTOR_PROOF_SAMPLE_LIMIT = 8;

export function postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (!isChromeReproActive()) {
    return;
  }
  postChromeReproEvent(
    "gpu-flow-visible-publication-outcome",
    createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
      completion,
      outcome,
      previousCommittedFrameId,
      publicationDecision,
      transactionProof,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const report = createGpuFlowVisiblePublicationTransactionReport({
    completion,
    outcome,
    previousCommittedFrameId,
    publicationDecision,
    transactionProof,
    visibleProjectionState,
  });
  return createBoundedGpuFlowVisiblePublicationOutcomeChromeReproPayload(
    report,
  );
}

function createBoundedGpuFlowVisiblePublicationOutcomeChromeReproPayload(
  report: GpuFlowVisiblePublicationTransactionReport,
) {
  const {
    actorProofDigest,
    actorProofs,
    commitProof,
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
    commitProof: summarizeChromeReproCommitProof(commitProof),
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
  proof: GpuFlowVisiblePublicationActorProof,
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
  resourceProtection: GpuFlowVisiblePublicationTransactionReport["resourceProtection"],
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

function summarizeChromeReproCommitProof(
  commitProof: GpuFlowVisiblePublicationTransactionReport["commitProof"],
) {
  if (commitProof === null) {
    return null;
  }
  return {
    ...commitProof,
    resourceProtectionDigest: summarizeChromeReproDigest(
      commitProof.resourceProtectionDigest,
    ),
  };
}

function summarizeChromeReproOutcomeToken(
  token: GpuFlowVisiblePublicationTransactionReportToken,
): GpuFlowVisiblePublicationTransactionReportToken | Record<string, unknown> {
  if ("presentationPairProof" in token) {
    const { presentationPairProof, ...rest } = token;
    return {
      ...rest,
      expectedActorSetDigest: summarizeChromeReproDigest(
        token.expectedActorSetDigest,
      ),
      presentationPairDigest: summarizeChromeReproDigest(
        token.presentationPairDigest,
      ),
      presentationPairProof: summarizeChromeReproPresentationProof(
        presentationPairProof,
      ),
      proofDigest: summarizeChromeReproDigest(token.proofDigest),
      resourceProtectionDigest: summarizeChromeReproDigest(
        token.resourceProtectionDigest,
      ),
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
  const { presentableCommit, presentationProof, token, ...rest } =
    visibleTransaction;
  return {
    ...rest,
    presentableCommit:
      presentableCommit === null
        ? null
        : {
            expectedActorSetDigest: summarizeChromeReproDigest(
              presentableCommit.expectedActorSetDigest,
            ),
            presentationPairDigest: summarizeChromeReproDigest(
              presentableCommit.presentationPairDigest,
            ),
            presentationPairProof: summarizeChromeReproPresentationProof(
              presentableCommit.presentationPairProof,
            ),
            proofDigest: summarizeChromeReproDigest(
              presentableCommit.proofDigest,
            ),
            resourceProtectionDigest: summarizeChromeReproDigest(
              presentableCommit.resourceProtectionDigest,
            ),
          },
    presentationProof:
      presentationProof === null
        ? null
        : summarizeChromeReproPresentationProof(presentationProof),
    token: summarizeChromeReproOutcomeToken(token),
  };
}

function summarizeChromeReproPresentationProof(
  proof: NonNullable<GpuFlowVisibleTransactionReport["presentationProof"]>,
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
    domGeneration: summarizeChromeReproScalarRecord(proof.domGeneration),
    domGenerationEvidence: summarizeChromeReproScalarRecord(
      proof.domGenerationEvidence,
    ),
    projectionSampleId: proof.projectionSampleId,
    surfaceTransactionDigest: summarizeChromeReproDigest(
      proof.surfaceTransactionDigest,
    ),
  };
}

function summarizeChromeReproStringList(values: readonly string[]) {
  return values.slice(0, 16).map(summarizeChromeReproDigest);
}

function summarizeChromeReproScalarRecord(
  record: Record<string, string | number | boolean | null>,
) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "string" ? summarizeChromeReproDigest(value) : value,
    ]),
  );
}

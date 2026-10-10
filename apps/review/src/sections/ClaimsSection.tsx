import { useMemo, useState } from "react";
import type { WorkspaceSection } from "@setta/workspace";

import type { CompletionDecisionKind } from "../app/reviewModel";
import { decisionForClaim, findRequestSnapshot } from "../app/reviewModel";
import { useReview } from "../app/reviewContext";
import { reviewDraftKey, useReviewTextDraft } from "../app/reviewDrafts";
import type {
  CompletionClaim,
  ExternalAssessment,
} from "../api/generatedContract";
import { sectionRequestId } from "./sectionModel";

type ClaimSignal =
  "supported" | "disputed" | "qualified" | "unproven" | "unassessed";

function claimAssessments(
  assessments: readonly ExternalAssessment[],
  claimId: string,
): ExternalAssessment[] {
  return assessments.filter((assessment) => assessment.claimId === claimId);
}

function claimSignal(assessments: readonly ExternalAssessment[]): ClaimSignal {
  if (assessments.length === 0) {
    return "unassessed";
  }
  const states = new Set(
    assessments.map((assessment) => assessment.assessment),
  );
  if (states.size > 1 || states.has("contradicted")) {
    return "disputed";
  }
  if (states.has("qualified")) {
    return "qualified";
  }
  if (states.has("unproven")) {
    return "unproven";
  }
  return "supported";
}

const signalLabel: Record<ClaimSignal, string> = {
  disputed: "Disagreement",
  qualified: "Qualified support",
  supported: "All support",
  unassessed: "No assessments",
  unproven: "Not established",
};

const signalMark: Record<ClaimSignal, string> = {
  disputed: "!",
  qualified: "~",
  supported: "✓",
  unassessed: "·",
  unproven: "?",
};

const decisionLabel: Record<CompletionDecisionKind, string> = {
  accepted: "Accepted",
  needsEvidence: "Evidence requested",
  qualified: "Qualified",
  rejected: "Rejected",
};

const decisionMark: Record<CompletionDecisionKind, string> = {
  accepted: "✓",
  needsEvidence: "?",
  qualified: "~",
  rejected: "×",
};

function ClaimAssessmentList({
  assessments,
}: {
  assessments: readonly ExternalAssessment[];
}) {
  if (assessments.length === 0) {
    return (
      <p className="review-empty-assessments">
        No external reviewer has assessed this claim.
      </p>
    );
  }
  return (
    <div aria-label="External assessments" className="review-assessments">
      {assessments.map((assessment) => (
        <div className="review-assessment" key={assessment.id}>
          <div>
            <strong>
              {assessment.producer.model} · {assessment.producer.harness}
            </strong>
            <span>{assessment.rationale}</span>
          </div>
          <span data-assessment={assessment.assessment}>
            {assessment.assessment}
          </span>
          {assessment.caveat ? <p>{assessment.caveat}</p> : null}
        </div>
      ))}
    </div>
  );
}

function HumanDecision({
  claim,
  decision,
  disabled,
  onDecide,
  draftKey,
}: {
  claim: CompletionClaim;
  decision: ReturnType<typeof decisionForClaim>;
  disabled: boolean;
  draftKey: string;
  onDecide: (
    kind: CompletionDecisionKind,
    rationale: string,
    qualification: string,
  ) => Promise<void>;
}) {
  const rationale = useReviewTextDraft(
    `${draftKey}:rationale`,
    decision?.rationale ?? "",
  );
  const qualification = useReviewTextDraft(
    `${draftKey}:qualification`,
    decision?.qualification ?? "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] =
    useState<CompletionDecisionKind | null>(null);

  const decide = async (kind: CompletionDecisionKind) => {
    if (kind === "qualified" && qualification.value.trim() === "") {
      setFormError("State the qualification before saving.");
      return;
    }
    try {
      setFormError(null);
      setPendingDecision(kind);
      await onDecide(kind, rationale.value, qualification.value);
      rationale.saved();
      qualification.saved();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save the decision.",
      );
    } finally {
      setPendingDecision(null);
    }
  };

  const action = (kind: CompletionDecisionKind, label: string) => {
    const current = decision?.decision === kind;
    const pending = pendingDecision === kind;
    return (
      <button
        aria-pressed={current}
        data-decision-kind={kind}
        disabled={
          disabled ||
          pendingDecision !== null ||
          (current && !rationale.hasDraft && !qualification.hasDraft)
        }
        onClick={() => void decide(kind)}
        type="button"
      >
        {pending
          ? "Saving…"
          : current
            ? `${decisionMark[kind]} ${decisionLabel[kind]}`
            : label}
      </button>
    );
  };

  return (
    <div className="review-human-decision">
      {rationale.status || qualification.status ? (
        <p className="review-draft-status" role="status">
          {rationale.status ?? qualification.status}
        </p>
      ) : null}
      <div className="review-human-decision-fields">
        <label>
          <span>Note</span>
          <input
            aria-label={`Note for ${claim.text}`}
            disabled={disabled}
            onChange={(event) => rationale.update(event.currentTarget.value)}
            placeholder="Optional reasoning"
            value={rationale.value}
          />
        </label>
        <label>
          <span>Qualification</span>
          <input
            aria-label={`Qualification for ${claim.text}`}
            disabled={disabled}
            onChange={(event) =>
              qualification.update(event.currentTarget.value)
            }
            placeholder="Required only for Qualify"
            value={qualification.value}
          />
        </label>
      </div>
      <div aria-label="Human decision" className="review-decision-actions">
        {action("accepted", "Accept")}
        {action("qualified", "Qualify")}
        {action("rejected", "Reject")}
        {action("needsEvidence", "Need evidence")}
      </div>
      {formError ? (
        <p className="review-form-error" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

export function ClaimsSection({ section }: { section: WorkspaceSection }) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  if (snapshot.request.type !== "completion") {
    throw new Error(`Review request ${requestId} is not a completion review.`);
  }
  const selectedClaimId =
    review.selection?.requestId === requestId &&
    review.selection.subjectKind === "claim"
      ? review.selection.subjectId
      : null;
  const selectedClaim =
    snapshot.request.completion.claims.find(
      (claim) => claim.id === selectedClaimId,
    ) ?? null;
  const selectedAssessments = useMemo(
    () =>
      selectedClaim
        ? claimAssessments(snapshot.assessments, selectedClaim.id)
        : [],
    [selectedClaim, snapshot.assessments],
  );
  const busy = review.busyRequestId === requestId;

  return (
    <div className="review-claims">
      <p className="review-requested-decision">
        {snapshot.request.requestedDecision}
      </p>
      <div className="review-claim-list">
        {snapshot.request.completion.claims.map((claim) => {
          const assessments = claimAssessments(snapshot.assessments, claim.id);
          const signal = claimSignal(assessments);
          const decision = decisionForClaim(snapshot, claim.id);
          const selected = selectedClaim?.id === claim.id;
          return (
            <button
              aria-expanded={selected}
              className="review-claim-row"
              data-decision={decision?.decision}
              data-selected={selected || undefined}
              data-signal={signal}
              key={claim.id}
              onClick={() =>
                review.actions.selectSubject({
                  requestId,
                  subjectId: claim.id,
                  subjectKind: "claim",
                })
              }
              type="button"
            >
              <span aria-hidden="true" className="review-claim-signal">
                {signalMark[signal]}
              </span>
              <strong>{claim.text}</strong>
              <span
                className="review-claim-state"
                data-decision={decision?.decision}
              >
                {decision
                  ? `${decisionMark[decision.decision]} ${decisionLabel[decision.decision]}`
                  : signalLabel[signal]}
              </span>
            </button>
          );
        })}
      </div>
      {selectedClaim ? (
        <div className="review-claim-detail">
          <ClaimAssessmentList assessments={selectedAssessments} />
          <HumanDecision
            claim={selectedClaim}
            decision={decisionForClaim(snapshot, selectedClaim.id)}
            disabled={busy}
            draftKey={reviewDraftKey(
              review.snapshot.project.id,
              snapshot,
              `claim:${selectedClaim.id}`,
            )}
            key={selectedClaim.id}
            onDecide={(kind, rationale, qualification) =>
              review.actions.decideClaim(requestId, {
                claimId: selectedClaim.id,
                decision: kind,
                qualification:
                  kind === "qualified" ? qualification.trim() : null,
                rationale: rationale.trim(),
              })
            }
          />
        </div>
      ) : (
        <p className="review-selection-hint">
          Select a claim to inspect evidence and respond.
        </p>
      )}
    </div>
  );
}

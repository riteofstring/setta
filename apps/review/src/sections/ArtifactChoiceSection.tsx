import type { WorkspaceSection } from "@setta/workspace";

import { useReview } from "../app/reviewContext";
import {
  confirmedChoiceOptionId,
  findRequestSnapshot,
} from "../app/reviewModel";
import { ChoiceActions } from "./ChoiceActions";
import { sectionRequestId } from "./sectionModel";

export function ArtifactChoiceSection({
  section,
}: {
  section: WorkspaceSection;
}) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const request = snapshot.request;
  if (
    request.type !== "choice" ||
    request.choice.presentation !== "artifacts"
  ) {
    throw new Error(`Review request ${requestId} is not an artifact choice.`);
  }
  const choice = request.choice;
  const selectedOption = review.selectedOptions[requestId] ?? null;
  const confirmedOption = confirmedChoiceOptionId(snapshot.response);

  return (
    <div className="review-choice review-artifact-choice">
      <p className="review-requested-decision">{request.requestedDecision}</p>
      <div className="review-artifact-options">
        {choice.options.map((option) => {
          const selected = selectedOption === option.id;
          const recommended = choice.recommendation?.optionId === option.id;
          const confirmed = confirmedOption === option.id;
          return (
            <button
              aria-pressed={selected}
              data-confirmed={confirmed || undefined}
              data-selected={selected || undefined}
              key={option.id}
              onClick={() => review.actions.selectOption(requestId, option.id)}
              type="button"
            >
              <span aria-hidden="true" className="review-option-radio" />
              <span>
                <strong>{option.label}</strong>
                {option.description ? (
                  <small>{option.description}</small>
                ) : null}
              </span>
              {confirmed ? (
                <em data-confirmed>Your choice</em>
              ) : recommended ? (
                <em>Recommended</em>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="review-artifact-hint">
        Open candidates in floating windows to compare them. Draw mode attaches
        feedback to the exact artifact.
      </p>
      <ChoiceActions requestId={requestId} />
    </div>
  );
}

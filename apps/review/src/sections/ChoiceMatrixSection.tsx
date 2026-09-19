import type { WorkspaceSection } from "@setta/workspace";

import { useReview } from "../app/reviewContext";
import { findRequestSnapshot } from "../app/reviewModel";
import { ChoiceActions } from "./ChoiceActions";
import { sectionRequestId } from "./sectionModel";

export function ChoiceMatrixSection({
  section,
}: {
  section: WorkspaceSection;
}) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const request = snapshot.request;
  if (request.type !== "choice" || request.choice.presentation !== "matrix") {
    throw new Error(`Review request ${requestId} is not a matrix choice.`);
  }
  const choice = request.choice;
  const selectedOption = review.selectedOptions[requestId] ?? null;
  const selectedFactor =
    review.selection?.requestId === requestId &&
    review.selection.subjectKind === "factor"
      ? review.selection.subjectId
      : null;
  const responseOption =
    snapshot.response?.type === "choice"
      ? (snapshot.response.choice.optionIds[0] ?? null)
      : null;

  return (
    <div className="review-choice review-choice-matrix-wrap">
      <p className="review-requested-decision">{request.requestedDecision}</p>
      <div className="review-choice-table-scroll">
        <table className="review-choice-table">
          <thead>
            <tr>
              <th scope="col">Option</th>
              {choice.factors.map((factor) => (
                <th
                  data-selected={selectedFactor === factor.id || undefined}
                  key={factor.id}
                  scope="col"
                >
                  <button
                    aria-pressed={selectedFactor === factor.id}
                    onClick={() =>
                      review.actions.selectSubject({
                        requestId,
                        subjectId: factor.id,
                        subjectKind: "factor",
                      })
                    }
                    title={factor.description || undefined}
                    type="button"
                  >
                    {factor.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {choice.options.map((option) => {
              const selected = selectedOption === option.id;
              const recommended = choice.recommendation?.optionId === option.id;
              return (
                <tr data-selected={selected || undefined} key={option.id}>
                  <th scope="row">
                    <button
                      aria-pressed={selected}
                      className="review-option-button"
                      onClick={() =>
                        review.actions.selectOption(requestId, option.id)
                      }
                      title={option.description || undefined}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="review-option-radio"
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {recommended ? (
                          <small>Producer recommendation</small>
                        ) : null}
                        {responseOption === option.id ? (
                          <small>Previously confirmed</small>
                        ) : null}
                      </span>
                    </button>
                  </th>
                  {choice.factors.map((factor) => {
                    const tradeoff = choice.tradeoffs.find(
                      (candidate) =>
                        candidate.optionId === option.id &&
                        candidate.factorId === factor.id,
                    );
                    return (
                      <td
                        data-selected={
                          selectedFactor === factor.id || undefined
                        }
                        data-tone={tradeoff?.tone ?? "neutral"}
                        key={factor.id}
                      >
                        {tradeoff?.value ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ChoiceActions requestId={requestId} />
    </div>
  );
}

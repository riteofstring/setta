import { NO_WHEEL_CLASS_NAME, type WorkspaceSection } from "@setta/workspace";

import { useReview, type ReviewSubjectSelection } from "../app/reviewContext";
import { findRequestSnapshot } from "../app/reviewModel";
import type {
  RequestSnapshot,
  ReviewResponse,
} from "../backend/generatedContract";
import { ChoiceActions } from "./ChoiceActions";
import { sectionRequestId } from "./sectionModel";

function matrixChoice(snapshot: RequestSnapshot, requestId: string) {
  const request = snapshot.request;
  if (request.type !== "choice" || request.choice.presentation !== "matrix") {
    throw new Error(`Review request ${requestId} is not a matrix choice.`);
  }
  return request.choice;
}

function selectedFactorId(
  selection: ReviewSubjectSelection | null,
  requestId: string,
): string | null {
  if (
    selection?.requestId !== requestId ||
    selection.subjectKind !== "factor"
  ) {
    return null;
  }
  return selection.subjectId;
}

function confirmedOptionId(response: ReviewResponse | null): string | null {
  if (response?.type !== "choice") {
    return null;
  }
  return response.choice.optionIds[0] ?? null;
}

export function ChoiceMatrixSection({
  section,
}: {
  section: WorkspaceSection;
}) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const request = snapshot.request;
  const choice = matrixChoice(snapshot, requestId);
  const selectedOption = review.selectedOptions[requestId] ?? null;
  const selectedFactor = selectedFactorId(review.selection, requestId);
  const responseOption = confirmedOptionId(snapshot.response);

  return (
    <div className="review-choice review-choice-matrix-wrap">
      <p className="review-requested-decision">{request.requestedDecision}</p>
      <div className={`review-choice-table-scroll ${NO_WHEEL_CLASS_NAME}`}>
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

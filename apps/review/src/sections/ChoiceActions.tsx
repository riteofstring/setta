import { useState } from "react";

import { useReview } from "../app/reviewContext";

export function ChoiceActions({ requestId }: { requestId: string }) {
  const review = useReview();
  const [showRevision, setShowRevision] = useState(false);
  const [revision, setRevision] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const selected = review.selectedOptions[requestId] ?? null;
  const busy = review.busyRequestId === requestId;

  const requestChanges = async () => {
    try {
      setFormError(null);
      await review.actions.requestChanges(requestId, revision);
      setShowRevision(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to request changes.",
      );
    }
  };

  return (
    <div className="review-choice-actions">
      {showRevision ? (
        <div className="review-revision-form">
          <label>
            <span>What should change?</span>
            <textarea
              aria-label="Requested changes"
              autoFocus
              disabled={busy}
              onChange={(event) => setRevision(event.currentTarget.value)}
              placeholder="Describe the revision, or draw directly on an artifact."
              rows={3}
              value={revision}
            />
          </label>
          <div>
            <button
              disabled={busy}
              onClick={() => void requestChanges()}
              type="button"
            >
              Send feedback
            </button>
            <button
              disabled={busy}
              onClick={() => setShowRevision(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
          {formError ? (
            <p className="review-form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="review-choice-action-row">
          <button
            className="review-primary-action"
            disabled={!selected || busy}
            onClick={() => void review.actions.confirmChoice(requestId, "")}
            type="button"
          >
            Confirm choice
          </button>
          <button
            disabled={busy}
            onClick={() => setShowRevision(true)}
            type="button"
          >
            Request changes
          </button>
        </div>
      )}
    </div>
  );
}

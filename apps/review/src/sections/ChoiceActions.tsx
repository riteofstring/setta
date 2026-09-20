import { useState } from "react";

import { useReview } from "../app/reviewContext";
import {
  confirmedChoiceOptionId,
  findRequestSnapshot,
} from "../app/reviewModel";

export function ChoiceActions({ requestId }: { requestId: string }) {
  const review = useReview();
  const [showRevision, setShowRevision] = useState(false);
  const [revision, setRevision] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "revision" | null
  >(null);
  const selected = review.selectedOptions[requestId] ?? null;
  const busy = review.busyRequestId === requestId;
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const response =
    snapshot.response?.type === "choice" ? snapshot.response : null;
  const confirmed =
    selected !== null && confirmedChoiceOptionId(response) === selected;
  const changesRequested = response?.choice.outcome === "changesRequested";

  const requestChanges = async () => {
    try {
      setFormError(null);
      setPendingAction("revision");
      await review.actions.requestChanges(requestId, revision);
      setShowRevision(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to request changes.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const confirmChoice = async () => {
    try {
      setFormError(null);
      setPendingAction("confirm");
      await review.actions.confirmChoice(requestId, "");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to confirm the choice.",
      );
    } finally {
      setPendingAction(null);
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
              disabled={busy || pendingAction !== null}
              onChange={(event) => setRevision(event.currentTarget.value)}
              placeholder="Describe the revision, or draw directly on an artifact."
              rows={3}
              value={revision}
            />
          </label>
          <div>
            <button
              disabled={busy || pendingAction !== null}
              onClick={() => void requestChanges()}
              type="button"
            >
              {pendingAction === "revision" ? "Sending…" : "Send feedback"}
            </button>
            <button
              disabled={busy || pendingAction !== null}
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
            aria-pressed={confirmed}
            className={confirmed ? undefined : "review-primary-action"}
            data-action-state={confirmed ? "confirmed" : undefined}
            disabled={!selected || busy || pendingAction !== null || confirmed}
            onClick={() => void confirmChoice()}
            type="button"
          >
            {pendingAction === "confirm"
              ? "Saving…"
              : confirmed
                ? "✓ Choice confirmed"
                : "Confirm choice"}
          </button>
          <button
            aria-pressed={changesRequested}
            data-action-state={
              changesRequested ? "changes-requested" : undefined
            }
            disabled={busy || pendingAction !== null}
            onClick={() => {
              setFormError(null);
              setShowRevision(true);
            }}
            type="button"
          >
            {changesRequested ? "✓ Changes requested" : "Request changes"}
          </button>
        </div>
      )}
      {!showRevision && formError ? (
        <p className="review-form-error" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

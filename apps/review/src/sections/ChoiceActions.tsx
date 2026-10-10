import { useState } from "react";

import { useReview } from "../app/reviewContext";
import { reviewDraftKey, useReviewTextDraft } from "../app/reviewDrafts";
import {
  confirmedChoiceOptionId,
  findRequestSnapshot,
} from "../app/reviewModel";

export function ChoiceActions({ requestId }: { requestId: string }) {
  const review = useReview();
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const draft = useReviewTextDraft(
    reviewDraftKey(review.snapshot.project.id, snapshot, "feedback"),
    "",
  );
  const [showRevision, setShowRevision] = useState(draft.hasDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "revision" | null
  >(null);
  const disabled = review.busyRequestId === requestId || pendingAction !== null;
  const changesRequested =
    snapshot.response?.type === "choice" &&
    snapshot.response.choice.outcome === "changesRequested";

  const requestChanges = async () => {
    try {
      setFormError(null);
      setPendingAction("revision");
      await review.actions.requestChanges(requestId, draft.value);
      draft.saved();
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
      {draft.status ? (
        <p className="review-draft-status" role="status">
          {draft.status}
        </p>
      ) : null}
      {showRevision ? (
        <RevisionForm
          disabled={disabled}
          onCancel={() => setShowRevision(false)}
          onChange={draft.update}
          onSubmit={() => void requestChanges()}
          sending={pendingAction === "revision"}
          value={draft.value}
        />
      ) : (
        <div className="review-choice-action-row">
          <ConfirmationButton
            disabled={disabled}
            onConfirm={() => void confirmChoice()}
            requestId={requestId}
            saving={pendingAction === "confirm"}
          />
          <button
            aria-pressed={changesRequested}
            data-action-state={
              changesRequested ? "changes-requested" : undefined
            }
            disabled={disabled}
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
      {formError ? (
        <p className="review-form-error" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function RevisionForm({
  disabled,
  onCancel,
  onChange,
  onSubmit,
  sending,
  value,
}: {
  disabled: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  value: string;
}) {
  return (
    <div className="review-revision-form">
      <label>
        <span>What should change?</span>
        <textarea
          aria-label="Requested changes"
          autoFocus
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Describe the revision, or draw directly on an artifact."
          rows={3}
          value={value}
        />
      </label>
      <div>
        <button disabled={disabled} onClick={onSubmit} type="button">
          {sending ? "Sending…" : "Send feedback"}
        </button>
        <button disabled={disabled} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmationButton({
  disabled,
  onConfirm,
  requestId,
  saving,
}: {
  disabled: boolean;
  onConfirm: () => void;
  requestId: string;
  saving: boolean;
}) {
  const review = useReview();
  const selected = review.selectedOptions[requestId] ?? null;
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const confirmed =
    selected !== null &&
    confirmedChoiceOptionId(snapshot.response) === selected;
  return (
    <button
      aria-pressed={confirmed}
      className={confirmed ? undefined : "review-primary-action"}
      data-action-state={confirmed ? "confirmed" : undefined}
      disabled={!selected || disabled || confirmed}
      onClick={onConfirm}
      type="button"
    >
      {saving ? "Saving…" : confirmed ? "✓ Choice confirmed" : "Confirm choice"}
    </button>
  );
}

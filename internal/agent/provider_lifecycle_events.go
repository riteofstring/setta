package agent

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

// Provider lifecycle, validation, and request-reconciliation normalizers.
//
// These notifications describe the execution substrate rather than the work:
// whether the provider can still carry the run, what extra checks it is
// applying to the run, and whether a request this app is still showing was
// already answered somewhere else. Each one has a durable Setta owner, so none
// of them reaches the product as raw provider text.

const (
	threadIdleSummary          = "Provider thread is idle"
	threadActiveSummary        = "Provider thread is active"
	threadNotLoadedSummary     = "Provider thread is not loaded"
	threadSystemErrorSummary   = "Provider thread reported a system error"
	threadClosedSummary        = "Provider thread was closed"
	environmentUpSummary       = "Execution environment connected"
	environmentDownSummary     = "Execution environment disconnected"
	guardianReviewSummary      = "Automatic approval review"
	modelVerificationSummary   = "Extra model safety verification is applied to this run"
	guardianRiskPattern        = "%s (risk %s)"
	modelVerificationSeparator = ", "
)

// normalizeThreadStatusChanged makes the provider's own thread status a typed
// lifecycle fact. Idle and active are the substrate working, so they stay
// metadata; a thread that is unloaded or reporting a system error cannot carry
// the run, which is a state the user or the Director has to act on.
func normalizeThreadStatusChanged(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeThreadStatusChangedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	state, summary, err := threadStatusLifecycle(notification.Status)
	if err != nil {
		return nil, nil, err
	}
	return normalizedLifecycle(base, notification.ThreadID, LifecycleEvent{
		State:  state,
		Reason: LifecycleReasonThreadStatus,
		Error:  stringPointer(summary),
	})
}

func threadStatusLifecycle(status codexapp.ThreadStatus) (LifecycleState, string, error) {
	switch status.Type {
	case codexapp.ThreadStatusTypeIdle:
		return LifecycleStateReady, threadIdleSummary, nil
	case codexapp.ThreadStatusTypeActive:
		return LifecycleStateReady, threadActiveSummary, nil
	case codexapp.ThreadStatusTypeNotLoaded:
		return LifecycleStateUnavailable, threadNotLoadedSummary, nil
	case codexapp.ThreadStatusTypeSystemError:
		return LifecycleStateUnavailable, threadSystemErrorSummary, nil
	default:
		return "", "", fmt.Errorf("unsupported provider thread status %q", status.Type)
	}
}

// normalizeEnvironmentConnected records an attached execution environment as
// healthy metadata.
func normalizeEnvironmentConnected(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeEnvironmentConnectionNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedLifecycle(base, notification.ThreadID, LifecycleEvent{
		State:  LifecycleStateReady,
		Reason: LifecycleReasonEnvironmentConnected,
		Error:  stringPointer(environmentUpSummary),
	})
}

// normalizeEnvironmentDisconnected records a lost execution environment. The
// run cannot make progress without one, so this is the state that becomes
// visible.
func normalizeEnvironmentDisconnected(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeEnvironmentConnectionNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedLifecycle(base, notification.ThreadID, LifecycleEvent{
		State:  LifecycleStateUnavailable,
		Reason: LifecycleReasonEnvironmentDisconnected,
		Error:  stringPointer(environmentDownSummary),
	})
}

// normalizeThreadClosed reconciles provider session teardown into Setta run
// liveness. The provider closing the session under an active turn means this
// run has no substrate left.
func normalizeThreadClosed(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeThreadClosedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedLifecycle(base, notification.ThreadID, LifecycleEvent{
		State:  LifecycleStateClosed,
		Reason: LifecycleReasonThreadClosed,
		Error:  stringPointer(threadClosedSummary),
	})
}

// normalizedLifecycle emits one typed lifecycle event for a thread-scoped
// provider notification. These notifications name no turn, so the adapter
// asserts thread scope and attributes the fact to the run the thread is
// currently executing.
func normalizedLifecycle(base Event, threadID string, lifecycle LifecycleEvent) ([]Event, *TerminalEvent, error) {
	if err := requireProviderThreadScope(base, threadID); err != nil {
		return nil, nil, err
	}
	event := base
	event.Kind = EventKindLifecycleChanged
	event.Lifecycle = &lifecycle
	return []Event{event}, nil, nil
}

func requireProviderThreadScope(base Event, threadID string) error {
	if threadID != base.ProviderThreadID {
		return fmt.Errorf("provider event thread %s does not match active thread %s", threadID, base.ProviderThreadID)
	}
	return nil
}

// normalizeGuardianReviewStarted records that the provider began reviewing
// whether a declared action needs the user's approval.
func normalizeGuardianReviewStarted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeItemGuardianApprovalReviewStartedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedGuardianReview(
		base,
		notification.ThreadID,
		notification.TurnID,
		notification.ReviewId,
		notification.TargetItemId,
		notification.Review,
	)
}

// normalizeGuardianReviewCompleted records the review's verdict. The upstream
// payload is marked unstable, so only the review id, the target item, the typed
// status, and the typed risk level cross the adapter.
func normalizeGuardianReviewCompleted(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeItemGuardianApprovalReviewCompletedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	return normalizedGuardianReview(
		base,
		notification.ThreadID,
		notification.TurnID,
		notification.ReviewId,
		notification.TargetItemId,
		notification.Review,
	)
}

func normalizedGuardianReview(
	base Event,
	threadID string,
	turnID string,
	reviewID string,
	targetItemID *string,
	review codexapp.GuardianApprovalReview,
) ([]Event, *TerminalEvent, error) {
	if err := requireProviderScope(base, threadID, turnID); err != nil {
		return nil, nil, err
	}
	status, err := guardianReviewStatus(review.Status)
	if err != nil {
		return nil, nil, err
	}
	return normalizedValidation(base, ValidationEvent{
		ID:      reviewID,
		Kind:    ValidationKindGuardianReview,
		Status:  status,
		Subject: cloneString(targetItemID),
		Summary: guardianReviewSummaryText(review),
	})
}

func guardianReviewStatus(status codexapp.GuardianApprovalReviewStatus) (ValidationStatus, error) {
	switch status {
	case codexapp.GuardianApprovalReviewStatusInProgress:
		return ValidationStatusInProgress, nil
	case codexapp.GuardianApprovalReviewStatusApproved:
		return ValidationStatusPassed, nil
	case codexapp.GuardianApprovalReviewStatusDenied:
		return ValidationStatusFailed, nil
	// A review that timed out or was aborted produced no verdict, which is not
	// the same fact as one that allowed or rejected the action.
	case codexapp.GuardianApprovalReviewStatusTimedOut, codexapp.GuardianApprovalReviewStatusAborted:
		return ValidationStatusInconclusive, nil
	default:
		return "", fmt.Errorf("unsupported provider guardian review status %q", status)
	}
}

// guardianReviewSummaryText prefers the provider's own rationale, because it is
// the only text that says why the review decided what it did. The typed risk
// level is appended rather than parsed out of that sentence.
func guardianReviewSummaryText(review codexapp.GuardianApprovalReview) string {
	summary := guardianReviewSummary
	if review.Rationale != nil && strings.TrimSpace(*review.Rationale) != "" {
		summary = strings.TrimSpace(*review.Rationale)
	}
	if review.RiskLevel == nil {
		return summary
	}
	return fmt.Sprintf(guardianRiskPattern, summary, *review.RiskLevel)
}

// normalizeModelVerification records the extra safety verification the provider
// applied to this run. The provider never reports a verdict for it, so it stays
// an in-progress check that explains the run's added latency instead of
// claiming an outcome it does not have.
func normalizeModelVerification(raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeModelVerificationNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderScope(base, notification.ThreadID, notification.TurnID); err != nil {
		return nil, nil, err
	}
	if len(notification.Verifications) == 0 {
		return nil, nil, nil
	}
	return normalizedValidation(base, ValidationEvent{
		ID:      notification.TurnID,
		Kind:    ValidationKindModelVerification,
		Status:  ValidationStatusInProgress,
		Summary: modelVerificationSummaryText(notification.Verifications),
	})
}

func modelVerificationSummaryText(verifications []codexapp.ModelVerification) string {
	names := make([]string, 0, len(verifications))
	for _, verification := range verifications {
		names = append(names, string(verification))
	}
	return modelVerificationSummary + ": " + strings.Join(names, modelVerificationSeparator)
}

func normalizedValidation(base Event, validation ValidationEvent) ([]Event, *TerminalEvent, error) {
	event := base
	event.Kind = EventKindValidationRecorded
	event.ProviderEventID = stringPointer(validation.ID)
	event.Validation = &validation
	return []Event{event}, nil, nil
}

// normalizeServerRequestResolved reconciles a request the provider resolved
// somewhere else. The notification is broadcast to every subscribed client
// including the one that answered, so the pending table is the trusted answer
// to whether this app is still waiting: a request this runtime already answered
// is gone from it and produces no event.
func normalizeServerRequestResolved(runtime *Runtime, raw []byte, base Event) ([]Event, *TerminalEvent, error) {
	notification, err := codexapp.DecodeServerRequestResolvedNotification(raw)
	if err != nil {
		return nil, nil, err
	}
	if err := requireProviderThreadScope(base, notification.ThreadID); err != nil {
		return nil, nil, err
	}
	requestID, err := providerRequestIDFromNotification(notification.RequestId)
	if err != nil {
		return nil, nil, err
	}
	if !runtime.dropPendingApproval(requestID, base.ConversationID) {
		return nil, nil, nil
	}
	event := base
	event.Kind = EventKindApprovalSuperseded
	event.ProviderEventID = stringPointer(requestID)
	event.ApprovalSuperseded = &ApprovalSupersededEvent{ApprovalID: requestID}
	return []Event{event}, nil, nil
}

// providerRequestIDFromNotification derives the request's identity the same way
// the request path did. Upstream types the id as a string or an integer, so the
// two derivations have to agree or a resolved request would never be found.
func providerRequestIDFromNotification(raw codexapp.RequestId) (string, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("decode provider request id: %w", err)
	}
	return providerRequestID(value)
}

// dropPendingApproval forgets a request the provider already resolved, so a
// later user answer cannot be sent to a request the app server has closed. It
// reports whether this app was still waiting on it.
func (runtime *Runtime) dropPendingApproval(requestID string, conversationID string) bool {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	pending, waiting := runtime.pending[requestID]
	if !waiting || pending.conversationID != conversationID {
		return false
	}
	delete(runtime.pending, requestID)
	return true
}

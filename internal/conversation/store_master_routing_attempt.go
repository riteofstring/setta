package conversation

import "setta/internal/master"

type storedMasterInputRoutingFailure struct {
	Code                string                        `json:"code"`
	Message             string                        `json:"message"`
	Retryable           bool                          `json:"retryable"`
	DiagnosticReference string                        `json:"diagnosticReference"`
	InvocationAttempt   master.RouteInvocationAttempt `json:"invocationAttempt"`
}

func appendMasterRouteInvocationAttemptEvent(
	transaction *WriteTransaction,
	attempt master.RouteInvocationAttempt,
	committedAt string,
) error {
	_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteInvocationAttemptEventID(attempt.InputID, attempt.RoutingAttempt),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteInvocationAttemptedKind,
		Payload:     master.CloneRouteInvocationAttempt(attempt),
		CommittedAt: committedAt,
	})
	return err
}

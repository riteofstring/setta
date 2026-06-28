package chat

type RunLivenessStatus string
type RunLivenessReason string

const (
	RunLivenessAttached    RunLivenessStatus = "attached"
	RunLivenessReconciling RunLivenessStatus = "reconciling"
	RunLivenessLost        RunLivenessStatus = "lost"
	RunLivenessTerminal    RunLivenessStatus = "terminal"

	RunLivenessReasonProviderRefPending RunLivenessReason = "provider_ref_pending"
	RunLivenessReasonProviderTurnLinked RunLivenessReason = "provider_turn_linked"
	RunLivenessReasonAttachmentMissing  RunLivenessReason = "attachment_missing"
	RunLivenessReasonRunTerminal        RunLivenessReason = "run_terminal"
)

var (
	runLivenessStatusValues = []RunLivenessStatus{
		RunLivenessAttached,
		RunLivenessReconciling,
		RunLivenessLost,
		RunLivenessTerminal,
	}
	runLivenessReasonValues = []RunLivenessReason{
		RunLivenessReasonProviderRefPending,
		RunLivenessReasonProviderTurnLinked,
		RunLivenessReasonAttachmentMissing,
		RunLivenessReasonRunTerminal,
	}
)

type RunLiveness struct {
	WorkspaceID         string            `json:"workspaceId"`
	ConversationID      string            `json:"conversationId"`
	RunID               string            `json:"runId"`
	Harness             HarnessKind       `json:"harness"`
	Status              RunLivenessStatus `json:"status"`
	Reason              RunLivenessReason `json:"reason"`
	Retryable           bool              `json:"retryable"`
	Cancellable         bool              `json:"cancellable"`
	ProviderThreadID    string            `json:"providerThreadId"`
	ProviderTurnID      string            `json:"providerTurnId"`
	LastProviderEventAt string            `json:"lastProviderEventAt"`
	LastReconciledAt    string            `json:"lastReconciledAt"`
	Error               string            `json:"error"`
}

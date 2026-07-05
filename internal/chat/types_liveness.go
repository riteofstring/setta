package chat

type RunLivenessStatus string
type RunLivenessReason string

const (
	RunLivenessAttached    RunLivenessStatus = "attached"
	RunLivenessReconciling RunLivenessStatus = "reconciling"
	RunLivenessLost        RunLivenessStatus = "lost"
	RunLivenessTerminal    RunLivenessStatus = "terminal"

	RunLivenessReasonProviderRefPending  RunLivenessReason = "provider_ref_pending"
	RunLivenessReasonProviderTurnLinked  RunLivenessReason = "provider_turn_linked"
	RunLivenessReasonAttachmentMissing   RunLivenessReason = "attachment_missing"
	RunLivenessReasonRunTerminal         RunLivenessReason = "run_terminal"
	RunLivenessReasonWakeRecheck         RunLivenessReason = "wake_recheck"
	RunLivenessReasonSnapshotLoad        RunLivenessReason = "snapshot_load"
	RunLivenessReasonStreamResync        RunLivenessReason = "stream_resync"
	RunLivenessReasonUserRetry           RunLivenessReason = "user_retry"
	RunLivenessReasonProviderRestarted   RunLivenessReason = "provider_restarted"
	RunLivenessReasonProviderUnavailable RunLivenessReason = "provider_unavailable"
	RunLivenessReasonTurnNotFound        RunLivenessReason = "turn_not_found"
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
		RunLivenessReasonWakeRecheck,
		RunLivenessReasonSnapshotLoad,
		RunLivenessReasonStreamResync,
		RunLivenessReasonUserRetry,
		RunLivenessReasonProviderRestarted,
		RunLivenessReasonProviderUnavailable,
		RunLivenessReasonTurnNotFound,
	}
	runLivenessPhaseValues = []RunLivenessPhase{
		RunLivenessPhaseStarting,
		RunLivenessPhaseWaitingForProvider,
		RunLivenessPhaseAttached,
		RunLivenessPhaseStalled,
		RunLivenessPhaseReconnecting,
		RunLivenessPhaseLost,
		RunLivenessPhaseBlocked,
		RunLivenessPhaseTerminal,
	}
	runActiveStatusKindValues = []RunActiveStatusKind{
		RunActiveStatusStarting,
		RunActiveStatusWaitingForProvider,
		RunActiveStatusWorking,
		RunActiveStatusThinking,
		RunActiveStatusWaiting,
		RunActiveStatusStalled,
		RunActiveStatusReconnecting,
		RunActiveStatusConnectionLost,
		RunActiveStatusBlocked,
		RunActiveStatusFinished,
	}
	runActiveHeadlineSourceValues = []RunActiveHeadlineSource{
		RunActiveHeadlineNone,
		RunActiveHeadlineFallback,
		RunActiveHeadlinePublicReasoning,
		RunActiveHeadlineCommand,
		RunActiveHeadlineApproval,
		RunActiveHeadlineLiveness,
		RunActiveHeadlineTerminal,
	}
)

type RunActiveStatus struct {
	Kind           RunActiveStatusKind     `json:"kind"`
	Headline       string                  `json:"headline"`
	HeadlineSource RunActiveHeadlineSource `json:"headlineSource"`
	Detail         string                  `json:"detail"`
}

type RunLiveness struct {
	WorkspaceID           string            `json:"workspaceId"`
	ConversationID        string            `json:"conversationId"`
	RunID                 string            `json:"runId"`
	Harness               HarnessKind       `json:"harness"`
	Status                RunLivenessStatus `json:"status"`
	Reason                RunLivenessReason `json:"reason"`
	Phase                 RunLivenessPhase  `json:"phase"`
	ActiveStatus          RunActiveStatus   `json:"activeStatus"`
	Retryable             bool              `json:"retryable"`
	Cancellable           bool              `json:"cancellable"`
	Steerable             bool              `json:"steerable"`
	SteeringDisabled      string            `json:"steeringDisabledReason"`
	ProviderThreadID      string            `json:"providerThreadId"`
	ProviderTurnID        string            `json:"providerTurnId"`
	LastProviderEventAt   string            `json:"lastProviderEventAt"`
	LastVisibleActivityAt string            `json:"lastVisibleActivityAt"`
	LastReconciledAt      string            `json:"lastReconciledAt"`
	Error                 string            `json:"error"`
}

type RunLivenessReconciliationResult struct {
	Runs []RunLiveness `json:"runs"`
}

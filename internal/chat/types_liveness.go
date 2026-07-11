package chat

type RunLivenessStatus string
type RunLivenessReason string
type RunLivenessPhase string
type RunActiveStatusKind string
type RunActiveHeadlineSource string

const (
	RunLivenessAttached    RunLivenessStatus = "attached"
	RunLivenessReconciling RunLivenessStatus = "reconciling"
	RunLivenessLost        RunLivenessStatus = "lost"
	RunLivenessTerminal    RunLivenessStatus = "terminal"

	RunLivenessReasonProviderRefPending  RunLivenessReason = "provider_ref_pending"
	RunLivenessReasonProviderTurnLinked  RunLivenessReason = "provider_turn_linked"
	RunLivenessReasonProviderInactive    RunLivenessReason = "provider_inactive"
	RunLivenessReasonAttachmentMissing   RunLivenessReason = "attachment_missing"
	RunLivenessReasonRunTerminal         RunLivenessReason = "run_terminal"
	RunLivenessReasonWakeRecheck         RunLivenessReason = "wake_recheck"
	RunLivenessReasonSnapshotLoad        RunLivenessReason = "snapshot_load"
	RunLivenessReasonStreamResync        RunLivenessReason = "stream_resync"
	RunLivenessReasonUserRetry           RunLivenessReason = "user_retry"
	RunLivenessReasonProviderRestarted   RunLivenessReason = "provider_restarted"
	RunLivenessReasonProviderUnavailable RunLivenessReason = "provider_unavailable"
	RunLivenessReasonTurnNotFound        RunLivenessReason = "turn_not_found"

	RunLivenessPhaseStarting           RunLivenessPhase = "starting"
	RunLivenessPhaseWaitingForProvider RunLivenessPhase = "waiting_for_provider"
	RunLivenessPhaseAttached           RunLivenessPhase = "attached"
	RunLivenessPhaseStalled            RunLivenessPhase = "stalled"
	RunLivenessPhaseReconnecting       RunLivenessPhase = "reconnecting"
	RunLivenessPhaseLost               RunLivenessPhase = "lost"
	RunLivenessPhaseBlocked            RunLivenessPhase = "blocked"
	RunLivenessPhaseTerminal           RunLivenessPhase = "terminal"

	RunActiveStatusStarting           RunActiveStatusKind = "starting"
	RunActiveStatusWaitingForProvider RunActiveStatusKind = "waiting_for_provider"
	RunActiveStatusWorking            RunActiveStatusKind = "working"
	RunActiveStatusThinking           RunActiveStatusKind = "thinking"
	RunActiveStatusWaiting            RunActiveStatusKind = "waiting"
	RunActiveStatusStalled            RunActiveStatusKind = "stalled"
	RunActiveStatusReconnecting       RunActiveStatusKind = "reconnecting"
	RunActiveStatusConnectionLost     RunActiveStatusKind = "connection_lost"
	RunActiveStatusBlocked            RunActiveStatusKind = "blocked"
	RunActiveStatusFinished           RunActiveStatusKind = "finished"

	RunActiveHeadlineNone            RunActiveHeadlineSource = "none"
	RunActiveHeadlineFallback        RunActiveHeadlineSource = "fallback"
	RunActiveHeadlinePublicReasoning RunActiveHeadlineSource = "public_reasoning"
	RunActiveHeadlineCommand         RunActiveHeadlineSource = "command"
	RunActiveHeadlineApproval        RunActiveHeadlineSource = "approval"
	RunActiveHeadlineLiveness        RunActiveHeadlineSource = "liveness"
	RunActiveHeadlineTerminal        RunActiveHeadlineSource = "terminal"
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
		RunLivenessReasonProviderInactive,
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
	WorkspaceID            string            `json:"workspaceId"`
	ConversationID         string            `json:"conversationId"`
	RunID                  string            `json:"runId"`
	Harness                HarnessKind       `json:"harness"`
	Status                 RunLivenessStatus `json:"status"`
	Reason                 RunLivenessReason `json:"reason"`
	Phase                  RunLivenessPhase  `json:"phase"`
	ActiveStatus           RunActiveStatus   `json:"activeStatus"`
	Retryable              bool              `json:"retryable"`
	Cancellable            bool              `json:"cancellable"`
	Steerable              bool              `json:"steerable"`
	SteeringDisabledReason string            `json:"steeringDisabledReason"`
	ProviderThreadID       string            `json:"providerThreadId"`
	ProviderTurnID         string            `json:"providerTurnId"`
	LastProviderEventAt    string            `json:"lastProviderEventAt"`
	LastVisibleActivityAt  string            `json:"lastVisibleActivityAt"`
	LastReconciledAt       string            `json:"lastReconciledAt"`
	Error                  string            `json:"error"`
}

type RunLivenessReconciliationResult struct {
	Runs []RunLiveness `json:"runs"`
}

package semanticgraph

type SemanticWorkingSetStatus string

const (
	WorkingSetStatusObserving     SemanticWorkingSetStatus = "observing"
	WorkingSetStatusWindowOpen    SemanticWorkingSetStatus = "window_open"
	WorkingSetStatusQueued        SemanticWorkingSetStatus = "queued"
	WorkingSetStatusRunning       SemanticWorkingSetStatus = "running"
	WorkingSetStatusProposing     SemanticWorkingSetStatus = "proposing"
	WorkingSetStatusApplying      SemanticWorkingSetStatus = "applying"
	WorkingSetStatusPendingReview SemanticWorkingSetStatus = "pending_review"
	WorkingSetStatusApplied       SemanticWorkingSetStatus = "applied"
	WorkingSetStatusNoop          SemanticWorkingSetStatus = "noop"
	WorkingSetStatusRejected      SemanticWorkingSetStatus = "rejected"
	WorkingSetStatusFailed        SemanticWorkingSetStatus = "failed"
	WorkingSetStatusSuperseded    SemanticWorkingSetStatus = "superseded"
)

var semanticWorkingSetStatusValues = []SemanticWorkingSetStatus{
	WorkingSetStatusObserving,
	WorkingSetStatusWindowOpen,
	WorkingSetStatusQueued,
	WorkingSetStatusRunning,
	WorkingSetStatusProposing,
	WorkingSetStatusApplying,
	WorkingSetStatusPendingReview,
	WorkingSetStatusApplied,
	WorkingSetStatusNoop,
	WorkingSetStatusRejected,
	WorkingSetStatusFailed,
	WorkingSetStatusSuperseded,
}

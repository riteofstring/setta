package semanticgraph

type SemanticWorkingSetStatus string
type SemanticWorkingSetPulseKind string

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

	WorkingSetPulseActiveWorkflowSource  SemanticWorkingSetPulseKind = "active_workflow_source"
	WorkingSetPulseCartographerObserving SemanticWorkingSetPulseKind = "cartographer_observing"
	WorkingSetPulseCartographerRunning   SemanticWorkingSetPulseKind = "cartographer_running"
	WorkingSetPulsePatchProposed         SemanticWorkingSetPulseKind = "patch_proposed"
	WorkingSetPulseNodeUpdatedRecent     SemanticWorkingSetPulseKind = "node_updated_recent"
	WorkingSetPulseEvidenceAttached      SemanticWorkingSetPulseKind = "evidence_attached"
	WorkingSetPulseEdgeCreated           SemanticWorkingSetPulseKind = "edge_created"
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

var semanticWorkingSetPulseKindValues = []SemanticWorkingSetPulseKind{
	WorkingSetPulseActiveWorkflowSource,
	WorkingSetPulseCartographerObserving,
	WorkingSetPulseCartographerRunning,
	WorkingSetPulsePatchProposed,
	WorkingSetPulseNodeUpdatedRecent,
	WorkingSetPulseEvidenceAttached,
	WorkingSetPulseEdgeCreated,
}

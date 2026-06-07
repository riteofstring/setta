package semanticgraph

import "encoding/json"

type CartographerRunStatus string
type CartographerRunTriggerKind string
type CartographerWindowStatus string
type CartographerSourceKind string
type CartographerPatchStatus string
type CartographerDiagnosticSeverity string

const (
	CartographerRunPending   CartographerRunStatus = "pending"
	CartographerRunRunning   CartographerRunStatus = "running"
	CartographerRunCompleted CartographerRunStatus = "completed"
	CartographerRunFailed    CartographerRunStatus = "failed"

	CartographerTriggerManual         CartographerRunTriggerKind = "manual"
	CartographerTriggerWorkflowWindow CartographerRunTriggerKind = "workflow_window"
	CartographerTriggerWorkflowDone   CartographerRunTriggerKind = "workflow_done"
	CartographerTriggerExplicitRetry  CartographerRunTriggerKind = "explicit_retry"
	CartographerTriggerExplicitReview CartographerRunTriggerKind = "explicit_review"

	CartographerWindowOpen      CartographerWindowStatus = "open"
	CartographerWindowClosed    CartographerWindowStatus = "closed"
	CartographerWindowProcessed CartographerWindowStatus = "processed"

	CartographerSourceWorkflowExecution CartographerSourceKind = "workflow_execution"
	CartographerSourceChatRun           CartographerSourceKind = "chat_run"
	CartographerSourceSemanticTarget    CartographerSourceKind = "semantic_target"

	CartographerPatchProposed  CartographerPatchStatus = "proposed"
	CartographerPatchValidated CartographerPatchStatus = "validated"
	CartographerPatchRejected  CartographerPatchStatus = "rejected"
	CartographerPatchApplied   CartographerPatchStatus = "applied"

	CartographerDiagnosticInfo    CartographerDiagnosticSeverity = "info"
	CartographerDiagnosticWarning CartographerDiagnosticSeverity = "warning"
	CartographerDiagnosticError   CartographerDiagnosticSeverity = "error"
)

type CartographerRun struct {
	ID             string                     `json:"id"`
	WorkspaceID    string                     `json:"workspaceId"`
	Status         CartographerRunStatus      `json:"status"`
	TriggerKind    CartographerRunTriggerKind `json:"triggerKind"`
	TargetEntityID string                     `json:"targetEntityId"`
	SourceRefs     SemanticContextSourceRefs  `json:"sourceRefs"`
	InputBundle    CartographerInputBundle    `json:"inputBundle"`
	OutputSchema   json.RawMessage            `json:"outputSchema"`
	HarnessKind    string                     `json:"harnessKind"`
	Model          string                     `json:"model"`
	RequestID      string                     `json:"requestId"`
	ResponseID     string                     `json:"responseId"`
	Diagnostics    []CartographerDiagnostic   `json:"diagnostics"`
	CreatedAt      string                     `json:"createdAt"`
	StartedAt      string                     `json:"startedAt"`
	CompletedAt    string                     `json:"completedAt"`
	UpdatedAt      string                     `json:"updatedAt"`
	Error          string                     `json:"error"`
}

type CartographerWindow struct {
	ID          string                   `json:"id"`
	WorkspaceID string                   `json:"workspaceId"`
	RunID       string                   `json:"runId"`
	Status      CartographerWindowStatus `json:"status"`
	Sequence    int                      `json:"sequence"`
	SourceKind  CartographerSourceKind   `json:"sourceKind"`
	SourceID    string                   `json:"sourceId"`
	CursorID    string                   `json:"cursorId"`
	SummaryID   string                   `json:"summaryId"`
	InputBundle CartographerInputBundle  `json:"inputBundle"`
	OpenedAt    string                   `json:"openedAt"`
	ClosedAt    string                   `json:"closedAt"`
	CreatedAt   string                   `json:"createdAt"`
	UpdatedAt   string                   `json:"updatedAt"`
}

type CartographerCursor struct {
	ID             string                 `json:"id"`
	WorkspaceID    string                 `json:"workspaceId"`
	SourceKind     CartographerSourceKind `json:"sourceKind"`
	SourceID       string                 `json:"sourceId"`
	LastEventID    string                 `json:"lastEventId"`
	LastSequence   int                    `json:"lastSequence"`
	LastObservedAt string                 `json:"lastObservedAt"`
	RunID          string                 `json:"runId"`
	UpdatedAt      string                 `json:"updatedAt"`
}

type CartographerTrajectorySummary struct {
	ID          string                    `json:"id"`
	WorkspaceID string                    `json:"workspaceId"`
	RunID       string                    `json:"runId"`
	WindowID    string                    `json:"windowId"`
	SourceKind  CartographerSourceKind    `json:"sourceKind"`
	SourceID    string                    `json:"sourceId"`
	Summary     string                    `json:"summary"`
	SourceRefs  SemanticContextSourceRefs `json:"sourceRefs"`
	ItemCount   int                       `json:"itemCount"`
	CreatedAt   string                    `json:"createdAt"`
}

type CartographerInputBundle struct {
	WorkspaceID         string                          `json:"workspaceId"`
	SourceRefs          SemanticContextSourceRefs       `json:"sourceRefs"`
	TargetEntityID      string                          `json:"targetEntityId"`
	ExistingNodes       []SemanticNode                  `json:"existingNodes"`
	ExistingEdges       []SemanticEdge                  `json:"existingEdges"`
	Evidence            []SemanticEvidenceAnchor        `json:"evidence"`
	Activity            []SemanticActivityInterval      `json:"activity"`
	Steering            []SemanticSteeringDirective     `json:"steering"`
	ContextPacks        []SemanticContextPackRecord     `json:"contextPacks"`
	TrajectorySummaries []CartographerTrajectorySummary `json:"trajectorySummaries"`
	ObservedEventRefs   []string                        `json:"observedEventRefs"`
}

type CartographerPatch struct {
	ID          string                         `json:"id"`
	RunID       string                         `json:"runId"`
	WindowID    string                         `json:"windowId"`
	Operations  []CartographerPatchOperation   `json:"operations"`
	Evidence    []CartographerPatchEvidenceRef `json:"evidence"`
	Confidence  *int                           `json:"confidence"`
	Summary     string                         `json:"summary"`
	RawEnvelope json.RawMessage                `json:"rawEnvelope"`
}

type CartographerPatchOperation struct {
	ID             string          `json:"id"`
	Kind           string          `json:"kind"`
	TargetEntityID string          `json:"targetEntityId"`
	Payload        json.RawMessage `json:"payload"`
}

type CartographerPatchEvidenceRef struct {
	SourceKind       SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID         string                     `json:"sourceId"`
	EvidenceAnchorID string                     `json:"evidenceAnchorId"`
}

type CartographerPatchValidationResult struct {
	PatchID     string                   `json:"patchId"`
	Accepted    bool                     `json:"accepted"`
	Diagnostics []CartographerDiagnostic `json:"diagnostics"`
	ValidatedAt string                   `json:"validatedAt"`
}

type CartographerPatchApplicationResult struct {
	PatchID                 string                   `json:"patchId"`
	Applied                 bool                     `json:"applied"`
	CreatedSemanticEventIDs []string                 `json:"createdSemanticEventIds"`
	Diagnostics             []CartographerDiagnostic `json:"diagnostics"`
	AppliedAt               string                   `json:"appliedAt"`
}

type CartographerPatchRecord struct {
	WorkspaceID             string                             `json:"workspaceId"`
	ID                      string                             `json:"id"`
	RunID                   string                             `json:"runId"`
	WindowID                string                             `json:"windowId"`
	Status                  CartographerPatchStatus            `json:"status"`
	Patch                   CartographerPatch                  `json:"patch"`
	ValidationResult        CartographerPatchValidationResult  `json:"validationResult"`
	ApplicationResult       CartographerPatchApplicationResult `json:"applicationResult"`
	CreatedSemanticEventIDs []string                           `json:"createdSemanticEventIds"`
	CreatedAt               string                             `json:"createdAt"`
	ValidatedAt             string                             `json:"validatedAt"`
	AppliedAt               string                             `json:"appliedAt"`
}

type CartographerDiagnostic struct {
	ID        string                         `json:"id"`
	RunID     string                         `json:"runId"`
	PatchID   string                         `json:"patchId"`
	Severity  CartographerDiagnosticSeverity `json:"severity"`
	Code      string                         `json:"code"`
	Message   string                         `json:"message"`
	Path      string                         `json:"path"`
	CreatedAt string                         `json:"createdAt"`
}

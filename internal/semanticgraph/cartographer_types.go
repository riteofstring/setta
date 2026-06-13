package semanticgraph

import "encoding/json"

type CartographerRunStatus string
type CartographerRunTriggerKind string
type CartographerWindowStatus string
type CartographerSourceKind string
type CartographerPatchStatus string
type CartographerPatchOperation string
type CartographerPatchNodeScope string
type CartographerDiagnosticSeverity string
type CartographerTrajectoryEventSource string
type CartographerWindowCloseReason string

const (
	CartographerRunPending   CartographerRunStatus = "pending"
	CartographerRunRunning   CartographerRunStatus = "running"
	CartographerRunCompleted CartographerRunStatus = "completed"
	CartographerRunFailed    CartographerRunStatus = "failed"
	CartographerRunProposed  CartographerRunStatus = "proposed"
	CartographerRunApplied   CartographerRunStatus = "applied"
	CartographerRunRejected  CartographerRunStatus = "rejected"

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

	CartographerPatchProposed      CartographerPatchStatus = "proposed"
	CartographerPatchValidated     CartographerPatchStatus = "validated"
	CartographerPatchPendingReview CartographerPatchStatus = "pending_review"
	CartographerPatchRejected      CartographerPatchStatus = "rejected"
	CartographerPatchApplied       CartographerPatchStatus = "applied"

	CartographerPatchRecordFinding      CartographerPatchOperation = "record_finding"
	CartographerPatchRecordDecision     CartographerPatchOperation = "record_decision"
	CartographerPatchRecordConstraint   CartographerPatchOperation = "record_constraint"
	CartographerPatchRecordOpenQuestion CartographerPatchOperation = "record_open_question"
	CartographerPatchUpdateNodeSummary  CartographerPatchOperation = "update_node_summary"
	CartographerPatchAttachEvidence     CartographerPatchOperation = "attach_evidence"
	CartographerPatchCreateEdge         CartographerPatchOperation = "create_edge"
	CartographerPatchStartActivity      CartographerPatchOperation = "start_activity"
	CartographerPatchEndActivity        CartographerPatchOperation = "end_activity"
	CartographerPatchSplitNode          CartographerPatchOperation = "split_node"
	CartographerPatchMergeNodes         CartographerPatchOperation = "merge_nodes"
	CartographerPatchMarkResolved       CartographerPatchOperation = "mark_resolved"

	CartographerPatchNodeScopeSession   CartographerPatchNodeScope = "session"
	CartographerPatchNodeScopeWorkspace CartographerPatchNodeScope = "workspace"

	CartographerDiagnosticInfo    CartographerDiagnosticSeverity = "info"
	CartographerDiagnosticWarning CartographerDiagnosticSeverity = "warning"
	CartographerDiagnosticError   CartographerDiagnosticSeverity = "error"

	CartographerTrajectorySourceChat     CartographerTrajectoryEventSource = "chat"
	CartographerTrajectorySourceWorkflow CartographerTrajectoryEventSource = "workflow"

	CartographerCloseRunItemTerminal      CartographerWindowCloseReason = "run_item_terminal"
	CartographerCloseApprovalRequired     CartographerWindowCloseReason = "approval_required"
	CartographerCloseAssistantComplete    CartographerWindowCloseReason = "assistant_complete"
	CartographerCloseAssistantThreshold   CartographerWindowCloseReason = "assistant_threshold"
	CartographerCloseOutputThreshold      CartographerWindowCloseReason = "output_threshold"
	CartographerCloseWorkflowNodeTerminal CartographerWindowCloseReason = "workflow_node_terminal"
	CartographerCloseWorkflowRunTerminal  CartographerWindowCloseReason = "workflow_run_terminal"
	CartographerCloseQuietPeriod          CartographerWindowCloseReason = "quiet_period"
	CartographerCloseManual               CartographerWindowCloseReason = "manual"
)

type CartographerRun struct {
	ID                      string                      `json:"id"`
	WorkspaceID             string                      `json:"workspaceId"`
	Status                  CartographerRunStatus       `json:"status"`
	TriggerKind             CartographerRunTriggerKind  `json:"triggerKind"`
	TargetEntityID          string                      `json:"targetEntityId"`
	SourceRefs              SemanticContextSourceRefs   `json:"sourceRefs"`
	InputBundle             CartographerInputBundle     `json:"inputBundle"`
	OutputSchema            json.RawMessage             `json:"outputSchema"`
	HarnessKind             string                      `json:"harnessKind"`
	Model                   string                      `json:"model"`
	RequestID               string                      `json:"requestId"`
	ResponseID              string                      `json:"responseId"`
	WindowID                string                      `json:"windowId"`
	InputBundleHash         string                      `json:"inputBundleHash"`
	InputItemCounts         CartographerInputItemCounts `json:"inputItemCounts"`
	RawHarnessResponseHash  string                      `json:"rawHarnessResponseHash"`
	TrajectorySummary       string                      `json:"trajectorySummary"`
	CreatedSemanticEventIDs []string                    `json:"createdSemanticEventIds"`
	Diagnostics             []CartographerDiagnostic    `json:"diagnostics"`
	CreatedAt               string                      `json:"createdAt"`
	StartedAt               string                      `json:"startedAt"`
	CompletedAt             string                      `json:"completedAt"`
	UpdatedAt               string                      `json:"updatedAt"`
	Error                   string                      `json:"error"`
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
	ID                         string         `json:"id"`
	WorkspaceID                string         `json:"workspaceId"`
	WorkflowExecutionID        string         `json:"workflowExecutionId"`
	WorkflowNodeExecutionID    string         `json:"workflowNodeExecutionId"`
	ChatConversationID         string         `json:"chatConversationId"`
	ChatRunID                  string         `json:"chatRunId"`
	LastChatEventStreamID      string         `json:"lastChatEventStreamId"`
	LastChatEventSequence      int            `json:"lastChatEventSequence"`
	LastWorkflowEventCursor    string         `json:"lastWorkflowEventCursor"`
	LastOutputOrdinalByRunItem map[string]int `json:"lastOutputOrdinalByRunItem"`
	LastWindowID               string         `json:"lastWindowId"`
	UpdatedAt                  string         `json:"updatedAt"`
}

type CartographerCursorKey struct {
	WorkspaceID             string `json:"workspaceId"`
	WorkflowExecutionID     string `json:"workflowExecutionId"`
	WorkflowNodeExecutionID string `json:"workflowNodeExecutionId"`
	ChatConversationID      string `json:"chatConversationId"`
	ChatRunID               string `json:"chatRunId"`
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
	WorkspaceID              string                          `json:"workspaceId"`
	TriggerKind              CartographerRunTriggerKind      `json:"triggerKind"`
	SourceRefs               SemanticContextSourceRefs       `json:"sourceRefs"`
	TargetEntityID           string                          `json:"targetEntityId"`
	RunStatus                string                          `json:"runStatus"`
	TerminalReason           string                          `json:"terminalReason"`
	WindowID                 string                          `json:"windowId"`
	WindowStartCursor        CartographerWindowCursor        `json:"windowStartCursor"`
	WindowEndCursor          CartographerWindowCursor        `json:"windowEndCursor"`
	NewEvents                []CartographerTrajectoryEvent   `json:"newEvents"`
	PromptSummary            string                          `json:"promptSummary"`
	PromptText               string                          `json:"promptText"`
	AssistantResponseSummary string                          `json:"assistantResponseSummary"`
	AssistantText            string                          `json:"assistantText"`
	ToolCalls                []CartographerToolCallSummary   `json:"toolCalls"`
	FileChanges              []CartographerFileChangeSummary `json:"fileChanges"`
	TestResults              []CartographerTestResultSummary `json:"testResults"`
	OutputSummaries          []CartographerOutputSummary     `json:"outputSummaries"`
	ExistingNodes            []SemanticNode                  `json:"existingNodes"`
	ExistingEdges            []SemanticEdge                  `json:"existingEdges"`
	Evidence                 []SemanticEvidenceAnchor        `json:"evidence"`
	Activity                 []SemanticActivityInterval      `json:"activity"`
	Steering                 []SemanticSteeringDirective     `json:"steering"`
	ContextPacks             []SemanticContextPackRecord     `json:"contextPacks"`
	TrajectorySummaries      []CartographerTrajectorySummary `json:"trajectorySummaries"`
	ObservedEventRefs        []string                        `json:"observedEventRefs"`
	TokenBudget              int                             `json:"tokenBudget"`
	Truncation               CartographerInputTruncation     `json:"truncation"`
}

type CartographerWindowCursor struct {
	ChatEventStreamID      string         `json:"chatEventStreamId"`
	ChatEventSequence      int            `json:"chatEventSequence"`
	WorkflowEventCursor    string         `json:"workflowEventCursor"`
	OutputOrdinalByRunItem map[string]int `json:"outputOrdinalByRunItem"`
}

type CartographerTrajectoryEvent struct {
	Source               CartographerTrajectoryEventSource `json:"source"`
	EventID              string                            `json:"eventId"`
	Type                 string                            `json:"type"`
	StreamID             string                            `json:"streamId"`
	Sequence             int                               `json:"sequence"`
	WorkflowEventCursor  string                            `json:"workflowEventCursor"`
	OccurredAt           string                            `json:"occurredAt"`
	SourceRefs           SemanticContextSourceRefs         `json:"sourceRefs"`
	ChatMessageID        string                            `json:"chatMessageId"`
	RunItemID            string                            `json:"runItemId"`
	RunItemType          string                            `json:"runItemType"`
	RunItemStatus        string                            `json:"runItemStatus"`
	RunStatus            string                            `json:"runStatus"`
	OutputStream         string                            `json:"outputStream"`
	OutputOrdinal        int                               `json:"outputOrdinal"`
	Summary              string                            `json:"summary"`
	Boundary             bool                              `json:"boundary"`
	CloseReason          CartographerWindowCloseReason     `json:"closeReason"`
	OriginalContentBytes int                               `json:"originalContentBytes"`
	IncludedContentBytes int                               `json:"includedContentBytes"`
	Truncated            bool                              `json:"truncated"`
}

type CartographerToolCallSummary struct {
	RunItemID     string `json:"runItemId"`
	Type          string `json:"type"`
	Status        string `json:"status"`
	Title         string `json:"title"`
	Command       string `json:"command"`
	Cwd           string `json:"cwd"`
	ToolName      string `json:"toolName"`
	ServerName    string `json:"serverName"`
	ResultSummary string `json:"resultSummary"`
	Error         string `json:"error"`
	ExitCode      int    `json:"exitCode"`
}

type CartographerFileChangeSummary struct {
	RunItemID   string   `json:"runItemId"`
	Status      string   `json:"status"`
	FilePaths   []string `json:"filePaths"`
	PatchStatus string   `json:"patchStatus"`
	DiffSummary string   `json:"diffSummary"`
}

type CartographerTestResultSummary struct {
	RunItemID string `json:"runItemId"`
	Command   string `json:"command"`
	ExitCode  int    `json:"exitCode"`
	Result    string `json:"result"`
	Error     string `json:"error"`
}

type CartographerOutputSummary struct {
	RunItemID    string `json:"runItemId"`
	Stream       string `json:"stream"`
	StartOrdinal int    `json:"startOrdinal"`
	EndOrdinal   int    `json:"endOrdinal"`
	Summary      string `json:"summary"`
	Truncated    bool   `json:"truncated"`
}

type CartographerInputTruncation struct {
	OriginalEventCount   int      `json:"originalEventCount"`
	IncludedEventCount   int      `json:"includedEventCount"`
	OriginalContentBytes int      `json:"originalContentBytes"`
	IncludedContentBytes int      `json:"includedContentBytes"`
	Summarized           bool     `json:"summarized"`
	Split                bool     `json:"split"`
	SegmentIndex         int      `json:"segmentIndex"`
	SegmentCount         int      `json:"segmentCount"`
	Reasons              []string `json:"reasons"`
	DeterministicSummary string   `json:"deterministicSummary"`
}

type CartographerInputItemCounts struct {
	NewEvents           int `json:"newEvents"`
	ToolCalls           int `json:"toolCalls"`
	FileChanges         int `json:"fileChanges"`
	TestResults         int `json:"testResults"`
	OutputSummaries     int `json:"outputSummaries"`
	ExistingNodes       int `json:"existingNodes"`
	ExistingEdges       int `json:"existingEdges"`
	Evidence            int `json:"evidence"`
	Activity            int `json:"activity"`
	Steering            int `json:"steering"`
	ContextPacks        int `json:"contextPacks"`
	TrajectorySummaries int `json:"trajectorySummaries"`
	ObservedEventRefs   int `json:"observedEventRefs"`
}

type CartographerPatchEnvelope struct {
	Patches []CartographerPatch `json:"patches"`
}

type CartographerPatch struct {
	ID             string                         `json:"patchId"`
	Operation      CartographerPatchOperation     `json:"operation"`
	WorkspaceID    string                         `json:"workspaceId"`
	SourceRefs     SemanticContextSourceRefs      `json:"sourceRefs"`
	CausationID    string                         `json:"causationId"`
	CorrelationID  string                         `json:"correlationId"`
	Confidence     *float64                       `json:"confidence"`
	PublicSummary  string                         `json:"publicSummary"`
	EvidenceRefs   []CartographerPatchEvidenceRef `json:"evidenceRefs"`
	ModelInfo      map[string]string              `json:"modelInfo"`
	ReviewRequired bool                           `json:"reviewRequired"`
	Payload        CartographerPatchPayload       `json:"payload"`
}

type CartographerPatchPayload struct {
	SemanticNodeID     string                         `json:"semanticNodeId"`
	TargetEntityID     string                         `json:"targetEntityId"`
	NewNode            *CartographerPatchNewNode      `json:"newNode"`
	Summary            string                         `json:"summary"`
	EdgeID             string                         `json:"edgeId"`
	EdgeKind           *SemanticEdgeKind              `json:"edgeKind"`
	FromNodeID         string                         `json:"fromNodeId"`
	ToNodeID           string                         `json:"toNodeId"`
	Label              string                         `json:"label"`
	ActivityID         string                         `json:"activityId"`
	ActivityKind       *SemanticActivityKind          `json:"activityKind"`
	ActivitySourceKind *SemanticActivitySourceKind    `json:"activitySourceKind"`
	ActivitySourceID   string                         `json:"activitySourceId"`
	EvidenceAnchorID   string                         `json:"evidenceAnchorId"`
	SourceNodeID       string                         `json:"sourceNodeId"`
	NewNodes           []CartographerPatchNewNode     `json:"newNodes"`
	SourceNodeIDs      []string                       `json:"sourceNodeIds"`
	TargetNode         *CartographerPatchNewNode      `json:"targetNode"`
	ResolutionNodeID   string                         `json:"resolutionNodeId"`
	EvidenceRefs       []CartographerPatchEvidenceRef `json:"evidenceRefs"`
	Reassignments      SemanticReassignmentInputs     `json:"reassignments"`
}

type CartographerPatchNewNode struct {
	SemanticNodeID string                         `json:"semanticNodeId"`
	Kind           SemanticNodeKind               `json:"kind"`
	Label          string                         `json:"label"`
	Summary        string                         `json:"summary"`
	Scope          CartographerPatchNodeScope     `json:"scope"`
	EvidenceRefs   []CartographerPatchEvidenceRef `json:"evidenceRefs"`
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

type CartographerRunFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	TargetEntityID      string `json:"targetEntityId"`
	Limit               int    `json:"limit"`
}

type CartographerRunList struct {
	WorkspaceID string            `json:"workspaceId"`
	Runs        []CartographerRun `json:"runs"`
	Limit       int               `json:"limit"`
}

type CartographerRunReadResponse struct {
	Run *CartographerRun `json:"run"`
}

type CartographerWindowFilter struct {
	WorkspaceID         string                 `json:"workspaceId"`
	RunID               string                 `json:"runId"`
	SourceKind          CartographerSourceKind `json:"sourceKind"`
	SourceID            string                 `json:"sourceId"`
	WorkflowExecutionID string                 `json:"workflowExecutionId"`
	ChatRunID           string                 `json:"chatRunId"`
	Limit               int                    `json:"limit"`
}

type CartographerWindowList struct {
	WorkspaceID string               `json:"workspaceId"`
	Windows     []CartographerWindow `json:"windows"`
	Limit       int                  `json:"limit"`
}

type CartographerCursorFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Limit               int    `json:"limit"`
}

type CartographerCursorList struct {
	WorkspaceID string               `json:"workspaceId"`
	Cursors     []CartographerCursor `json:"cursors"`
	Limit       int                  `json:"limit"`
}

type CartographerPatchFilter struct {
	WorkspaceID      string                  `json:"workspaceId"`
	RunID            string                  `json:"runId"`
	SemanticTargetID string                  `json:"semanticTargetId"`
	Status           CartographerPatchStatus `json:"status"`
	Limit            int                     `json:"limit"`
}

type CartographerPatchList struct {
	WorkspaceID string                    `json:"workspaceId"`
	Patches     []CartographerPatchRecord `json:"patches"`
	Limit       int                       `json:"limit"`
}

type CartographerWindowBuildResult struct {
	Run     CartographerRun                `json:"run"`
	Window  CartographerWindow             `json:"window"`
	Summary *CartographerTrajectorySummary `json:"summary"`
}

type CartographerPatchReviewResult struct {
	Run        CartographerRun         `json:"run"`
	Patch      CartographerPatchRecord `json:"patch"`
	Events     []SemanticEvent         `json:"events"`
	NodeDetail *SemanticNodeDetail     `json:"nodeDetail"`
}

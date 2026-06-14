package semanticgraph

import (
	"encoding/json"

	"setta/internal/chat"
)

type CartographerRunStatus string
type CartographerRunTriggerKind string
type CartographerTaskProfile string
type CartographerWindowStatus string
type CartographerSourceKind string
type CartographerPatchStatus string
type CartographerPatchOperation string
type CartographerPatchNodeScope string
type CartographerDiagnosticSeverity string
type CartographerTrajectoryEventSource string
type CartographerWindowCloseReason string
type CartographerObservationKind string

const (
	CartographerRunQueued        CartographerRunStatus = "queued"
	CartographerRunRunning       CartographerRunStatus = "running"
	CartographerRunCompletedNoop CartographerRunStatus = "completed_noop"
	CartographerRunApplied       CartographerRunStatus = "applied"
	CartographerRunPendingReview CartographerRunStatus = "pending_review"
	CartographerRunFailed        CartographerRunStatus = "failed"
	CartographerRunSuperseded    CartographerRunStatus = "superseded"
	CartographerRunCancelled     CartographerRunStatus = "cancelled"
	CartographerRunAbandoned     CartographerRunStatus = "abandoned"
	CartographerRunRejected      CartographerRunStatus = "rejected"

	CartographerTriggerManual         CartographerRunTriggerKind = "manual"
	CartographerTriggerWorkflowWindow CartographerRunTriggerKind = "workflow_window"
	CartographerTriggerWorkflowDone   CartographerRunTriggerKind = "workflow_done"
	CartographerTriggerExplicitRetry  CartographerRunTriggerKind = "explicit_retry"
	CartographerTriggerExplicitReview CartographerRunTriggerKind = "explicit_review"

	CartographerTaskProfileLiveWindow     CartographerTaskProfile = "live_window"
	CartographerTaskProfileFinalSynthesis CartographerTaskProfile = "final_synthesis"
	CartographerTaskProfileManual         CartographerTaskProfile = "manual"
	CartographerTaskProfileRetry          CartographerTaskProfile = "retry"
	CartographerTaskProfileReview         CartographerTaskProfile = "review"

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

	CartographerCloseNone                 CartographerWindowCloseReason = "none"
	CartographerCloseRunItemTerminal      CartographerWindowCloseReason = "run_item_terminal"
	CartographerCloseApprovalRequired     CartographerWindowCloseReason = "approval_required"
	CartographerCloseAssistantComplete    CartographerWindowCloseReason = "assistant_complete"
	CartographerCloseAssistantThreshold   CartographerWindowCloseReason = "assistant_threshold"
	CartographerCloseOutputThreshold      CartographerWindowCloseReason = "output_threshold"
	CartographerCloseWorkflowNodeTerminal CartographerWindowCloseReason = "workflow_node_terminal"
	CartographerCloseWorkflowRunTerminal  CartographerWindowCloseReason = "workflow_run_terminal"
	CartographerCloseQuietPeriod          CartographerWindowCloseReason = "quiet_period"
	CartographerCloseManual               CartographerWindowCloseReason = "manual"

	CartographerObservationPromptMessage               CartographerObservationKind = "prompt_message"
	CartographerObservationAssistantMessageCompleted   CartographerObservationKind = "assistant_message_completed"
	CartographerObservationAssistantTextChunkAggregate CartographerObservationKind = "assistant_text_chunk_aggregate"
	CartographerObservationCommandStarted              CartographerObservationKind = "command_started"
	CartographerObservationCommandCompleted            CartographerObservationKind = "command_completed"
	CartographerObservationCommandFailed               CartographerObservationKind = "command_failed"
	CartographerObservationFileReadObserved            CartographerObservationKind = "file_read_observed"
	CartographerObservationFileChangeObserved          CartographerObservationKind = "file_change_observed"
	CartographerObservationDiffObserved                CartographerObservationKind = "diff_observed"
	CartographerObservationTestResultObserved          CartographerObservationKind = "test_result_observed"
	CartographerObservationWorkflowNodeStarted         CartographerObservationKind = "workflow_node_started"
	CartographerObservationWorkflowNodeCompleted       CartographerObservationKind = "workflow_node_completed"
	CartographerObservationApprovalRequested           CartographerObservationKind = "approval_requested"
	CartographerObservationRunCompleted                CartographerObservationKind = "run_completed"
)

type CartographerRun struct {
	ID                        string                             `json:"id"`
	WorkspaceID               string                             `json:"workspaceId"`
	Status                    CartographerRunStatus              `json:"status"`
	TriggerKind               CartographerRunTriggerKind         `json:"triggerKind"`
	TargetEntityID            string                             `json:"targetEntityId"`
	SourceRefs                SemanticContextSourceRefs          `json:"sourceRefs"`
	InputBundle               CartographerInputBundle            `json:"inputBundle"`
	OutputSchema              json.RawMessage                    `json:"outputSchema"`
	HarnessKind               string                             `json:"harnessKind"`
	SettingsHash              string                             `json:"settingsHash"`
	TaskProfile               CartographerTaskProfile            `json:"taskProfile"`
	RequestedModelSelection   SemanticCartographerModelSelection `json:"requestedModelSelection"`
	RequestedModel            string                             `json:"requestedModel"`
	EffectiveModel            string                             `json:"effectiveModel"`
	ReportedModel             string                             `json:"reportedModel"`
	RequestedReasoningEffort  chat.ReasoningEffort               `json:"requestedReasoningEffort"`
	RequestedInputBudget      int                                `json:"requestedInputBudget"`
	EffectiveReasoningEffort  string                             `json:"effectiveReasoningEffort"`
	ReportedReasoningEffort   string                             `json:"reportedReasoningEffort"`
	ReasoningEffortReported   bool                               `json:"reasoningEffortReported"`
	RequestID                 string                             `json:"requestId"`
	ResponseID                string                             `json:"responseId"`
	WindowID                  string                             `json:"windowId"`
	SourceEpochID             string                             `json:"sourceEpochId"`
	SourceKey                 string                             `json:"sourceKey"`
	Priority                  int                                `json:"priority"`
	LeaseOwner                string                             `json:"leaseOwner"`
	LeaseDeadline             string                             `json:"leaseDeadline"`
	AttemptCount              int                                `json:"attemptCount"`
	InputBundleHash           string                             `json:"inputBundleHash"`
	InputBundleBytes          int                                `json:"inputBundleBytes"`
	InputBundleCharacterCount int                                `json:"inputBundleCharacterCount"`
	InputItemCounts           CartographerInputItemCounts        `json:"inputItemCounts"`
	OutputSchemaBytes         int                                `json:"outputSchemaBytes"`
	RawHarnessResponseHash    string                             `json:"rawHarnessResponseHash"`
	RawHarnessResponseBytes   int                                `json:"rawHarnessResponseBytes"`
	CloseReason               CartographerWindowCloseReason      `json:"closeReason"`
	QueueWaitMS               int                                `json:"queueWaitMs"`
	HarnessDurationMS         int                                `json:"harnessDurationMs"`
	ValidationDurationMS      int                                `json:"validationDurationMs"`
	ApplicationDurationMS     int                                `json:"applicationDurationMs"`
	TotalDurationMS           int                                `json:"totalDurationMs"`
	TrajectorySummary         string                             `json:"trajectorySummary"`
	CreatedSemanticEventIDs   []string                           `json:"createdSemanticEventIds"`
	Diagnostics               []CartographerDiagnostic           `json:"diagnostics"`
	GraphUsefulnessScore      CartographerGraphUsefulnessScore   `json:"graphUsefulnessScore"`
	CreatedAt                 string                             `json:"createdAt"`
	StartedAt                 string                             `json:"startedAt"`
	CompletedAt               string                             `json:"completedAt"`
	UpdatedAt                 string                             `json:"updatedAt"`
	Error                     string                             `json:"error"`
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
	Observations             []CartographerObservationRecord `json:"observations"`
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
	RetrievalResults         []SemanticRetrievalResult       `json:"retrievalResults"`
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
	MessageRole          string                            `json:"messageRole"`
	MessageStatus        string                            `json:"messageStatus"`
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

type CartographerObservationRecord struct {
	Kind                    CartographerObservationKind       `json:"kind"`
	Source                  CartographerTrajectoryEventSource `json:"source"`
	EventID                 string                            `json:"eventId"`
	Type                    string                            `json:"type"`
	WorkspaceID             string                            `json:"workspaceId"`
	WorkflowDefinitionID    string                            `json:"workflowDefinitionId"`
	WorkflowExecutionID     string                            `json:"workflowExecutionId"`
	WorkflowNodeID          string                            `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                            `json:"workflowNodeExecutionId"`
	ChatConversationID      string                            `json:"chatConversationId"`
	ChatRunID               string                            `json:"chatRunId"`
	ChatMessageID           string                            `json:"chatMessageId"`
	MessageRole             string                            `json:"messageRole"`
	MessageStatus           string                            `json:"messageStatus"`
	RunItemID               string                            `json:"runItemId"`
	ProviderItemID          string                            `json:"providerItemId"`
	RunItemType             string                            `json:"runItemType"`
	RunItemStatus           string                            `json:"runItemStatus"`
	RunStatus               string                            `json:"runStatus"`
	FilePath                string                            `json:"filePath"`
	FilePaths               []string                          `json:"filePaths"`
	RangeStart              int                               `json:"rangeStart"`
	RangeEnd                int                               `json:"rangeEnd"`
	Command                 string                            `json:"command"`
	Cwd                     string                            `json:"cwd"`
	ExitCode                int                               `json:"exitCode"`
	OutputStream            string                            `json:"outputStream"`
	OutputOrdinal           int                               `json:"outputOrdinal"`
	Summary                 string                            `json:"summary"`
	TextExcerpt             string                            `json:"textExcerpt"`
	ContentHash             string                            `json:"contentHash"`
	OccurredAt              string                            `json:"occurredAt"`
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
	OriginalEventCount            int                         `json:"originalEventCount"`
	IncludedEventCount            int                         `json:"includedEventCount"`
	OriginalContentBytes          int                         `json:"originalContentBytes"`
	IncludedContentBytes          int                         `json:"includedContentBytes"`
	OriginalItemCounts            CartographerInputItemCounts `json:"originalItemCounts"`
	IncludedItemCounts            CartographerInputItemCounts `json:"includedItemCounts"`
	DroppedItemCounts             CartographerInputItemCounts `json:"droppedItemCounts"`
	FoldedWindowCount             int                         `json:"foldedWindowCount"`
	SerializedInputBytes          int                         `json:"serializedInputBytes"`
	SerializedInputCharacterCount int                         `json:"serializedInputCharacterCount"`
	InputBudgetCharacters         int                         `json:"inputBudgetCharacters"`
	StructuredTaskCharacterLimit  int                         `json:"structuredTaskCharacterLimit"`
	BudgetExceeded                bool                        `json:"budgetExceeded"`
	Summarized                    bool                        `json:"summarized"`
	Split                         bool                        `json:"split"`
	SegmentIndex                  int                         `json:"segmentIndex"`
	SegmentCount                  int                         `json:"segmentCount"`
	Reasons                       []string                    `json:"reasons"`
	DeterministicSummary          string                      `json:"deterministicSummary"`
}

type CartographerInputItemCounts struct {
	NewEvents           int `json:"newEvents"`
	Observations        int `json:"observations"`
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
	RetrievalResults    int `json:"retrievalResults"`
	TrajectorySummaries int `json:"trajectorySummaries"`
	ObservedEventRefs   int `json:"observedEventRefs"`
}

type CartographerGraphUsefulnessKindCount struct {
	Kind  string `json:"kind"`
	Count int    `json:"count"`
}

type CartographerGraphUsefulnessScore struct {
	AppliedPatches                               int                                    `json:"appliedPatches"`
	NoopPatches                                  int                                    `json:"noopPatches"`
	RejectedPatches                              int                                    `json:"rejectedPatches"`
	DuplicateEvidencePrevented                   int                                    `json:"duplicateEvidencePrevented"`
	CreatedNodesByKind                           []CartographerGraphUsefulnessKindCount `json:"createdNodesByKind"`
	CreatedEdgesByKind                           []CartographerGraphUsefulnessKindCount `json:"createdEdgesByKind"`
	SourceLinksBySourceKind                      []CartographerGraphUsefulnessKindCount `json:"sourceLinksBySourceKind"`
	ActivityTargetCount                          int                                    `json:"activityTargetCount"`
	ActivityCoveredTargetCount                   int                                    `json:"activityCoveredTargetCount"`
	ActivityCoveragePercent                      int                                    `json:"activityCoveragePercent"`
	LivePulseLatencySampleCount                  int                                    `json:"livePulseLatencySampleCount"`
	CommittedUpdateLatencySampleCount            int                                    `json:"committedUpdateLatencySampleCount"`
	MedianSourceEventToVisibleLivePulseMs        int                                    `json:"medianSourceEventToVisibleLivePulseMs"`
	MedianSourceEventToCommittedSemanticUpdateMs int                                    `json:"medianSourceEventToCommittedSemanticUpdateMs"`
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

type CartographerWindowProcessResult struct {
	Run     CartographerRun           `json:"run"`
	Window  CartographerWindow        `json:"window"`
	Patches []CartographerPatchRecord `json:"patches"`
	Events  []SemanticEvent           `json:"events"`
}

type CartographerPatchReviewResult struct {
	Run        CartographerRun         `json:"run"`
	Patch      CartographerPatchRecord `json:"patch"`
	Events     []SemanticEvent         `json:"events"`
	NodeDetail *SemanticNodeDetail     `json:"nodeDetail"`
}

type AutomaticCartographerProcessingConfig struct {
	MaxConcurrent        int `json:"maxConcurrent"`
	PerSourceConcurrent  int `json:"perSourceConcurrent"`
	LeaseDurationSeconds int `json:"leaseDurationSeconds"`
	MaxQueuedPerSource   int `json:"maxQueuedPerSource"`
}

type CartographerProcessingQueueItem struct {
	WorkspaceID   string                     `json:"workspaceId"`
	WindowID      string                     `json:"windowId"`
	RunID         string                     `json:"runId"`
	Status        CartographerRunStatus      `json:"status"`
	TriggerKind   CartographerRunTriggerKind `json:"triggerKind"`
	SourceEpochID string                     `json:"sourceEpochId"`
	SourceKey     string                     `json:"sourceKey"`
	Priority      int                        `json:"priority"`
	LeaseOwner    string                     `json:"leaseOwner"`
	LeaseDeadline string                     `json:"leaseDeadline"`
	AttemptCount  int                        `json:"attemptCount"`
	EnqueuedAt    string                     `json:"enqueuedAt"`
	StartedAt     string                     `json:"startedAt"`
	CompletedAt   string                     `json:"completedAt"`
	Position      int                        `json:"position"`
}

type CartographerProcessingFailure struct {
	WorkspaceID string `json:"workspaceId"`
	WindowID    string `json:"windowId"`
	RunID       string `json:"runId"`
	SourceKey   string `json:"sourceKey"`
	Message     string `json:"message"`
	FailedAt    string `json:"failedAt"`
}

type CartographerProcessingRunAuditSummary struct {
	WorkspaceID               string                             `json:"workspaceId"`
	RunID                     string                             `json:"runId"`
	WindowID                  string                             `json:"windowId"`
	Status                    CartographerRunStatus              `json:"status"`
	TaskProfile               CartographerTaskProfile            `json:"taskProfile"`
	RequestedModelSelection   SemanticCartographerModelSelection `json:"requestedModelSelection"`
	RequestedModel            string                             `json:"requestedModel"`
	EffectiveModel            string                             `json:"effectiveModel"`
	ReportedModel             string                             `json:"reportedModel"`
	RequestedReasoningEffort  chat.ReasoningEffort               `json:"requestedReasoningEffort"`
	EffectiveReasoningEffort  string                             `json:"effectiveReasoningEffort"`
	ReportedReasoningEffort   string                             `json:"reportedReasoningEffort"`
	ReasoningEffortReported   bool                               `json:"reasoningEffortReported"`
	InputBundleBytes          int                                `json:"inputBundleBytes"`
	InputBundleCharacterCount int                                `json:"inputBundleCharacterCount"`
	CloseReason               CartographerWindowCloseReason      `json:"closeReason"`
	HarnessDurationMS         int                                `json:"harnessDurationMs"`
	TotalDurationMS           int                                `json:"totalDurationMs"`
	CompletedAt               string                             `json:"completedAt"`
	Error                     string                             `json:"error"`
}

type CartographerProcessingState struct {
	Enabled                   bool                                   `json:"enabled"`
	Started                   bool                                   `json:"started"`
	MaxConcurrent             int                                    `json:"maxConcurrent"`
	PerSourceConcurrent       int                                    `json:"perSourceConcurrent"`
	SettingsHash              string                                 `json:"settingsHash"`
	EffectiveProcessingConfig SemanticCartographerProcessingConfig   `json:"effectiveProcessingConfig"`
	QueuedWindowCount         int                                    `json:"queuedWindowCount"`
	RunningWindowCount        int                                    `json:"runningWindowCount"`
	QueuedWindows             []CartographerProcessingQueueItem      `json:"queuedWindows"`
	RunningWindows            []CartographerProcessingQueueItem      `json:"runningWindows"`
	DurableQueuedWindowCount  int                                    `json:"durableQueuedWindowCount"`
	DurableRunningWindowCount int                                    `json:"durableRunningWindowCount"`
	StaleLeaseCount           int                                    `json:"staleLeaseCount"`
	SupersededWindowCount     int                                    `json:"supersededWindowCount"`
	CompletedNoopRunCount     int                                    `json:"completedNoopRunCount"`
	FailedRunCount            int                                    `json:"failedRunCount"`
	PendingReviewPatchCount   int                                    `json:"pendingReviewPatchCount"`
	LastAppliedPatchID        string                                 `json:"lastAppliedPatchId"`
	LastAppliedAt             string                                 `json:"lastAppliedAt"`
	LastNoopRunID             string                                 `json:"lastNoopRunId"`
	LastNoopAt                string                                 `json:"lastNoopAt"`
	LastNoopReason            string                                 `json:"lastNoopReason"`
	LastSupersededWindowID    string                                 `json:"lastSupersededWindowId"`
	LastSupersededAt          string                                 `json:"lastSupersededAt"`
	ConcurrencyGuidance       string                                 `json:"concurrencyGuidance"`
	LastProcessedWorkspaceID  string                                 `json:"lastProcessedWorkspaceId"`
	LastProcessedWindowID     string                                 `json:"lastProcessedWindowId"`
	LastProcessedRunID        string                                 `json:"lastProcessedRunId"`
	LastProcessedAt           string                                 `json:"lastProcessedAt"`
	LastProcessedRunSummary   *CartographerProcessingRunAuditSummary `json:"lastProcessedRunSummary"`
	LastFailure               *CartographerProcessingFailure         `json:"lastFailure"`
	LastFailureRunSummary     *CartographerProcessingRunAuditSummary `json:"lastFailureRunSummary"`
	CreatedSemanticEventIDs   []string                               `json:"createdSemanticEventIds"`
}

type CartographerProcessingRecoveryResult struct {
	State            CartographerProcessingState       `json:"state"`
	RecoveredCount   int                               `json:"recoveredCount"`
	RecoveredWindows []CartographerProcessingQueueItem `json:"recoveredWindows"`
	AbandonedCount   int                               `json:"abandonedCount"`
	AbandonedWindows []CartographerProcessingQueueItem `json:"abandonedWindows"`
}

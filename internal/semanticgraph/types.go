package semanticgraph

import "encoding/json"

const SchemaVersion = 1

type SemanticNodeKind string
type SemanticEdgeKind string
type SemanticActivityKind string
type SemanticActivitySourceKind string
type SemanticEventType string
type SemanticActorKind string
type SemanticEvidenceSourceKind string
type SemanticSteeringKind string
type SemanticSteeringStatus string
type SemanticSteeringScope string
type SemanticContextTriggerKind string
type SemanticContextPackItemKind string
type SemanticContextPackPriority string
type SemanticGraphChangeArea string

const (
	NodeKindConcept    SemanticNodeKind = "concept"
	NodeKindQuestion   SemanticNodeKind = "question"
	NodeKindHypothesis SemanticNodeKind = "hypothesis"
	NodeKindFinding    SemanticNodeKind = "finding"
	NodeKindDecision   SemanticNodeKind = "decision"
	NodeKindConstraint SemanticNodeKind = "constraint"

	EdgeKindAbout      SemanticEdgeKind = "about"
	EdgeKindTouches    SemanticEdgeKind = "touches"
	EdgeKindSupports   SemanticEdgeKind = "supports"
	EdgeKindRefutes    SemanticEdgeKind = "refutes"
	EdgeKindResolves   SemanticEdgeKind = "resolves"
	EdgeKindConstrains SemanticEdgeKind = "constrains"
	EdgeKindRelatedTo  SemanticEdgeKind = "related_to"

	ActivityKindExploring  SemanticActivityKind = "exploring"
	ActivityKindEditing    SemanticActivityKind = "editing"
	ActivityKindDebugging  SemanticActivityKind = "debugging"
	ActivityKindValidating SemanticActivityKind = "validating"
	ActivityKindBlocked    SemanticActivityKind = "blocked"

	ActivitySourceWorkflowExecution SemanticActivitySourceKind = "workflow_execution"
	ActivitySourceWorkflowNode      SemanticActivitySourceKind = "workflow_node"
	ActivitySourceChatRun           SemanticActivitySourceKind = "chat_run"
	ActivitySourceChatMessage       SemanticActivitySourceKind = "chat_message"
	ActivitySourceRunItem           SemanticActivitySourceKind = "run_item"
	ActivitySourceFileRange         SemanticActivitySourceKind = "file_range"
	ActivitySourceTest              SemanticActivitySourceKind = "test"
	ActivitySourceDiff              SemanticActivitySourceKind = "diff"
	ActivitySourceCommand           SemanticActivitySourceKind = "command"

	EventNodeCreated             SemanticEventType = "node.created"
	EventNodeUpdated             SemanticEventType = "node.updated"
	EventNodeRenamed             SemanticEventType = "node.renamed"
	EventNodeDismissed           SemanticEventType = "node.dismissed"
	EventNodePromoted            SemanticEventType = "node.promoted"
	EventNodeSplit               SemanticEventType = "node.split"
	EventNodeMerged              SemanticEventType = "node.merged"
	EventEdgeCreated             SemanticEventType = "edge.created"
	EventEdgeUpdated             SemanticEventType = "edge.updated"
	EventEdgeRemoved             SemanticEventType = "edge.removed"
	EventEvidenceAttached        SemanticEventType = "evidence.attached"
	EventActivityStarted         SemanticEventType = "activity.started"
	EventActivityEnded           SemanticEventType = "activity.ended"
	EventSteeringCreated         SemanticEventType = "steering.created"
	EventSteeringUpdated         SemanticEventType = "steering.updated"
	EventContextPackCreated      SemanticEventType = "context_pack.created"
	EventConstraintCheckRecorded SemanticEventType = "constraint_check.recorded"

	ActorKindUser         SemanticActorKind = "user"
	ActorKindAssistant    SemanticActorKind = "assistant"
	ActorKindService      SemanticActorKind = "service"
	ActorKindSystem       SemanticActorKind = "system"
	ActorKindCartographer SemanticActorKind = "cartographer"

	EvidenceSourceChatMessage       SemanticEvidenceSourceKind = "chat_message"
	EvidenceSourceRunItem           SemanticEvidenceSourceKind = "run_item"
	EvidenceSourceFileRange         SemanticEvidenceSourceKind = "file_range"
	EvidenceSourceDiff              SemanticEvidenceSourceKind = "diff"
	EvidenceSourceTest              SemanticEvidenceSourceKind = "test"
	EvidenceSourceWorkflowNode      SemanticEvidenceSourceKind = "workflow_node"
	EvidenceSourceWorkflowExecution SemanticEvidenceSourceKind = "workflow_execution"
	EvidenceSourceChatRun           SemanticEvidenceSourceKind = "chat_run"
	EvidenceSourcePrompt            SemanticEvidenceSourceKind = "prompt"
	EvidenceSourceLog               SemanticEvidenceSourceKind = "log"
	EvidenceSourceDocument          SemanticEvidenceSourceKind = "document"

	SteeringKindFocus        SemanticSteeringKind = "focus"
	SteeringKindAvoid        SemanticSteeringKind = "avoid"
	SteeringKindValidate     SemanticSteeringKind = "validate"
	SteeringKindConstraint   SemanticSteeringKind = "constraint"
	SteeringKindPrompt       SemanticSteeringKind = "prompt"
	SteeringKindSessionPin   SemanticSteeringKind = "session_pin"
	SteeringKindWorkspacePin SemanticSteeringKind = "workspace_pin"

	SteeringStatusCreated    SemanticSteeringStatus = "created"
	SteeringStatusActive     SemanticSteeringStatus = "active"
	SteeringStatusSuperseded SemanticSteeringStatus = "superseded"
	SteeringStatusCompleted  SemanticSteeringStatus = "completed"
	SteeringStatusDismissed  SemanticSteeringStatus = "dismissed"

	SteeringScopeRun       SemanticSteeringScope = "run"
	SteeringScopeSession   SemanticSteeringScope = "session"
	SteeringScopeWorkspace SemanticSteeringScope = "workspace"

	ContextTriggerWorkflowAgentStart      SemanticContextTriggerKind = "workflow_agent_start"
	ContextTriggerSteering                SemanticContextTriggerKind = "steering"
	ContextTriggerImmediateSteeringReplay SemanticContextTriggerKind = "immediate_steering_replay"
	ContextTriggerPhaseBoundary           SemanticContextTriggerKind = "phase_boundary"
	ContextTriggerAgentRequest            SemanticContextTriggerKind = "agent_request"

	ContextPackItemConcept    SemanticContextPackItemKind = "concept"
	ContextPackItemConstraint SemanticContextPackItemKind = "constraint"
	ContextPackItemDecision   SemanticContextPackItemKind = "decision"
	ContextPackItemQuestion   SemanticContextPackItemKind = "question"
	ContextPackItemFinding    SemanticContextPackItemKind = "finding"
	ContextPackItemSteering   SemanticContextPackItemKind = "steering"
	ContextPackItemEvidence   SemanticContextPackItemKind = "evidence"
	ContextPackItemActivity   SemanticContextPackItemKind = "activity"
	ContextPackItemFile       SemanticContextPackItemKind = "file"

	ContextPriorityBackground SemanticContextPackPriority = "background"
	ContextPriorityRelevant   SemanticContextPackPriority = "relevant"
	ContextPriorityImportant  SemanticContextPackPriority = "important"
	ContextPriorityRequired   SemanticContextPackPriority = "required"

	SemanticGraphChangeAreaGraph             SemanticGraphChangeArea = "graph"
	SemanticGraphChangeAreaActivity          SemanticGraphChangeArea = "activity"
	SemanticGraphChangeAreaSteering          SemanticGraphChangeArea = "steering"
	SemanticGraphChangeAreaContextPacks      SemanticGraphChangeArea = "context_packs"
	SemanticGraphChangeAreaCartographerAudit SemanticGraphChangeArea = "cartographer_audit"
	SemanticGraphChangeAreaLayout            SemanticGraphChangeArea = "layout"
)

var (
	semanticNodeKindValues = []SemanticNodeKind{
		NodeKindConcept,
		NodeKindQuestion,
		NodeKindHypothesis,
		NodeKindFinding,
		NodeKindDecision,
		NodeKindConstraint,
	}
	semanticEdgeKindValues = []SemanticEdgeKind{
		EdgeKindAbout,
		EdgeKindTouches,
		EdgeKindSupports,
		EdgeKindRefutes,
		EdgeKindResolves,
		EdgeKindConstrains,
		EdgeKindRelatedTo,
	}
	semanticActivityKindValues = []SemanticActivityKind{
		ActivityKindExploring,
		ActivityKindEditing,
		ActivityKindDebugging,
		ActivityKindValidating,
		ActivityKindBlocked,
	}
	semanticActivitySourceKindValues = []SemanticActivitySourceKind{
		ActivitySourceWorkflowExecution,
		ActivitySourceWorkflowNode,
		ActivitySourceChatRun,
		ActivitySourceChatMessage,
		ActivitySourceRunItem,
		ActivitySourceFileRange,
		ActivitySourceTest,
		ActivitySourceDiff,
		ActivitySourceCommand,
	}
	semanticEventTypeValues = []SemanticEventType{
		EventNodeCreated,
		EventNodeUpdated,
		EventNodeRenamed,
		EventNodeDismissed,
		EventNodePromoted,
		EventNodeSplit,
		EventNodeMerged,
		EventEdgeCreated,
		EventEdgeUpdated,
		EventEdgeRemoved,
		EventEvidenceAttached,
		EventActivityStarted,
		EventActivityEnded,
		EventSteeringCreated,
		EventSteeringUpdated,
		EventContextPackCreated,
		EventConstraintCheckRecorded,
	}
	semanticActorKindValues = []SemanticActorKind{
		ActorKindUser,
		ActorKindAssistant,
		ActorKindService,
		ActorKindSystem,
		ActorKindCartographer,
	}
	semanticEvidenceSourceKindValues = []SemanticEvidenceSourceKind{
		EvidenceSourceChatMessage,
		EvidenceSourceRunItem,
		EvidenceSourceFileRange,
		EvidenceSourceDiff,
		EvidenceSourceTest,
		EvidenceSourceWorkflowNode,
		EvidenceSourceWorkflowExecution,
		EvidenceSourceChatRun,
		EvidenceSourcePrompt,
		EvidenceSourceLog,
		EvidenceSourceDocument,
	}
	semanticSteeringKindValues = []SemanticSteeringKind{
		SteeringKindFocus,
		SteeringKindAvoid,
		SteeringKindValidate,
		SteeringKindConstraint,
		SteeringKindPrompt,
		SteeringKindSessionPin,
		SteeringKindWorkspacePin,
	}
	semanticSteeringStatusValues = []SemanticSteeringStatus{
		SteeringStatusCreated,
		SteeringStatusActive,
		SteeringStatusSuperseded,
		SteeringStatusCompleted,
		SteeringStatusDismissed,
	}
	semanticSteeringScopeValues = []SemanticSteeringScope{
		SteeringScopeRun,
		SteeringScopeSession,
		SteeringScopeWorkspace,
	}
	semanticContextTriggerKindValues = []SemanticContextTriggerKind{
		ContextTriggerWorkflowAgentStart,
		ContextTriggerSteering,
		ContextTriggerImmediateSteeringReplay,
		ContextTriggerPhaseBoundary,
		ContextTriggerAgentRequest,
	}
	semanticContextPackItemKindValues = []SemanticContextPackItemKind{
		ContextPackItemConcept,
		ContextPackItemConstraint,
		ContextPackItemDecision,
		ContextPackItemQuestion,
		ContextPackItemFinding,
		ContextPackItemSteering,
		ContextPackItemEvidence,
		ContextPackItemActivity,
		ContextPackItemFile,
	}
	semanticContextPackPriorityValues = []SemanticContextPackPriority{
		ContextPriorityBackground,
		ContextPriorityRelevant,
		ContextPriorityImportant,
		ContextPriorityRequired,
	}
	semanticGraphChangeAreaValues = []SemanticGraphChangeArea{
		SemanticGraphChangeAreaGraph,
		SemanticGraphChangeAreaActivity,
		SemanticGraphChangeAreaSteering,
		SemanticGraphChangeAreaContextPacks,
		SemanticGraphChangeAreaCartographerAudit,
		SemanticGraphChangeAreaLayout,
	}
	cartographerRunStatusValues = []CartographerRunStatus{
		CartographerRunQueued,
		CartographerRunRunning,
		CartographerRunCompletedNoop,
		CartographerRunApplied,
		CartographerRunPendingReview,
		CartographerRunFailed,
		CartographerRunSuperseded,
		CartographerRunCancelled,
		CartographerRunAbandoned,
		CartographerRunRejected,
	}
	cartographerRunTriggerKindValues = []CartographerRunTriggerKind{
		CartographerTriggerManual,
		CartographerTriggerWorkflowWindow,
		CartographerTriggerWorkflowDone,
		CartographerTriggerExplicitRetry,
		CartographerTriggerExplicitReview,
	}
	cartographerTaskProfileValues = []CartographerTaskProfile{
		CartographerTaskProfileLiveWindow,
		CartographerTaskProfileFinalSynthesis,
		CartographerTaskProfileManual,
		CartographerTaskProfileRetry,
		CartographerTaskProfileReview,
	}
	semanticCartographerModelSelectionValues = []SemanticCartographerModelSelection{
		SemanticCartographerModelSelectionProviderDefault,
		SemanticCartographerModelSelectionExplicit,
	}
	cartographerWindowStatusValues = []CartographerWindowStatus{
		CartographerWindowOpen,
		CartographerWindowClosed,
		CartographerWindowProcessed,
	}
	cartographerSourceKindValues = []CartographerSourceKind{
		CartographerSourceWorkflowExecution,
		CartographerSourceChatRun,
		CartographerSourceSemanticTarget,
	}
	cartographerPatchStatusValues = []CartographerPatchStatus{
		CartographerPatchProposed,
		CartographerPatchValidated,
		CartographerPatchPendingReview,
		CartographerPatchRejected,
		CartographerPatchApplied,
	}
	cartographerPatchOperationValues = []CartographerPatchOperation{
		CartographerPatchRecordFinding,
		CartographerPatchRecordDecision,
		CartographerPatchRecordConstraint,
		CartographerPatchRecordOpenQuestion,
		CartographerPatchUpdateNodeSummary,
		CartographerPatchAttachEvidence,
		CartographerPatchCreateEdge,
		CartographerPatchStartActivity,
		CartographerPatchEndActivity,
		CartographerPatchSplitNode,
		CartographerPatchMergeNodes,
		CartographerPatchMarkResolved,
	}
	cartographerPatchNodeScopeValues = []CartographerPatchNodeScope{
		CartographerPatchNodeScopeSession,
		CartographerPatchNodeScopeWorkspace,
	}
	cartographerDiagnosticSeverityValues = []CartographerDiagnosticSeverity{
		CartographerDiagnosticInfo,
		CartographerDiagnosticWarning,
		CartographerDiagnosticError,
	}
	cartographerTrajectoryEventSourceValues = []CartographerTrajectoryEventSource{
		CartographerTrajectorySourceChat,
		CartographerTrajectorySourceWorkflow,
	}
	cartographerWindowCloseReasonValues = []CartographerWindowCloseReason{
		CartographerCloseNone,
		CartographerCloseRunItemTerminal,
		CartographerCloseApprovalRequired,
		CartographerCloseAssistantComplete,
		CartographerCloseAssistantThreshold,
		CartographerCloseOutputThreshold,
		CartographerCloseWorkflowNodeTerminal,
		CartographerCloseWorkflowRunTerminal,
		CartographerCloseQuietPeriod,
		CartographerCloseManual,
	}
	cartographerObservationKindValues = []CartographerObservationKind{
		CartographerObservationPromptMessage,
		CartographerObservationAssistantMessageCompleted,
		CartographerObservationAssistantTextChunkAggregate,
		CartographerObservationCommandStarted,
		CartographerObservationCommandCompleted,
		CartographerObservationCommandFailed,
		CartographerObservationFileReadObserved,
		CartographerObservationFileChangeObserved,
		CartographerObservationDiffObserved,
		CartographerObservationTestResultObserved,
		CartographerObservationWorkflowNodeStarted,
		CartographerObservationWorkflowNodeCompleted,
		CartographerObservationApprovalRequested,
		CartographerObservationRunCompleted,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "SemanticNodeKind", Values: stringValues(semanticNodeKindValues)},
		{Name: "SemanticEdgeKind", Values: stringValues(semanticEdgeKindValues)},
		{Name: "SemanticActivityKind", Values: stringValues(semanticActivityKindValues)},
		{Name: "SemanticActivitySourceKind", Values: stringValues(semanticActivitySourceKindValues)},
		{Name: "SemanticEventType", Values: stringValues(semanticEventTypeValues)},
		{Name: "SemanticActorKind", Values: stringValues(semanticActorKindValues)},
		{Name: "SemanticEvidenceSourceKind", Values: stringValues(semanticEvidenceSourceKindValues)},
		{Name: "SemanticSteeringKind", Values: stringValues(semanticSteeringKindValues)},
		{Name: "SemanticSteeringStatus", Values: stringValues(semanticSteeringStatusValues)},
		{Name: "SemanticSteeringScope", Values: stringValues(semanticSteeringScopeValues)},
		{Name: "SemanticContextTriggerKind", Values: stringValues(semanticContextTriggerKindValues)},
		{Name: "SemanticContextPackItemKind", Values: stringValues(semanticContextPackItemKindValues)},
		{Name: "SemanticContextPackPriority", Values: stringValues(semanticContextPackPriorityValues)},
		{Name: "SemanticGraphChangeArea", Values: stringValues(semanticGraphChangeAreaValues)},
		{Name: "CartographerRunStatus", Values: stringValues(cartographerRunStatusValues)},
		{Name: "CartographerRunTriggerKind", Values: stringValues(cartographerRunTriggerKindValues)},
		{Name: "CartographerTaskProfile", Values: stringValues(cartographerTaskProfileValues)},
		{Name: "SemanticCartographerModelSelection", Values: stringValues(semanticCartographerModelSelectionValues)},
		{Name: "CartographerWindowStatus", Values: stringValues(cartographerWindowStatusValues)},
		{Name: "CartographerSourceKind", Values: stringValues(cartographerSourceKindValues)},
		{Name: "CartographerPatchStatus", Values: stringValues(cartographerPatchStatusValues)},
		{Name: "CartographerPatchOperation", Values: stringValues(cartographerPatchOperationValues)},
		{Name: "CartographerPatchNodeScope", Values: stringValues(cartographerPatchNodeScopeValues)},
		{Name: "CartographerDiagnosticSeverity", Values: stringValues(cartographerDiagnosticSeverityValues)},
		{Name: "CartographerTrajectoryEventSource", Values: stringValues(cartographerTrajectoryEventSourceValues)},
		{Name: "CartographerWindowCloseReason", Values: stringValues(cartographerWindowCloseReasonValues)},
		{Name: "CartographerObservationKind", Values: stringValues(cartographerObservationKindValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

type SemanticEvent struct {
	EventID             string            `json:"eventId"`
	WorkspaceID         string            `json:"workspaceId"`
	SessionID           string            `json:"sessionId"`
	RunID               string            `json:"runId"`
	WorkflowExecutionID string            `json:"workflowExecutionId"`
	ActorKind           SemanticActorKind `json:"actorKind"`
	ActorID             string            `json:"actorId"`
	EventType           SemanticEventType `json:"eventType"`
	TargetEntityID      string            `json:"targetEntityId"`
	CausationID         string            `json:"causationId"`
	CorrelationID       string            `json:"correlationId"`
	TraceID             string            `json:"traceId"`
	SpanID              string            `json:"spanId"`
	LogicalClock        int               `json:"logicalClock"`
	ObservedAt          string            `json:"observedAt"`
	Payload             json.RawMessage   `json:"payload"`
	ModelInfo           map[string]string `json:"modelInfo"`
	Confidence          *int              `json:"confidence"`
	SupersedesEventID   string            `json:"supersedesEventId"`
	RetractedByEventID  string            `json:"retractedByEventId"`
}

type SemanticNode struct {
	ID               string           `json:"id"`
	WorkspaceID      string           `json:"workspaceId"`
	Kind             SemanticNodeKind `json:"kind"`
	Label            string           `json:"label"`
	Summary          string           `json:"summary"`
	Dismissed        bool             `json:"dismissed"`
	Promoted         bool             `json:"promoted"`
	SplitFromNodeID  string           `json:"splitFromNodeId"`
	SplitIntoNodeIDs []string         `json:"splitIntoNodeIds"`
	MergedIntoNodeID string           `json:"mergedIntoNodeId"`
	CreatedByEventID string           `json:"createdByEventId"`
	UpdatedByEventID string           `json:"updatedByEventId"`
	CreatedAt        string           `json:"createdAt"`
	UpdatedAt        string           `json:"updatedAt"`
}

type SemanticEdge struct {
	ID               string           `json:"id"`
	WorkspaceID      string           `json:"workspaceId"`
	Kind             SemanticEdgeKind `json:"kind"`
	FromNodeID       string           `json:"fromNodeId"`
	ToNodeID         string           `json:"toNodeId"`
	Label            string           `json:"label"`
	Summary          string           `json:"summary"`
	CreatedByEventID string           `json:"createdByEventId"`
	UpdatedByEventID string           `json:"updatedByEventId"`
	CreatedAt        string           `json:"createdAt"`
	UpdatedAt        string           `json:"updatedAt"`
}

type SemanticEvidenceAnchor struct {
	ID                      string                     `json:"id"`
	WorkspaceID             string                     `json:"workspaceId"`
	TargetEntityID          string                     `json:"targetEntityId"`
	SourceKind              SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID                string                     `json:"sourceId"`
	URI                     string                     `json:"uri"`
	Path                    string                     `json:"path"`
	RangeStart              int                        `json:"rangeStart"`
	RangeEnd                int                        `json:"rangeEnd"`
	Text                    string                     `json:"text"`
	Summary                 string                     `json:"summary"`
	ContentHash             string                     `json:"contentHash"`
	WorkflowDefinitionID    string                     `json:"workflowDefinitionId"`
	WorkflowExecutionID     string                     `json:"workflowExecutionId"`
	WorkflowNodeID          string                     `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                     `json:"workflowNodeExecutionId"`
	ChatConversationID      string                     `json:"chatConversationId"`
	ChatRunID               string                     `json:"chatRunId"`
	ChatMessageID           string                     `json:"chatMessageId"`
	RunItemID               string                     `json:"runItemId"`
	ReassignedFromAnchorID  string                     `json:"reassignedFromAnchorId"`
	CreatedByEventID        string                     `json:"createdByEventId"`
	CreatedAt               string                     `json:"createdAt"`
}

type SemanticActivityInterval struct {
	ID                       string                     `json:"id"`
	WorkspaceID              string                     `json:"workspaceId"`
	TargetEntityID           string                     `json:"targetEntityId"`
	Kind                     SemanticActivityKind       `json:"kind"`
	Summary                  string                     `json:"summary"`
	SourceKind               SemanticActivitySourceKind `json:"sourceKind"`
	SourceID                 string                     `json:"sourceId"`
	EvidenceAnchorID         string                     `json:"evidenceAnchorId"`
	WorkflowDefinitionID     string                     `json:"workflowDefinitionId"`
	WorkflowExecutionID      string                     `json:"workflowExecutionId"`
	WorkflowNodeID           string                     `json:"workflowNodeId"`
	WorkflowNodeExecutionID  string                     `json:"workflowNodeExecutionId"`
	ChatConversationID       string                     `json:"chatConversationId"`
	ChatRunID                string                     `json:"chatRunId"`
	ChatMessageID            string                     `json:"chatMessageId"`
	RunItemID                string                     `json:"runItemId"`
	ReassignedFromIntervalID string                     `json:"reassignedFromIntervalId"`
	ActorKind                SemanticActorKind          `json:"actorKind"`
	ActorID                  string                     `json:"actorId"`
	StartedByEventID         string                     `json:"startedByEventId"`
	EndedByEventID           string                     `json:"endedByEventId"`
	StartedAt                string                     `json:"startedAt"`
	EndedAt                  string                     `json:"endedAt"`
	UpdatedAt                string                     `json:"updatedAt"`
}

type SemanticSteeringDirective struct {
	ID                        string                 `json:"id"`
	WorkspaceID               string                 `json:"workspaceId"`
	TargetEntityID            string                 `json:"targetEntityId"`
	Kind                      SemanticSteeringKind   `json:"kind"`
	Instruction               string                 `json:"instruction"`
	Status                    SemanticSteeringStatus `json:"status"`
	Scope                     SemanticSteeringScope  `json:"scope"`
	WorkflowDefinitionID      string                 `json:"workflowDefinitionId"`
	WorkflowExecutionID       string                 `json:"workflowExecutionId"`
	WorkflowNodeID            string                 `json:"workflowNodeId"`
	WorkflowNodeExecutionID   string                 `json:"workflowNodeExecutionId"`
	ChatConversationID        string                 `json:"chatConversationId"`
	ChatRunID                 string                 `json:"chatRunId"`
	ChatMessageID             string                 `json:"chatMessageId"`
	RunItemID                 string                 `json:"runItemId"`
	SupersedesDirectiveID     string                 `json:"supersedesDirectiveId"`
	ReassignedFromDirectiveID string                 `json:"reassignedFromDirectiveId"`
	CreatedByEventID          string                 `json:"createdByEventId"`
	UpdatedByEventID          string                 `json:"updatedByEventId"`
	CreatedAt                 string                 `json:"createdAt"`
	UpdatedAt                 string                 `json:"updatedAt"`
	CompletedAt               string                 `json:"completedAt"`
}

type SemanticContextSourceRefs struct {
	WorkflowDefinitionID    string `json:"workflowDefinitionId"`
	WorkflowExecutionID     string `json:"workflowExecutionId"`
	WorkflowNodeID          string `json:"workflowNodeId"`
	WorkflowNodeExecutionID string `json:"workflowNodeExecutionId"`
	ChatConversationID      string `json:"chatConversationId"`
	ChatRunID               string `json:"chatRunId"`
	ChatMessageID           string `json:"chatMessageId"`
	RunItemID               string `json:"runItemId"`
}

type SemanticContextPackItem struct {
	ItemID              string                      `json:"itemId"`
	Kind                SemanticContextPackItemKind `json:"kind"`
	SemanticNodeID      string                      `json:"semanticNodeId"`
	EvidenceAnchorID    string                      `json:"evidenceAnchorId"`
	ActivityIntervalID  string                      `json:"activityIntervalId"`
	SteeringDirectiveID string                      `json:"steeringDirectiveId"`
	SourceRefs          SemanticContextSourceRefs   `json:"sourceRefs"`
	Title               string                      `json:"title"`
	Summary             string                      `json:"summary"`
	ReasonIncluded      string                      `json:"reasonIncluded"`
	Priority            SemanticContextPackPriority `json:"priority"`
	EstimatedTokens     int                         `json:"estimatedTokens"`
	CreatedAt           string                      `json:"createdAt"`
	UpdatedAt           string                      `json:"updatedAt"`
}

type SemanticContextPackRecord struct {
	ID                   string                     `json:"id"`
	WorkspaceID          string                     `json:"workspaceId"`
	TriggerKind          SemanticContextTriggerKind `json:"triggerKind"`
	TargetEntityID       string                     `json:"targetEntityId"`
	SourceRefs           SemanticContextSourceRefs  `json:"sourceRefs"`
	AuthoredPromptHash   string                     `json:"authoredPromptHash"`
	DeliveredContextHash string                     `json:"deliveredContextHash"`
	TokenBudget          int                        `json:"tokenBudget"`
	EstimatedTokens      int                        `json:"estimatedTokens"`
	ItemCount            int                        `json:"itemCount"`
	Items                []SemanticContextPackItem  `json:"items"`
	DeliveredContext     string                     `json:"deliveredContext"`
	CreatedByEventID     string                     `json:"createdByEventId"`
	CreatedAt            string                     `json:"createdAt"`
}

type SemanticRetrievalResult struct {
	ID                  string                      `json:"id"`
	Source              string                      `json:"source"`
	RecordKind          string                      `json:"recordKind"`
	RecordID            string                      `json:"recordId"`
	SemanticNodeID      string                      `json:"semanticNodeId"`
	EvidenceAnchorID    string                      `json:"evidenceAnchorId"`
	ActivityIntervalID  string                      `json:"activityIntervalId"`
	SteeringDirectiveID string                      `json:"steeringDirectiveId"`
	ContextPackID       string                      `json:"contextPackId"`
	ContextPackItemID   string                      `json:"contextPackItemId"`
	ItemKind            SemanticContextPackItemKind `json:"itemKind"`
	SourceKind          string                      `json:"sourceKind"`
	SourceID            string                      `json:"sourceId"`
	URI                 string                      `json:"uri"`
	Path                string                      `json:"path"`
	SourceRefs          SemanticContextSourceRefs   `json:"sourceRefs"`
	Title               string                      `json:"title"`
	Summary             string                      `json:"summary"`
	Reasons             []string                    `json:"reasons"`
	Score               float64                     `json:"score"`
	FTSScore            float64                     `json:"ftsScore"`
	UpdatedAt           string                      `json:"updatedAt"`
}

type SemanticContextPackReadResponse struct {
	Pack *SemanticContextPackRecord `json:"pack"`
}

type SemanticContextPackList struct {
	WorkspaceID string                      `json:"workspaceId"`
	Packs       []SemanticContextPackRecord `json:"packs"`
	HasMore     bool                        `json:"hasMore"`
	NextOffset  int                         `json:"nextOffset"`
	Offset      int                         `json:"offset"`
	Limit       int                         `json:"limit"`
}

type SemanticContextPackFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	TargetEntityID      string `json:"targetEntityId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Offset              int    `json:"offset"`
	Limit               int    `json:"limit"`
}

type SemanticLayoutPosition struct {
	WorkspaceID string `json:"workspaceId"`
	EntityID    string `json:"entityId"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
	Pinned      bool   `json:"pinned"`
	UpdatedAt   string `json:"updatedAt"`
}

type SemanticLayoutPositionInput struct {
	EntityID string `json:"entityId"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Pinned   bool   `json:"pinned"`
}

type SemanticLayoutPositionList struct {
	WorkspaceID string                   `json:"workspaceId"`
	Positions   []SemanticLayoutPosition `json:"positions"`
}

type SemanticGraph struct {
	WorkspaceID     string                   `json:"workspaceId"`
	Nodes           []SemanticNode           `json:"nodes"`
	Edges           []SemanticEdge           `json:"edges"`
	SourceLinks     []SemanticEvidenceAnchor `json:"sourceLinks"`
	LayoutPositions []SemanticLayoutPosition `json:"layoutPositions"`
}

type SemanticNodeDetail struct {
	WorkspaceID         string                      `json:"workspaceId"`
	Node                SemanticNode                `json:"node"`
	IncomingEdges       []SemanticEdge              `json:"incomingEdges"`
	OutgoingEdges       []SemanticEdge              `json:"outgoingEdges"`
	Evidence            []SemanticEvidenceAnchor    `json:"evidence"`
	Activity            []SemanticActivityInterval  `json:"activity"`
	SteeringDirectives  []SemanticSteeringDirective `json:"steeringDirectives"`
	ContextPackHistory  []SemanticContextPackRecord `json:"contextPackHistory"`
	CartographerPatches []CartographerPatchRecord   `json:"cartographerPatches"`
	CartographerRuns    []CartographerRun           `json:"cartographerRuns"`
	CartographerWindows []CartographerWindow        `json:"cartographerWindows"`
	CartographerCursors []CartographerCursor        `json:"cartographerCursors"`
}

type SemanticEvidenceList struct {
	WorkspaceID    string                   `json:"workspaceId"`
	TargetEntityID string                   `json:"targetEntityId"`
	Evidence       []SemanticEvidenceAnchor `json:"evidence"`
}

type SemanticActivityList struct {
	WorkspaceID    string                     `json:"workspaceId"`
	TargetEntityID string                     `json:"targetEntityId"`
	Activity       []SemanticActivityInterval `json:"activity"`
}

type SemanticActivityPage struct {
	WorkspaceID    string                     `json:"workspaceId"`
	TargetEntityID string                     `json:"targetEntityId"`
	Activity       []SemanticActivityInterval `json:"activity"`
	HasMore        bool                       `json:"hasMore"`
	NextOffset     int                        `json:"nextOffset"`
	Offset         int                        `json:"offset"`
	Limit          int                        `json:"limit"`
}

type SemanticActivityFilter struct {
	WorkspaceID         string                     `json:"workspaceId"`
	TargetEntityID      string                     `json:"targetEntityId"`
	SourceKind          SemanticActivitySourceKind `json:"sourceKind"`
	SourceID            string                     `json:"sourceId"`
	WorkflowExecutionID string                     `json:"workflowExecutionId"`
	WorkflowNodeID      string                     `json:"workflowNodeId"`
	ChatConversationID  string                     `json:"chatConversationId"`
	ChatRunID           string                     `json:"chatRunId"`
	ChatMessageID       string                     `json:"chatMessageId"`
	ActorKind           SemanticActorKind          `json:"actorKind"`
	ActorID             string                     `json:"actorId"`
	Offset              int                        `json:"offset"`
	Limit               int                        `json:"limit"`
}

type SemanticActivityTargetSummary struct {
	TargetEntityID  string                     `json:"targetEntityId"`
	CurrentActivity []SemanticActivityInterval `json:"currentActivity"`
	RecentActivity  []SemanticActivityInterval `json:"recentActivity"`
}

type SemanticActivitySummary struct {
	WorkspaceID string                          `json:"workspaceId"`
	Targets     []SemanticActivityTargetSummary `json:"targets"`
}

type SemanticSteeringState struct {
	WorkspaceID        string                      `json:"workspaceId"`
	TargetEntityID     string                      `json:"targetEntityId"`
	SteeringDirectives []SemanticSteeringDirective `json:"steeringDirectives"`
}

type SemanticEventHistory struct {
	WorkspaceID             string          `json:"workspaceId"`
	TargetEntityID          string          `json:"targetEntityId"`
	Events                  []SemanticEvent `json:"events"`
	HasMoreOlder            bool            `json:"hasMoreOlder"`
	OlderBeforeLogicalClock int             `json:"olderBeforeLogicalClock"`
}

type SemanticAttachmentActor struct {
	ActorKind SemanticActorKind `json:"actorKind"`
	ActorID   string            `json:"actorId"`
}

type AttachWorkflowExecutionInput struct {
	WorkspaceID         string                  `json:"workspaceId"`
	NodeID              string                  `json:"nodeId"`
	WorkflowExecutionID string                  `json:"workflowExecutionId"`
	ActivityKind        SemanticActivityKind    `json:"activityKind"`
	Summary             string                  `json:"summary"`
	Actor               SemanticAttachmentActor `json:"actor"`
}

type AttachWorkflowNodeInput struct {
	WorkspaceID             string                  `json:"workspaceId"`
	NodeID                  string                  `json:"nodeId"`
	WorkflowExecutionID     string                  `json:"workflowExecutionId"`
	WorkflowNodeID          string                  `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                  `json:"workflowNodeExecutionId"`
	WorkflowDefinitionID    string                  `json:"workflowDefinitionId"`
	ActivityKind            SemanticActivityKind    `json:"activityKind"`
	Summary                 string                  `json:"summary"`
	Actor                   SemanticAttachmentActor `json:"actor"`
}

type AttachChatRunInput struct {
	WorkspaceID  string                  `json:"workspaceId"`
	NodeID       string                  `json:"nodeId"`
	ChatRunID    string                  `json:"chatRunId"`
	ActivityKind SemanticActivityKind    `json:"activityKind"`
	Summary      string                  `json:"summary"`
	Actor        SemanticAttachmentActor `json:"actor"`
}

type AttachChatMessageInput struct {
	WorkspaceID        string                  `json:"workspaceId"`
	NodeID             string                  `json:"nodeId"`
	ChatConversationID string                  `json:"chatConversationId"`
	ChatMessageID      string                  `json:"chatMessageId"`
	ActivityKind       SemanticActivityKind    `json:"activityKind"`
	Summary            string                  `json:"summary"`
	Actor              SemanticAttachmentActor `json:"actor"`
}

type AttachRunItemInput struct {
	WorkspaceID  string                  `json:"workspaceId"`
	NodeID       string                  `json:"nodeId"`
	ChatRunID    string                  `json:"chatRunId"`
	RunItemID    string                  `json:"runItemId"`
	ActivityKind SemanticActivityKind    `json:"activityKind"`
	Summary      string                  `json:"summary"`
	Actor        SemanticAttachmentActor `json:"actor"`
}

type AttachFileRangeInput struct {
	WorkspaceID  string                  `json:"workspaceId"`
	NodeID       string                  `json:"nodeId"`
	Path         string                  `json:"path"`
	RangeStart   int                     `json:"rangeStart"`
	RangeEnd     int                     `json:"rangeEnd"`
	ActivityKind SemanticActivityKind    `json:"activityKind"`
	Summary      string                  `json:"summary"`
	Actor        SemanticAttachmentActor `json:"actor"`
}

type EndSemanticActivityInput struct {
	WorkspaceID        string                  `json:"workspaceId"`
	ActivityIntervalID string                  `json:"activityIntervalId"`
	Actor              SemanticAttachmentActor `json:"actor"`
}

type SemanticNodeSeedInput struct {
	NodeID  string           `json:"nodeId"`
	Kind    SemanticNodeKind `json:"kind"`
	Label   string           `json:"label"`
	Summary string           `json:"summary"`
}

type RenameSemanticNodeInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	NodeID      string                  `json:"nodeId"`
	Label       string                  `json:"label"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type UpdateSemanticNodeInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	NodeID      string                  `json:"nodeId"`
	Kind        *SemanticNodeKind       `json:"kind"`
	Summary     *string                 `json:"summary"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type SemanticNodeOperationInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	NodeID      string                  `json:"nodeId"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type SplitSemanticNodeInput struct {
	WorkspaceID   string                     `json:"workspaceId"`
	SourceNodeID  string                     `json:"sourceNodeId"`
	Nodes         []SemanticNodeSeedInput    `json:"nodes"`
	Reassignments SemanticReassignmentInputs `json:"reassignments"`
	Actor         SemanticAttachmentActor    `json:"actor"`
}

type MergeSemanticNodesInput struct {
	WorkspaceID   string                     `json:"workspaceId"`
	SourceNodeIDs []string                   `json:"sourceNodeIds"`
	TargetNode    SemanticNodeSeedInput      `json:"targetNode"`
	Reassignments SemanticReassignmentInputs `json:"reassignments"`
	Actor         SemanticAttachmentActor    `json:"actor"`
}

type CreateSemanticNodeInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	NodeID      string                  `json:"nodeId"`
	Kind        SemanticNodeKind        `json:"kind"`
	Label       string                  `json:"label"`
	Summary     string                  `json:"summary"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type CreateSemanticEdgeInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	EdgeID      string                  `json:"edgeId"`
	Kind        SemanticEdgeKind        `json:"kind"`
	FromNodeID  string                  `json:"fromNodeId"`
	ToNodeID    string                  `json:"toNodeId"`
	Label       string                  `json:"label"`
	Summary     string                  `json:"summary"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type UpdateSemanticEdgeInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	EdgeID      string                  `json:"edgeId"`
	Kind        *SemanticEdgeKind       `json:"kind"`
	Label       *string                 `json:"label"`
	Summary     *string                 `json:"summary"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type SemanticEdgeOperationInput struct {
	WorkspaceID string                  `json:"workspaceId"`
	EdgeID      string                  `json:"edgeId"`
	Actor       SemanticAttachmentActor `json:"actor"`
}

type CreateSteeringDirectiveInput struct {
	WorkspaceID             string                  `json:"workspaceId"`
	TargetEntityID          string                  `json:"targetEntityId"`
	Kind                    SemanticSteeringKind    `json:"kind"`
	Instruction             string                  `json:"instruction"`
	Scope                   SemanticSteeringScope   `json:"scope"`
	WorkflowDefinitionID    string                  `json:"workflowDefinitionId"`
	WorkflowExecutionID     string                  `json:"workflowExecutionId"`
	WorkflowNodeID          string                  `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                  `json:"workflowNodeExecutionId"`
	ChatConversationID      string                  `json:"chatConversationId"`
	ChatRunID               string                  `json:"chatRunId"`
	ChatMessageID           string                  `json:"chatMessageId"`
	RunItemID               string                  `json:"runItemId"`
	Actor                   SemanticAttachmentActor `json:"actor"`
}

type UpdateSteeringDirectiveInput struct {
	WorkspaceID           string                  `json:"workspaceId"`
	DirectiveID           string                  `json:"directiveId"`
	Instruction           *string                 `json:"instruction"`
	Status                *SemanticSteeringStatus `json:"status"`
	SupersedesDirectiveID string                  `json:"supersedesDirectiveId"`
	Actor                 SemanticAttachmentActor `json:"actor"`
}

type SemanticReassignmentInputs struct {
	Edges    []SemanticEdgeReassignmentInput     `json:"edges"`
	Evidence []SemanticEvidenceReassignmentInput `json:"evidence"`
	Activity []SemanticActivityReassignmentInput `json:"activity"`
	Steering []SemanticSteeringReassignmentInput `json:"steering"`
	Layout   []SemanticLayoutReassignmentInput   `json:"layout"`
}

type SemanticEdgeReassignmentInput struct {
	EdgeID       string `json:"edgeId"`
	TargetEdgeID string `json:"targetEdgeId"`
	FromNodeID   string `json:"fromNodeId"`
	ToNodeID     string `json:"toNodeId"`
}

type SemanticEvidenceReassignmentInput struct {
	AnchorID     string `json:"anchorId"`
	TargetNodeID string `json:"targetNodeId"`
}

type SemanticActivityReassignmentInput struct {
	ActivityIntervalID string `json:"activityIntervalId"`
	TargetNodeID       string `json:"targetNodeId"`
}

type SemanticSteeringReassignmentInput struct {
	DirectiveID  string `json:"directiveId"`
	TargetNodeID string `json:"targetNodeId"`
}

type SemanticLayoutReassignmentInput struct {
	EntityID       string `json:"entityId"`
	TargetEntityID string `json:"targetEntityId"`
}

type SemanticAttachmentResult struct {
	WorkspaceID    string                   `json:"workspaceId"`
	TargetEntityID string                   `json:"targetEntityId"`
	Evidence       SemanticEvidenceAnchor   `json:"evidence"`
	Activity       SemanticActivityInterval `json:"activity"`
	Events         []SemanticEvent          `json:"events"`
}

type SemanticActivityEndResult struct {
	WorkspaceID    string                   `json:"workspaceId"`
	TargetEntityID string                   `json:"targetEntityId"`
	Activity       SemanticActivityInterval `json:"activity"`
	Event          SemanticEvent            `json:"event"`
}

type SemanticMutationResult struct {
	WorkspaceID    string              `json:"workspaceId"`
	TargetEntityID string              `json:"targetEntityId"`
	Graph          SemanticGraph       `json:"graph"`
	NodeDetail     *SemanticNodeDetail `json:"nodeDetail"`
	Events         []SemanticEvent     `json:"events"`
}

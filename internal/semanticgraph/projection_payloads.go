package semanticgraph

type nodeCreatedPayload struct {
	NodeID  string           `json:"nodeId"`
	Kind    SemanticNodeKind `json:"kind"`
	Label   string           `json:"label"`
	Summary string           `json:"summary"`
}

type nodeUpdatedPayload struct {
	NodeID  string            `json:"nodeId"`
	Kind    *SemanticNodeKind `json:"kind"`
	Summary *string           `json:"summary"`
}

type nodeRenamedPayload struct {
	NodeID string `json:"nodeId"`
	Label  string `json:"label"`
}

type nodeDismissedPayload struct {
	NodeID string `json:"nodeId"`
}

type nodePromotedPayload struct {
	NodeID string `json:"nodeId"`
}

type nodeSplitPayload struct {
	SourceNodeID string               `json:"sourceNodeId"`
	Nodes        []nodeCreatedPayload `json:"nodes"`
}

type nodeMergedPayload struct {
	SourceNodeIDs []string           `json:"sourceNodeIds"`
	TargetNode    nodeCreatedPayload `json:"targetNode"`
}

type edgeCreatedPayload struct {
	EdgeID     string           `json:"edgeId"`
	Kind       SemanticEdgeKind `json:"kind"`
	FromNodeID string           `json:"fromNodeId"`
	ToNodeID   string           `json:"toNodeId"`
	Label      string           `json:"label"`
	Summary    string           `json:"summary"`
}

type edgeUpdatedPayload struct {
	EdgeID  string            `json:"edgeId"`
	Kind    *SemanticEdgeKind `json:"kind"`
	Label   *string           `json:"label"`
	Summary *string           `json:"summary"`
}

type edgeRemovedPayload struct {
	EdgeID string `json:"edgeId"`
}

type evidenceAttachedPayload struct {
	AnchorID                string                     `json:"anchorId"`
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
}

type activityStartedPayload struct {
	IntervalID               string                     `json:"intervalId"`
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
}

type activityEndedPayload struct {
	IntervalID string `json:"intervalId"`
}

type steeringCreatedPayload struct {
	DirectiveID               string                 `json:"directiveId"`
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
}

type steeringUpdatedPayload struct {
	DirectiveID           string                  `json:"directiveId"`
	Instruction           *string                 `json:"instruction"`
	Status                *SemanticSteeringStatus `json:"status"`
	SupersedesDirectiveID string                  `json:"supersedesDirectiveId"`
}

type contextPackCreatedPayload struct {
	PackID               string                     `json:"packId"`
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
}

type constraintCheckRecordedPayload struct {
	CheckID        string `json:"checkId"`
	TargetEntityID string `json:"targetEntityId"`
	Status         string `json:"status"`
	Message        string `json:"message"`
}

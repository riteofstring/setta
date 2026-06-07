package semanticgraph

import "encoding/json"

const SchemaVersion = 1

type SemanticNodeKind string
type SemanticEdgeKind string
type SemanticActivityKind string
type SemanticEventType string
type SemanticActorKind string
type SemanticEvidenceSourceKind string

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
	EvidenceSourceWorkflowExecution SemanticEvidenceSourceKind = "workflow_execution"
	EvidenceSourcePrompt            SemanticEvidenceSourceKind = "prompt"
	EvidenceSourceLog               SemanticEvidenceSourceKind = "log"
	EvidenceSourceDocument          SemanticEvidenceSourceKind = "document"
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
		EvidenceSourceWorkflowExecution,
		EvidenceSourcePrompt,
		EvidenceSourceLog,
		EvidenceSourceDocument,
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
		{Name: "SemanticEventType", Values: stringValues(semanticEventTypeValues)},
		{Name: "SemanticActorKind", Values: stringValues(semanticActorKindValues)},
		{Name: "SemanticEvidenceSourceKind", Values: stringValues(semanticEvidenceSourceKindValues)},
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
	ID               string                     `json:"id"`
	WorkspaceID      string                     `json:"workspaceId"`
	TargetEntityID   string                     `json:"targetEntityId"`
	SourceKind       SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID         string                     `json:"sourceId"`
	URI              string                     `json:"uri"`
	Path             string                     `json:"path"`
	RangeStart       int                        `json:"rangeStart"`
	RangeEnd         int                        `json:"rangeEnd"`
	Text             string                     `json:"text"`
	Summary          string                     `json:"summary"`
	CreatedByEventID string                     `json:"createdByEventId"`
	CreatedAt        string                     `json:"createdAt"`
}

type SemanticActivityInterval struct {
	ID               string               `json:"id"`
	WorkspaceID      string               `json:"workspaceId"`
	TargetEntityID   string               `json:"targetEntityId"`
	Kind             SemanticActivityKind `json:"kind"`
	Summary          string               `json:"summary"`
	StartedByEventID string               `json:"startedByEventId"`
	EndedByEventID   string               `json:"endedByEventId"`
	StartedAt        string               `json:"startedAt"`
	EndedAt          string               `json:"endedAt"`
	UpdatedAt        string               `json:"updatedAt"`
}

type SemanticSteeringDirective struct {
	ID               string `json:"id"`
	WorkspaceID      string `json:"workspaceId"`
	TargetEntityID   string `json:"targetEntityId"`
	Instruction      string `json:"instruction"`
	Active           bool   `json:"active"`
	CreatedByEventID string `json:"createdByEventId"`
	UpdatedByEventID string `json:"updatedByEventId"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

type SemanticContextPackRecord struct {
	ID               string `json:"id"`
	WorkspaceID      string `json:"workspaceId"`
	TargetEntityID   string `json:"targetEntityId"`
	Summary          string `json:"summary"`
	Prompt           string `json:"prompt"`
	ItemCount        int    `json:"itemCount"`
	CreatedByEventID string `json:"createdByEventId"`
	CreatedAt        string `json:"createdAt"`
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
	LayoutPositions []SemanticLayoutPosition `json:"layoutPositions"`
}

type SemanticNodeDetail struct {
	WorkspaceID        string                      `json:"workspaceId"`
	Node               SemanticNode                `json:"node"`
	IncomingEdges      []SemanticEdge              `json:"incomingEdges"`
	OutgoingEdges      []SemanticEdge              `json:"outgoingEdges"`
	Evidence           []SemanticEvidenceAnchor    `json:"evidence"`
	Activity           []SemanticActivityInterval  `json:"activity"`
	SteeringDirectives []SemanticSteeringDirective `json:"steeringDirectives"`
	ContextPackHistory []SemanticContextPackRecord `json:"contextPackHistory"`
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

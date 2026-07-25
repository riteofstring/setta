package director

import "fmt"

// SemanticNodeKind is the deliberately small catalog of things the command
// center can draw. Every kind names an observable state or an attributable
// interpretation, so a node always tells the user what happened or what is
// needed. There is no generic "struggling" kind: it is subjective, cannot be
// validated, and does not name an action.
type SemanticNodeKind string

const (
	// SemanticNodeWorkstream is the anchor durable workstream registration
	// projects. It is what an idle workstream is: work that exists, is
	// selectable, and has not been asked for anything yet.
	SemanticNodeWorkstream       SemanticNodeKind = "workstream"
	SemanticNodeUserGoal         SemanticNodeKind = "user_goal"
	SemanticNodeDirectorDecision SemanticNodeKind = "director_decision"
	SemanticNodePlan             SemanticNodeKind = "plan"
	SemanticNodeMilestone        SemanticNodeKind = "milestone"
	SemanticNodeDelegation       SemanticNodeKind = "delegation"
	SemanticNodeInvestigation    SemanticNodeKind = "investigation"
	SemanticNodeAction           SemanticNodeKind = "action"
	SemanticNodeResourceRequired SemanticNodeKind = "resource_required"
	SemanticNodeApprovalRequired SemanticNodeKind = "approval_required"
	SemanticNodeArtifact         SemanticNodeKind = "artifact"
	SemanticNodeValidation       SemanticNodeKind = "validation"
	SemanticNodeBlocked          SemanticNodeKind = "blocked"
	SemanticNodeRetry            SemanticNodeKind = "retry"
	SemanticNodeRecovery         SemanticNodeKind = "recovery"
	SemanticNodeCompleted        SemanticNodeKind = "completed"
	SemanticNodeFailed           SemanticNodeKind = "failed"
	SemanticNodeCancelled        SemanticNodeKind = "cancelled"
)

var semanticNodeKinds = []SemanticNodeKind{
	SemanticNodeWorkstream,
	SemanticNodeUserGoal,
	SemanticNodeDirectorDecision,
	SemanticNodePlan,
	SemanticNodeMilestone,
	SemanticNodeDelegation,
	SemanticNodeInvestigation,
	SemanticNodeAction,
	SemanticNodeResourceRequired,
	SemanticNodeApprovalRequired,
	SemanticNodeArtifact,
	SemanticNodeValidation,
	SemanticNodeBlocked,
	SemanticNodeRetry,
	SemanticNodeRecovery,
	SemanticNodeCompleted,
	SemanticNodeFailed,
	SemanticNodeCancelled,
}

// SemanticNodeKinds returns the ordered node catalog.
func SemanticNodeKinds() []SemanticNodeKind {
	return append([]SemanticNodeKind(nil), semanticNodeKinds...)
}

// SemanticNodeStatus is the lifecycle position of one node.
type SemanticNodeStatus string

const (
	// SemanticNodeStatusPending is accepted but not started, such as a queued
	// run or a plan step nothing has begun.
	SemanticNodeStatusPending SemanticNodeStatus = "pending"
	// SemanticNodeStatusActive is progressing now.
	SemanticNodeStatusActive SemanticNodeStatus = "active"
	// SemanticNodeStatusWaiting cannot progress until an approval, resource,
	// or provider lifecycle fact resolves.
	SemanticNodeStatusWaiting   SemanticNodeStatus = "waiting"
	SemanticNodeStatusSucceeded SemanticNodeStatus = "succeeded"
	SemanticNodeStatusFailed    SemanticNodeStatus = "failed"
	SemanticNodeStatusCancelled SemanticNodeStatus = "cancelled"
)

var semanticNodeStatuses = []SemanticNodeStatus{
	SemanticNodeStatusPending,
	SemanticNodeStatusActive,
	SemanticNodeStatusWaiting,
	SemanticNodeStatusSucceeded,
	SemanticNodeStatusFailed,
	SemanticNodeStatusCancelled,
}

// SemanticNodeStatuses returns the ordered status catalog.
func SemanticNodeStatuses() []SemanticNodeStatus {
	return append([]SemanticNodeStatus(nil), semanticNodeStatuses...)
}

// EvidenceClass records where a node's meaning came from. View state —
// selection, hover, camera, expansion — is deliberately absent: it never
// becomes durable semantic truth, so it is not an evidence class a stored node
// can carry.
type EvidenceClass string

const (
	// EvidenceRuntimeFact was emitted by execution, persistence, approval,
	// resource, or artifact systems.
	EvidenceRuntimeFact EvidenceClass = "runtime_fact"
	// EvidenceStructuredDeclaration was emitted by the Director or a worker
	// through a typed protocol field.
	EvidenceStructuredDeclaration EvidenceClass = "structured_declaration"
	// EvidenceDirectorInterpretation is a public, attributable interpretation
	// of supplied facts. It must stay visually distinguishable from a runtime
	// fact.
	EvidenceDirectorInterpretation EvidenceClass = "director_interpretation"
)

var evidenceClasses = []EvidenceClass{
	EvidenceRuntimeFact,
	EvidenceStructuredDeclaration,
	EvidenceDirectorInterpretation,
}

// SemanticActor is who produced the fact. Provider identity, leases, and
// credentials stay behind the execution port; the actor is the product role.
type SemanticActor string

const (
	SemanticActorUser     SemanticActor = "user"
	SemanticActorDirector SemanticActor = "director"
	SemanticActorWorker   SemanticActor = "worker"
	SemanticActorProvider SemanticActor = "provider"
	SemanticActorSystem   SemanticActor = "system"
)

var semanticActors = []SemanticActor{
	SemanticActorUser,
	SemanticActorDirector,
	SemanticActorWorker,
	SemanticActorProvider,
	SemanticActorSystem,
}

// SemanticEdgeKind is the typed relationship catalog. Visual proximity,
// animation, force-layout attraction, and text similarity never create edges.
type SemanticEdgeKind string

const (
	// SemanticEdgeFollowedBy orders visible facts inside one run or workstream.
	SemanticEdgeFollowedBy SemanticEdgeKind = "followed_by"
	// SemanticEdgeDelegatedTo connects a run to the delegation node that
	// received work the provider handed to a subagent.
	SemanticEdgeDelegatedTo SemanticEdgeKind = "delegated_to"
	// SemanticEdgeDependsOn connects queued work and explicit prerequisites.
	SemanticEdgeDependsOn SemanticEdgeKind = "depends_on"
	// SemanticEdgeBlockedBy connects blocked work to the approval, resource,
	// provider lifecycle fact, or failure that blocks it.
	SemanticEdgeBlockedBy SemanticEdgeKind = "blocked_by"
	// SemanticEdgeProduced connects an action or completed run to an artifact.
	SemanticEdgeProduced SemanticEdgeKind = "produced"
	// SemanticEdgeValidatedBy connects an action to an explicit validation fact.
	SemanticEdgeValidatedBy SemanticEdgeKind = "validated_by"
	// SemanticEdgeRecoveredBy connects a failed, interrupted, or unavailable
	// state to the retry or recovery that addressed it.
	SemanticEdgeRecoveredBy SemanticEdgeKind = "recovered_by"
)

var semanticEdgeKinds = []SemanticEdgeKind{
	SemanticEdgeFollowedBy,
	SemanticEdgeDelegatedTo,
	SemanticEdgeDependsOn,
	SemanticEdgeBlockedBy,
	SemanticEdgeProduced,
	SemanticEdgeValidatedBy,
	SemanticEdgeRecoveredBy,
}

// SemanticEdgeKinds returns the ordered edge catalog.
func SemanticEdgeKinds() []SemanticEdgeKind {
	return append([]SemanticEdgeKind(nil), semanticEdgeKinds...)
}

// InterpretationModelIdentity attributes an interpretation to the runtime that
// produced it. It carries no credential, lease, or provider session id.
type InterpretationModelIdentity struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	RuntimeID string `json:"runtimeId"`
}

// InterpretationMetadata is required on every director_interpretation node. The
// node's own public summary and source event ids supply the rest of the
// provenance the plan requires.
type InterpretationMetadata struct {
	InterpretedBy SemanticActor               `json:"interpretedBy"`
	Model         InterpretationModelIdentity `json:"model"`
	// Confidence is present only when a confidence value is meaningful for the
	// interpretation.
	Confidence    *float64 `json:"confidence"`
	InterpretedAt string   `json:"interpretedAt"`
}

// SemanticNode is one visible fact in the command-center graph. Every field is
// Setta-owned: provider ids, provider item ids, and leases stay behind the
// execution port as evidence metadata.
type SemanticNode struct {
	ID            string             `json:"id"`
	Kind          SemanticNodeKind   `json:"kind"`
	WorkstreamID  string             `json:"workstreamId"`
	RunID         *string            `json:"runId"`
	Actor         SemanticActor      `json:"actor"`
	Status        SemanticNodeStatus `json:"status"`
	PublicSummary string             `json:"publicSummary"`
	EvidenceClass EvidenceClass      `json:"evidenceClass"`
	// SourceEventIDs are the durable Setta events this node was projected from.
	// A node without source evidence is invalid.
	SourceEventIDs []string                `json:"sourceEventIds"`
	ArtifactIDs    []string                `json:"artifactIds"`
	CreatedAt      string                  `json:"createdAt"`
	UpdatedAt      string                  `json:"updatedAt"`
	CompletedAt    *string                 `json:"completedAt"`
	Interpretation *InterpretationMetadata `json:"interpretation"`
}

// SemanticEdge is one typed relationship between two nodes of one workstream.
// A relationship is something that happened inside a single workstream's own
// causal chain, so an edge names the workstream that owns it and both endpoints
// resolve inside that workstream's graph.
type SemanticEdge struct {
	ID             string           `json:"id"`
	Kind           SemanticEdgeKind `json:"kind"`
	WorkstreamID   string           `json:"workstreamId"`
	FromNodeID     string           `json:"fromNodeId"`
	ToNodeID       string           `json:"toNodeId"`
	SourceEventIDs []string         `json:"sourceEventIds"`
	CreatedAt      string           `json:"createdAt"`
}

// WorkstreamGraph is the projected semantic graph for one workstream at the
// detail level the registry assigned. Background workstreams carry no graph.
type WorkstreamGraph struct {
	WorkstreamID string                `json:"workstreamId"`
	DetailLevel  WorkstreamDetailLevel `json:"detailLevel"`
	Nodes        []SemanticNode        `json:"nodes"`
	Edges        []SemanticEdge        `json:"edges"`
	// HasEarlier reports that older nodes exist outside this window, so the
	// renderer shows a compaction boundary instead of implying a start.
	HasEarlier bool `json:"hasEarlier"`
}

func isSemanticNodeKind(kind SemanticNodeKind) bool {
	for _, candidate := range semanticNodeKinds {
		if candidate == kind {
			return true
		}
	}
	return false
}

func isSemanticNodeStatus(status SemanticNodeStatus) bool {
	for _, candidate := range semanticNodeStatuses {
		if candidate == status {
			return true
		}
	}
	return false
}

func isEvidenceClass(class EvidenceClass) bool {
	for _, candidate := range evidenceClasses {
		if candidate == class {
			return true
		}
	}
	return false
}

func isSemanticActor(actor SemanticActor) bool {
	for _, candidate := range semanticActors {
		if candidate == actor {
			return true
		}
	}
	return false
}

func isSemanticEdgeKind(kind SemanticEdgeKind) bool {
	for _, candidate := range semanticEdgeKinds {
		if candidate == kind {
			return true
		}
	}
	return false
}

func isWorkstreamDetailLevel(level WorkstreamDetailLevel) bool {
	for _, candidate := range workstreamDetailLevels {
		if candidate == level {
			return true
		}
	}
	return false
}

func requireSourceEventIDs(label string, eventIDs []string) error {
	if len(eventIDs) == 0 {
		return fmt.Errorf("%s requires at least one source event id", label)
	}
	seen := make(map[string]bool, len(eventIDs))
	for index, eventID := range eventIDs {
		if err := validateIdentifier(fmt.Sprintf("%s source event id %d", label, index), eventID); err != nil {
			return err
		}
		if seen[eventID] {
			return fmt.Errorf("%s repeats source event id %q", label, eventID)
		}
		seen[eventID] = true
	}
	return nil
}

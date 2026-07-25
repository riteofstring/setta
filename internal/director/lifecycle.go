package director

import (
	"fmt"

	"setta/internal/conversation"
)

// Lifecycle tables are the Director's explicit statement of which durable state
// changes are possible. Every projector and service that advances one of these
// states validates against the table first, so an impossible transition fails
// loudly at the boundary instead of producing a graph the user cannot trust.

// QueueItemStatus is the lifecycle of one accepted-but-not-running unit of
// work. A queue item is promoted into a run; it never becomes a run's terminal
// state itself.
type QueueItemStatus string

const (
	QueueItemStatusQueued    QueueItemStatus = "queued"
	QueueItemStatusPromoted  QueueItemStatus = "promoted"
	QueueItemStatusCancelled QueueItemStatus = "cancelled"
)

var queueItemStatuses = []QueueItemStatus{
	QueueItemStatusQueued,
	QueueItemStatusPromoted,
	QueueItemStatusCancelled,
}

// ApprovalStatus is the lifecycle of one approval request. The resolved values
// mirror the durable trajectory approval decisions so a Director approval and
// the conversation event it came from cannot disagree.
type ApprovalStatus string

const (
	ApprovalStatusPending            ApprovalStatus = "pending"
	ApprovalStatusApproved           ApprovalStatus = "approved"
	ApprovalStatusApprovedForSession ApprovalStatus = "approved_for_session"
	ApprovalStatusDenied             ApprovalStatus = "denied"
	ApprovalStatusCancelled          ApprovalStatus = "cancelled"
	ApprovalStatusAnswered           ApprovalStatus = "answered"
)

var approvalStatuses = []ApprovalStatus{
	ApprovalStatusPending,
	ApprovalStatusApproved,
	ApprovalStatusApprovedForSession,
	ApprovalStatusDenied,
	ApprovalStatusCancelled,
	ApprovalStatusAnswered,
}

// ResourceRequestStatus is the lifecycle of one durable resource request, such
// as work that cannot start until the user chooses a folder.
type ResourceRequestStatus string

const (
	ResourceRequestStatusRequested ResourceRequestStatus = "requested"
	ResourceRequestStatusResolved  ResourceRequestStatus = "resolved"
	ResourceRequestStatusCancelled ResourceRequestStatus = "cancelled"
)

var resourceRequestStatuses = []ResourceRequestStatus{
	ResourceRequestStatusRequested,
	ResourceRequestStatusResolved,
	ResourceRequestStatusCancelled,
}

// ArtifactStatus separates an artifact a worker declared from one Setta durably
// holds. Only an available artifact is a semantic artifact node.
type ArtifactStatus string

const (
	// ArtifactStatusDeclared was announced by a worker but is not durable yet.
	ArtifactStatusDeclared ArtifactStatus = "declared"
	// ArtifactStatusAvailable is durable and openable.
	ArtifactStatusAvailable ArtifactStatus = "available"
	// ArtifactStatusUnresolved was declared and never delivered before the run
	// ended.
	ArtifactStatusUnresolved ArtifactStatus = "unresolved"
)

var artifactStatuses = []ArtifactStatus{
	ArtifactStatusDeclared,
	ArtifactStatusAvailable,
	ArtifactStatusUnresolved,
}

// RecoveryStatus is the lifecycle of one recovery attempt over a failed,
// interrupted, lost, or unavailable execution state.
type RecoveryStatus string

const (
	RecoveryStatusDetected      RecoveryStatus = "detected"
	RecoveryStatusRetrying      RecoveryStatus = "retrying"
	RecoveryStatusRecovered     RecoveryStatus = "recovered"
	RecoveryStatusUnrecoverable RecoveryStatus = "unrecoverable"
)

var recoveryStatuses = []RecoveryStatus{
	RecoveryStatusDetected,
	RecoveryStatusRetrying,
	RecoveryStatusRecovered,
	RecoveryStatusUnrecoverable,
}

type lifecycleTable[T ~string] struct {
	label       string
	initial     []T
	transitions map[T][]T
}

func (table lifecycleTable[T]) validateStatus(status T) error {
	if _, known := table.transitions[status]; !known {
		return fmt.Errorf("unknown %s status %q", table.label, string(status))
	}
	return nil
}

func (table lifecycleTable[T]) validateTransition(from T, to T) error {
	if err := table.validateStatus(from); err != nil {
		return err
	}
	if err := table.validateStatus(to); err != nil {
		return err
	}
	if from == to {
		return nil
	}
	for _, candidate := range table.transitions[from] {
		if candidate == to {
			return nil
		}
	}
	return fmt.Errorf("%s cannot transition from %q to %q", table.label, string(from), string(to))
}

func (table lifecycleTable[T]) validateInitial(status T) error {
	if err := table.validateStatus(status); err != nil {
		return err
	}
	for _, candidate := range table.initial {
		if candidate == status {
			return nil
		}
	}
	return fmt.Errorf("%s cannot start at %q", table.label, string(status))
}

func (table lifecycleTable[T]) allowed(from T) []T {
	return append([]T(nil), table.transitions[from]...)
}

func (table lifecycleTable[T]) isTerminal(status T) bool {
	return len(table.transitions[status]) == 0
}

var workstreamLifecycle = lifecycleTable[WorkstreamStatus]{
	label:   "workstream",
	initial: []WorkstreamStatus{WorkstreamStatusIdle},
	transitions: map[WorkstreamStatus][]WorkstreamStatus{
		WorkstreamStatusIdle: {
			WorkstreamStatusRunning,
			WorkstreamStatusQueued,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusBlocked,
			WorkstreamStatusArchived,
		},
		WorkstreamStatusRunning: {
			WorkstreamStatusIdle,
			WorkstreamStatusQueued,
			WorkstreamStatusAwaitingApproval,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusBlocked,
			WorkstreamStatusFailed,
			WorkstreamStatusCompleted,
		},
		WorkstreamStatusQueued: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusBlocked,
			WorkstreamStatusFailed,
		},
		WorkstreamStatusAwaitingApproval: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusBlocked,
			WorkstreamStatusFailed,
			WorkstreamStatusCompleted,
		},
		WorkstreamStatusAwaitingResource: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusQueued,
			WorkstreamStatusBlocked,
			WorkstreamStatusFailed,
			WorkstreamStatusArchived,
		},
		WorkstreamStatusBlocked: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusQueued,
			WorkstreamStatusAwaitingApproval,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusFailed,
			WorkstreamStatusArchived,
		},
		WorkstreamStatusFailed: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusQueued,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusBlocked,
			WorkstreamStatusArchived,
		},
		WorkstreamStatusCompleted: {
			WorkstreamStatusIdle,
			WorkstreamStatusRunning,
			WorkstreamStatusQueued,
			WorkstreamStatusAwaitingResource,
			WorkstreamStatusArchived,
		},
		WorkstreamStatusArchived: {},
	},
}

var runLifecycle = lifecycleTable[conversation.TurnStatus]{
	label:   "run",
	initial: []conversation.TurnStatus{conversation.TurnStatusQueued, conversation.TurnStatusRunning},
	transitions: map[conversation.TurnStatus][]conversation.TurnStatus{
		conversation.TurnStatusQueued: {
			conversation.TurnStatusRunning,
			conversation.TurnStatusCancelled,
			conversation.TurnStatusFailed,
		},
		conversation.TurnStatusRunning: {
			conversation.TurnStatusCompleted,
			conversation.TurnStatusCancelled,
			conversation.TurnStatusFailed,
		},
		conversation.TurnStatusCompleted: {},
		conversation.TurnStatusCancelled: {},
		conversation.TurnStatusFailed:    {},
	},
}

var queueItemLifecycle = lifecycleTable[QueueItemStatus]{
	label:   "queue item",
	initial: []QueueItemStatus{QueueItemStatusQueued},
	transitions: map[QueueItemStatus][]QueueItemStatus{
		QueueItemStatusQueued:    {QueueItemStatusPromoted, QueueItemStatusCancelled},
		QueueItemStatusPromoted:  {},
		QueueItemStatusCancelled: {},
	},
}

var approvalLifecycle = lifecycleTable[ApprovalStatus]{
	label:   "approval",
	initial: []ApprovalStatus{ApprovalStatusPending},
	transitions: map[ApprovalStatus][]ApprovalStatus{
		ApprovalStatusPending: {
			ApprovalStatusApproved,
			ApprovalStatusApprovedForSession,
			ApprovalStatusDenied,
			ApprovalStatusCancelled,
			ApprovalStatusAnswered,
		},
		ApprovalStatusApproved:           {},
		ApprovalStatusApprovedForSession: {},
		ApprovalStatusDenied:             {},
		ApprovalStatusCancelled:          {},
		ApprovalStatusAnswered:           {},
	},
}

var resourceRequestLifecycle = lifecycleTable[ResourceRequestStatus]{
	label:   "resource request",
	initial: []ResourceRequestStatus{ResourceRequestStatusRequested},
	transitions: map[ResourceRequestStatus][]ResourceRequestStatus{
		ResourceRequestStatusRequested: {ResourceRequestStatusResolved, ResourceRequestStatusCancelled},
		ResourceRequestStatusResolved:  {},
		ResourceRequestStatusCancelled: {},
	},
}

var artifactLifecycle = lifecycleTable[ArtifactStatus]{
	label:   "artifact",
	initial: []ArtifactStatus{ArtifactStatusDeclared, ArtifactStatusAvailable},
	transitions: map[ArtifactStatus][]ArtifactStatus{
		ArtifactStatusDeclared:   {ArtifactStatusAvailable, ArtifactStatusUnresolved},
		ArtifactStatusAvailable:  {},
		ArtifactStatusUnresolved: {},
	},
}

var recoveryLifecycle = lifecycleTable[RecoveryStatus]{
	label:   "recovery",
	initial: []RecoveryStatus{RecoveryStatusDetected},
	transitions: map[RecoveryStatus][]RecoveryStatus{
		RecoveryStatusDetected:      {RecoveryStatusRetrying, RecoveryStatusRecovered, RecoveryStatusUnrecoverable},
		RecoveryStatusRetrying:      {RecoveryStatusRetrying, RecoveryStatusRecovered, RecoveryStatusUnrecoverable},
		RecoveryStatusRecovered:     {},
		RecoveryStatusUnrecoverable: {RecoveryStatusRetrying},
	},
}

var semanticNodeLifecycle = lifecycleTable[SemanticNodeStatus]{
	label:   "semantic node",
	initial: []SemanticNodeStatus{SemanticNodeStatusPending, SemanticNodeStatusActive, SemanticNodeStatusWaiting, SemanticNodeStatusSucceeded, SemanticNodeStatusFailed, SemanticNodeStatusCancelled},
	transitions: map[SemanticNodeStatus][]SemanticNodeStatus{
		SemanticNodeStatusPending: {
			SemanticNodeStatusActive,
			SemanticNodeStatusWaiting,
			SemanticNodeStatusFailed,
			SemanticNodeStatusCancelled,
		},
		SemanticNodeStatusActive: {
			SemanticNodeStatusWaiting,
			SemanticNodeStatusSucceeded,
			SemanticNodeStatusFailed,
			SemanticNodeStatusCancelled,
		},
		SemanticNodeStatusWaiting: {
			SemanticNodeStatusActive,
			SemanticNodeStatusSucceeded,
			SemanticNodeStatusFailed,
			SemanticNodeStatusCancelled,
		},
		SemanticNodeStatusSucceeded: {},
		SemanticNodeStatusFailed:    {},
		SemanticNodeStatusCancelled: {},
	},
}

// semanticNodeKindStatuses bounds each node kind to the statuses it can carry.
// A terminal kind exists to close a causal chain, so it carries exactly the
// status it names.
var semanticNodeKindStatuses = map[SemanticNodeKind][]SemanticNodeStatus{
	SemanticNodeUserGoal: {
		SemanticNodeStatusActive,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeDirectorDecision: {SemanticNodeStatusSucceeded, SemanticNodeStatusFailed},
	SemanticNodePlan: {
		SemanticNodeStatusActive,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeMilestone: {
		SemanticNodeStatusPending,
		SemanticNodeStatusActive,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeDelegation: {
		SemanticNodeStatusPending,
		SemanticNodeStatusActive,
		SemanticNodeStatusWaiting,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeInvestigation: {
		SemanticNodeStatusActive,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeAction: {
		SemanticNodeStatusPending,
		SemanticNodeStatusActive,
		SemanticNodeStatusWaiting,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeResourceRequired: {
		SemanticNodeStatusWaiting,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeApprovalRequired: {
		SemanticNodeStatusWaiting,
		SemanticNodeStatusSucceeded,
		SemanticNodeStatusFailed,
		SemanticNodeStatusCancelled,
	},
	SemanticNodeArtifact:   {SemanticNodeStatusSucceeded},
	SemanticNodeValidation: {SemanticNodeStatusActive, SemanticNodeStatusSucceeded, SemanticNodeStatusFailed},
	SemanticNodeBlocked:    {SemanticNodeStatusWaiting, SemanticNodeStatusSucceeded, SemanticNodeStatusFailed, SemanticNodeStatusCancelled},
	SemanticNodeRetry:      {SemanticNodeStatusActive, SemanticNodeStatusSucceeded, SemanticNodeStatusFailed},
	SemanticNodeRecovery:   {SemanticNodeStatusActive, SemanticNodeStatusSucceeded, SemanticNodeStatusFailed},
	SemanticNodeCompleted:  {SemanticNodeStatusSucceeded},
	SemanticNodeFailed:     {SemanticNodeStatusFailed},
	SemanticNodeCancelled:  {SemanticNodeStatusCancelled},
}

// ValidateWorkstreamTransition rejects an impossible workstream state change.
func ValidateWorkstreamTransition(from WorkstreamStatus, to WorkstreamStatus) error {
	return workstreamLifecycle.validateTransition(from, to)
}

// AllowedWorkstreamTransitions returns the statuses a workstream may move to.
func AllowedWorkstreamTransitions(from WorkstreamStatus) []WorkstreamStatus {
	return workstreamLifecycle.allowed(from)
}

// ValidateInitialWorkstreamStatus rejects a registry record that did not start
// in a startable state.
func ValidateInitialWorkstreamStatus(status WorkstreamStatus) error {
	return workstreamLifecycle.validateInitial(status)
}

// ValidateRunTransition rejects an impossible run state change.
func ValidateRunTransition(from conversation.TurnStatus, to conversation.TurnStatus) error {
	return runLifecycle.validateTransition(from, to)
}

// IsTerminalRunStatus reports whether a run can no longer change state.
func IsTerminalRunStatus(status conversation.TurnStatus) bool {
	return runLifecycle.isTerminal(status)
}

// ValidateQueueItemTransition rejects an impossible queue item state change.
func ValidateQueueItemTransition(from QueueItemStatus, to QueueItemStatus) error {
	return queueItemLifecycle.validateTransition(from, to)
}

// ValidateApprovalTransition rejects an impossible approval state change.
func ValidateApprovalTransition(from ApprovalStatus, to ApprovalStatus) error {
	return approvalLifecycle.validateTransition(from, to)
}

// ValidateResourceRequestTransition rejects an impossible resource request
// state change.
func ValidateResourceRequestTransition(from ResourceRequestStatus, to ResourceRequestStatus) error {
	return resourceRequestLifecycle.validateTransition(from, to)
}

// ValidateArtifactTransition rejects an impossible artifact state change.
func ValidateArtifactTransition(from ArtifactStatus, to ArtifactStatus) error {
	return artifactLifecycle.validateTransition(from, to)
}

// ValidateRecoveryTransition rejects an impossible recovery state change.
func ValidateRecoveryTransition(from RecoveryStatus, to RecoveryStatus) error {
	return recoveryLifecycle.validateTransition(from, to)
}

// ValidateSemanticNodeTransition rejects an impossible node lifecycle change.
func ValidateSemanticNodeTransition(from SemanticNodeStatus, to SemanticNodeStatus) error {
	return semanticNodeLifecycle.validateTransition(from, to)
}

// IsTerminalSemanticNodeStatus reports whether a node has closed its chain.
func IsTerminalSemanticNodeStatus(status SemanticNodeStatus) bool {
	return semanticNodeLifecycle.isTerminal(status)
}

// SemanticNodeKindStatuses returns the statuses one node kind may carry.
func SemanticNodeKindStatuses(kind SemanticNodeKind) ([]SemanticNodeStatus, error) {
	statuses, known := semanticNodeKindStatuses[kind]
	if !known {
		return nil, fmt.Errorf("unknown semantic node kind %q", kind)
	}
	return append([]SemanticNodeStatus(nil), statuses...), nil
}

// ValidateSemanticNodeKindStatus rejects a status the node kind cannot carry,
// such as an artifact node that claims it failed.
func ValidateSemanticNodeKindStatus(kind SemanticNodeKind, status SemanticNodeStatus) error {
	statuses, err := SemanticNodeKindStatuses(kind)
	if err != nil {
		return err
	}
	for _, candidate := range statuses {
		if candidate == status {
			return nil
		}
	}
	return fmt.Errorf("semantic node kind %q cannot carry status %q", kind, status)
}

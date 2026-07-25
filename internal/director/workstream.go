// Package director owns the Setta 4 Director command center contracts.
//
// The Director command center replaces pane identity as the application-level
// owner of conversational work. A workstream is the durable unit the user
// selects, delegates to, and receives results from. Conversations remain the
// execution and durability substrate; a workstream is the app-scoped identity
// projected over one conversation.
//
// This package defines contracts, lifecycle tables, and validation only. The
// registry, projector, and execution port that use them are separate owners.
package director

import (
	"fmt"
	"path/filepath"
)

// DirectorContractSchemaVersion versions every contract in this package
// together. A renderer that loaded a snapshot at a different version must
// resync rather than merge.
const DirectorContractSchemaVersion = 1

// WorkstreamStatus is the actionable aggregate state of one workstream. It is
// the only workstream state a background workstream renders, so every value
// must tell the user whether the workstream needs them.
type WorkstreamStatus string

const (
	// WorkstreamStatusIdle has no active run, no queued run, and nothing
	// unresolved. It is the state of a newly registered workstream.
	WorkstreamStatusIdle WorkstreamStatus = "idle"
	// WorkstreamStatusRunning has an active run.
	WorkstreamStatusRunning WorkstreamStatus = "running"
	// WorkstreamStatusQueued has accepted work that no run is executing yet.
	WorkstreamStatusQueued WorkstreamStatus = "queued"
	// WorkstreamStatusAwaitingApproval has at least one unresolved approval.
	WorkstreamStatusAwaitingApproval WorkstreamStatus = "awaiting_approval"
	// WorkstreamStatusAwaitingResource has at least one unresolved resource
	// request, such as work that needs a folder the user has not chosen.
	WorkstreamStatusAwaitingResource WorkstreamStatus = "awaiting_resource"
	// WorkstreamStatusBlocked cannot progress because of a typed lifecycle
	// fact such as a lost agent or an unavailable provider.
	WorkstreamStatusBlocked WorkstreamStatus = "blocked"
	// WorkstreamStatusFailed ended its last run in failure and has not
	// recovered.
	WorkstreamStatusFailed WorkstreamStatus = "failed"
	// WorkstreamStatusCompleted ended its last run successfully with nothing
	// pending.
	WorkstreamStatusCompleted WorkstreamStatus = "completed"
	// WorkstreamStatusArchived is retained for history and is not offered as a
	// routing target.
	WorkstreamStatusArchived WorkstreamStatus = "archived"
)

var workstreamStatuses = []WorkstreamStatus{
	WorkstreamStatusIdle,
	WorkstreamStatusRunning,
	WorkstreamStatusQueued,
	WorkstreamStatusAwaitingApproval,
	WorkstreamStatusAwaitingResource,
	WorkstreamStatusBlocked,
	WorkstreamStatusFailed,
	WorkstreamStatusCompleted,
	WorkstreamStatusArchived,
}

// WorkstreamStatuses returns the ordered status catalog.
func WorkstreamStatuses() []WorkstreamStatus {
	return append([]WorkstreamStatus(nil), workstreamStatuses...)
}

// WorkstreamResourceScopeKind states whether a workstream is bound to a
// filesystem resource. Folderless is a first-class scope, not a degraded one:
// the user must be able to start useful work before choosing a folder.
type WorkstreamResourceScopeKind string

const (
	WorkstreamResourceScopeFolderless WorkstreamResourceScopeKind = "folderless"
	WorkstreamResourceScopeFolder     WorkstreamResourceScopeKind = "folder"
)

var workstreamResourceScopeKinds = []WorkstreamResourceScopeKind{
	WorkstreamResourceScopeFolderless,
	WorkstreamResourceScopeFolder,
}

// WorkstreamResourceKind is the kind of resource a workstream can bind.
type WorkstreamResourceKind string

const (
	WorkstreamResourceKindFolder WorkstreamResourceKind = "folder"
)

var workstreamResourceKinds = []WorkstreamResourceKind{
	WorkstreamResourceKindFolder,
}

// WorkstreamFolderResource binds a workstream to a filesystem workspace. The
// workspace is a resource of the workstream, never its identity.
type WorkstreamFolderResource struct {
	WorkspaceID string `json:"workspaceId"`
	RootPath    string `json:"rootPath"`
}

// WorkstreamResourceBinding is the Director-owned replacement for the pane
// resource binding. Trusted product code attaches bindings after a decision
// validates; model output never supplies a resource path.
type WorkstreamResourceBinding struct {
	Kind   WorkstreamResourceKind    `json:"kind"`
	Folder *WorkstreamFolderResource `json:"folder"`
}

// WorkstreamResourceScope is the resolved scope a workstream currently runs in.
type WorkstreamResourceScope struct {
	Kind   WorkstreamResourceScopeKind `json:"kind"`
	Folder *WorkstreamFolderResource   `json:"folder"`
}

// WorkstreamMilestone is the last meaningful public fact of a workstream. It is
// what an adjacent or background workstream renders instead of a trajectory.
type WorkstreamMilestone struct {
	NodeID        string           `json:"nodeId"`
	Kind          SemanticNodeKind `json:"kind"`
	PublicSummary string           `json:"publicSummary"`
	OccurredAt    string           `json:"occurredAt"`
}

// Workstream is one registry record. Counts are aggregated by the registry so
// background workstreams never need their trajectory loaded to be actionable.
type Workstream struct {
	ID       string           `json:"id"`
	Title    string           `json:"title"`
	Status   WorkstreamStatus `json:"status"`
	ParentID *string          `json:"parentId"`
	// ConversationID is the durable execution substrate for this workstream.
	// The initial cutover maps one conversation to one workstream.
	ConversationID                 string                      `json:"conversationId"`
	ResourceScope                  WorkstreamResourceScope     `json:"resourceScope"`
	ResourceBindings               []WorkstreamResourceBinding `json:"resourceBindings"`
	ActiveRunID                    *string                     `json:"activeRunId"`
	QueuedRunCount                 int                         `json:"queuedRunCount"`
	UnresolvedApprovalCount        int                         `json:"unresolvedApprovalCount"`
	UnresolvedResourceRequestCount int                         `json:"unresolvedResourceRequestCount"`
	ArtifactCount                  int                         `json:"artifactCount"`
	LastMilestone                  *WorkstreamMilestone        `json:"lastMilestone"`
	CreatedAt                      string                      `json:"createdAt"`
	UpdatedAt                      string                      `json:"updatedAt"`
}

// WorkstreamDetailLevel is the projection depth the registry assigned to one
// workstream. It is derived from selection and recency, never persisted as
// workstream truth, and it bounds how much of a workstream the renderer must
// hold.
type WorkstreamDetailLevel string

const (
	// WorkstreamDetailSelected renders the full recent semantic trajectory.
	WorkstreamDetailSelected WorkstreamDetailLevel = "selected"
	// WorkstreamDetailAdjacent renders status, last milestone, unresolved
	// blockers, and produced artifacts.
	WorkstreamDetailAdjacent WorkstreamDetailLevel = "adjacent"
	// WorkstreamDetailBackground renders aggregate status only.
	WorkstreamDetailBackground WorkstreamDetailLevel = "background"
)

var workstreamDetailLevels = []WorkstreamDetailLevel{
	WorkstreamDetailSelected,
	WorkstreamDetailAdjacent,
	WorkstreamDetailBackground,
}

// ValidateWorkstream rejects registry records that could not have been produced
// by trusted product code.
func ValidateWorkstream(workstream Workstream) error {
	if err := validateWorkstreamIdentity(workstream); err != nil {
		return err
	}
	if err := validateWorkstreamResources(workstream); err != nil {
		return err
	}
	if err := validateWorkstreamCounts(workstream); err != nil {
		return err
	}
	if err := validateWorkstreamMilestone(workstream.LastMilestone); err != nil {
		return err
	}
	if err := validateTimestamp("workstream created at", workstream.CreatedAt); err != nil {
		return err
	}
	if err := validateTimestamp("workstream updated at", workstream.UpdatedAt); err != nil {
		return err
	}
	if err := validateTimestampOrder("workstream timestamp", workstream.CreatedAt, workstream.UpdatedAt); err != nil {
		return err
	}
	if workstream.LastMilestone != nil {
		if err := validateTimestampOrder(
			"workstream milestone creation timestamp",
			workstream.CreatedAt,
			workstream.LastMilestone.OccurredAt,
		); err != nil {
			return err
		}
		return validateTimestampOrder(
			"workstream milestone update timestamp",
			workstream.LastMilestone.OccurredAt,
			workstream.UpdatedAt,
		)
	}
	return nil
}

func validateWorkstreamIdentity(workstream Workstream) error {
	if err := validateIdentifier("workstream id", workstream.ID); err != nil {
		return err
	}
	if err := validateIdentifier("workstream conversation id", workstream.ConversationID); err != nil {
		return err
	}
	if workstream.ParentID != nil {
		if err := validateIdentifier("workstream parent id", *workstream.ParentID); err != nil {
			return err
		}
		if *workstream.ParentID == workstream.ID {
			return fmt.Errorf("workstream %s cannot be its own parent", workstream.ID)
		}
	}
	if err := validateTrimmedText("workstream title", workstream.Title); err != nil {
		return err
	}
	if !isWorkstreamStatus(workstream.Status) {
		return fmt.Errorf("unknown workstream status %q", workstream.Status)
	}
	return nil
}

func validateWorkstreamResources(workstream Workstream) error {
	if err := validateWorkstreamResourceScope(workstream.ResourceScope); err != nil {
		return err
	}
	if workstream.ResourceBindings == nil {
		return fmt.Errorf("workstream %s resource bindings must be an array, not null", workstream.ID)
	}
	for index, binding := range workstream.ResourceBindings {
		if err := ValidateWorkstreamResourceBinding(binding); err != nil {
			return fmt.Errorf("workstream %s resource binding %d: %w", workstream.ID, index, err)
		}
	}
	return nil
}

func validateWorkstreamCounts(workstream Workstream) error {
	if workstream.ActiveRunID != nil {
		if err := validateIdentifier("workstream active run id", *workstream.ActiveRunID); err != nil {
			return err
		}
	}
	counts := []struct {
		label string
		value int
	}{
		{"workstream queued run count", workstream.QueuedRunCount},
		{"workstream unresolved approval count", workstream.UnresolvedApprovalCount},
		{"workstream unresolved resource request count", workstream.UnresolvedResourceRequestCount},
		{"workstream artifact count", workstream.ArtifactCount},
	}
	for _, count := range counts {
		if err := validateCount(count.label, count.value); err != nil {
			return err
		}
	}
	return validateWorkstreamStatusState(workstream)
}

func validateWorkstreamStatusState(workstream Workstream) error {
	switch workstream.Status {
	case WorkstreamStatusIdle:
		if workstream.ActiveRunID != nil ||
			workstream.QueuedRunCount != 0 ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("idle workstream %s carries active or unresolved work", workstream.ID)
		}
	case WorkstreamStatusRunning:
		if workstream.ActiveRunID == nil ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("running workstream %s requires an active run with no unresolved blocker", workstream.ID)
		}
	case WorkstreamStatusQueued:
		if workstream.ActiveRunID != nil ||
			workstream.QueuedRunCount == 0 ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("queued workstream %s requires only queued work and no active run", workstream.ID)
		}
	case WorkstreamStatusAwaitingApproval:
		if workstream.ActiveRunID == nil || workstream.UnresolvedApprovalCount == 0 {
			return fmt.Errorf("approval-waiting workstream %s requires an active run and unresolved approval", workstream.ID)
		}
	case WorkstreamStatusAwaitingResource:
		if workstream.UnresolvedResourceRequestCount == 0 {
			return fmt.Errorf("resource-waiting workstream %s requires an unresolved resource request", workstream.ID)
		}
	case WorkstreamStatusFailed:
		if workstream.ActiveRunID != nil ||
			workstream.QueuedRunCount != 0 ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("failed workstream %s carries active or unresolved work", workstream.ID)
		}
	case WorkstreamStatusCompleted:
		if workstream.ActiveRunID != nil ||
			workstream.QueuedRunCount != 0 ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("completed workstream %s carries active or unresolved work", workstream.ID)
		}
	case WorkstreamStatusArchived:
		if workstream.ActiveRunID != nil ||
			workstream.QueuedRunCount != 0 ||
			workstream.UnresolvedApprovalCount != 0 ||
			workstream.UnresolvedResourceRequestCount != 0 {
			return fmt.Errorf("archived workstream %s carries active or unresolved work", workstream.ID)
		}
	case WorkstreamStatusBlocked:
		// A typed provider, agent, approval, or resource fact owns the block.
	}
	return nil
}

// ValidateWorkstreamResourceBinding enforces that the binding kind selects
// exactly one populated payload.
func ValidateWorkstreamResourceBinding(binding WorkstreamResourceBinding) error {
	switch binding.Kind {
	case WorkstreamResourceKindFolder:
		if binding.Folder == nil {
			return fmt.Errorf("folder resource binding requires a folder payload")
		}
		return validateWorkstreamFolderResource(*binding.Folder)
	default:
		return fmt.Errorf("unknown workstream resource kind %q", binding.Kind)
	}
}

func validateWorkstreamResourceScope(scope WorkstreamResourceScope) error {
	switch scope.Kind {
	case WorkstreamResourceScopeFolderless:
		if scope.Folder != nil {
			return fmt.Errorf("folderless workstream scope must not carry a folder binding")
		}
		return nil
	case WorkstreamResourceScopeFolder:
		if scope.Folder == nil {
			return fmt.Errorf("folder workstream scope requires a folder binding")
		}
		return validateWorkstreamFolderResource(*scope.Folder)
	default:
		return fmt.Errorf("unknown workstream resource scope kind %q", scope.Kind)
	}
}

func validateWorkstreamFolderResource(folder WorkstreamFolderResource) error {
	if err := validateIdentifier("folder resource workspace id", folder.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("folder resource root path", folder.RootPath); err != nil {
		return err
	}
	if !filepath.IsAbs(folder.RootPath) {
		return fmt.Errorf("folder resource root path must be absolute: %q", folder.RootPath)
	}
	return nil
}

func validateWorkstreamMilestone(milestone *WorkstreamMilestone) error {
	if milestone == nil {
		return nil
	}
	if err := validateIdentifier("workstream milestone node id", milestone.NodeID); err != nil {
		return err
	}
	if !isSemanticNodeKind(milestone.Kind) {
		return fmt.Errorf("unknown workstream milestone node kind %q", milestone.Kind)
	}
	if err := validateTrimmedText("workstream milestone public summary", milestone.PublicSummary); err != nil {
		return err
	}
	return validateTimestamp("workstream milestone occurred at", milestone.OccurredAt)
}

func isWorkstreamStatus(status WorkstreamStatus) bool {
	for _, candidate := range workstreamStatuses {
		if candidate == status {
			return true
		}
	}
	return false
}

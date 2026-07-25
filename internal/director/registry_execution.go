package director

import "fmt"

// The trusted execution state a decision is carried out against.
//
// The tool boundary tells the Director what it may act on; this tells trusted
// product code what carrying that action out addresses. Both come from the same
// durable fold, so an offered workstream and its execution conversation cannot
// be resolved from two derivations that disagree.

// WorkstreamExecutionTarget is the durable substrate one workstream executes
// on. It is trusted state: the Director never sees a conversation id, a folder
// path, or a run id it did not receive as an authorized reference.
type WorkstreamExecutionTarget struct {
	WorkstreamID   string
	ConversationID string
	// WorkspaceID is the folder resource the workstream is bound to. A nil
	// workspace is a folderless workstream, which exists and is selectable but
	// cannot run work until the user supplies a folder.
	WorkspaceID *string
	ActiveRunID *string
}

// ExecutionTarget resolves the durable substrate of one workstream.
func (registry *Registry) ExecutionTarget(workstreamID string) (WorkstreamExecutionTarget, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return WorkstreamExecutionTarget{}, err
	}
	workstream, known := registry.state.workstreams[workstreamID]
	if !known {
		return WorkstreamExecutionTarget{}, fmt.Errorf(
			"%w: workstream %s is not in the registry",
			ErrDirectorIntentRejected,
			workstreamID,
		)
	}
	return WorkstreamExecutionTarget{
		WorkstreamID:   workstream.record.ID,
		ConversationID: workstream.conversationID,
		WorkspaceID:    workstreamFolderWorkspaceID(workstream.record.ResourceScope),
		ActiveRunID:    copyOptionalString(workstream.activeRunID),
	}, nil
}

// RecoverableRun resolves the run one recoverable failure interrupted. The
// Director names a durable failure event; the run it belongs to is trusted state,
// so a recovery restarts the work that actually failed rather than work the
// decision claimed.
func (registry *Registry) RecoverableRun(workstreamID string, failureEventID string) (string, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return "", err
	}
	workstream, known := registry.state.workstreams[workstreamID]
	if !known {
		return "", fmt.Errorf(
			"%w: workstream %s is not in the registry",
			ErrDirectorIntentRejected,
			workstreamID,
		)
	}
	runID, recoverable := workstream.failureRuns[failureEventID]
	if !recoverable {
		return "", fmt.Errorf(
			"%w: failure %s is not recoverable on workstream %s",
			ErrDirectorIntentRejected,
			failureEventID,
			workstreamID,
		)
	}
	return runID, nil
}

// WorkstreamRunTarget is the durable substrate one named run executes on. A
// dispatched command addresses the run the user was shown, so the run is part of
// the target rather than something resolved at the last moment from whatever is
// active by then.
type WorkstreamRunTarget struct {
	WorkstreamID   string
	ConversationID string
	WorkspaceID    string
	RunID          string
}

// ActiveRunTarget resolves the substrate of a run the user asked to act on, and
// proves it is still the run the workstream is carrying. A run that already
// ended is a rejected request rather than a repaired one: the successor the
// workstream promoted is work the user never chose.
func (registry *Registry) ActiveRunTarget(workstreamID string, runID string) (WorkstreamRunTarget, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	return registry.activeRunTargetLocked(workstreamID, runID)
}

// PendingApprovalTarget resolves the workstream, run, and substrate one pending
// approval belongs to. The approval names its own run, so the user answers the
// approval they were shown rather than whichever one is outstanding now.
func (registry *Registry) PendingApprovalTarget(approvalID string) (WorkstreamRunTarget, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return WorkstreamRunTarget{}, err
	}
	approval, known := registry.state.approvals[approvalID]
	if !known {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: approval %s is not in the registry",
			ErrDirectorIntentRejected,
			approvalID,
		)
	}
	if approval.Status != ApprovalStatusPending {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: approval %s is already %s",
			ErrDirectorIntentRejected,
			approvalID,
			approval.Status,
		)
	}
	if approval.RunID == nil {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: approval %s names no run to answer on",
			ErrDirectorIntentRejected,
			approvalID,
		)
	}
	return registry.activeRunTargetLocked(approval.WorkstreamID, *approval.RunID)
}

// activeRunTargetLocked is the shared resolution: the workstream exists, the run
// is the one it is carrying, and it runs inside a folder. A workstream with no
// folder cannot have a run at all, so the check is a guard rather than a state
// the user can reach.
func (registry *Registry) activeRunTargetLocked(
	workstreamID string,
	runID string,
) (WorkstreamRunTarget, error) {
	if err := registry.requireAvailableLocked(); err != nil {
		return WorkstreamRunTarget{}, err
	}
	workstream, known := registry.state.workstreams[workstreamID]
	if !known {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: workstream %s is not in the registry",
			ErrDirectorIntentRejected,
			workstreamID,
		)
	}
	if workstream.activeRunID == nil || *workstream.activeRunID != runID {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: run %s is no longer the active run of workstream %s",
			ErrDirectorIntentRejected,
			runID,
			workstreamID,
		)
	}
	workspaceID := workstreamFolderWorkspaceID(workstream.record.ResourceScope)
	if workspaceID == nil {
		return WorkstreamRunTarget{}, fmt.Errorf(
			"%w: workstream %s has no folder resource its run could be executing in",
			ErrDirectorIntentRejected,
			workstreamID,
		)
	}
	return WorkstreamRunTarget{
		WorkstreamID:   workstream.record.ID,
		ConversationID: workstream.conversationID,
		WorkspaceID:    *workspaceID,
		RunID:          runID,
	}, nil
}

// ResourceRequestTarget is the workstream one open resource request is holding
// up, and the resource it is waiting for.
type ResourceRequestTarget struct {
	RequestID      string
	Kind           WorkstreamResourceKind
	WorkstreamID   string
	ConversationID string
}

// OpenResourceRequestTarget resolves one request the user is answering. Only an
// unresolved request can be closed, so supplying a folder twice is rejected
// rather than committing a second resolution of the same request.
func (registry *Registry) OpenResourceRequestTarget(requestID string) (ResourceRequestTarget, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return ResourceRequestTarget{}, err
	}
	request, known := registry.state.resources[requestID]
	if !known {
		return ResourceRequestTarget{}, fmt.Errorf(
			"%w: resource request %s is not in the registry",
			ErrDirectorIntentRejected,
			requestID,
		)
	}
	if request.Status != ResourceRequestStatusRequested {
		return ResourceRequestTarget{}, fmt.Errorf(
			"%w: resource request %s is already %s",
			ErrDirectorIntentRejected,
			requestID,
			request.Status,
		)
	}
	workstream, known := registry.state.workstreams[request.WorkstreamID]
	if !known {
		return ResourceRequestTarget{}, fmt.Errorf(
			"%w: workstream %s is not in the registry",
			ErrDirectorIntentRejected,
			request.WorkstreamID,
		)
	}
	return ResourceRequestTarget{
		RequestID:      request.ID,
		Kind:           request.Kind,
		WorkstreamID:   workstream.record.ID,
		ConversationID: workstream.conversationID,
	}, nil
}

// OfferedFolderResource resolves a folder the user chose into the binding
// trusted code attaches. The choice is authorized against the folders the app
// can reach right now — the same set a Director decision may scope new work to —
// so a request naming a folder the app is not offering is rejected instead of
// binding a path nothing vouched for.
func (registry *Registry) OfferedFolderResource(workspaceID string) (WorkstreamFolderResource, error) {
	if registry == nil || registry.workspaces == nil {
		return WorkstreamFolderResource{}, fmt.Errorf(
			"%w: the registry has no workspace resources to resolve a folder with",
			ErrDirectorUnavailable,
		)
	}
	if err := registry.requireAvailable(); err != nil {
		return WorkstreamFolderResource{}, err
	}
	summaries, err := registry.workspaces.AvailableWorkspaces()
	if err != nil {
		return WorkstreamFolderResource{}, err
	}
	if err := registry.requireAvailable(); err != nil {
		return WorkstreamFolderResource{}, err
	}
	for _, summary := range summaries {
		if summary.ID != workspaceID {
			continue
		}
		folder := WorkstreamFolderResource{WorkspaceID: summary.ID, RootPath: summary.RootPath}
		if err := validateWorkstreamFolderResource(folder); err != nil {
			return WorkstreamFolderResource{}, err
		}
		return folder, nil
	}
	return WorkstreamFolderResource{}, fmt.Errorf(
		"%w: workspace %s is not a folder the app can offer",
		ErrDirectorIntentRejected,
		workspaceID,
	)
}

func workstreamFolderWorkspaceID(scope WorkstreamResourceScope) *string {
	if scope.Kind != WorkstreamResourceScopeFolder || scope.Folder == nil {
		return nil
	}
	workspaceID := scope.Folder.WorkspaceID
	return &workspaceID
}

package director

import "fmt"

// The trusted execution state a decision is carried out against.
//
// The decision protocol tells the Director what it may decide; this tells
// trusted product code what carrying that decision out addresses. Both come
// from the same durable fold, so the workstream the schema offered and the
// conversation the work runs on cannot be resolved from two derivations that
// disagree.

// WorkstreamExecutionTarget is the durable substrate one workstream executes
// on. It is trusted state: the model never sees a conversation id, a folder, or
// a run id it did not receive as an authorized reference.
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
	if !registry.started {
		return WorkstreamExecutionTarget{}, fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
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
// model names a durable failure event; the run it belongs to is trusted state,
// so a recovery restarts the work that actually failed rather than work the
// decision claimed.
func (registry *Registry) RecoverableRun(workstreamID string, failureEventID string) (string, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if !registry.started {
		return "", fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
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

func workstreamFolderWorkspaceID(scope WorkstreamResourceScope) *string {
	if scope.Kind != WorkstreamResourceScopeFolder || scope.Folder == nil {
		return nil
	}
	workspaceID := scope.Folder.WorkspaceID
	return &workspaceID
}

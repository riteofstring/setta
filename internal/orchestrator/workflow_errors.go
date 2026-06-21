package orchestrator

import "errors"

const WorkflowDraftRevisionConflictCode = "workflow_draft_revision_conflict"

type WorkflowConflictError struct {
	Code    string
	Message string
}

func (err *WorkflowConflictError) Error() string {
	return err.Message
}

func IsWorkflowConflictError(err error) (*WorkflowConflictError, bool) {
	var conflictErr *WorkflowConflictError
	if errors.As(err, &conflictErr) {
		return conflictErr, true
	}
	return nil, false
}

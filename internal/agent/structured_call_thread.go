package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/codexapp"
)

const (
	structuredCallThreadCleanupTimeout = 5 * time.Second
	// Codex maps an explicit null thread override to this standard-routing
	// sentinel and reports it as the effective tier in thread responses.
	codexDefaultServiceTier = "default"
)

func (runtime *Runtime) rejectStructuredCallThread(threadID string, cause error) error {
	cleanupCtx, cancel := context.WithTimeout(
		context.Background(),
		structuredCallThreadCleanupTimeout,
	)
	defer cancel()
	if threadID == "" {
		return cause
	}
	if err := runtime.UnsubscribeThread(cleanupCtx, threadID); err != nil {
		return errors.Join(
			cause,
			fmt.Errorf("unsubscribe rejected structured-call thread %s: %w", threadID, err),
		)
	}
	return cause
}

type structuredCallThreadResponse struct {
	ApprovalPolicy        json.RawMessage
	CWD                   codexapp.AbsolutePathBuf
	InstructionSources    []codexapp.LegacyAppPathString
	Model                 string
	ReasoningEffort       *codexapp.ReasoningEffort
	RuntimeWorkspaceRoots []codexapp.AbsolutePathBuf
	Sandbox               json.RawMessage
	ServiceTier           *string
	Thread                codexapp.Thread
}

func validateStructuredCallThreadResponse(
	workspaceRoot string,
	invocation Invocation,
	response structuredCallThreadResponse,
) error {
	if err := validateStructuredCallThreadPolicies(response); err != nil {
		return err
	}
	if err := validateStructuredCallThreadSelection(invocation, response); err != nil {
		return err
	}
	return validateStructuredCallThreadIsolation(workspaceRoot, response)
}

func validateStructuredCallThreadPolicies(response structuredCallThreadResponse) error {
	approvalMode, err := forkResponseApprovalMode(response.ApprovalPolicy)
	if err != nil {
		return err
	}
	if approvalMode != ApprovalModeNever {
		return fmt.Errorf("structured-call thread approval mode is %s, want never", approvalMode)
	}
	permissionMode, err := forkResponsePermissionMode(response.Sandbox)
	if err != nil {
		return err
	}
	if permissionMode != PermissionModeReadOnly {
		return fmt.Errorf(
			"structured-call thread permission mode is %s, want read_only",
			permissionMode,
		)
	}
	return nil
}

func validateStructuredCallThreadSelection(
	invocation Invocation,
	response structuredCallThreadResponse,
) error {
	if response.Model != invocation.Model {
		return fmt.Errorf(
			"structured-call thread model is %s, want %s",
			response.Model,
			invocation.Model,
		)
	}
	if response.ReasoningEffort == nil ||
		string(*response.ReasoningEffort) != invocation.ReasoningEffort {
		return fmt.Errorf(
			"structured-call thread reasoning effort is %s, want %s",
			optionalReasoningEffort(response.ReasoningEffort),
			invocation.ReasoningEffort,
		)
	}
	if !matchesStructuredCallServiceTier(response.ServiceTier, invocation.ServiceTier) {
		return fmt.Errorf(
			"structured-call thread service tier is %s, want %s",
			optionalAgentString(response.ServiceTier),
			optionalAgentString(invocation.ServiceTier),
		)
	}
	return nil
}

func validateStructuredCallThreadIsolation(
	workspaceRoot string,
	response structuredCallThreadResponse,
) error {
	if !sameWorkspaceRoot(workspaceRoot, string(response.CWD)) ||
		!sameWorkspaceRoot(workspaceRoot, string(response.Thread.CWD)) {
		return fmt.Errorf(
			"structured-call thread cwd is %s/%s, want %s",
			response.CWD,
			response.Thread.CWD,
			workspaceRoot,
		)
	}
	if len(response.RuntimeWorkspaceRoots) != 0 {
		return errors.New("structured-call thread response contains runtime workspace roots")
	}
	if len(response.InstructionSources) != 0 {
		return errors.New("structured-call thread response contains external instruction sources")
	}
	if !response.Thread.Ephemeral {
		return errors.New("structured-call thread must be ephemeral")
	}
	if response.Thread.ForkedFromId != nil || response.Thread.ParentThreadId != nil {
		return errors.New("structured-call thread must not inherit another provider thread")
	}
	return nil
}

func optionalReasoningEffort(value *codexapp.ReasoningEffort) string {
	if value == nil {
		return "<nil>"
	}
	return string(*value)
}

func matchesStructuredCallServiceTier(response *string, requested *string) bool {
	if requested == nil {
		return response != nil && *response == codexDefaultServiceTier
	}
	if response == nil {
		return false
	}
	return *response == *requested
}

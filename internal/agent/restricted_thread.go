package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/codexapp"
)

const (
	restrictedThreadCleanupTimeout = 5 * time.Second
	// Codex maps an explicit null thread override to this standard-routing
	// sentinel and reports it as the effective tier in thread responses.
	codexDefaultServiceTier        = "default"
	restrictedThreadInitialization = "Setta initialized this restricted durable thread. This is an inert history marker, not a request. Respond only to a later user turn under the thread's developer contract."
)

// RestrictedThreadRequest creates or resumes one durable model thread without
// workspace, shell, filesystem, MCP capability-root, or dynamic-tool access.
// The invocation must already be resolved to exact provider settings.
type RestrictedThreadRequest struct {
	WorkspaceRoot         string     `json:"workspaceRoot"`
	Invocation            Invocation `json:"invocation"`
	DeveloperInstructions string     `json:"developerInstructions"`
}

func (request RestrictedThreadRequest) Validate() error {
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	if err := validateRestrictedThreadInvocation(request.Invocation); err != nil {
		return err
	}
	if strings.TrimSpace(request.DeveloperInstructions) == "" ||
		strings.TrimSpace(request.DeveloperInstructions) != request.DeveloperInstructions {
		return errors.New("restricted thread developer instructions must be non-empty without surrounding whitespace")
	}
	return nil
}

func validateRestrictedThreadInvocation(invocation Invocation) error {
	if err := invocation.Validate(); err != nil {
		return err
	}
	if invocation.ModelSelectionProviderDefault || strings.TrimSpace(invocation.Model) == "" {
		return errors.New("restricted thread requires a catalog-resolved exact model")
	}
	if strings.TrimSpace(invocation.ReasoningEffort) == "" {
		return errors.New("restricted thread requires an exact reasoning effort")
	}
	if invocation.ServiceTier != nil && strings.TrimSpace(*invocation.ServiceTier) == "" {
		return errors.New("restricted thread service tier must be exact when present")
	}
	if invocation.PermissionMode != PermissionModeReadOnly || invocation.ApprovalMode != ApprovalModeNever {
		return errors.New("restricted thread requires read-only permission and no approvals")
	}
	return nil
}

func (runtime *Runtime) StartRestrictedThread(
	ctx context.Context,
	request RestrictedThreadRequest,
) (Thread, error) {
	if err := validateRestrictedThreadRuntimeRequest(runtime, ctx, request); err != nil {
		return Thread{}, err
	}
	config, err := readRestrictedModelThreadConfig(
		ctx,
		runtime.manager,
		request.WorkspaceRoot,
		request.Invocation,
	)
	if err != nil {
		return Thread{}, err
	}
	params, err := restrictedThreadStartParams(request, config)
	if err != nil {
		return Thread{}, err
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return Thread{}, fmt.Errorf("start restricted agent thread: %w", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode restricted agent thread start: %w", err)
	}
	thread, err := providerThread(response.Thread, response.Model)
	if err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			response.Thread.ID,
			fmt.Errorf("map restricted agent thread: %w", err),
		)
	}
	if err := validateRestrictedThreadResponse(request, restrictedThreadResponse{
		ApprovalPolicy:        response.ApprovalPolicy,
		CWD:                   response.CWD,
		InstructionSources:    response.InstructionSources,
		Model:                 response.Model,
		ReasoningEffort:       response.ReasoningEffort,
		RuntimeWorkspaceRoots: response.RuntimeWorkspaceRoots,
		Sandbox:               response.Sandbox,
		ServiceTier:           response.ServiceTier,
		Thread:                response.Thread,
	}); err != nil {
		return Thread{}, runtime.rejectRestrictedThread(thread.ID, err)
	}
	if err := runtime.MaterializeThread(ctx, thread.ID, restrictedThreadInitialization); err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			thread.ID,
			fmt.Errorf("materialize restricted agent thread %s: %w", thread.ID, err),
		)
	}
	return thread, nil
}

func (runtime *Runtime) rejectRestrictedThread(threadID string, cause error) error {
	return runtime.rejectRestrictedThreads(cause, threadID)
}

func (runtime *Runtime) rejectRestrictedThreads(cause error, threadIDs ...string) error {
	cleanupCtx, cancel := context.WithTimeout(context.Background(), restrictedThreadCleanupTimeout)
	defer cancel()
	seen := make(map[string]bool, len(threadIDs))
	for _, threadID := range threadIDs {
		if threadID == "" || seen[threadID] {
			continue
		}
		seen[threadID] = true
		if err := runtime.UnsubscribeThread(cleanupCtx, threadID); err != nil {
			cause = errors.Join(cause, fmt.Errorf("unsubscribe rejected restricted thread %s: %w", threadID, err))
		}
	}
	return cause
}

func (runtime *Runtime) ResumeRestrictedThread(
	ctx context.Context,
	threadID string,
	request RestrictedThreadRequest,
) (Thread, error) {
	if strings.TrimSpace(threadID) == "" {
		return Thread{}, errors.New("restricted provider thread id is required")
	}
	if err := validateRestrictedThreadRuntimeRequest(runtime, ctx, request); err != nil {
		return Thread{}, err
	}
	config, err := readRestrictedModelThreadConfig(
		ctx,
		runtime.manager,
		request.WorkspaceRoot,
		request.Invocation,
	)
	if err != nil {
		return Thread{}, err
	}
	params, err := restrictedThreadResumeParams(threadID, request, config)
	if err != nil {
		return Thread{}, err
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadResume, params)
	if err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			threadID,
			fmt.Errorf("resume restricted agent thread %s: %w", threadID, err),
		)
	}
	response, err := codexapp.DecodeThreadResumeResponse(raw)
	if err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			threadID,
			fmt.Errorf("decode restricted agent thread resume %s: %w", threadID, err),
		)
	}
	if response.Thread.ID != threadID {
		return Thread{}, runtime.rejectRestrictedThreads(
			fmt.Errorf("restricted agent thread resumed as %s, want %s", response.Thread.ID, threadID),
			threadID,
			response.Thread.ID,
		)
	}
	thread, err := providerThread(response.Thread, response.Model)
	if err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			threadID,
			fmt.Errorf("map restricted agent thread resume %s: %w", threadID, err),
		)
	}
	if err := validateRestrictedThreadResponse(request, restrictedThreadResponse{
		ApprovalPolicy:        response.ApprovalPolicy,
		CWD:                   response.CWD,
		InstructionSources:    response.InstructionSources,
		Model:                 response.Model,
		ReasoningEffort:       response.ReasoningEffort,
		RuntimeWorkspaceRoots: response.RuntimeWorkspaceRoots,
		Sandbox:               response.Sandbox,
		ServiceTier:           response.ServiceTier,
		Thread:                response.Thread,
	}); err != nil {
		return Thread{}, runtime.rejectRestrictedThread(
			threadID,
			fmt.Errorf("validate restricted agent thread resume %s: %w", threadID, err),
		)
	}
	return thread, nil
}

func validateRestrictedThreadRuntimeRequest(
	runtime *Runtime,
	ctx context.Context,
	request RestrictedThreadRequest,
) error {
	if runtime == nil || runtime.manager == nil {
		return errors.New("agent runtime is required")
	}
	if ctx == nil {
		return errors.New("restricted thread context is required")
	}
	return request.Validate()
}

func restrictedThreadStartParams(
	request RestrictedThreadRequest,
	config map[string]json.RawMessage,
) (codexapp.ThreadStartParams, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return codexapp.ThreadStartParams{}, err
	}
	allowFallback := false
	baseInstructions := restrictedThreadBaseInstructions
	ephemeral := false
	dynamicTools := []codexapp.DynamicToolSpec{}
	environments := []codexapp.TurnEnvironmentParams{}
	capabilityRoots := []codexapp.SelectedCapabilityRoot{}
	runtimeWorkspaceRoots := []codexapp.AbsolutePathBuf{}
	historyMode := codexapp.ThreadHistoryModeLegacy
	return codexapp.ThreadStartParams{
		AllowProviderModelFallback: &allowFallback,
		ApprovalPolicy:             approvalPolicy,
		BaseInstructions:           &baseInstructions,
		Config:                     &config,
		CWD:                        &request.WorkspaceRoot,
		DeveloperInstructions:      &request.DeveloperInstructions,
		DynamicTools:               &dynamicTools,
		Environments:               &environments,
		Ephemeral:                  &ephemeral,
		HistoryMode:                &historyMode,
		Model:                      &request.Invocation.Model,
		RuntimeWorkspaceRoots:      &runtimeWorkspaceRoots,
		Sandbox:                    &sandbox,
		SelectedCapabilityRoots:    &capabilityRoots,
		ServiceTier:                nullableServiceTier(request.Invocation.ServiceTier),
	}, nil
}

func restrictedThreadResumeParams(
	threadID string,
	request RestrictedThreadRequest,
	config map[string]json.RawMessage,
) (codexapp.ThreadResumeParams, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return codexapp.ThreadResumeParams{}, err
	}
	runtimeWorkspaceRoots := []codexapp.AbsolutePathBuf{}
	baseInstructions := restrictedThreadBaseInstructions
	excludeTurns := true
	return codexapp.ThreadResumeParams{
		ApprovalPolicy:        approvalPolicy,
		BaseInstructions:      &baseInstructions,
		Config:                &config,
		CWD:                   &request.WorkspaceRoot,
		DeveloperInstructions: &request.DeveloperInstructions,
		ExcludeTurns:          &excludeTurns,
		Model:                 &request.Invocation.Model,
		RuntimeWorkspaceRoots: &runtimeWorkspaceRoots,
		Sandbox:               &sandbox,
		ServiceTier:           nullableServiceTier(request.Invocation.ServiceTier),
		ThreadID:              threadID,
	}, nil
}

type restrictedThreadResponse struct {
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

func validateRestrictedThreadResponse(
	request RestrictedThreadRequest,
	response restrictedThreadResponse,
) error {
	return validateRestrictedModelThreadResponse(
		request.WorkspaceRoot,
		request.Invocation,
		false,
		response,
	)
}

func validateRestrictedModelThreadResponse(
	workspaceRoot string,
	invocation Invocation,
	expectedEphemeral bool,
	response restrictedThreadResponse,
) error {
	if err := validateRestrictedThreadPolicies(response); err != nil {
		return err
	}
	if err := validateRestrictedThreadSelection(invocation, response); err != nil {
		return err
	}
	return validateRestrictedThreadIsolation(workspaceRoot, expectedEphemeral, response)
}

func validateRestrictedThreadPolicies(response restrictedThreadResponse) error {
	approvalMode, err := forkResponseApprovalMode(response.ApprovalPolicy)
	if err != nil {
		return err
	}
	if approvalMode != ApprovalModeNever {
		return fmt.Errorf("restricted thread approval mode is %s, want never", approvalMode)
	}
	permissionMode, err := forkResponsePermissionMode(response.Sandbox)
	if err != nil {
		return err
	}
	if permissionMode != PermissionModeReadOnly {
		return fmt.Errorf("restricted thread permission mode is %s, want read_only", permissionMode)
	}
	return nil
}

func validateRestrictedThreadSelection(
	invocation Invocation,
	response restrictedThreadResponse,
) error {
	if response.Model != invocation.Model {
		return fmt.Errorf("restricted thread model is %s, want %s", response.Model, invocation.Model)
	}
	if response.ReasoningEffort == nil || string(*response.ReasoningEffort) != invocation.ReasoningEffort {
		return fmt.Errorf("restricted thread reasoning effort is %s, want %s", optionalReasoningEffort(response.ReasoningEffort), invocation.ReasoningEffort)
	}
	if !matchesRestrictedThreadServiceTier(response.ServiceTier, invocation.ServiceTier) {
		return fmt.Errorf("restricted thread service tier is %s, want %s", optionalAgentString(response.ServiceTier), optionalAgentString(invocation.ServiceTier))
	}
	return nil
}

func validateRestrictedThreadIsolation(
	workspaceRoot string,
	expectedEphemeral bool,
	response restrictedThreadResponse,
) error {
	if !sameWorkspaceRoot(workspaceRoot, string(response.CWD)) ||
		!sameWorkspaceRoot(workspaceRoot, string(response.Thread.CWD)) {
		return fmt.Errorf("restricted thread cwd is %s/%s, want %s", response.CWD, response.Thread.CWD, workspaceRoot)
	}
	if len(response.RuntimeWorkspaceRoots) != 0 {
		return errors.New("restricted thread response contains runtime workspace roots")
	}
	if len(response.InstructionSources) != 0 {
		return errors.New("restricted thread response contains external instruction sources")
	}
	if response.Thread.Ephemeral != expectedEphemeral {
		if expectedEphemeral {
			return errors.New("restricted thread must be ephemeral")
		}
		return errors.New("restricted thread must be durable")
	}
	if response.Thread.ForkedFromId != nil || response.Thread.ParentThreadId != nil {
		return errors.New("restricted thread must not inherit another provider thread")
	}
	return nil
}

func optionalReasoningEffort(value *codexapp.ReasoningEffort) string {
	if value == nil {
		return "<nil>"
	}
	return string(*value)
}

func sameOptionalAgentString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func matchesRestrictedThreadServiceTier(response *string, requested *string) bool {
	if requested == nil {
		return response != nil && *response == codexDefaultServiceTier
	}
	return sameOptionalAgentString(response, requested)
}

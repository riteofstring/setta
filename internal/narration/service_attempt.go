package narration

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

type serviceAttemptWorker struct {
	caller       *Caller
	committer    *OutputCommitter
	materializer *ContextMaterializer
	profiles     RoleProfileSource
	workspaces   WorkspaceResolver
}

func newServiceRegistry(
	service *Service,
	store *conversation.Store,
	workspaces WorkspaceResolver,
	agentRuntime ServiceAgentRuntime,
) (*Registry, error) {
	materializer, err := NewContextMaterializer(store)
	if err != nil {
		return nil, err
	}
	models, err := NewModelResolver(store, agentRuntime)
	if err != nil {
		return nil, err
	}
	caller, err := NewCaller(models, agentRuntime)
	if err != nil {
		return nil, err
	}
	committer, err := NewOutputCommitter(store)
	if err != nil {
		return nil, err
	}
	failures, err := NewFailureHandler(store)
	if err != nil {
		return nil, err
	}
	attempts := &serviceAttemptWorker{
		caller:       caller,
		committer:    committer,
		materializer: materializer,
		profiles:     store,
		workspaces:   workspaces,
	}
	worker, err := NewResilientWorker(attempts, failures)
	if err != nil {
		return nil, err
	}
	return NewRegistry(
		worker,
		WithRetryWait(service.retryWait),
		WithCompletionObserver(service.handleCompletion),
	)
}

func (worker *serviceAttemptWorker) PrepareAttempt(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	if err := worker.validateInvocation(invocation); err != nil {
		return nil, err
	}
	switch invocation.Request.Kind {
	case RequestKindProjection:
		return worker.prepareProjection(ctx, invocation)
	case RequestKindStatus:
		return worker.prepareStatus(ctx, invocation)
	case RequestKindCheckpoint:
		return worker.prepareCheckpoint(ctx, invocation)
	default:
		return nil, NewAttemptFailure(FailureKindInternal, fmt.Errorf(
			"narrator worker received operation %q",
			invocation.Request.Kind,
		))
	}
}

func (worker *serviceAttemptWorker) validateInvocation(invocation Invocation) error {
	if worker == nil || worker.caller == nil || worker.committer == nil ||
		worker.materializer == nil || worker.profiles == nil || worker.workspaces == nil {
		return NewAttemptFailure(FailureKindInternal, errors.New("narrator attempt worker is required"))
	}
	if err := invocation.Request.Validate(); err != nil {
		return NewAttemptFailure(FailureKindInternal, err)
	}
	if invocation.Generation == 0 {
		return NewAttemptFailure(FailureKindInternal, errors.New("narrator generation must be positive"))
	}
	return nil
}

func (worker *serviceAttemptWorker) prepareProjection(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	operation := *invocation.Request.Projection
	limits, err := worker.contextLimits(ctx, operation.WorkspaceID, invocation.Request.ConversationID)
	if err != nil {
		return nil, err
	}
	bundle, noWork, err := worker.materializeProjection(
		ctx,
		invocation.Request.ConversationID,
		invocation.Request.Trigger,
		operation,
		limits,
	)
	if err != nil {
		return nil, err
	}
	if noWork {
		return noOpPreparedCommit, nil
	}
	request := CallRequest{Projection: &bundle}
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "projection"); err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, request)
}

func (worker *serviceAttemptWorker) materializeProjection(
	ctx context.Context,
	conversationID string,
	trigger conversation.NarrationTrigger,
	operation ProjectionOperation,
	limits ContextLimits,
) (ProjectionContextBundle, bool, error) {
	materializeTrigger := trigger
	if trigger == conversation.NarrationTriggerTurnTerminal {
		materializeTrigger = conversation.NarrationTriggerProgressWindowElapsed
	}
	bundle, err := worker.materializer.Projection(ctx, ProjectionContextRequest{
		ConversationID:  conversationID,
		TurnID:          operation.TurnID,
		Trigger:         materializeTrigger,
		ThroughSequence: operation.ThroughSequence,
		Limits:          limits,
	})
	if err != nil {
		if errors.Is(err, ErrNoProjectionWork) || errors.Is(err, ErrCheckpointRequired) {
			return ProjectionContextBundle{}, true, nil
		}
		return ProjectionContextBundle{}, false, err
	}
	if trigger == conversation.NarrationTriggerTurnTerminal &&
		bundle.EvaluationRange.End == operation.ThroughSequence {
		bundle, err = worker.materializer.Projection(ctx, ProjectionContextRequest{
			ConversationID:  conversationID,
			TurnID:          operation.TurnID,
			Trigger:         trigger,
			ThroughSequence: operation.ThroughSequence,
			Limits:          limits,
		})
		if err != nil {
			return ProjectionContextBundle{}, false, err
		}
	}
	return bundle, false, nil
}

func (worker *serviceAttemptWorker) prepareStatus(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	operation := *invocation.Request.Status
	limits, err := worker.contextLimits(ctx, operation.WorkspaceID, invocation.Request.ConversationID)
	if err != nil {
		return nil, err
	}
	limits.RecentFinalSummaries = statusRecentFinalSummaries
	bundle, err := worker.materializer.Status(ctx, StatusContextRequest{
		ConversationID: invocation.Request.ConversationID,
		Question:       operation.Question,
		Limits:         limits,
	})
	if err != nil {
		return nil, err
	}
	request := CallRequest{Status: &bundle}
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "status"); err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, request)
}

func (worker *serviceAttemptWorker) prepareCheckpoint(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	operation := *invocation.Request.Checkpoint
	limits, err := worker.contextLimits(ctx, operation.WorkspaceID, invocation.Request.ConversationID)
	if err != nil {
		return nil, err
	}
	limits.RecentFinalSummaries = 0
	limits.MaxCheckpointSummaryBytes = maxCheckpointHistoricalSummary
	bundle, err := worker.materializer.Checkpoint(ctx, CheckpointContextRequest{
		ConversationID: invocation.Request.ConversationID,
		TurnID:         operation.TurnID,
		Limits:         limits,
	})
	if errors.Is(err, ErrNoCheckpointWork) {
		return noOpPreparedCommit, nil
	}
	if err != nil {
		return nil, err
	}
	request := CallRequest{Checkpoint: &bundle}
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "checkpoint"); err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, &narratorCallAttemptError{request: request, cause: err}
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, request)
}

func (worker *serviceAttemptWorker) callAndPrepare(
	ctx context.Context,
	invocation Invocation,
	workspaceRoot string,
	request CallRequest,
) (PreparedCommit, error) {
	request.ID = invocation.Request.ID
	request.Generation = invocation.Generation
	request.WorkspaceRoot = workspaceRoot
	result, err := worker.caller.Call(ctx, request)
	if err != nil {
		return nil, &narratorCallAttemptError{request: request, result: result, cause: err}
	}
	commit, err := worker.committer.Prepare(request, result)
	if err != nil {
		return nil, &narratorCallAttemptError{
			request: request,
			result:  result,
			cause:   NewAttemptFailure(FailureKindInternal, err),
		}
	}
	return commit, nil
}

func (worker *serviceAttemptWorker) contextLimits(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ContextLimits, error) {
	profile, err := worker.profiles.ReadEffectiveRoleProfile(
		ctx,
		workspaceID,
		conversationID,
		conversation.DefaultNarratorRoleProfile(),
	)
	if err != nil {
		return ContextLimits{}, err
	}
	if err := validateNarratorRoleProfile(profile); err != nil {
		return ContextLimits{}, NewAttemptFailure(FailureKindConfigurationInvalid, err)
	}
	return ContextLimits{
		MaxInputBytes:        profile.ContextBudget.MaxInputBytes,
		MaxTrajectoryEvents:  conversation.MaxNarratorContextTrajectoryEvents,
		RecentFinalSummaries: projectionRecentFinalSummaries,
	}, nil
}

func (worker *serviceAttemptWorker) resolveWorkspaceRoot(workspaceID string) (string, error) {
	resolvedWorkspace, err := worker.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return "", NewAttemptFailure(FailureKindStateUnavailable, fmt.Errorf(
			"resolve narrator workspace %s: %w",
			workspaceID,
			err,
		))
	}
	if resolvedWorkspace.ID != workspaceID {
		return "", NewAttemptFailure(FailureKindStateCorrupt, fmt.Errorf(
			"resolved narrator workspace is %s, want %s",
			resolvedWorkspace.ID,
			workspaceID,
		))
	}
	return resolvedWorkspace.RootPath, nil
}

func requireBundleWorkspace(
	authoritative AuthoritativeContext,
	want string,
	kind string,
) error {
	if authoritative.Conversation.WorkspaceID == want {
		return nil
	}
	return NewAttemptFailure(FailureKindStateCorrupt, fmt.Errorf(
		"narrator %s conversation workspace is %s, want %s",
		kind,
		authoritative.Conversation.WorkspaceID,
		want,
	))
}

func noOpPreparedCommit(context.Context) error {
	return nil
}

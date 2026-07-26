package narration

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/conversation"
)

type narratorInvocationStartStore interface {
	CommitNarratorInvocationStarted(
		context.Context,
		conversation.NarratorInvocationStartedCommit,
	) (conversation.NarratorState, error)
}

type serviceAttemptWorker struct {
	caller       *Caller
	committer    *OutputCommitter
	materializer *ContextMaterializer
	profiles     RoleProfileSource
	starts       narratorInvocationStartStore
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
	var callerOptions []CallerOption
	if service.callerClock != nil {
		callerOptions = append(callerOptions, WithCallerClock(service.callerClock))
	}
	caller, err := NewCaller(models, agentRuntime, callerOptions...)
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
		starts:       store,
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
	case RequestKindFocus:
		return worker.prepareFocus(ctx, invocation)
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
		worker.materializer == nil || worker.profiles == nil || worker.starts == nil ||
		worker.workspaces == nil {
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

func (worker *serviceAttemptWorker) prepareFocus(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	operation := *invocation.Request.Focus
	limits, err := worker.contextLimits(ctx, operation.WorkspaceID, invocation.Request.ConversationID)
	if err != nil {
		return nil, err
	}
	bundle, err := worker.materializer.Focus(ctx, FocusContextRequest{
		ConversationID: invocation.Request.ConversationID,
		TurnID:         operation.TurnID,
		Trigger:        invocation.Request.Trigger,
		SourceSequence: operation.SourceSequence,
		Limits:         limits,
	})
	if err != nil {
		return nil, err
	}
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "focus"); err != nil {
		return nil, err
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, CallRequest{Focus: &bundle})
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
	if invocation.Request.Trigger == conversation.NarrationTriggerTurnTerminal {
		var err error
		bundle, err = worker.markTerminalProjectionStarted(
			ctx,
			invocation.Request.ConversationID,
			bundle,
			limits.MaxInputBytes,
		)
		if err != nil {
			return nil, err
		}
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, CallRequest{Projection: &bundle})
}

func (worker *serviceAttemptWorker) markTerminalProjectionStarted(
	ctx context.Context,
	conversationID string,
	bundle ProjectionContextBundle,
	maxInputBytes int,
) (ProjectionContextBundle, error) {
	eventID, err := worker.committer.newID("conversation_event")
	if err != nil {
		return ProjectionContextBundle{}, NewAttemptFailure(FailureKindInternal, err)
	}
	startedAt, err := narratorInvocationStartedAt(bundle.PreCallCursor.UpdatedAt)
	if err != nil {
		return ProjectionContextBundle{}, NewAttemptFailure(FailureKindInternal, err)
	}
	state, err := worker.starts.CommitNarratorInvocationStarted(ctx, conversation.NarratorInvocationStartedCommit{
		ConversationID:   conversationID,
		Expected:         narratorStateExpectation(bundle.PreCallCursor),
		CommittedEventID: eventID,
		StartedAt:        startedAt,
	})
	if err != nil {
		return ProjectionContextBundle{}, NewAttemptFailure(
			FailureKindStateUnavailable,
			fmt.Errorf("commit narrator terminal projection start: %w", err),
		)
	}
	bundle.PreCallCursor = narratorCursor(state)
	bundle.InputBytes = 0
	size, err := contextBytes(bundle)
	if err != nil {
		return ProjectionContextBundle{}, NewAttemptFailure(FailureKindInternal, err)
	}
	if size > maxInputBytes {
		return ProjectionContextBundle{}, budgetError(
			ContextKindProjection,
			maxInputBytes,
			size,
			"terminal projection start marker must remain in the provider context",
		)
	}
	bundle.InputBytes = size
	return bundle, nil
}

func narratorInvocationStartedAt(expectedUpdatedAt string) (string, error) {
	expected, err := canonicalNarratorTime("narrator invocation expected updatedAt", expectedUpdatedAt)
	if err != nil {
		return "", err
	}
	started := time.Now().UTC()
	if !started.After(expected) {
		started = expected.Add(time.Nanosecond)
	}
	return started.Format(time.RFC3339Nano), nil
}

func (worker *serviceAttemptWorker) materializeProjection(
	ctx context.Context,
	conversationID string,
	trigger conversation.NarrationTrigger,
	operation ProjectionOperation,
	limits ContextLimits,
) (ProjectionContextBundle, bool, error) {
	bundle, err := worker.materializer.Projection(ctx, ProjectionContextRequest{
		ConversationID:  conversationID,
		TurnID:          operation.TurnID,
		Trigger:         trigger,
		ThroughSequence: operation.ThroughSequence,
		SemanticEvents:  operation.SemanticEvents,
		Limits:          limits,
	})
	if err != nil {
		return worker.handleProjectionMaterializationError(ctx, conversationID, trigger, operation, limits, err)
	}
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "projection"); err != nil {
		return ProjectionContextBundle{}, false, err
	}
	return bundle, false, nil
}

func (worker *serviceAttemptWorker) handleProjectionMaterializationError(
	ctx context.Context,
	conversationID string,
	trigger conversation.NarrationTrigger,
	operation ProjectionOperation,
	limits ContextLimits,
	sourceErr error,
) (ProjectionContextBundle, bool, error) {
	if trigger == conversation.NarrationTriggerTurnTerminal && errors.Is(sourceErr, ErrNoProjectionWork) {
		bundle, err := worker.materializer.Projection(ctx, ProjectionContextRequest{
			ConversationID:  conversationID,
			TurnID:          operation.TurnID,
			Trigger:         trigger,
			ThroughSequence: operation.ThroughSequence,
			SemanticEvents:  operation.SemanticEvents,
			Limits:          limits,
		})
		if err == nil {
			if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "projection"); err != nil {
				return ProjectionContextBundle{}, false, err
			}
			return bundle, false, nil
		}
		sourceErr = err
	}
	if errors.Is(sourceErr, ErrNoProjectionWork) {
		return ProjectionContextBundle{}, true, nil
	}
	return ProjectionContextBundle{}, false, sourceErr
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
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "status"); err != nil {
		return nil, err
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, CallRequest{Status: &bundle})
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
	if err := requireBundleWorkspace(bundle.Authoritative, operation.WorkspaceID, "checkpoint"); err != nil {
		return nil, err
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, CallRequest{Checkpoint: &bundle})
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
		return nil, err
	}
	commit, err := worker.committer.Prepare(request, result)
	if err != nil {
		return nil, NewAttemptFailure(FailureKindInternal, err)
	}
	return commit, nil
}

func (worker *serviceAttemptWorker) contextLimits(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ContextLimits, error) {
	profile := conversation.DefaultNarratorRoleProfile()
	if workspaceID != "" {
		var err error
		profile, err = worker.profiles.ReadEffectiveRoleProfile(
			ctx,
			workspaceID,
			conversationID,
			profile,
		)
		if err != nil {
			return ContextLimits{}, err
		}
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
	if workspaceID == "" {
		root, err := folderlessRuntimeRoot()
		if err != nil {
			return "", NewAttemptFailure(FailureKindStateUnavailable, err)
		}
		return root, nil
	}
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

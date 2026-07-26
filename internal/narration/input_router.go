package narration

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/conversation"
)

type ConversationInputRouter struct {
	store        *conversation.Store
	profiles     RoleProfileSource
	workspaces   WorkspaceResolver
	materializer *ConversationRouteContextMaterializer
	caller       *ConversationRouteCaller
	executor     ConversationRouteCommandExecutor
	newID        func(string) (string, error)
	now          func() time.Time
}

type ConversationRouteCommandExecutor interface {
	ExecuteConversationRouteCommand(context.Context, conversation.ConversationRouteDecisionRecord) error
}

type committedConversationRouteCommandError struct {
	cause error
}

func (err *committedConversationRouteCommandError) Error() string {
	return fmt.Sprintf("execute committed conversation route command: %v", err.cause)
}

func (err *committedConversationRouteCommandError) Unwrap() error {
	return err.cause
}

func NewConversationInputRouter(
	store *conversation.Store,
	workspaces WorkspaceResolver,
	agentRuntime ServiceAgentRuntime,
) (*ConversationInputRouter, error) {
	if store == nil || workspaces == nil || agentRuntime == nil {
		return nil, errors.New("conversation input router requires store, workspace resolver, and agent runtime")
	}
	materializer, err := NewConversationRouteContextMaterializer(store)
	if err != nil {
		return nil, err
	}
	models, err := NewModelResolver(store, agentRuntime)
	if err != nil {
		return nil, err
	}
	caller, err := NewConversationRouteCaller(models, agentRuntime)
	if err != nil {
		return nil, err
	}
	return &ConversationInputRouter{
		store:        store,
		profiles:     store,
		workspaces:   workspaces,
		materializer: materializer,
		caller:       caller,
		newID:        randomServiceID,
		now:          time.Now,
	}, nil
}

// ProcessNext claims at most one local input. The store claim enforces
// conversation submission order, while different router instances may run
// concurrently for different conversations. Every claimed input is classified
// by the local narrator/router.
func (router *ConversationInputRouter) ProcessNext(
	ctx context.Context,
	conversationID string,
) (bool, error) {
	if err := validateConversationInputRouter(router, ctx); err != nil {
		return false, err
	}
	if router.executor != nil {
		pending, found, err := router.store.ReadNextPendingConversationRouteCommand(ctx, conversationID)
		if err != nil {
			return false, err
		}
		if found {
			return true, router.executeCommittedCommand(ctx, pending)
		}
	}
	startedAt := router.timestamp()
	work, found, err := router.store.ClaimNextConversationInput(ctx, conversationID, startedAt)
	if err != nil {
		return false, err
	}
	if !found {
		return false, nil
	}
	record, err := router.routeClaimedInput(ctx, work)
	if err != nil {
		return true, router.handleClaimedInputError(ctx, work, err)
	}
	if router.executor != nil {
		return true, router.executeCommittedCommand(ctx, record)
	}
	return true, nil
}

func (router *ConversationInputRouter) executeCommittedCommand(
	ctx context.Context,
	record conversation.ConversationRouteDecisionRecord,
) error {
	if err := router.executor.ExecuteConversationRouteCommand(ctx, record); err != nil {
		return &committedConversationRouteCommandError{cause: err}
	}
	completedAt, err := router.timestampAfter(record.DecidedAt)
	if err != nil {
		return &committedConversationRouteCommandError{cause: err}
	}
	if err := router.store.CompleteConversationRouteCommand(ctx, record.ID, completedAt); err != nil {
		return &committedConversationRouteCommandError{cause: err}
	}
	return nil
}

func validateConversationInputRouter(router *ConversationInputRouter, ctx context.Context) error {
	if router == nil || router.store == nil || router.profiles == nil ||
		router.workspaces == nil || router.materializer == nil || router.caller == nil ||
		router.newID == nil || router.now == nil {
		return errors.New("conversation input router is required")
	}
	if ctx == nil {
		return errors.New("conversation input router context is required")
	}
	return nil
}

func (router *ConversationInputRouter) handleClaimedInputError(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	cause error,
) error {
	if ctx.Err() != nil || errors.Is(cause, context.Canceled) {
		return cause
	}
	var committed *committedConversationRouteCommandError
	if errors.As(cause, &committed) {
		return cause
	}
	if err := router.failClaimedInput(ctx, work, cause); err != nil {
		return errors.Join(cause, err)
	}
	return nil
}

func (router *ConversationInputRouter) routeClaimedInput(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
) (conversation.ConversationRouteDecisionRecord, error) {
	workspaceID, profile, limits, err := router.contextLimits(ctx, work.Input.Input.ConversationID)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	bundle, audit, err := router.materializer.Materialize(ctx, ConversationRouteContextRequest{
		Work:   work,
		Limits: limits,
	})
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, classifyConversationRouteContextError(err)
	}
	if decision, ok, err := productInvariantConversationRouteDecision(work, bundle); err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	} else if ok {
		audit.DecisionAuthority = conversation.ConversationRouteDecisionAuthorityProductInvariant
		invocation, err := router.productInvariantInvocation(profile, work.RoutingStartedAt)
		if err != nil {
			return conversation.ConversationRouteDecisionRecord{}, err
		}
		if invocation.EndedAt == nil {
			return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
				FailureKindInternal,
				errors.New("conversation router product invariant invocation has no end time"),
			)
		}
		return router.commitConversationRouteDecision(
			ctx,
			work,
			bundle,
			audit,
			decision,
			invocation,
			*invocation.EndedAt,
		)
	}
	workspaceRoot, err := router.resolveConversationRouteWorkspaceRoot(workspaceID)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	requestID, err := router.newID("conversation_route_call")
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	call, err := router.caller.Call(ctx, requestID, workspaceRoot, bundle)
	if err != nil {
		if conversationRouteProviderOutputInvalid(err) {
			return router.commitProductInvariantRecovery(ctx, work, bundle, audit, profile)
		}
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	return router.commitConversationRouteCall(ctx, work, bundle, audit, call)
}

func productInvariantConversationRouteDecision(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
) (conversation.ConversationRouteDecision, bool, error) {
	if !productInvariantInitialParentRoute(work, bundle) {
		return conversation.ConversationRouteDecision{}, false, nil
	}
	decision, err := conversationRouteAuthoredDecision(
		conversation.ConversationRouteDecisionKindSendToParent,
		conversation.AuthoredInput{Text: work.Input.Input.Text},
	)
	if err != nil {
		return conversation.ConversationRouteDecision{}, false, NewAttemptFailure(FailureKindInternal, err)
	}
	return decision, true, nil
}

func productInvariantInitialParentRoute(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
) bool {
	return bundle.Authoritative.Conversation.WorkspaceID != "" &&
		productInvariantInitialInput(work) &&
		productInvariantBlankParentRouteContext(bundle)
}

func productInvariantInitialInput(work conversation.ConversationInputRoutingWork) bool {
	return work.ClarificationReply == nil && work.PriorClarification == nil
}

func productInvariantBlankParentRouteContext(bundle ConversationRouteContextBundle) bool {
	return conversationRouteDecisionKindIncluded(
		bundle.AllowedDecisionKinds,
		conversation.ConversationRouteDecisionKindSendToParent,
	) &&
		productInvariantBlankAuthoritativeContext(bundle.Authoritative) &&
		productInvariantBlankRouteHistory(bundle)
}

func productInvariantBlankAuthoritativeContext(
	authoritative ConversationRouteAuthoritativeContext,
) bool {
	identity := authoritative.Conversation
	return identity.Status == conversation.ConversationStatusIdle &&
		identity.LatestTrajectorySequence == 0 &&
		authoritative.CurrentInstructions == nil &&
		authoritative.CurrentPlan == nil &&
		len(authoritative.ActiveActivities) == 0 &&
		len(authoritative.PendingApprovals) == 0 &&
		len(authoritative.ActiveSubagents) == 0 &&
		len(authoritative.Artifacts) == 0 &&
		authoritative.CurrentFocus == ""
}

func productInvariantBlankRouteHistory(bundle ConversationRouteContextBundle) bool {
	return len(bundle.Trajectory) == 0 &&
		bundle.AvailableTrajectoryRange == nil &&
		bundle.IncludedTrajectoryRange == nil &&
		len(bundle.PriorNarration) == 0 &&
		len(bundle.PriorRouteDecisions) == 0 &&
		len(bundle.ValidCompletedForkPoints) == 0
}

func (router *ConversationInputRouter) commitProductInvariantRecovery(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	audit conversation.ConversationRouteContextAudit,
	profile conversation.RoleProfile,
) (conversation.ConversationRouteDecisionRecord, error) {
	decision, ok, err := productInvariantRecoveryRouteDecision(work, bundle)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	if !ok {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindProviderOutputInvalid,
			errors.New("conversation router provider output could not be repaired and no product invariant route was available"),
		)
	}
	audit.DecisionAuthority = conversation.ConversationRouteDecisionAuthorityProductInvariant
	invocation, err := router.productInvariantInvocation(profile, work.RoutingStartedAt)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	if invocation.EndedAt == nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindInternal,
			errors.New("conversation router product invariant recovery invocation has no end time"),
		)
	}
	return router.commitConversationRouteDecision(
		ctx,
		work,
		bundle,
		audit,
		decision,
		invocation,
		*invocation.EndedAt,
	)
}

func productInvariantRecoveryRouteDecision(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
) (conversation.ConversationRouteDecision, bool, error) {
	if work.ClarificationReply != nil || work.PriorClarification != nil {
		return conversation.ConversationRouteDecision{}, false, nil
	}
	input := conversation.AuthoredInput{Text: work.Input.Input.Text}
	allowed := bundle.AllowedDecisionKinds
	if conversationRouteDecisionKindIncluded(
		allowed,
		conversation.ConversationRouteDecisionKindSendToParent,
	) {
		return productInvariantAuthoredRouteDecision(
			conversation.ConversationRouteDecisionKindSendToParent,
			input,
		)
	}
	queueAllowed := conversationRouteDecisionKindIncluded(
		allowed,
		conversation.ConversationRouteDecisionKindQueueParentTurn,
	)
	steerAllowed := conversationRouteDecisionKindIncluded(
		allowed,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
	)
	switch {
	case queueAllowed && !steerAllowed:
		return productInvariantAuthoredRouteDecision(
			conversation.ConversationRouteDecisionKindQueueParentTurn,
			input,
		)
	case steerAllowed && !queueAllowed:
		return productInvariantAuthoredRouteDecision(
			conversation.ConversationRouteDecisionKindSteerParentTurn,
			input,
		)
	case queueAllowed && steerAllowed && conversationRouteDecisionKindIncluded(
		allowed,
		conversation.ConversationRouteDecisionKindClarify,
	):
		return conversation.ConversationRouteDecision{
			Kind: conversation.ConversationRouteDecisionKindClarify,
			Clarify: &conversation.ClarifyConversationRouteDecision{
				Question: "Should I change the current run or queue this as the next task?",
			},
		}, true, nil
	default:
		return conversation.ConversationRouteDecision{}, false, nil
	}
}

func productInvariantAuthoredRouteDecision(
	kind conversation.ConversationRouteDecisionKind,
	input conversation.AuthoredInput,
) (conversation.ConversationRouteDecision, bool, error) {
	decision, err := conversationRouteAuthoredDecision(kind, input)
	if err != nil {
		return conversation.ConversationRouteDecision{}, false, NewAttemptFailure(FailureKindInternal, err)
	}
	return decision, true, nil
}

func (router *ConversationInputRouter) commitConversationRouteCall(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	audit conversation.ConversationRouteContextAudit,
	call ConversationRouteCallResult,
) (conversation.ConversationRouteDecisionRecord, error) {
	invocation, err := router.successfulInvocation(call)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	return router.commitConversationRouteDecision(
		ctx,
		work,
		bundle,
		audit,
		call.Decision,
		invocation,
		call.EndedAt,
	)
}

func (router *ConversationInputRouter) commitConversationRouteDecision(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	audit conversation.ConversationRouteContextAudit,
	decision conversation.ConversationRouteDecision,
	invocation conversation.ResolvedInvocation,
	after string,
) (conversation.ConversationRouteDecisionRecord, error) {
	command, err := router.buildCommand(work, bundle, decision)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	decisionID, err := router.newID("conversation_route_decision")
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	decidedAt, err := router.timestampAfter(after)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	commit := conversation.ConversationRouteDecisionCommit{
		ID:                   decisionID,
		ConversationID:       work.Input.Input.ConversationID,
		InputID:              work.Input.Input.ID,
		ClarificationInputID: conversationRouteClarificationInputID(work),
		RoutingAttempt:       work.RoutingAttempt,
		RouterContext:        audit,
		ResolvedInvocation:   invocation,
		Decision:             decision,
		ResultingCommand:     command,
		DecidedAt:            decidedAt,
	}
	if err := commit.Validate(); err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	record, err := router.store.CommitConversationRouteDecision(ctx, commit)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindStateUnavailable, err)
	}
	return record, nil
}

func (router *ConversationInputRouter) productInvariantInvocation(
	profile conversation.RoleProfile,
	after string,
) (conversation.ResolvedInvocation, error) {
	id, err := router.newID("conversation_router_invariant")
	if err != nil {
		return conversation.ResolvedInvocation{}, NewAttemptFailure(FailureKindInternal, err)
	}
	startedAt, err := router.timestampAfter(after)
	if err != nil {
		return conversation.ResolvedInvocation{}, NewAttemptFailure(FailureKindInternal, err)
	}
	endedAt, err := router.timestampAfter(startedAt)
	if err != nil {
		return conversation.ResolvedInvocation{}, NewAttemptFailure(FailureKindInternal, err)
	}
	invocation := conversation.ResolvedInvocation{
		ID:                 id,
		Role:               conversation.RoleNarrator,
		Provider:           conversation.ProviderCodex,
		Requested:          profile,
		Resolved:           productInvariantResolvedSettings(profile),
		ProviderReferences: conversation.InvocationProviderReferences{},
		ModelReroutes:      []conversation.InvocationModelReroute{},
		StartedAt:          startedAt,
		EndedAt:            &endedAt,
		Outcome:            conversation.InvocationOutcomeSucceeded,
	}
	if err := invocation.Validate(); err != nil {
		return conversation.ResolvedInvocation{}, NewAttemptFailure(FailureKindInternal, err)
	}
	return invocation, nil
}

func productInvariantResolvedSettings(
	profile conversation.RoleProfile,
) conversation.ResolvedInvocationSettings {
	return conversation.ResolvedInvocationSettings{
		ModelID:           "product-invariant",
		ReasoningEffort:   profile.ReasoningEffort,
		ServiceTier:       cloneOptionalString(profile.ServiceTier),
		PermissionProfile: profile.PermissionProfile,
	}
}

func (router *ConversationInputRouter) contextLimits(
	ctx context.Context,
	conversationID string,
) (string, conversation.RoleProfile, ContextLimits, error) {
	workspaceBindingID, err := router.store.ReadConversationWorkspaceBindingID(ctx, conversationID)
	if err != nil {
		return "", conversation.RoleProfile{}, ContextLimits{}, NewAttemptFailure(FailureKindStateUnavailable, err)
	}
	workspaceID := ""
	profile := conversation.DefaultNarratorRoleProfile()
	if workspaceBindingID != nil {
		workspaceID = *workspaceBindingID
	}
	profile, err = router.profiles.ReadEffectiveRoleProfile(
		ctx,
		workspaceBindingID,
		conversationID,
		profile,
	)
	if err != nil {
		return "", conversation.RoleProfile{}, ContextLimits{}, NewAttemptFailure(FailureKindConfigurationInvalid, err)
	}
	if err := validateNarratorRoleProfile(profile); err != nil {
		return "", conversation.RoleProfile{}, ContextLimits{}, NewAttemptFailure(FailureKindConfigurationInvalid, err)
	}
	return workspaceID, profile, ContextLimits{
		MaxInputBytes:        profile.ContextBudget.MaxInputBytes,
		MaxTrajectoryEvents:  conversation.MaxConversationRouterTrajectoryEvents,
		RecentFinalSummaries: 0,
	}, nil
}

func (router *ConversationInputRouter) resolveWorkspaceRoot(workspaceID string) (string, error) {
	resolved, err := router.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return "", NewAttemptFailure(FailureKindStateUnavailable, err)
	}
	if resolved.ID != workspaceID {
		return "", NewAttemptFailure(
			FailureKindStateCorrupt,
			fmt.Errorf("resolved conversation router workspace is %s, want %s", resolved.ID, workspaceID),
		)
	}
	return resolved.RootPath, nil
}

func (router *ConversationInputRouter) resolveConversationRouteWorkspaceRoot(
	workspaceID string,
) (string, error) {
	if workspaceID == "" {
		root, err := folderlessRuntimeRoot()
		if err != nil {
			return "", NewAttemptFailure(FailureKindStateUnavailable, err)
		}
		return root, nil
	}
	return router.resolveWorkspaceRoot(workspaceID)
}

func (router *ConversationInputRouter) buildCommand(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	decision conversation.ConversationRouteDecision,
) (conversation.ConversationRouteCommand, error) {
	newID := router.newID
	switch decision.Kind {
	case conversation.ConversationRouteDecisionKindSendToParent:
		turnID, err := conversationRouteCommandID(newID, "conversation_turn")
		return conversation.ConversationRouteCommand{
			Kind: decision.Kind,
			SendToParent: &conversation.SendToParentConversationRouteCommand{
				TurnID: turnID, AuthoredInput: decision.SendToParent.AuthoredInput,
			},
		}, err
	case conversation.ConversationRouteDecisionKindQueueParentTurn:
		turnID, err := conversationRouteCommandID(newID, "conversation_turn")
		return conversation.ConversationRouteCommand{
			Kind: decision.Kind,
			QueueParentTurn: &conversation.QueueParentTurnConversationRouteCommand{
				TurnID: turnID, AuthoredInput: decision.QueueParentTurn.AuthoredInput,
			},
		}, err
	case conversation.ConversationRouteDecisionKindSteerParentTurn:
		return conversationRouteSteerCommand(bundle, decision)
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator:
		requestID, err := conversationRouteCommandID(newID, "narrator_status")
		return conversation.ConversationRouteCommand{
			Kind: decision.Kind,
			AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteCommand{
				RequestID: requestID, Question: decision.AnswerAsNarrator.Question,
			},
		}, err
	case conversation.ConversationRouteDecisionKindCreateSideConversation:
		return conversationRouteSideCommand(newID, work, decision)
	case conversation.ConversationRouteDecisionKindForkConversation:
		childID, err := conversationRouteCommandID(newID, "conversation")
		if err != nil {
			return conversation.ConversationRouteCommand{}, err
		}
		turnID, err := conversationRouteCommandID(newID, "conversation_turn")
		return conversation.ConversationRouteCommand{
			Kind: decision.Kind,
			ForkConversation: &conversation.ForkConversationRouteCommand{
				ChildConversationID: childID,
				ForkedAtTurnID:      decision.ForkConversation.ForkedAtTurnID,
				TurnID:              turnID,
				Input:               decision.ForkConversation.Input,
				ProposedTitle:       decision.ForkConversation.ProposedTitle,
			},
		}, err
	case conversation.ConversationRouteDecisionKindClarify:
		return conversation.ConversationRouteCommand{
			Kind:    decision.Kind,
			Clarify: &conversation.ClarifyConversationRouteCommand{Question: decision.Clarify.Question},
		}, nil
	default:
		return conversation.ConversationRouteCommand{}, NewAttemptFailure(
			FailureKindInternal,
			fmt.Errorf("unsupported conversation router decision %q", decision.Kind),
		)
	}
}

func conversationRouteCommandID(
	newID func(string) (string, error),
	prefix string,
) (string, error) {
	id, err := newID(prefix)
	if err != nil {
		return "", NewAttemptFailure(
			FailureKindInternal,
			fmt.Errorf("generate conversation route command %s id: %w", prefix, err),
		)
	}
	return id, nil
}

func conversationRouteSteerCommand(
	bundle ConversationRouteContextBundle,
	decision conversation.ConversationRouteDecision,
) (conversation.ConversationRouteCommand, error) {
	current := bundle.Authoritative.CurrentInstructions
	if current == nil || current.TurnStatus != conversation.TurnStatusRunning {
		return conversation.ConversationRouteCommand{}, NewAttemptFailure(
			FailureKindStateUnavailable,
			errors.New("conversation router steering has no active turn"),
		)
	}
	return conversation.ConversationRouteCommand{
		Kind: decision.Kind,
		SteerParentTurn: &conversation.SteerParentTurnConversationRouteCommand{
			TargetTurnID: current.TurnID, AuthoredInput: decision.SteerParentTurn.AuthoredInput,
		},
	}, nil
}

func conversationRouteSideCommand(
	newID func(string) (string, error),
	work conversation.ConversationInputRoutingWork,
	decision conversation.ConversationRouteDecision,
) (conversation.ConversationRouteCommand, error) {
	sideID, err := conversationRouteCommandID(newID, "side_conversation")
	if err != nil {
		return conversation.ConversationRouteCommand{}, err
	}
	turnID, err := conversationRouteCommandID(newID, "side_turn")
	return conversation.ConversationRouteCommand{
		Kind: decision.Kind,
		CreateSideConversation: &conversation.CreateSideConversationRouteCommand{
			SideConversationID: sideID,
			TurnID:             turnID,
			Input:              decision.CreateSideConversation.Input,
		},
	}, err
}

func (router *ConversationInputRouter) successfulInvocation(
	call ConversationRouteCallResult,
) (conversation.ResolvedInvocation, error) {
	id, err := router.newID("conversation_router_invocation")
	if err != nil {
		return conversation.ResolvedInvocation{}, err
	}
	requestID := call.RequestID
	turnID := call.ProviderTurnID
	endedAt := call.EndedAt
	invocation := conversation.ResolvedInvocation{
		ID:        id,
		Role:      conversation.RoleNarrator,
		Provider:  conversation.ProviderCodex,
		Requested: call.Model.RequestedProfile,
		Resolved:  call.Model.Settings,
		ProviderReferences: conversation.InvocationProviderReferences{
			TurnID:    &turnID,
			RequestID: &requestID,
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     call.StartedAt,
		EndedAt:       &endedAt,
		Outcome:       conversation.InvocationOutcomeSucceeded,
	}
	if err := invocation.Validate(); err != nil {
		return conversation.ResolvedInvocation{}, err
	}
	return invocation, nil
}

func (router *ConversationInputRouter) failClaimedInput(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	cause error,
) error {
	kind, classified, classificationErr := classifyTypedFailure(cause)
	if classificationErr != nil {
		return classificationErr
	}
	if !classified {
		kind = FailureKindInternal
	}
	diagnosticReference := fmt.Sprintf(
		"conversation_router:%s:%d",
		conversationRouteActiveInputID(work),
		work.RoutingAttempt,
	)
	return router.failClaimedInputWithFailure(ctx, work, conversation.Failure{
		Code:                "conversation_router_" + string(kind),
		Message:             conversationRouteFailureMessage(kind),
		Retryable:           true,
		DiagnosticReference: diagnosticReference,
	})
}

func (router *ConversationInputRouter) failClaimedInputWithFailure(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
	reason conversation.Failure,
) error {
	failedAt, err := router.timestampAfter(work.RoutingStartedAt)
	if err != nil {
		return err
	}
	return router.store.FailConversationInputRouting(ctx, conversation.ConversationInputRoutingFailure{
		ConversationID:       work.Input.Input.ConversationID,
		InputID:              work.Input.Input.ID,
		ClarificationInputID: conversationRouteClarificationInputID(work),
		RoutingAttempt:       work.RoutingAttempt,
		Failure:              reason,
		FailedAt:             failedAt,
	})
}

func classifyConversationRouteContextError(err error) error {
	if errors.Is(err, ErrContextBudgetExceeded) {
		return NewAttemptFailure(FailureKindContextBudgetExceeded, err)
	}
	if conversation.IsStateConflict(err) {
		return NewAttemptFailure(FailureKindStateUnavailable, err)
	}
	var corrupt *conversation.CorruptStateError
	if errors.As(err, &corrupt) {
		return NewAttemptFailure(FailureKindStateCorrupt, err)
	}
	return NewAttemptFailure(FailureKindStateUnavailable, err)
}

func conversationRouteFailureMessage(kind FailureKind) string {
	switch kind {
	case FailureKindProviderUnavailable:
		return "Conversation routing is temporarily unavailable because the narrator model could not be reached."
	case FailureKindProviderOutputInvalid:
		return "Conversation routing is temporarily unavailable."
	case FailureKindConfigurationInvalid:
		return "Conversation routing is unavailable because the narrator model configuration is invalid."
	case FailureKindContextBudgetExceeded:
		return "Conversation routing is unavailable because the required authoritative context exceeds its configured budget."
	case FailureKindStateUnavailable:
		return "Conversation routing is temporarily unavailable because its authoritative state changed or could not be read."
	case FailureKindStateCorrupt:
		return "Conversation routing is unavailable because its durable state is invalid."
	case FailureKindInternal:
		return "Conversation routing is temporarily unavailable because an internal router contract failed."
	default:
		return "Conversation routing is temporarily unavailable."
	}
}

func conversationRouteClarificationInputID(
	work conversation.ConversationInputRoutingWork,
) *string {
	if work.ClarificationReply == nil {
		return nil
	}
	id := work.ClarificationReply.Input.ID
	return &id
}

func conversationRouteActiveInputID(work conversation.ConversationInputRoutingWork) string {
	if work.ClarificationReply != nil {
		return work.ClarificationReply.Input.ID
	}
	return work.Input.Input.ID
}

func (router *ConversationInputRouter) timestamp() string {
	return router.now().UTC().Format(time.RFC3339Nano)
}

func (router *ConversationInputRouter) timestampAfter(previous string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return "", err
	}
	candidate := router.now().UTC()
	if !candidate.After(parsed) {
		candidate = parsed.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

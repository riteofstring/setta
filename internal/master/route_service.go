package master

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"sync"
	"time"

	"setta/internal/conversationindex"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

type RouteStore interface {
	ClaimNextMasterRouteInput(context.Context, string) (InputRoutingWork, bool, error)
	ReadMasterRouteTargets(context.Context, []string, int) ([]RouteConversationTarget, error)
	ListRecentMasterRouteDecisions(context.Context, int) ([]RouteDecisionRecord, error)
	CommitMasterRouteDecision(context.Context, RouteDecisionCommit) (RouteDecisionRecord, error)
	FailMasterInputRouting(context.Context, InputRoutingFailure) error
	RecoverMasterInputRouting(context.Context, string) error
	WaitForPendingMasterRouteInputs(context.Context) error
}

type CandidateRetriever interface {
	RetrieveCandidates(context.Context, conversationindex.CandidateRequest) ([]conversationindex.Candidate, error)
}

type RouteWorkspaceSource interface {
	Session() workspacesession.WorkspaceSession
	ResolveActiveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type RouteSessionSource interface {
	EnsureSession(context.Context) (Session, error)
	StructuredSessionCaller
}

type RouteService struct {
	store      RouteStore
	candidates CandidateRetriever
	workspaces RouteWorkspaceSource
	sessions   RouteSessionSource
	caller     *RouteCaller
	newID      func(string) (string, error)
	now        func() time.Time

	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	tasks           sync.WaitGroup
	shutdownOnce    sync.Once
}

func NewRouteService(
	store RouteStore,
	candidates CandidateRetriever,
	workspaces RouteWorkspaceSource,
	sessions RouteSessionSource,
) (*RouteService, error) {
	if store == nil || candidates == nil || workspaces == nil || sessions == nil {
		return nil, errors.New("master route service requires store, candidates, workspaces, and session")
	}
	caller, err := NewRouteCaller(sessions)
	if err != nil {
		return nil, err
	}
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	service := &RouteService{
		store:           store,
		candidates:      candidates,
		workspaces:      workspaces,
		sessions:        sessions,
		caller:          caller,
		newID:           randomRouteID,
		now:             time.Now,
		lifecycleCtx:    lifecycleCtx,
		lifecycleCancel: lifecycleCancel,
	}
	if err := service.store.RecoverMasterInputRouting(
		context.Background(),
		service.timestamp(),
	); err != nil {
		lifecycleCancel()
		return nil, fmt.Errorf("recover master input routing: %w", err)
	}
	service.tasks.Add(1)
	go service.run()
	return service, nil
}

func (service *RouteService) ProcessNext(ctx context.Context) (bool, error) {
	if err := validateRouteServiceRequest(service, ctx); err != nil {
		return false, err
	}
	work, found, err := service.store.ClaimNextMasterRouteInput(ctx, service.timestamp())
	if err != nil || !found {
		return false, err
	}
	if err := service.routeOrFailClaimedInput(ctx, work); err != nil {
		return true, err
	}
	return true, nil
}

func validateRouteServiceRequest(service *RouteService, ctx context.Context) error {
	if service == nil || service.store == nil || service.candidates == nil ||
		service.workspaces == nil || service.sessions == nil || service.caller == nil ||
		service.newID == nil || service.now == nil {
		return errors.New("master route service is unavailable")
	}
	if ctx == nil {
		return errors.New("master route context is required")
	}
	return nil
}

func (service *RouteService) routeOrFailClaimedInput(
	ctx context.Context,
	work InputRoutingWork,
) error {
	err := service.routeClaimedInput(ctx, work)
	if err == nil {
		return nil
	}
	if ctx.Err() != nil || errors.Is(err, context.Canceled) {
		return err
	}
	if failErr := service.failClaimedInput(ctx, work, err); failErr != nil {
		return errors.Join(err, failErr)
	}
	return nil
}

func (service *RouteService) routeClaimedInput(
	ctx context.Context,
	work InputRoutingWork,
) error {
	materialized, err := service.materializeClaimedInput(ctx, work)
	if err != nil {
		return err
	}
	requestID, err := service.newID("master_route_call")
	if err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	call, err := service.caller.Call(ctx, requestID, materialized)
	if err != nil {
		return err
	}
	return service.commitGeneratedRoute(ctx, work, materialized, call)
}

func (service *RouteService) materializeClaimedInput(
	ctx context.Context,
	work InputRoutingWork,
) (RouteContextMaterialization, error) {
	session, err := service.sessions.EnsureSession(ctx)
	if err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindConfigurationInvalid, err)
	}
	retrieval, queryTruncated, err := CandidateRequestForInput(work.Input.Input)
	if err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	candidates, err := service.candidates.RetrieveCandidates(ctx, retrieval)
	if err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	targetIDs := routeContextTargetIDs(work.Input.Input, candidates)
	targets, err := service.store.ReadMasterRouteTargets(ctx, targetIDs, MaxRouteForkPointsPerTarget)
	if err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	if err := validateRequiredRouteTargets(work.Input.Input, candidates, targets); err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	prior, err := service.store.ListRecentMasterRouteDecisions(ctx, MaxRecentRouteDecisionCount)
	if err != nil {
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	materialized, err := MaterializeRouteContext(
		work,
		session,
		service.workspaces.Session(),
		retrieval,
		queryTruncated,
		candidates,
		targets,
		prior,
	)
	if err != nil {
		var budget *RouteContextBudgetError
		if errors.As(err, &budget) {
			return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindContextBudgetExceeded, err)
		}
		return RouteContextMaterialization{}, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	return materialized, nil
}

func (service *RouteService) commitGeneratedRoute(
	ctx context.Context,
	work InputRoutingWork,
	materialized RouteContextMaterialization,
	call RouteCallResult,
) error {
	if err := service.validateDecisionWorkspace(call.Decision); err != nil {
		return NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	invocation, err := routeInvocationAudit(call)
	if err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	decisionID, err := service.newID("master_route_decision")
	if err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	decidedAt, err := service.timestampAfter(call.EndedAt)
	if err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	commit := RouteDecisionCommit{
		ID:                 decisionID,
		MasterSessionID:    call.Session.ID,
		InputID:            work.Input.Input.ID,
		RoutingAttempt:     work.RoutingAttempt,
		Context:            materialized.Audit,
		ResolvedInvocation: invocation,
		Decision:           call.Decision,
		DecidedAt:          decidedAt,
	}
	if err := commit.Validate(); err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	if _, err := service.store.CommitMasterRouteDecision(ctx, commit); err != nil {
		return NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	return nil
}

func (service *RouteService) validateDecisionWorkspace(decision RouteDecision) error {
	if decision.Kind != RouteDecisionKindCreateConversation {
		return nil
	}
	workspaceID := decision.CreateConversation.WorkspaceID
	resolved, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return err
	}
	if resolved.ID != workspaceID {
		return fmt.Errorf("master route workspace resolved as %s, want %s", resolved.ID, workspaceID)
	}
	return nil
}

func (service *RouteService) failClaimedInput(
	ctx context.Context,
	work InputRoutingWork,
	cause error,
) error {
	kind, classified := ClassifyRouteAttemptFailure(cause)
	if !classified {
		kind = RouteFailureKindInternal
	}
	failedAt, err := service.timestampAfter(work.RoutingStartedAt)
	if err != nil {
		return err
	}
	failure := InputRoutingFailure{
		InputID:        work.Input.Input.ID,
		RoutingAttempt: work.RoutingAttempt,
		Failure: RouteFailure{
			Code:                "master_route_" + string(kind),
			Message:             routeFailureMessage(kind),
			Retryable:           routeFailureRetryable(kind),
			DiagnosticReference: fmt.Sprintf("master_route:%s:%d", work.Input.Input.ID, work.RoutingAttempt),
		},
		FailedAt: failedAt,
	}
	return service.store.FailMasterInputRouting(ctx, failure)
}

func routeContextTargetIDs(
	input MasterInput,
	candidates []conversationindex.Candidate,
) []string {
	ids := make([]string, 0, len(candidates)+2)
	for _, candidate := range candidates {
		ids = append(ids, candidate.Card.ConversationID)
	}
	for _, optional := range []*string{input.FocusedConversationID, input.OriginatingConversationID} {
		if optional != nil && !slices.Contains(ids, *optional) {
			ids = append(ids, *optional)
		}
	}
	return ids
}

func validateRequiredRouteTargets(
	input MasterInput,
	candidates []conversationindex.Candidate,
	targets []RouteConversationTarget,
) error {
	found := make(map[string]bool, len(targets))
	for _, target := range targets {
		found[target.ConversationID] = true
	}
	for _, candidate := range candidates {
		if !found[candidate.Card.ConversationID] {
			return fmt.Errorf("candidate conversation %s disappeared before master routing", candidate.Card.ConversationID)
		}
	}
	if input.OriginatingConversationID != nil && !found[*input.OriginatingConversationID] {
		return fmt.Errorf("originating conversation %s is unavailable", *input.OriginatingConversationID)
	}
	return nil
}

func routeFailureMessage(kind RouteFailureKind) string {
	switch kind {
	case RouteFailureKindProviderUnavailable:
		return "Global routing is temporarily unavailable because the master model could not be reached."
	case RouteFailureKindProviderOutputInvalid:
		return "Global routing is temporarily unavailable because the master model returned an invalid decision."
	case RouteFailureKindConfigurationInvalid:
		return "Global routing is unavailable because the master model configuration is invalid."
	case RouteFailureKindContextBudgetExceeded:
		return "Global routing is unavailable because its required context exceeds the configured master budget."
	case RouteFailureKindStateUnavailable:
		return "Global routing is temporarily unavailable because authoritative application state changed or could not be read."
	case RouteFailureKindStateCorrupt:
		return "Global routing is unavailable because durable application state is invalid."
	default:
		return "Global routing is temporarily unavailable because an internal routing contract failed."
	}
}

func routeFailureRetryable(kind RouteFailureKind) bool {
	return kind == RouteFailureKindProviderUnavailable || kind == RouteFailureKindStateUnavailable
}

func (service *RouteService) run() {
	defer service.tasks.Done()
	for {
		if err := service.store.WaitForPendingMasterRouteInputs(service.lifecycleCtx); err != nil {
			return
		}
		for {
			processed, err := service.ProcessNext(service.lifecycleCtx)
			if err != nil || !processed {
				break
			}
		}
	}
}

func (service *RouteService) Shutdown(ctx context.Context) error {
	if service == nil {
		return nil
	}
	if ctx == nil {
		return errors.New("master route shutdown context is required")
	}
	service.shutdownOnce.Do(service.lifecycleCancel)
	done := make(chan struct{})
	go func() {
		service.tasks.Wait()
		close(done)
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-done:
		return nil
	}
}

func (service *RouteService) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func (service *RouteService) timestampAfter(previous string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return "", err
	}
	candidate := service.now().UTC()
	if !candidate.After(parsed) {
		candidate = parsed.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

func randomRouteID(prefix string) (string, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(random[:]), nil
}

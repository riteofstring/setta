package narration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/workspace"
)

const (
	MaxStatusQuestionBytes     = 16 * 1024
	statusRecentFinalSummaries = 8
)

type ServiceAgentRuntime interface {
	ModelCatalogResolver
	FreshStructuredCallProvider
}

type WorkspaceResolver interface {
	ResolveActiveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type ServiceOption func(*Service) error

func WithServiceIDGenerator(generator func(string) (string, error)) ServiceOption {
	return func(service *Service) error {
		if generator == nil {
			return errors.New("narrator service id generator is required")
		}
		service.newID = generator
		return nil
	}
}

// Service is the production command boundary for narrator work. Phase 4
// exposes only the explicit status command; automatic projection triggers use
// the same actor/caller/committer stack when their production lifecycle is
// composed separately.
type Service struct {
	store    *conversation.Store
	registry *Registry
	newID    func(string) (string, error)
}

func NewService(
	store *conversation.Store,
	workspaces WorkspaceResolver,
	agentRuntime ServiceAgentRuntime,
	options ...ServiceOption,
) (*Service, error) {
	if err := validateServiceDependencies(store, workspaces, agentRuntime); err != nil {
		return nil, err
	}
	service := &Service{store: store, newID: randomServiceID}
	if err := applyServiceOptions(service, options); err != nil {
		return nil, err
	}
	registry, err := newStatusRegistry(store, workspaces, agentRuntime)
	if err != nil {
		return nil, err
	}
	service.registry = registry
	return service, nil
}

func validateServiceDependencies(
	store *conversation.Store,
	workspaces WorkspaceResolver,
	agentRuntime ServiceAgentRuntime,
) error {
	if store == nil || workspaces == nil || agentRuntime == nil {
		return errors.New("narrator service requires store, workspace resolver, and agent runtime")
	}
	return nil
}

func newStatusRegistry(
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
	attempts := &statusAttemptWorker{
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
	return NewRegistry(worker)
}

func applyServiceOptions(service *Service, options []ServiceOption) error {
	for _, option := range options {
		if option == nil {
			return errors.New("narrator service option must not be nil")
		}
		if err := option(service); err != nil {
			return err
		}
	}
	return nil
}

func ValidateStatusQuestion(question string) error {
	if strings.TrimSpace(question) == "" || strings.TrimSpace(question) != question {
		return errors.New("narrator status question must be non-empty without surrounding whitespace")
	}
	if len(question) > MaxStatusQuestionBytes {
		return fmt.Errorf("narrator status question exceeds %d bytes", MaxStatusQuestionBytes)
	}
	return nil
}

// AskStatus submits a read-only narrator operation and waits for its durable
// reply. The primary-agent runtime is not part of this command surface: no
// turn, steering, interrupt, queue, or approval method is available here.
func (service *Service) AskStatus(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	question string,
) (conversation.ConversationSnapshot, error) {
	if service == nil || service.store == nil || service.registry == nil || service.newID == nil {
		return conversation.ConversationSnapshot{}, errors.New("narrator service is required")
	}
	if ctx == nil {
		return conversation.ConversationSnapshot{}, errors.New("narrator status context is required")
	}
	operation := StatusOperation{WorkspaceID: workspaceID, Question: question}
	if err := operation.Validate(); err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	if _, err := service.store.ReadSnapshot(ctx, workspaceID, conversationID); err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	requestID, err := service.newID("narrator_status")
	if err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	receipt, err := service.registry.Submit(ctx, Request{
		ID:             requestID,
		ConversationID: conversationID,
		Kind:           RequestKindStatus,
		Trigger:        conversation.NarrationTriggerExplicitStatusRequested,
		Status:         &operation,
	})
	if err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	if err := receipt.Wait(ctx); err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) Shutdown(ctx context.Context) error {
	if service == nil || service.registry == nil {
		return errors.New("narrator service is required")
	}
	return service.registry.Shutdown(ctx)
}

type statusAttemptWorker struct {
	caller       *Caller
	committer    *OutputCommitter
	materializer *ContextMaterializer
	profiles     RoleProfileSource
	workspaces   WorkspaceResolver
}

func (worker *statusAttemptWorker) PrepareAttempt(
	ctx context.Context,
	invocation Invocation,
) (PreparedCommit, error) {
	if err := worker.validateDependencies(); err != nil {
		return nil, err
	}
	operation, err := validateStatusInvocation(invocation)
	if err != nil {
		return nil, err
	}
	bundle, err := worker.materializeStatus(ctx, invocation.Request.ConversationID, operation)
	if err != nil {
		return nil, err
	}
	workspaceRoot, err := worker.resolveWorkspaceRoot(operation.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return worker.callAndPrepare(ctx, invocation, workspaceRoot, bundle)
}

func (worker *statusAttemptWorker) validateDependencies() error {
	if worker == nil || worker.caller == nil || worker.committer == nil ||
		worker.materializer == nil || worker.profiles == nil || worker.workspaces == nil {
		return NewAttemptFailure(FailureKindInternal, errors.New("narrator status attempt worker is required"))
	}
	return nil
}

func validateStatusInvocation(invocation Invocation) (StatusOperation, error) {
	if err := invocation.Request.Validate(); err != nil {
		return StatusOperation{}, NewAttemptFailure(FailureKindInternal, err)
	}
	if invocation.Generation == 0 {
		return StatusOperation{}, NewAttemptFailure(FailureKindInternal, errors.New("narrator status generation must be positive"))
	}
	if invocation.Request.Kind != RequestKindStatus || invocation.Request.Status == nil {
		return StatusOperation{}, NewAttemptFailure(FailureKindInternal, fmt.Errorf(
			"narrator status worker received operation %q",
			invocation.Request.Kind,
		))
	}
	return *invocation.Request.Status, nil
}

func (worker *statusAttemptWorker) materializeStatus(
	ctx context.Context,
	conversationID string,
	operation StatusOperation,
) (StatusContextBundle, error) {
	limits, err := worker.statusContextLimits(ctx, operation.WorkspaceID, conversationID)
	if err != nil {
		return StatusContextBundle{}, err
	}
	bundle, err := worker.materializer.Status(ctx, StatusContextRequest{
		ConversationID: conversationID,
		Question:       operation.Question,
		Limits:         limits,
	})
	if err != nil {
		return StatusContextBundle{}, err
	}
	if bundle.Authoritative.Conversation.WorkspaceID != operation.WorkspaceID {
		return StatusContextBundle{}, NewAttemptFailure(FailureKindStateCorrupt, fmt.Errorf(
			"narrator status conversation workspace is %s, want %s",
			bundle.Authoritative.Conversation.WorkspaceID,
			operation.WorkspaceID,
		))
	}
	return bundle, nil
}

func (worker *statusAttemptWorker) resolveWorkspaceRoot(workspaceID string) (string, error) {
	resolvedWorkspace, err := worker.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return "", NewAttemptFailure(FailureKindStateUnavailable, fmt.Errorf(
			"resolve narrator status workspace %s: %w",
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

func (worker *statusAttemptWorker) callAndPrepare(
	ctx context.Context,
	invocation Invocation,
	workspaceRoot string,
	bundle StatusContextBundle,
) (PreparedCommit, error) {
	callRequest := CallRequest{
		ID:            invocation.Request.ID,
		Generation:    invocation.Generation,
		WorkspaceRoot: workspaceRoot,
		Status:        &bundle,
	}
	result, err := worker.caller.Call(ctx, callRequest)
	if err != nil {
		return nil, err
	}
	commit, err := worker.committer.Prepare(callRequest, result)
	if err != nil {
		return nil, NewAttemptFailure(FailureKindInternal, err)
	}
	return commit, nil
}

func (worker *statusAttemptWorker) statusContextLimits(
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
		RecentFinalSummaries: statusRecentFinalSummaries,
	}, nil
}

func randomServiceID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

var _ ServiceAgentRuntime = (*agent.Runtime)(nil)

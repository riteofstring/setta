package narration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/workspace"
)

const (
	MaxStatusQuestionBytes         = 16 * 1024
	defaultProgressWindow          = 30 * time.Second
	defaultCheckpointWindowEvents  = 64
	projectionRecentFinalSummaries = 8
	statusRecentFinalSummaries     = 8
	maxCheckpointHistoricalSummary = 16 * 1024
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

func WithServiceProgressWait(wait RetryWait) ServiceOption {
	return func(service *Service) error {
		if wait == nil {
			return errors.New("narrator progress wait is required")
		}
		service.progressWait = wait
		return nil
	}
}

func WithServiceRetryWait(wait RetryWait) ServiceOption {
	return func(service *Service) error {
		if wait == nil {
			return errors.New("narrator service retry wait is required")
		}
		service.retryWait = wait
		return nil
	}
}

func WithServiceCallerClock(now func() time.Time) ServiceOption {
	return func(service *Service) error {
		if now == nil {
			return errors.New("narrator service caller clock is required")
		}
		service.callerClock = now
		return nil
	}
}

// Service is the production command and lifecycle boundary for narrator work.
// Explicit status, automatic projections, live terminal projections,
// checkpoints, and recoverable retries all share one priority mailbox per
// conversation.
type Service struct {
	store                  *conversation.Store
	registry               *Registry
	inputRouter            *ConversationInputRouter
	newID                  func(string) (string, error)
	progressWait           RetryWait
	retryWait              RetryWait
	callerClock            func() time.Time
	progressWindow         time.Duration
	checkpointWindowEvents int

	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	lifecycleMu     sync.Mutex
	closing         bool
	focus           map[string][]focusBarrier
	progress        map[string]*progressWindow
	terminal        map[string]*terminalProjectionQueue
	routing         map[string]*conversationRouteQueue
	tasks           sync.WaitGroup
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
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	service := &Service{
		store:                  store,
		newID:                  randomServiceID,
		progressWait:           waitForRetry,
		retryWait:              waitForRetry,
		progressWindow:         defaultProgressWindow,
		checkpointWindowEvents: defaultCheckpointWindowEvents,
		lifecycleCtx:           lifecycleCtx,
		lifecycleCancel:        lifecycleCancel,
		focus:                  map[string][]focusBarrier{},
		progress:               map[string]*progressWindow{},
		terminal:               map[string]*terminalProjectionQueue{},
		routing:                map[string]*conversationRouteQueue{},
	}
	if err := applyServiceOptions(service, options); err != nil {
		lifecycleCancel()
		return nil, err
	}
	registry, err := newServiceRegistry(service, store, workspaces, agentRuntime)
	if err != nil {
		lifecycleCancel()
		return nil, err
	}
	service.registry = registry
	inputRouter, err := NewConversationInputRouter(store, workspaces, agentRuntime)
	if err != nil {
		lifecycleCancel()
		return nil, err
	}
	inputRouter.newID = service.newID
	service.inputRouter = inputRouter
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

// AskRoutedStatus executes one already validated route command while
// preserving the request id committed with its originating input decision.
func (service *Service) AskRoutedStatus(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	requestID string,
	question string,
) (conversation.ConversationSnapshot, error) {
	if err := validateIdentifier("routed narrator status request id", requestID); err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	return service.askStatus(ctx, workspaceID, conversationID, requestID, question)
}

func (service *Service) askStatus(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	requestID string,
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

func randomServiceID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

var _ ServiceAgentRuntime = (*agent.Runtime)(nil)

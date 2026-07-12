package narration

import (
	"context"
	"errors"
	"sync"
	"time"
)

// RetryWait blocks only its dedicated timer goroutine until a retry becomes
// eligible or the actor shuts down. Tests replace it with an event-driven
// waiter; production uses one cancellable timer and never polls.
type RetryWait func(context.Context, time.Duration) error

type RegistryOption func(*registryConfig) error

type registryConfig struct {
	completionObserver CompletionObserver
	retryWait          RetryWait
}

// Completion reports the durable outcome of one mailbox attempt. Retries are
// reported independently, allowing the production projector to continue a
// multi-window catch-up only after the exact retry eventually succeeds.
type Completion struct {
	Request         Request
	ProviderRequest *CallRequest
	ProviderResult  *CallResult
	Err             error
	RetryScheduled  bool
	Generation      uint64
	StartedAt       string
	EndedAt         string
	Stale           bool
}

// CompletionObserver must return promptly. The production observer only
// admits bounded follow-up work onto its own lifecycle goroutines.
type CompletionObserver func(Completion)

func WithRetryWait(wait RetryWait) RegistryOption {
	return func(config *registryConfig) error {
		if wait == nil {
			return errors.New("narrator retry wait is required")
		}
		config.retryWait = wait
		return nil
	}
}

func WithCompletionObserver(observer CompletionObserver) RegistryOption {
	return func(config *registryConfig) error {
		if observer == nil {
			return errors.New("narrator completion observer is required")
		}
		config.completionObserver = observer
		return nil
	}
}

// Registry lazily creates exactly one mailbox actor for each conversation.
// Worker.Prepare may run concurrently for different conversations, while each
// conversation's prepared commits remain serialized by its actor.
type Registry struct {
	worker    Worker
	retryWait RetryWait
	observer  CompletionObserver
	mu        sync.Mutex
	actors    map[string]*conversationActor
	closed    bool
}

func NewRegistry(worker Worker, options ...RegistryOption) (*Registry, error) {
	if worker == nil {
		return nil, errors.New("narrator registry worker is required")
	}
	config := registryConfig{retryWait: waitForRetry}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("narrator registry option must not be nil")
		}
		if err := option(&config); err != nil {
			return nil, err
		}
	}
	return &Registry{
		worker:    worker,
		retryWait: config.retryWait,
		observer:  config.completionObserver,
		actors:    map[string]*conversationActor{},
	}, nil
}

func (registry *Registry) Submit(ctx context.Context, request Request) (*Receipt, error) {
	if ctx == nil {
		return nil, errors.New("narrator submit context is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	request = cloneRequest(request)
	registry.mu.Lock()
	if registry.closed {
		registry.mu.Unlock()
		return nil, ErrMailboxClosed
	}
	actor := registry.actors[request.ConversationID]
	if actor == nil {
		actor = newConversationActor(
			request.ConversationID,
			registry.worker,
			registry.retryWait,
			registry.observer,
		)
		registry.actors[request.ConversationID] = actor
	}
	registry.mu.Unlock()
	return actor.submit(ctx, request)
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	if ctx == nil {
		return errors.New("narrator retry context is required")
	}
	if delay <= 0 {
		return errors.New("narrator retry delay must be positive")
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (registry *Registry) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("narrator shutdown context is required")
	}
	registry.mu.Lock()
	registry.closed = true
	actors := make([]*conversationActor, 0, len(registry.actors))
	for _, actor := range registry.actors {
		actors = append(actors, actor)
	}
	registry.mu.Unlock()
	for _, actor := range actors {
		actor.beginShutdown()
	}
	for _, actor := range actors {
		if err := actor.wait(ctx); err != nil {
			return err
		}
	}
	return nil
}

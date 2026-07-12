package narration

import (
	"context"
	"errors"
	"sync"
)

// Registry lazily creates exactly one mailbox actor for each conversation.
// Worker.Prepare may run concurrently for different conversations, while each
// conversation's prepared commits remain serialized by its actor.
type Registry struct {
	worker Worker
	mu     sync.Mutex
	actors map[string]*conversationActor
	closed bool
}

func NewRegistry(worker Worker) (*Registry, error) {
	if worker == nil {
		return nil, errors.New("narrator registry worker is required")
	}
	return &Registry{worker: worker, actors: map[string]*conversationActor{}}, nil
}

func (registry *Registry) Submit(ctx context.Context, request Request) (*Receipt, error) {
	if ctx == nil {
		return nil, errors.New("narrator submit context is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	registry.mu.Lock()
	if registry.closed {
		registry.mu.Unlock()
		return nil, ErrMailboxClosed
	}
	actor := registry.actors[request.ConversationID]
	if actor == nil {
		actor = newConversationActor(request.ConversationID, registry.worker)
		registry.actors[request.ConversationID] = actor
	}
	registry.mu.Unlock()
	return actor.submit(ctx, request)
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

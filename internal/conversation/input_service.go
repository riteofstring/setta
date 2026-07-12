package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type ConversationInputStore interface {
	AcceptConversationInput(context.Context, ConversationInput, string) (AcceptedConversationInput, error)
}

type InputService struct {
	store ConversationInputStore
	now   func() time.Time
}

func NewInputService(store ConversationInputStore) (*InputService, error) {
	return newInputService(store, time.Now)
}

func newInputService(store ConversationInputStore, now func() time.Time) (*InputService, error) {
	if store == nil {
		return nil, errors.New("conversation input store is required")
	}
	if now == nil {
		return nil, errors.New("conversation input clock is required")
	}
	return &InputService{store: store, now: now}, nil
}

func (service *InputService) SubmitInput(
	ctx context.Context,
	input ConversationInput,
) (AcceptedConversationInput, error) {
	if service == nil || service.store == nil || service.now == nil {
		return AcceptedConversationInput{}, errors.New("conversation input service is unavailable")
	}
	if ctx == nil {
		return AcceptedConversationInput{}, errors.New("conversation input context is required")
	}
	normalized, err := NormalizeConversationInput(input)
	if err != nil {
		return AcceptedConversationInput{}, err
	}
	acceptedAt := service.now().UTC().Format(time.RFC3339Nano)
	accepted, err := service.store.AcceptConversationInput(ctx, normalized, acceptedAt)
	if err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := accepted.Validate(); err != nil {
		return AcceptedConversationInput{}, fmt.Errorf("conversation input store returned an invalid record: %w", err)
	}
	if !EqualConversationInputs(accepted.Input, normalized) {
		return AcceptedConversationInput{}, errors.New("conversation input store returned a different input")
	}
	return CloneAcceptedConversationInput(accepted), nil
}

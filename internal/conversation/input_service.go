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

type invalidConversationInputReceiptError struct {
	cause error
}

func (err *invalidConversationInputReceiptError) Error() string {
	return fmt.Sprintf("conversation input store returned an invalid receipt: %v", err.cause)
}

func (err *invalidConversationInputReceiptError) Unwrap() error {
	return err.cause
}

func IsInvalidConversationInputReceipt(err error) bool {
	var receiptError *invalidConversationInputReceiptError
	return errors.As(err, &receiptError)
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
		return AcceptedConversationInput{}, &invalidConversationInputReceiptError{cause: err}
	}
	if !EqualConversationInputs(accepted.Input, normalized) {
		return AcceptedConversationInput{}, &invalidConversationInputReceiptError{
			cause: errors.New("receipt input differs from the submitted input"),
		}
	}
	return CloneAcceptedConversationInput(accepted), nil
}

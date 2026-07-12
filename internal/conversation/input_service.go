package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type ConversationInputStore interface {
	AcceptConversationInput(context.Context, ConversationInput, string) (AcceptedConversationInput, error)
	DiscardConversationInputRouting(context.Context, string, string, string, string) error
	ReadConversationInputRoutingState(context.Context, string, string, string) (ConversationInputRoutingState, error)
	RetryConversationInputRouting(context.Context, string, string, string, string) (AcceptedConversationInput, error)
}

type ConversationInputRoutingNotifier interface {
	NotifyConversationInput(string) error
}

type InputService struct {
	store  ConversationInputStore
	router ConversationInputRoutingNotifier
	now    func() time.Time
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

func NewRoutedInputService(
	store ConversationInputStore,
	router ConversationInputRoutingNotifier,
) (*InputService, error) {
	if router == nil {
		return nil, errors.New("conversation input router notifier is required")
	}
	return newInputService(store, time.Now, router)
}

func newInputService(
	store ConversationInputStore,
	now func() time.Time,
	routers ...ConversationInputRoutingNotifier,
) (*InputService, error) {
	if store == nil {
		return nil, errors.New("conversation input store is required")
	}
	if now == nil {
		return nil, errors.New("conversation input clock is required")
	}
	if len(routers) > 1 || (len(routers) == 1 && routers[0] == nil) {
		return nil, errors.New("conversation input service accepts at most one router notifier")
	}
	service := &InputService{store: store, now: now}
	if len(routers) == 1 {
		service.router = routers[0]
	}
	return service, nil
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
	if err := service.notifyRouter(accepted); err != nil {
		return AcceptedConversationInput{}, err
	}
	return CloneAcceptedConversationInput(accepted), nil
}

func (service *InputService) ReadInputState(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if service == nil || service.store == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input service is unavailable")
	}
	if ctx == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input state context is required")
	}
	state, err := service.store.ReadConversationInputRoutingState(
		ctx,
		workspaceID,
		conversationID,
		inputID,
	)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := state.Validate(); err != nil {
		return ConversationInputRoutingState{}, &invalidConversationInputReceiptError{cause: err}
	}
	return cloneConversationInputRoutingState(state), nil
}

func (service *InputService) RetryInput(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if service == nil || service.store == nil || service.now == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input service is unavailable")
	}
	if ctx == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input retry context is required")
	}
	retriedAt := service.now().UTC().Format(time.RFC3339Nano)
	retried, err := service.store.RetryConversationInputRouting(
		ctx,
		workspaceID,
		conversationID,
		inputID,
		retriedAt,
	)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := service.notifyRouter(retried); err != nil {
		return ConversationInputRoutingState{}, err
	}
	return service.ReadInputState(ctx, workspaceID, conversationID, inputID)
}

func (service *InputService) notifyRouter(accepted AcceptedConversationInput) error {
	if service.router == nil || accepted.Status != ConversationInputStatusAccepted {
		return nil
	}
	if err := service.router.NotifyConversationInput(accepted.Input.ConversationID); err != nil {
		return fmt.Errorf(
			"conversation input %s was accepted but local routing could not be scheduled: %w",
			accepted.Input.ID,
			err,
		)
	}
	return nil
}

func (service *InputService) DiscardInput(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if service == nil || service.store == nil || service.now == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input service is unavailable")
	}
	if ctx == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input discard context is required")
	}
	discardedAt := service.now().UTC().Format(time.RFC3339Nano)
	if err := service.store.DiscardConversationInputRouting(
		ctx,
		workspaceID,
		conversationID,
		inputID,
		discardedAt,
	); err != nil {
		return ConversationInputRoutingState{}, err
	}
	return service.ReadInputState(ctx, workspaceID, conversationID, inputID)
}

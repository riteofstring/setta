package master

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type InputStore interface {
	AcceptMasterInput(context.Context, MasterInput, string) (AcceptedMasterInput, error)
	ListRecentMasterInputs(context.Context) (RecentMasterInputHistory, error)
}

func (service *Service) ListRecentInputs(ctx context.Context) (RecentMasterInputHistory, error) {
	if service == nil || service.store == nil {
		return RecentMasterInputHistory{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return RecentMasterInputHistory{}, errors.New("master input context is required")
	}
	history, err := service.store.ListRecentMasterInputs(ctx)
	if err != nil {
		return RecentMasterInputHistory{}, err
	}
	if err := history.Validate(); err != nil {
		return RecentMasterInputHistory{}, fmt.Errorf("master input store returned invalid history: %w", err)
	}
	return CloneRecentInputHistory(history), nil
}

type Service struct {
	store InputStore
	now   func() time.Time
}

func NewService(store InputStore) (*Service, error) {
	return newService(store, time.Now)
}

func newService(store InputStore, now func() time.Time) (*Service, error) {
	if store == nil {
		return nil, errors.New("master input store is required")
	}
	if now == nil {
		return nil, errors.New("master clock is required")
	}
	return &Service{store: store, now: now}, nil
}

func (service *Service) SubmitInput(ctx context.Context, input MasterInput) (AcceptedMasterInput, error) {
	if service == nil || service.store == nil || service.now == nil {
		return AcceptedMasterInput{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return AcceptedMasterInput{}, errors.New("master input context is required")
	}
	normalized, err := NormalizeInput(input)
	if err != nil {
		return AcceptedMasterInput{}, err
	}
	if normalized.Source != MasterInputSourceShell {
		return AcceptedMasterInput{}, errors.New("conversation-escalation master input must come from a validated local route decision")
	}
	acceptedAt := service.now().UTC().Format(time.RFC3339Nano)
	accepted, err := service.store.AcceptMasterInput(ctx, normalized, acceptedAt)
	if err != nil {
		return AcceptedMasterInput{}, err
	}
	if err := accepted.Validate(); err != nil {
		return AcceptedMasterInput{}, fmt.Errorf("master input store returned an invalid record: %w", err)
	}
	if !EqualInputs(accepted.Input, normalized) {
		return AcceptedMasterInput{}, errors.New("master input store returned a different input")
	}
	return CloneAcceptedInput(accepted), nil
}

package master

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type InputStore interface {
	AcceptMasterInput(context.Context, MasterInput, string) (AcceptedMasterInput, error)
	ReadActiveMasterShellInteraction(context.Context) (ActiveShellInteraction, error)
	ReadMasterInputRoutingState(context.Context, string) (InputRoutingState, error)
	WaitForMasterInputRoutingState(context.Context, string) (InputRoutingState, error)
	WaitForMasterPresentationIntent(context.Context, string) (PresentationIntent, error)
	ResolveMasterPresentationIntent(context.Context, PresentationResolutionRequest, string) (PresentationResolution, error)
}

type InputRoutingCanceler interface {
	CancelMasterInputRouting(context.Context, string, string) (InputRoutingState, error)
}

func (service *Service) WaitPresentationIntent(
	ctx context.Context,
	inputID string,
) (PresentationIntent, error) {
	if service == nil || service.store == nil {
		return PresentationIntent{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return PresentationIntent{}, errors.New("master presentation wait context is required")
	}
	intent, err := service.store.WaitForMasterPresentationIntent(ctx, inputID)
	if err != nil {
		return PresentationIntent{}, err
	}
	if err := intent.Validate(); err != nil {
		return PresentationIntent{}, fmt.Errorf("master input store returned invalid presentation intent: %w", err)
	}
	return ClonePresentationIntent(intent), nil
}

func (service *Service) ResolvePresentationIntent(
	ctx context.Context,
	request PresentationResolutionRequest,
) (PresentationResolution, error) {
	if service == nil || service.store == nil || service.now == nil {
		return PresentationResolution{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return PresentationResolution{}, errors.New("master presentation resolution context is required")
	}
	if err := request.Validate(); err != nil {
		return PresentationResolution{}, err
	}
	resolution, err := service.store.ResolveMasterPresentationIntent(
		ctx,
		request,
		service.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return PresentationResolution{}, err
	}
	if err := resolution.Validate(); err != nil {
		return PresentationResolution{}, fmt.Errorf("master input store returned invalid presentation resolution: %w", err)
	}
	if resolution.IntentID != request.IntentID || resolution.InputID != request.InputID || resolution.PaneID != request.PaneID {
		return PresentationResolution{}, errors.New("master input store returned a different presentation resolution")
	}
	return resolution, nil
}

func (service *Service) ReadActiveShellInteraction(ctx context.Context) (ActiveShellInteraction, error) {
	if service == nil || service.store == nil {
		return ActiveShellInteraction{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return ActiveShellInteraction{}, errors.New("master shell interaction context is required")
	}
	interaction, err := service.store.ReadActiveMasterShellInteraction(ctx)
	if err != nil {
		return ActiveShellInteraction{}, err
	}
	if err := interaction.Validate(); err != nil {
		return ActiveShellInteraction{}, fmt.Errorf("master input store returned invalid shell interaction: %w", err)
	}
	return CloneActiveShellInteraction(interaction), nil
}

func (service *Service) ReadInputState(ctx context.Context, inputID string) (InputRoutingState, error) {
	if service == nil || service.store == nil {
		return InputRoutingState{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return InputRoutingState{}, errors.New("master input context is required")
	}
	state, err := service.store.ReadMasterInputRoutingState(ctx, inputID)
	if err != nil {
		return InputRoutingState{}, err
	}
	if err := state.Validate(); err != nil {
		return InputRoutingState{}, fmt.Errorf("master input store returned invalid routing state: %w", err)
	}
	return CloneInputRoutingState(state), nil
}

func (service *Service) WaitShellInteraction(
	ctx context.Context,
	inputID string,
) (ShellInteractionState, error) {
	if service == nil || service.store == nil {
		return ShellInteractionState{}, errors.New("master input service is unavailable")
	}
	if ctx == nil {
		return ShellInteractionState{}, errors.New("master shell interaction wait context is required")
	}
	state, err := service.store.WaitForMasterInputRoutingState(ctx, inputID)
	if err != nil {
		return ShellInteractionState{}, err
	}
	interaction, err := ProjectShellInteractionState(state)
	if err != nil {
		return ShellInteractionState{}, fmt.Errorf(
			"master input store returned invalid shell interaction: %w",
			err,
		)
	}
	return CloneShellInteractionState(interaction), nil
}

type Service struct {
	store    InputStore
	canceler InputRoutingCanceler
	now      func() time.Time
}

func NewService(store InputStore) (*Service, error) {
	return newService(store, time.Now)
}

func NewRoutedService(store InputStore, canceler InputRoutingCanceler) (*Service, error) {
	if canceler == nil {
		return nil, errors.New("master input routing canceler is required")
	}
	service, err := newService(store, time.Now)
	if err != nil {
		return nil, err
	}
	service.canceler = canceler
	return service, nil
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

func (service *Service) CancelInput(
	ctx context.Context,
	inputID string,
) (ShellInteractionState, error) {
	if err := validateInputCancellationRequest(service, ctx, inputID); err != nil {
		return ShellInteractionState{}, err
	}
	state, err := service.canceler.CancelMasterInputRouting(
		ctx,
		inputID,
		service.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return ShellInteractionState{}, err
	}
	return projectCancelledShellInteraction(state, inputID)
}

func validateInputCancellationRequest(service *Service, ctx context.Context, inputID string) error {
	if service == nil || service.store == nil || service.canceler == nil || service.now == nil {
		return errors.New("master input cancellation is unavailable")
	}
	if ctx == nil {
		return errors.New("master input cancellation context is required")
	}
	return ValidateInputID(inputID)
}

func projectCancelledShellInteraction(
	state InputRoutingState,
	inputID string,
) (ShellInteractionState, error) {
	if err := state.Validate(); err != nil {
		return ShellInteractionState{}, fmt.Errorf("master input canceler returned invalid routing state: %w", err)
	}
	if state.Status != InputRoutingStatusCancelled || state.Input.Input.ID != inputID {
		return ShellInteractionState{}, errors.New("master input canceler returned a different cancellation state")
	}
	interaction, err := ProjectShellInteractionState(state)
	if err != nil {
		return ShellInteractionState{}, fmt.Errorf("project master input cancellation: %w", err)
	}
	return CloneShellInteractionState(interaction), nil
}

package applayout

import (
	"errors"
	"fmt"
	"sync"
)

type LayoutObserver interface {
	ObserveAppPaneLayout(previous *AppPaneLayout, layout AppPaneLayout) error
}

type Service struct {
	store    *Store
	observer LayoutObserver
	mu       sync.Mutex
}

func NewService(store *Store, observer LayoutObserver) (*Service, error) {
	if store == nil {
		return nil, errors.New("app pane layout store is required")
	}
	if observer == nil {
		return nil, errors.New("app pane layout observer is required")
	}
	return &Service{store: store, observer: observer}, nil
}

func (service *Service) ReadLayout() (AppPaneLayoutReadResult, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	result, err := service.store.LoadLayout()
	if err != nil || result.Layout == nil {
		return result, err
	}
	if err := service.observeLayout(nil, *result.Layout); err != nil {
		return AppPaneLayoutReadResult{}, err
	}
	return result, nil
}

func (service *Service) SaveLayout(layout AppPaneLayout) (AppPaneLayout, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	previous, err := service.store.LoadLayout()
	if err != nil && !IsCorruptStateError(err) {
		return AppPaneLayout{}, err
	}
	saved, err := service.store.SaveLayout(layout)
	if err != nil {
		return AppPaneLayout{}, err
	}
	if err := service.observeLayout(previous.Layout, saved); err != nil {
		return AppPaneLayout{}, err
	}
	return saved, nil
}

func (service *Service) observeLayout(previous *AppPaneLayout, layout AppPaneLayout) error {
	if err := service.observer.ObserveAppPaneLayout(previous, layout); err != nil {
		return fmt.Errorf("observe app pane layout: %w", err)
	}
	return nil
}

package workspaceui

import (
	"errors"
	"fmt"
	"sync"

	"setta/internal/workspace"
)

type LayoutObserver interface {
	ObserveWorkspaceUILayout(WorkspaceUILayout) error
}

type WorkspaceResolver interface {
	LookupWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	resolver WorkspaceResolver
	store    *Store
	observer LayoutObserver
	mu       sync.Mutex
}

func NewService(
	store *Store,
	resolver WorkspaceResolver,
	observer LayoutObserver,
) (*Service, error) {
	if store == nil {
		return nil, errors.New("workspace UI store is required")
	}
	if resolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	if observer == nil {
		return nil, errors.New("workspace UI layout observer is required")
	}
	return &Service{
		resolver: resolver,
		store:    store,
		observer: observer,
	}, nil
}

func (service *Service) ReadLayout(workspaceID string) (WorkspaceUILayoutReadResult, error) {
	if _, err := service.resolver.LookupWorkspace(workspaceID); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	result, err := service.store.LoadLayout(workspaceID)
	if err != nil || result.Layout == nil {
		return result, err
	}
	if err := service.observeLayout(*result.Layout); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	return result, nil
}

func (service *Service) SaveLayout(layout WorkspaceUILayout) (WorkspaceUILayout, error) {
	if _, err := service.resolver.LookupWorkspace(layout.WorkspaceID); err != nil {
		return WorkspaceUILayout{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	saved, err := service.store.SaveLayout(layout)
	if err != nil {
		return WorkspaceUILayout{}, err
	}
	if err := service.observeLayout(saved); err != nil {
		return WorkspaceUILayout{}, err
	}
	return saved, nil
}

func (service *Service) observeLayout(layout WorkspaceUILayout) error {
	if err := service.observer.ObserveWorkspaceUILayout(layout); err != nil {
		return fmt.Errorf("observe workspace UI layout: %w", err)
	}
	return nil
}

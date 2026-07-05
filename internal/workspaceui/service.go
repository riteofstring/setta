package workspaceui

import (
	"errors"

	"setta/internal/workspace"
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	resolver WorkspaceResolver
	store    *Store
}

func NewService(store *Store, resolver WorkspaceResolver) (*Service, error) {
	if store == nil {
		return nil, errors.New("workspace UI store is required")
	}
	if resolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	return &Service{
		resolver: resolver,
		store:    store,
	}, nil
}

func (service *Service) ReadLayout(workspaceID string) (WorkspaceUILayoutReadResult, error) {
	if _, err := service.resolver.ResolveWorkspace(workspaceID); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	return service.store.LoadLayout(workspaceID)
}

func (service *Service) SaveLayout(layout WorkspaceUILayout) (WorkspaceUILayout, error) {
	if _, err := service.resolver.ResolveWorkspace(layout.WorkspaceID); err != nil {
		return WorkspaceUILayout{}, err
	}
	return service.store.SaveLayout(layout)
}

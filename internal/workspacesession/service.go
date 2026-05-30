package workspacesession

import (
	"sync"

	"setta/internal/appstate"
	"setta/internal/workspace"
)

type Service struct {
	manager *workspace.Manager
	mu      sync.Mutex
	session WorkspaceSession
	store   *appstate.Store
}

func NewService(store *appstate.Store, manager *workspace.Manager) (*Service, error) {
	state, err := store.Load()
	if err != nil {
		return nil, err
	}
	session, err := FromAppState(state)
	if err != nil {
		return nil, err
	}
	return &Service{
		manager: manager,
		session: session,
		store:   store,
	}, nil
}

func (service *Service) Session() WorkspaceSession {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.session.Clone()
}

func (service *Service) OpenLocalFolder(rootPath string) (workspace.WorkspaceSummary, WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	summary, _, err := service.manager.OpenLocal(rootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	next := service.session.Clone()
	if err := next.Open(summary); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	if err := service.store.Save(next.AppState()); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	service.session = next
	return summary, service.session.Clone(), nil
}

func (service *Service) Select(id string) (WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	next := service.session.Clone()
	if err := next.Select(id); err != nil {
		return WorkspaceSession{}, err
	}
	if err := service.store.Save(next.AppState()); err != nil {
		return WorkspaceSession{}, err
	}
	service.session = next
	return service.session.Clone(), nil
}

func (service *Service) Close(id string) (WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	next := service.session.Clone()
	if err := next.Close(id); err != nil {
		return WorkspaceSession{}, err
	}
	if err := service.store.Save(next.AppState()); err != nil {
		return WorkspaceSession{}, err
	}
	service.session = next
	return service.session.Clone(), nil
}

func (service *Service) Reorder(ids []string) (WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	next := service.session.Clone()
	if err := next.Reorder(ids); err != nil {
		return WorkspaceSession{}, err
	}
	if err := service.store.Save(next.AppState()); err != nil {
		return WorkspaceSession{}, err
	}
	service.session = next
	return service.session.Clone(), nil
}

func (service *Service) RemoveRecent(id string) (WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	next := service.session.Clone()
	if err := next.RemoveRecent(id); err != nil {
		return WorkspaceSession{}, err
	}
	if err := service.store.Save(next.AppState()); err != nil {
		return WorkspaceSession{}, err
	}
	service.session = next
	return service.session.Clone(), nil
}

package workspacesession

import (
	"errors"
	"fmt"
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
	service := &Service{
		manager: manager,
		session: session,
		store:   store,
	}
	service.refreshAllAvailabilityLocked()
	return service, nil
}

func (service *Service) Session() WorkspaceSession {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.session.Clone()
}

func (service *Service) LookupWorkspace(id string) (workspace.WorkspaceSummary, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.session.Workspace(id)
}

// LookupLocalWorkspace reads durable workspace metadata rather than the
// session's list. A workstream keeps its folder resource after the folder is
// closed or dropped from the recent list, so resolving a durable binding must
// not depend on the folder still being open.
func (service *Service) LookupLocalWorkspace(id string) (workspace.WorkspaceSummary, bool, error) {
	return service.manager.LookupLocal(id)
}

func (service *Service) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	summary, err := service.session.Workspace(id)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	rootPath, err := workspace.ValidateLocalRootPath(summary.RootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	summary.RootPath = rootPath
	return summary, nil
}

func (service *Service) ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	if id == "" {
		return workspace.WorkspaceSummary{}, errors.New("workspace id is required")
	}
	index := activeIndex(service.session.ActiveWorkspaces, id)
	if index < 0 {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace is not active: %s", id)
	}
	summary := service.session.ActiveWorkspaces[index]
	rootPath, err := workspace.ValidateLocalRootPath(summary.RootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	summary.RootPath = rootPath
	return summary, nil
}

func (service *Service) OpenLocalFolder(rootPath string) (workspace.WorkspaceSummary, WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	canonicalRootPath, err := workspace.ValidateLocalRootPath(rootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	summary, err := service.openLocalFolderLocked(canonicalRootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	next := service.session.Clone()
	if err := next.Open(summary); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	next.setAvailability(inspectWorkspaceAvailability(summary))
	if err := service.store.Save(next.AppState()); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	service.session = next
	return summary, service.session.Clone(), nil
}

func (service *Service) Relocate(id string, rootPath string) (workspace.WorkspaceSummary, WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	if _, err := service.session.Workspace(id); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	canonicalRootPath, err := workspace.ValidateLocalRootPath(rootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	for _, existing := range service.session.RecentWorkspaces {
		if existing.ID != id && existing.RootPath == canonicalRootPath {
			return workspace.WorkspaceSummary{}, WorkspaceSession{}, fmt.Errorf(
				"workspace path is already owned by %s",
				existing.ID,
			)
		}
	}
	summary, _, err := service.manager.Relocate(id, canonicalRootPath)
	if err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	next := service.session.Clone()
	if err := next.Relocate(summary); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	next.setAvailability(inspectWorkspaceAvailability(summary))
	if err := service.store.Save(next.AppState()); err != nil {
		return workspace.WorkspaceSummary{}, WorkspaceSession{}, err
	}
	service.session = next
	return summary, service.session.Clone(), nil
}

func (service *Service) RefreshAvailability(id string) (WorkspaceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	summary, err := service.session.Workspace(id)
	if err != nil {
		return WorkspaceSession{}, err
	}
	service.session.setAvailability(inspectWorkspaceAvailability(summary))
	return service.session.Clone(), nil
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

func (service *Service) openLocalFolderLocked(rootPath string) (workspace.WorkspaceSummary, error) {
	for _, existing := range service.session.RecentWorkspaces {
		if existing.RootPath != rootPath {
			continue
		}
		summary, _, err := service.manager.Relocate(existing.ID, rootPath)
		return summary, err
	}
	summary, _, err := service.manager.OpenLocal(rootPath)
	return summary, err
}

func (service *Service) refreshAllAvailabilityLocked() {
	service.session.WorkspaceAvailabilities = make(
		[]WorkspaceAvailability,
		0,
		len(service.session.RecentWorkspaces),
	)
	for _, summary := range service.session.RecentWorkspaces {
		service.session.WorkspaceAvailabilities = append(
			service.session.WorkspaceAvailabilities,
			inspectWorkspaceAvailability(summary),
		)
	}
}

func inspectWorkspaceAvailability(summary workspace.WorkspaceSummary) WorkspaceAvailability {
	availability := WorkspaceAvailability{WorkspaceID: summary.ID, Available: true}
	if _, err := workspace.ValidateLocalRootPath(summary.RootPath); err != nil {
		availability.Available = false
		availability.UnavailableReason = err.Error()
	}
	return availability
}

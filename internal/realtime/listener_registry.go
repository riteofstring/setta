package realtime

import (
	"errors"
	"sort"
	"strings"
	"sync"
)

var (
	ErrEmptyListenerCallbackID       = errors.New("realtime: listener callback id is required")
	ErrEmptyListenerDependency       = errors.New("realtime: listener dependency is required")
	ErrInvalidListenerDependencyMode = errors.New("realtime: invalid listener dependency mode")
)

type ListenerDependencyMode string

const (
	ListenerDependencyModeAlways       ListenerDependencyMode = "always"
	ListenerDependencyModeRealtimeOnly ListenerDependencyMode = "realtime_only"
	ListenerDependencyModeRefreshOnly  ListenerDependencyMode = "refresh_only"
)

type ListenerCallback struct {
	Dependencies   []string
	DependencyMode ListenerDependencyMode
}

type ListenerBootstrap struct {
	ConnectionID   string
	ProjectID      string
	ShareSessionID string
}

type ListenerRegistration struct {
	ConnectionID   string
	ProjectID      string
	ShareSessionID string
	Callbacks      map[string]ListenerCallback

	dependencyIndex   map[string]map[string]struct{}
	wildcardCallbacks map[string]struct{}
}

type ListenerRegistry struct {
	mu sync.RWMutex

	bootstraps    map[string]ListenerBootstrap
	registrations map[string]ListenerRegistration
}

func NewListenerRegistry() *ListenerRegistry {
	return &ListenerRegistry{
		bootstraps:    make(map[string]ListenerBootstrap),
		registrations: make(map[string]ListenerRegistration),
	}
}

func (r *ListenerRegistry) RecordBootstrap(bootstrap ListenerBootstrap) error {
	connectionID := strings.TrimSpace(bootstrap.ConnectionID)
	if connectionID == "" {
		return ErrEmptyConnectionID
	}

	projectID := strings.TrimSpace(bootstrap.ProjectID)
	if projectID == "" {
		return ErrEmptyProjectID
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.bootstraps[connectionID] = ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: strings.TrimSpace(bootstrap.ShareSessionID),
	}
	return nil
}

func (r *ListenerRegistry) UpsertRegistration(
	connectionID string,
	projectID string,
	callbacks map[string]ListenerCallback,
	shareSessionID string,
) error {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return ErrEmptyConnectionID
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	bootstrap, hasBootstrap := r.bootstraps[connectionID]
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		if !hasBootstrap {
			return ErrEmptyProjectID
		}
		projectID = bootstrap.ProjectID
	}

	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" && hasBootstrap {
		shareSessionID = bootstrap.ShareSessionID
	}

	registration, err := buildListenerRegistration(
		connectionID,
		projectID,
		shareSessionID,
		callbacks,
	)
	if err != nil {
		return err
	}

	r.registrations[connectionID] = registration
	return nil
}

func (r *ListenerRegistry) RemoveConnection(connectionID string) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.bootstraps, connectionID)
	delete(r.registrations, connectionID)
}

func (r *ListenerRegistry) Registration(connectionID string) (ListenerRegistration, bool) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return ListenerRegistration{}, false
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	registration, ok := r.registrations[connectionID]
	if !ok {
		return ListenerRegistration{}, false
	}
	return cloneListenerRegistration(registration), true
}

func (r *ListenerRegistry) DropShareSession(shareSessionID string) {
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for connectionID, bootstrap := range r.bootstraps {
		if bootstrap.ShareSessionID == shareSessionID {
			delete(r.bootstraps, connectionID)
		}
	}
	for connectionID, registration := range r.registrations {
		if registration.ShareSessionID == shareSessionID {
			delete(r.registrations, connectionID)
		}
	}
}

func (r *ListenerRegistry) BootstrapConnectionIDs(projectID string, shareSessionID string) []string {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil
	}
	shareSessionID = strings.TrimSpace(shareSessionID)

	r.mu.RLock()
	defer r.mu.RUnlock()

	connectionIDs := make([]string, 0, len(r.bootstraps))
	for connectionID, bootstrap := range r.bootstraps {
		if bootstrap.ProjectID != projectID {
			continue
		}
		if !matchesListenerShareSession(bootstrap.ShareSessionID, shareSessionID) {
			continue
		}
		connectionIDs = append(connectionIDs, connectionID)
	}

	sort.Strings(connectionIDs)
	return connectionIDs
}

func (r *ListenerRegistry) MatchingConnectionIDs(
	projectID string,
	dependencyKeys []string,
	shareSessionID string,
) []string {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil
	}
	shareSessionID = strings.TrimSpace(shareSessionID)

	dependencyFilter := make(map[string]struct{}, len(dependencyKeys))
	for _, dependencyKey := range dependencyKeys {
		dependencyKey = strings.TrimSpace(dependencyKey)
		if dependencyKey == "" {
			continue
		}
		dependencyFilter[dependencyKey] = struct{}{}
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	connectionIDs := make([]string, 0, len(r.registrations))
	for connectionID, registration := range r.registrations {
		if registration.ProjectID != projectID {
			continue
		}
		if !matchesListenerShareSession(registration.ShareSessionID, shareSessionID) {
			continue
		}
		if len(registration.wildcardCallbacks) > 0 {
			connectionIDs = append(connectionIDs, connectionID)
			continue
		}
		for dependencyKey := range dependencyFilter {
			if callbacks := registration.dependencyIndex[dependencyKey]; len(callbacks) > 0 {
				connectionIDs = append(connectionIDs, connectionID)
				break
			}
		}
	}

	sort.Strings(connectionIDs)
	return connectionIDs
}

func (r *ListenerRegistry) RegistrationsForProject(projectID string, shareSessionID string) []ListenerRegistration {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil
	}
	shareSessionID = strings.TrimSpace(shareSessionID)

	r.mu.RLock()
	defer r.mu.RUnlock()

	connectionIDs := make([]string, 0, len(r.registrations))
	for connectionID, registration := range r.registrations {
		if registration.ProjectID != projectID {
			continue
		}
		if !matchesListenerShareSession(registration.ShareSessionID, shareSessionID) {
			continue
		}
		connectionIDs = append(connectionIDs, connectionID)
	}

	sort.Strings(connectionIDs)

	registrations := make([]ListenerRegistration, 0, len(connectionIDs))
	for _, connectionID := range connectionIDs {
		registrations = append(registrations, cloneListenerRegistration(r.registrations[connectionID]))
	}
	return registrations
}

func buildListenerRegistration(
	connectionID string,
	projectID string,
	shareSessionID string,
	callbacks map[string]ListenerCallback,
) (ListenerRegistration, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return ListenerRegistration{}, ErrEmptyProjectID
	}

	callbackMap := make(map[string]ListenerCallback, len(callbacks))
	dependencyIndex := make(map[string]map[string]struct{})
	wildcardCallbacks := make(map[string]struct{})

	for callbackID, callback := range callbacks {
		callbackID = strings.TrimSpace(callbackID)
		if callbackID == "" {
			return ListenerRegistration{}, ErrEmptyListenerCallbackID
		}

		normalizedCallback, err := normalizeListenerCallback(callback)
		if err != nil {
			return ListenerRegistration{}, err
		}

		callbackMap[callbackID] = normalizedCallback

		if normalizedCallback.DependencyMode == ListenerDependencyModeRefreshOnly {
			continue
		}
		if len(normalizedCallback.Dependencies) == 0 {
			wildcardCallbacks[callbackID] = struct{}{}
			continue
		}
		for _, dependencyKey := range normalizedCallback.Dependencies {
			callbackIDs := dependencyIndex[dependencyKey]
			if callbackIDs == nil {
				callbackIDs = make(map[string]struct{})
				dependencyIndex[dependencyKey] = callbackIDs
			}
			callbackIDs[callbackID] = struct{}{}
		}
	}

	return ListenerRegistration{
		ConnectionID:      connectionID,
		ProjectID:         projectID,
		ShareSessionID:    strings.TrimSpace(shareSessionID),
		Callbacks:         callbackMap,
		dependencyIndex:   dependencyIndex,
		wildcardCallbacks: wildcardCallbacks,
	}, nil
}

func normalizeListenerCallback(callback ListenerCallback) (ListenerCallback, error) {
	switch callback.DependencyMode {
	case ListenerDependencyModeAlways, ListenerDependencyModeRealtimeOnly, ListenerDependencyModeRefreshOnly:
	default:
		return ListenerCallback{}, ErrInvalidListenerDependencyMode
	}

	dependencies := make([]string, 0, len(callback.Dependencies))
	for _, dependency := range callback.Dependencies {
		dependency = strings.TrimSpace(dependency)
		if dependency == "" {
			return ListenerCallback{}, ErrEmptyListenerDependency
		}
		dependencies = append(dependencies, dependency)
	}

	return ListenerCallback{
		Dependencies:   dependencies,
		DependencyMode: callback.DependencyMode,
	}, nil
}

func matchesListenerShareSession(storedShareSessionID string, targetShareSessionID string) bool {
	if targetShareSessionID == "" {
		return true
	}
	return storedShareSessionID == "" || storedShareSessionID == targetShareSessionID
}

func cloneListenerRegistration(registration ListenerRegistration) ListenerRegistration {
	callbacks := make(map[string]ListenerCallback, len(registration.Callbacks))
	for callbackID, callback := range registration.Callbacks {
		callbacks[callbackID] = ListenerCallback{
			Dependencies:   append([]string(nil), callback.Dependencies...),
			DependencyMode: callback.DependencyMode,
		}
	}

	dependencyIndex := make(map[string]map[string]struct{}, len(registration.dependencyIndex))
	for dependencyKey, callbackIDs := range registration.dependencyIndex {
		clonedIDs := make(map[string]struct{}, len(callbackIDs))
		for callbackID := range callbackIDs {
			clonedIDs[callbackID] = struct{}{}
		}
		dependencyIndex[dependencyKey] = clonedIDs
	}

	wildcardCallbacks := make(map[string]struct{}, len(registration.wildcardCallbacks))
	for callbackID := range registration.wildcardCallbacks {
		wildcardCallbacks[callbackID] = struct{}{}
	}

	return ListenerRegistration{
		ConnectionID:      registration.ConnectionID,
		ProjectID:         registration.ProjectID,
		ShareSessionID:    registration.ShareSessionID,
		Callbacks:         callbacks,
		dependencyIndex:   dependencyIndex,
		wildcardCallbacks: wildcardCallbacks,
	}
}

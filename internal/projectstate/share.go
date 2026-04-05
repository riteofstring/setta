package projectstate

import (
	"errors"
	"fmt"
	"strings"
	"sync"
)

var (
	ErrBaseRuntimeRequired   = errors.New("base project runtime is required")
	ErrUnknownOverlaySession = errors.New("unknown overlay session")
)

type OverlayRegistryOptions struct {
	DeploymentRoot string
	RuntimeRoot    string
}

type SessionOverlayRegistry struct {
	base  *Runtime
	paths DeploymentPathPolicy

	mu       sync.Mutex
	sessions map[string]*Runtime
}

func OpenSessionOverlayRegistry(base *Runtime, opts OverlayRegistryOptions) (*SessionOverlayRegistry, error) {
	if base == nil {
		return nil, ErrBaseRuntimeRequired
	}

	paths, err := ResolveDeploymentPathPolicy(opts.DeploymentRoot, opts.RuntimeRoot)
	if err != nil {
		return nil, err
	}

	return &SessionOverlayRegistry{
		base:     base,
		paths:    paths,
		sessions: map[string]*Runtime{},
	}, nil
}

func (r *SessionOverlayRegistry) Base() *Runtime {
	if r == nil {
		return nil
	}
	return r.base
}

func (r *SessionOverlayRegistry) Paths() DeploymentPathPolicy {
	if r == nil {
		return DeploymentPathPolicy{}
	}
	return r.paths
}

func (r *SessionOverlayRegistry) Has(sessionID string) bool {
	if r == nil {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.sessions[strings.TrimSpace(sessionID)]
	return ok
}

func (r *SessionOverlayRegistry) GetOrCreate(sessionID string) (*Runtime, error) {
	if r == nil {
		return nil, ErrUnknownOverlaySession
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return nil, ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if runtime, ok := r.sessions[trimmedID]; ok {
		return runtime, nil
	}

	baseSnapshot := r.base.Snapshot()
	overlayRuntime, err := OpenOverlayRuntime(baseSnapshot.Document)
	if err != nil {
		return nil, err
	}
	r.sessions[trimmedID] = overlayRuntime
	return overlayRuntime, nil
}

func (r *SessionOverlayRegistry) Get(sessionID string) (*Runtime, error) {
	if r == nil {
		return nil, ErrUnknownOverlaySession
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return nil, ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	runtime, ok := r.sessions[trimmedID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownOverlaySession, trimmedID)
	}
	return runtime, nil
}

func (r *SessionOverlayRegistry) Delete(sessionID string) error {
	if r == nil {
		return nil
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return ErrSessionIDRequired
	}

	r.mu.Lock()
	runtime, ok := r.sessions[trimmedID]
	if ok {
		delete(r.sessions, trimmedID)
	}
	r.mu.Unlock()

	if !ok {
		return fmt.Errorf("%w: %q", ErrUnknownOverlaySession, trimmedID)
	}
	return runtime.Close()
}

func (r *SessionOverlayRegistry) Close() error {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	sessions := make([]*Runtime, 0, len(r.sessions))
	for sessionID, runtime := range r.sessions {
		sessions = append(sessions, runtime)
		delete(r.sessions, sessionID)
	}
	r.mu.Unlock()

	var errs []error
	for _, runtime := range sessions {
		errs = append(errs, runtime.Close())
	}
	return errors.Join(errs...)
}

package realtime

import (
	"errors"
	"strings"
	"sync"
)

var ErrEmptyProjectID = errors.New("realtime: project id is required")

type Scope struct {
	ProjectID      string
	ShareSessionID string
}

type Sequencer struct {
	mu              sync.RWMutex
	sequenceByScope map[Scope]uint64
}

func NewSequencer() *Sequencer {
	return &Sequencer{
		sequenceByScope: make(map[Scope]uint64),
	}
}

func (s *Sequencer) Next(scope Scope) (uint64, error) {
	scope, err := normalizeScope(scope)
	if err != nil {
		return 0, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	next := s.sequenceByScope[scope] + 1
	s.sequenceByScope[scope] = next
	return next, nil
}

func (s *Sequencer) Current(scope Scope) (uint64, bool) {
	scope, err := normalizeScope(scope)
	if err != nil {
		return 0, false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.sequenceByScope[scope]
	return current, ok
}

func (s *Sequencer) Reset(scope Scope) error {
	scope, err := normalizeScope(scope)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.sequenceByScope, scope)
	return nil
}

func (s *Sequencer) DropShareSession(shareSessionID string) {
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for scope := range s.sequenceByScope {
		if scope.ShareSessionID == shareSessionID {
			delete(s.sequenceByScope, scope)
		}
	}
}

func normalizeScope(scope Scope) (Scope, error) {
	scope.ProjectID = strings.TrimSpace(scope.ProjectID)
	scope.ShareSessionID = strings.TrimSpace(scope.ShareSessionID)
	if scope.ProjectID == "" {
		return Scope{}, ErrEmptyProjectID
	}
	return scope, nil
}

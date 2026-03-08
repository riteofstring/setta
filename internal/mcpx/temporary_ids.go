package mcpx

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"

	"setta/internal/statefs"
)

const temporaryIDMapFileName = "temporary_id_map.json"

type UnknownTemporaryIDError struct {
	ID        string
	Available []string
}

func (e *UnknownTemporaryIDError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s is not a valid id. The available ids are %v", e.ID, e.Available)
}

type TemporaryIDStore struct {
	path                 string
	mu                   sync.Mutex
	loaded               bool
	mtimeNs              int64
	canonicalToTemporary map[string]string
	temporaryToCanonical map[string]string
}

func TemporaryIDMapPath(runtimeRoot string) string {
	return filepath.Join(runtimeRoot, temporaryIDMapFileName)
}

func NewTemporaryIDStore(path string) (*TemporaryIDStore, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return nil, fmt.Errorf("mcpx: temporary id map path: %w", err)
	}
	store := &TemporaryIDStore{
		path:                 resolvedPath,
		canonicalToTemporary: map[string]string{},
		temporaryToCanonical: map[string]string{},
	}
	if err := store.refreshLocked(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *TemporaryIDStore) ResolveClientID(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || s == nil {
		return trimmed, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.refreshLocked(); err != nil {
		return "", err
	}
	if canonicalID, ok := s.temporaryToCanonical[trimmed]; ok {
		return canonicalID, nil
	}
	if _, ok := s.canonicalToTemporary[trimmed]; ok {
		return trimmed, nil
	}
	if isNumericTemporaryID(trimmed) {
		return "", &UnknownTemporaryIDError{
			ID:        trimmed,
			Available: s.availableTemporaryIDsLocked(),
		}
	}
	return trimmed, nil
}

func (s *TemporaryIDStore) EnsureTemporaryID(canonicalID string) (string, error) {
	trimmed := strings.TrimSpace(canonicalID)
	if trimmed == "" || s == nil {
		return trimmed, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.refreshLocked(); err != nil {
		return "", err
	}
	if temporaryID, ok := s.canonicalToTemporary[trimmed]; ok {
		return temporaryID, nil
	}

	nextID, err := s.nextTemporaryIDLocked()
	if err != nil {
		return "", err
	}
	temporaryID := strconv.FormatInt(nextID, 10)
	s.canonicalToTemporary[trimmed] = temporaryID
	s.temporaryToCanonical[temporaryID] = trimmed
	if err := s.persistLocked(); err != nil {
		return "", err
	}
	return temporaryID, nil
}

func (s *TemporaryIDStore) Snapshot() (map[string]string, error) {
	if s == nil {
		return map[string]string{}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.refreshLocked(); err != nil {
		return nil, err
	}

	cloned := make(map[string]string, len(s.canonicalToTemporary))
	for canonicalID, temporaryID := range s.canonicalToTemporary {
		cloned[canonicalID] = temporaryID
	}
	return cloned, nil
}

func (s *TemporaryIDStore) refreshLocked() error {
	if s == nil {
		return nil
	}
	info, err := os.Stat(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.loaded = true
			s.mtimeNs = 0
			s.canonicalToTemporary = map[string]string{}
			s.temporaryToCanonical = map[string]string{}
			return nil
		}
		return fmt.Errorf("stat temporary id map %s: %w", s.path, err)
	}
	if s.loaded && info.ModTime().UnixNano() == s.mtimeNs {
		return nil
	}

	payload, err := os.ReadFile(s.path)
	if err != nil {
		return fmt.Errorf("read temporary id map %s: %w", s.path, err)
	}

	raw := map[string]string{}
	if len(strings.TrimSpace(string(payload))) != 0 {
		if err := json.Unmarshal(payload, &raw); err != nil {
			return fmt.Errorf("decode temporary id map %s: %w", s.path, err)
		}
	}

	canonicalToTemporary := make(map[string]string, len(raw))
	temporaryToCanonical := make(map[string]string, len(raw))
	for canonicalID, temporaryID := range raw {
		normalizedCanonical := strings.TrimSpace(canonicalID)
		normalizedTemporary := strings.TrimSpace(temporaryID)
		if normalizedCanonical == "" {
			return fmt.Errorf("temporary id map %s contains an empty canonical id", s.path)
		}
		if !isNumericTemporaryID(normalizedTemporary) {
			return fmt.Errorf("temporary id map %s contains a non-numeric temporary id %q", s.path, normalizedTemporary)
		}
		if priorCanonical, exists := temporaryToCanonical[normalizedTemporary]; exists && priorCanonical != normalizedCanonical {
			return fmt.Errorf("temporary id map %s reuses temporary id %q", s.path, normalizedTemporary)
		}
		canonicalToTemporary[normalizedCanonical] = normalizedTemporary
		temporaryToCanonical[normalizedTemporary] = normalizedCanonical
	}

	s.loaded = true
	s.mtimeNs = info.ModTime().UnixNano()
	s.canonicalToTemporary = canonicalToTemporary
	s.temporaryToCanonical = temporaryToCanonical
	return nil
}

func (s *TemporaryIDStore) persistLocked() error {
	if s == nil {
		return nil
	}
	encoded, err := json.MarshalIndent(s.canonicalToTemporary, "", "  ")
	if err != nil {
		return fmt.Errorf("encode temporary id map: %w", err)
	}
	if err := statefs.AtomicWriteFile(s.path, encoded, 0o644); err != nil {
		return fmt.Errorf("write temporary id map: %w", err)
	}
	info, err := os.Stat(s.path)
	if err != nil {
		return fmt.Errorf("stat temporary id map after write: %w", err)
	}
	s.mtimeNs = info.ModTime().UnixNano()
	s.loaded = true
	return nil
}

func (s *TemporaryIDStore) nextTemporaryIDLocked() (int64, error) {
	var maxID int64
	for temporaryID := range s.temporaryToCanonical {
		parsed, err := strconv.ParseInt(temporaryID, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("temporary id map contains invalid temporary id %q", temporaryID)
		}
		if parsed > maxID {
			maxID = parsed
		}
	}
	return maxID + 1, nil
}

func (s *TemporaryIDStore) availableTemporaryIDsLocked() []string {
	values := make([]string, 0, len(s.temporaryToCanonical))
	for temporaryID := range s.temporaryToCanonical {
		values = append(values, temporaryID)
	}
	slices.Sort(values)
	return values
}

func isNumericTemporaryID(value string) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

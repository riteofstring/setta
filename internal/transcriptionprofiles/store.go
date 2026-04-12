package transcriptionprofiles

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const (
	profilesFileName = "transcription_profiles.json"
	storeFileMode    = 0o644
)

var (
	ErrRootRequired    = errors.New("transcription profiles root is required")
	ErrProfileNotFound = errors.New("transcription profile not found")
)

type Store struct {
	root string
	path string
}

func NewStore(root string) (*Store, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &Store{
		root: resolvedRoot,
		path: filepath.Join(resolvedRoot, profilesFileName),
	}, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) List() ([]Profile, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return nil, ErrRootRequired
	}
	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Profile{}, nil
		}
		return nil, fmt.Errorf("read transcription profiles: %w", err)
	}
	return decodeProfiles(content)
}

func (s *Store) Get(profileID string) (Profile, error) {
	if s == nil {
		return Profile{}, ErrRootRequired
	}
	trimmedID := strings.TrimSpace(profileID)
	if trimmedID == "" {
		return Profile{}, fmt.Errorf("%w: transcription profile id is required", ErrProfileNotFound)
	}
	profiles, err := s.List()
	if err != nil {
		return Profile{}, err
	}
	for _, profile := range profiles {
		if profile.ID == trimmedID {
			return profile, nil
		}
	}
	return Profile{}, fmt.Errorf("%w: %q", ErrProfileNotFound, trimmedID)
}

func (s *Store) Write(profiles []Profile) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}
	normalized := make([]Profile, 0, len(profiles))
	for _, profile := range profiles {
		entry, err := profile.normalized()
		if err != nil {
			return err
		}
		normalized = append(normalized, entry)
	}
	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode transcription profiles: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, storeFileMode); err != nil {
		return fmt.Errorf("write transcription profiles: %w", err)
	}
	return nil
}

func decodeProfiles(content []byte) ([]Profile, error) {
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return []Profile{}, nil
	}
	var payload any
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, fmt.Errorf("decode transcription profiles: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return []Profile{}, nil
	}
	rawProfiles, ok := payload.([]any)
	if !ok {
		return nil, fmt.Errorf("transcription profiles file must contain a JSON array")
	}
	profiles := make([]Profile, 0, len(rawProfiles))
	for index, raw := range rawProfiles {
		entryContent, err := json.Marshal(raw)
		if err != nil {
			return nil, fmt.Errorf("encode transcription profile %d: %w", index, err)
		}
		decoder := json.NewDecoder(bytes.NewReader(entryContent))
		decoder.DisallowUnknownFields()
		var entry Profile
		if err := decoder.Decode(&entry); err != nil {
			return nil, fmt.Errorf("decode transcription profile %d: %w", index, err)
		}
		normalized, err := entry.normalized()
		if err != nil {
			return nil, err
		}
		profiles = append(profiles, normalized)
	}
	return profiles, nil
}

func isEmptyJSONValue(value any) bool {
	if value == nil {
		return true
	}
	if entries, ok := value.([]any); ok {
		return len(entries) == 0
	}
	return false
}

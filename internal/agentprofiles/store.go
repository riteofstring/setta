package agentprofiles

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
	FileName        = "agent_profiles.json"
	defaultFileMode = 0o644
)

var (
	ErrRootRequired    = errors.New("agent profiles root is required")
	ErrInvalidProfile  = errors.New("invalid agent profile")
	ErrProfileNotFound = errors.New("agent profile not found")
)

type Profile struct {
	ID                          string   `json:"id"`
	Name                        string   `json:"name"`
	Description                 string   `json:"description"`
	SystemPrompt                string   `json:"systemPrompt"`
	EnableBackgroundSummaryFill bool     `json:"enableBackgroundSummaryFill"`
	EnableLlmChatTitles         bool     `json:"enableLlmChatTitles"`
	EngineConfigID              *string  `json:"engineConfigId" ts_optional:"true"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope" ts_optional:"true"`
}

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
		path: filepath.Join(resolvedRoot, FileName),
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
		return nil, fmt.Errorf("read agent profiles: %w", err)
	}

	return decodeProfiles(content)
}

func (s *Store) Get(profileID string) (Profile, error) {
	if s == nil {
		return Profile{}, ErrRootRequired
	}

	trimmedProfileID := strings.TrimSpace(profileID)
	if trimmedProfileID == "" {
		return Profile{}, fmt.Errorf("%w: profile id is required", ErrProfileNotFound)
	}

	profiles, err := s.List()
	if err != nil {
		return Profile{}, err
	}
	for _, profile := range profiles {
		if profile.ID == trimmedProfileID {
			return cloneProfile(profile), nil
		}
	}
	return Profile{}, fmt.Errorf("%w: %q", ErrProfileNotFound, trimmedProfileID)
}

func (s *Store) Write(profiles []Profile) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}

	normalizedProfiles := make([]Profile, 0, len(profiles))
	for index, profile := range profiles {
		normalizedProfile, err := normalizeProfile(profile, index)
		if err != nil {
			return err
		}
		normalizedProfiles = append(normalizedProfiles, normalizedProfile)
	}

	content, err := json.MarshalIndent(normalizedProfiles, "", "  ")
	if err != nil {
		return fmt.Errorf("encode agent profiles: %w", err)
	}
	content = append(content, '\n')

	if err := statefs.AtomicWriteFile(s.path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write agent profiles: %w", err)
	}
	return nil
}

func (s *Store) Create(profile Profile) (Profile, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return Profile{}, ErrRootRequired
	}

	normalizedProfile, err := normalizeSingleProfile(profile)
	if err != nil {
		return Profile{}, err
	}
	profiles, err := s.List()
	if err != nil {
		return Profile{}, err
	}
	profiles = append(profiles, normalizedProfile)
	if err := s.Write(profiles); err != nil {
		return Profile{}, err
	}
	return cloneProfile(normalizedProfile), nil
}

func (s *Store) Update(profile Profile) (Profile, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return Profile{}, ErrRootRequired
	}

	normalizedProfile, err := normalizeSingleProfile(profile)
	if err != nil {
		return Profile{}, err
	}
	profiles, err := s.List()
	if err != nil {
		return Profile{}, err
	}
	for index, existing := range profiles {
		if existing.ID != normalizedProfile.ID {
			continue
		}
		profiles[index] = normalizedProfile
		if err := s.Write(profiles); err != nil {
			return Profile{}, err
		}
		return cloneProfile(normalizedProfile), nil
	}
	return Profile{}, fmt.Errorf("%w: %q", ErrProfileNotFound, normalizedProfile.ID)
}

func (s *Store) Delete(profileID string) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}

	trimmedProfileID := strings.TrimSpace(profileID)
	if trimmedProfileID == "" {
		return fmt.Errorf("%w: profile id is required", ErrProfileNotFound)
	}
	profiles, err := s.List()
	if err != nil {
		return err
	}
	for index, profile := range profiles {
		if profile.ID != trimmedProfileID {
			continue
		}
		profiles = append(profiles[:index], profiles[index+1:]...)
		return s.Write(profiles)
	}
	return fmt.Errorf("%w: %q", ErrProfileNotFound, trimmedProfileID)
}

func decodeProfiles(content []byte) ([]Profile, error) {
	trimmedContent := bytes.TrimSpace(content)
	if len(trimmedContent) == 0 {
		return []Profile{}, nil
	}

	var payload any
	if err := json.Unmarshal(trimmedContent, &payload); err != nil {
		return nil, fmt.Errorf("decode agent profiles: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return []Profile{}, nil
	}

	rawProfiles, ok := payload.([]any)
	if !ok {
		return nil, fmt.Errorf("agent profiles file must contain a JSON array")
	}

	profiles := make([]Profile, 0, len(rawProfiles))
	for index, rawProfile := range rawProfiles {
		entryContent, err := json.Marshal(rawProfile)
		if err != nil {
			return nil, fmt.Errorf("encode agent profile %d for validation: %w", index, err)
		}
		profile, err := decodeProfile(entryContent, index)
		if err != nil {
			return nil, err
		}
		profiles = append(profiles, profile)
	}
	return profiles, nil
}

func decodeProfile(content []byte, index int) (Profile, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()

	var profile Profile
	if err := decoder.Decode(&profile); err != nil {
		return Profile{}, fmt.Errorf("decode agent profile %d: %w", index, err)
	}
	return normalizeProfile(profile, index)
}

func normalizeProfile(profile Profile, index int) (Profile, error) {
	label := "agent profile"
	if index >= 0 {
		label = fmt.Sprintf("agent profile %d", index)
	}
	if strings.TrimSpace(profile.ID) == "" {
		return Profile{}, fmt.Errorf("%s id is required", label)
	}
	if strings.TrimSpace(profile.Name) == "" {
		return Profile{}, fmt.Errorf("%s name is required", label)
	}

	normalized := cloneProfile(profile)
	if normalized.ToolAllowlist == nil {
		normalized.ToolAllowlist = []string{}
	}
	return normalized, nil
}

func normalizeSingleProfile(profile Profile) (Profile, error) {
	normalized, err := normalizeProfile(profile, -1)
	if err != nil {
		return Profile{}, fmt.Errorf("%w: %v", ErrInvalidProfile, err)
	}
	return normalized, nil
}

func cloneProfile(profile Profile) Profile {
	cloned := profile
	if profile.ToolAllowlist != nil {
		cloned.ToolAllowlist = append([]string(nil), profile.ToolAllowlist...)
	}
	if profile.EngineConfigID != nil {
		engineConfigID := *profile.EngineConfigID
		cloned.EngineConfigID = &engineConfigID
	}
	if profile.MemoryScope != nil {
		memoryScope := *profile.MemoryScope
		cloned.MemoryScope = &memoryScope
	}
	return cloned
}

func isEmptyJSONValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case bool:
		return !typed
	case string:
		return typed == ""
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	case float64:
		return typed == 0
	default:
		return false
	}
}

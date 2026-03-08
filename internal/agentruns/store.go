package agentruns

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"setta/internal/statefs"
)

const (
	engineConfigsFileName = "engine_configs.json"
	runDirectoryName      = "agent_runs"
	runIndexFileName      = "agent_run_index.json"
	storeFileMode         = 0o644
)

var (
	ErrRootRequired         = errors.New("agent runs root is required")
	ErrEngineConfigNotFound = errors.New("engine config not found")
	ErrRunNotFound          = errors.New("agent run not found")
)

type EngineStore struct {
	root string
	path string
}

type RunStore struct {
	root      string
	runsRoot  string
	indexPath string
}

func NewEngineStore(root string) (*EngineStore, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &EngineStore{
		root: resolvedRoot,
		path: filepath.Join(resolvedRoot, engineConfigsFileName),
	}, nil
}

func (s *EngineStore) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *EngineStore) List() ([]EngineConfig, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return nil, ErrRootRequired
	}
	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []EngineConfig{}, nil
		}
		return nil, fmt.Errorf("read engine configs: %w", err)
	}
	return decodeEngineConfigs(content)
}

func (s *EngineStore) Get(configID string) (EngineConfig, error) {
	if s == nil {
		return EngineConfig{}, ErrRootRequired
	}
	trimmedID := strings.TrimSpace(configID)
	if trimmedID == "" {
		return EngineConfig{}, fmt.Errorf("%w: engine config id is required", ErrEngineConfigNotFound)
	}
	configs, err := s.List()
	if err != nil {
		return EngineConfig{}, err
	}
	for _, config := range configs {
		if config.ID == trimmedID {
			return config, nil
		}
	}
	return EngineConfig{}, fmt.Errorf("%w: %q", ErrEngineConfigNotFound, trimmedID)
}

func (s *EngineStore) Write(configs []EngineConfig) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}
	normalized := make([]EngineConfig, 0, len(configs))
	for _, config := range configs {
		entry, err := config.normalized()
		if err != nil {
			return err
		}
		normalized = append(normalized, entry)
	}
	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode engine configs: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, storeFileMode); err != nil {
		return fmt.Errorf("write engine configs: %w", err)
	}
	return nil
}

func NewRunStore(root string) (*RunStore, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &RunStore{
		root:      resolvedRoot,
		runsRoot:  filepath.Join(resolvedRoot, runDirectoryName),
		indexPath: filepath.Join(resolvedRoot, runIndexFileName),
	}, nil
}

func (s *RunStore) RunsRoot() string {
	if s == nil {
		return ""
	}
	return s.runsRoot
}

func (s *RunStore) IndexPath() string {
	if s == nil {
		return ""
	}
	return s.indexPath
}

func (s *RunStore) Save(run Run) error {
	if s == nil {
		return ErrRootRequired
	}
	normalized, err := run.normalized()
	if err != nil {
		return err
	}
	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode agent run: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.runPath(normalized.ID), content, storeFileMode); err != nil {
		return fmt.Errorf("write agent run: %w", err)
	}
	return s.writeIndexEntry(normalized)
}

func (s *RunStore) Load(runID string) (Run, error) {
	if s == nil {
		return Run{}, ErrRootRequired
	}
	trimmedID := strings.TrimSpace(runID)
	if trimmedID == "" {
		return Run{}, fmt.Errorf("%w: run id is required", ErrRunNotFound)
	}
	content, err := os.ReadFile(s.runPath(trimmedID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Run{}, fmt.Errorf("%w: %q", ErrRunNotFound, trimmedID)
		}
		return Run{}, fmt.Errorf("read agent run: %w", err)
	}
	return decodeRun(content)
}

func (s *RunStore) Delete(runID string) error {
	if s == nil {
		return ErrRootRequired
	}
	trimmedID := strings.TrimSpace(runID)
	if trimmedID == "" {
		return fmt.Errorf("%w: run id is required", ErrRunNotFound)
	}
	if err := os.Remove(s.runPath(trimmedID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete agent run: %w", err)
	}
	index, err := s.loadIndex()
	if err != nil {
		return err
	}
	delete(index.Runs, trimmedID)
	return s.persistIndex(index)
}

func (s *RunStore) List() ([]Run, error) {
	if s == nil {
		return nil, ErrRootRequired
	}
	entries, err := os.ReadDir(s.runsRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Run{}, nil
		}
		return nil, fmt.Errorf("list agent runs: %w", err)
	}
	runs := make([]Run, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		run, err := s.Load(strings.TrimSuffix(entry.Name(), ".json"))
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	slices.SortFunc(runs, func(left, right Run) int {
		return strings.Compare(left.ID, right.ID)
	})
	return runs, nil
}

func (s *RunStore) ListByMetadata(filter RunFilter) ([]Run, error) {
	if s == nil {
		return nil, ErrRootRequired
	}
	index, err := s.loadIndex()
	if err != nil {
		return nil, err
	}
	runIDs := make([]string, 0, len(index.Runs))
	for runID, entry := range index.Runs {
		if filter.RunType != nil && !stringPtrEqual(entry.RunType, *filter.RunType) {
			continue
		}
		if filter.ChatID != nil && !stringPtrEqual(entry.ChatID, *filter.ChatID) {
			continue
		}
		if filter.ProjectConfigID != nil && !stringPtrEqual(entry.ProjectConfigID, *filter.ProjectConfigID) {
			continue
		}
		runIDs = append(runIDs, runID)
	}
	slices.Sort(runIDs)
	runs := make([]Run, 0, len(runIDs))
	for _, runID := range runIDs {
		run, err := s.Load(runID)
		if err != nil {
			if errors.Is(err, ErrRunNotFound) {
				continue
			}
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, nil
}

func (s *RunStore) runPath(runID string) string {
	return filepath.Join(s.runsRoot, strings.TrimSpace(runID)+".json")
}

func (s *RunStore) writeIndexEntry(run Run) error {
	index, err := s.loadIndex()
	if err != nil {
		return err
	}
	if index.Runs == nil {
		index.Runs = map[string]RunIndexEntry{}
	}
	index.Runs[run.ID] = buildRunIndexEntry(run)
	return s.persistIndex(index)
}

func (s *RunStore) loadIndex() (RunIndex, error) {
	content, err := os.ReadFile(s.indexPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return RunIndex{Version: 1, Runs: map[string]RunIndexEntry{}}, nil
		}
		return RunIndex{}, fmt.Errorf("read run index: %w", err)
	}
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return RunIndex{Version: 1, Runs: map[string]RunIndexEntry{}}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	var index RunIndex
	if err := decoder.Decode(&index); err != nil {
		return RunIndex{}, fmt.Errorf("decode run index: %w", err)
	}
	if index.Version == 0 {
		index.Version = 1
	}
	if index.Runs == nil {
		index.Runs = map[string]RunIndexEntry{}
	}
	return index, nil
}

func (s *RunStore) persistIndex(index RunIndex) error {
	if index.Version == 0 {
		index.Version = 1
	}
	if index.Runs == nil {
		index.Runs = map[string]RunIndexEntry{}
	}
	content, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return fmt.Errorf("encode run index: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.indexPath, content, storeFileMode); err != nil {
		return fmt.Errorf("write run index: %w", err)
	}
	return nil
}

func decodeEngineConfigs(content []byte) ([]EngineConfig, error) {
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return []EngineConfig{}, nil
	}
	var payload any
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, fmt.Errorf("decode engine configs: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return []EngineConfig{}, nil
	}
	rawConfigs, ok := payload.([]any)
	if !ok {
		return nil, fmt.Errorf("engine configs file must contain a JSON array")
	}
	configs := make([]EngineConfig, 0, len(rawConfigs))
	for index, raw := range rawConfigs {
		entryContent, err := json.Marshal(raw)
		if err != nil {
			return nil, fmt.Errorf("encode engine config %d: %w", index, err)
		}
		decoder := json.NewDecoder(bytes.NewReader(entryContent))
		decoder.DisallowUnknownFields()
		var entry EngineConfig
		if err := decoder.Decode(&entry); err != nil {
			return nil, fmt.Errorf("decode engine config %d: %w", index, err)
		}
		normalized, err := entry.normalized()
		if err != nil {
			return nil, err
		}
		configs = append(configs, normalized)
	}
	return configs, nil
}

func decodeRun(content []byte) (Run, error) {
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return Run{}, fmt.Errorf("agent run file must not be empty")
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	var run Run
	if err := decoder.Decode(&run); err != nil {
		return Run{}, fmt.Errorf("decode agent run: %w", err)
	}
	return run.normalized()
}

func buildRunIndexEntry(run Run) RunIndexEntry {
	var runType *string
	if value, ok := run.Inputs["runType"]; ok {
		if text, ok := value.(string); ok {
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				runType = &trimmed
			}
		}
	}
	var chatID *string
	if value, ok := run.Inputs["chatId"]; ok {
		if text, ok := value.(string); ok {
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				chatID = &trimmed
			}
		}
	}
	var projectConfigID *string
	if value, ok := run.Inputs["projectConfigId"]; ok {
		if text, ok := value.(string); ok {
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				projectConfigID = &trimmed
			}
		}
	}
	return RunIndexEntry{
		RunType:         runType,
		ChatID:          chatID,
		ProjectConfigID: projectConfigID,
	}
}

func stringPtrEqual(actual *string, expected string) bool {
	if actual == nil {
		return false
	}
	return strings.TrimSpace(*actual) == strings.TrimSpace(expected)
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

package settingsstate

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const defaultFileMode = 0o644

type StoreOptions struct {
	Locker              statefs.Locker
	SettingsProjectPath string
}

type Store struct {
	path                string
	settingsProjectPath string
	locker              statefs.Locker
}

func NewStore(path string, opts StoreOptions) (*Store, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return nil, fmt.Errorf("resolve settings store path: %w", err)
	}
	resolvedSettingsProjectPath := ""
	if strings.TrimSpace(opts.SettingsProjectPath) != "" {
		resolvedSettingsProjectPath, err = statefs.NormalizePath(opts.SettingsProjectPath, "")
		if err != nil {
			return nil, fmt.Errorf("resolve settings project path: %w", err)
		}
	}

	locker := opts.Locker
	if locker == nil {
		locker = statefs.NoopLocker{}
	}

	return &Store{
		path:                resolvedPath,
		settingsProjectPath: resolvedSettingsProjectPath,
		locker:              locker,
	}, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) Load(ctx context.Context) (Document, error) {
	if s == nil {
		return nil, fmt.Errorf("settings store is required")
	}

	defaultDocument, err := DefaultDocument()
	if err != nil {
		return nil, err
	}
	settingsPaths, err := s.settingsPaths(ctx, defaultDocument)
	if err != nil {
		return nil, err
	}
	pathToSlices := invertSettingsPaths(settingsPaths)
	unlock, err := s.lockPaths(ctx, sortedSettingsPaths(pathToSlices))
	if err != nil {
		return nil, fmt.Errorf("lock settings store for load: %w", err)
	}
	defer unlock()
	if err := ensureMissingSettingsTargets(defaultDocument, pathToSlices); err != nil {
		return nil, err
	}

	output := make(Document, len(defaultDocument))
	for path, slices := range pathToSlices {
		documentRoot, err := loadSettingsObjectForPath(path, defaultDocument, slices)
		if err != nil {
			return nil, err
		}
		for _, settingsSlice := range slices {
			output[settingsSlice] = cloneValue(documentRoot[settingsSlice])
		}
	}
	return output.Normalized()
}

func (s *Store) Save(ctx context.Context, document Document) error {
	if s == nil {
		return fmt.Errorf("settings store is required")
	}

	normalized, err := document.Normalized()
	if err != nil {
		return err
	}

	settingsPaths, err := s.settingsPaths(ctx, normalized)
	if err != nil {
		return err
	}
	pathToSlices := invertSettingsPaths(settingsPaths)
	unlock, err := s.lockPaths(ctx, sortedSettingsPaths(pathToSlices))
	if err != nil {
		return fmt.Errorf("lock settings store for save: %w", err)
	}
	defer unlock()

	for path, slices := range pathToSlices {
		payload := make(map[string]any, len(slices))
		for _, settingsSlice := range slices {
			payload[settingsSlice] = cloneValue(normalized[settingsSlice])
		}
		if err := writeSettingsObject(path, payload); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) settingsPaths(ctx context.Context, defaults Document) (map[string]string, error) {
	if s == nil {
		return nil, fmt.Errorf("settings store is required")
	}

	settingsProject, ok, err := s.loadSettingsProject(ctx)
	if err != nil {
		return nil, err
	}

	paths := make(map[string]string, len(defaults))
	for settingsSlice := range defaults {
		paths[settingsSlice] = s.path
		if !ok {
			continue
		}
		path, found, err := s.findPathForSettingsSlice(settingsProject, settingsSlice)
		if err != nil {
			return nil, err
		}
		if found {
			paths[settingsSlice] = path
		}
	}
	return paths, nil
}

func (s *Store) loadSettingsProject(ctx context.Context) (projectstate.Project, bool, error) {
	if s == nil || strings.TrimSpace(s.settingsProjectPath) == "" {
		return projectstate.Project{}, false, nil
	}

	store, err := projectstate.NewStore(
		s.settingsProjectPath,
		projectstate.StoreOptions{Locker: s.locker},
	)
	if err != nil {
		return projectstate.Project{}, false, fmt.Errorf("create settings project store: %w", err)
	}
	document, err := store.LoadRaw(ctx)
	if err != nil {
		return projectstate.Project{}, false, fmt.Errorf("load settings project: %w", err)
	}
	return settingsProjectForDocument(document)
}

func (s *Store) findPathForSettingsSlice(
	project projectstate.Project,
	settingsSlice string,
) (string, bool, error) {
	for _, sectionID := range sortedProjectSectionIDs(project) {
		sourceSection, ok, err := loadSettingsProjectJSONSourceSection(project, sectionID)
		if err != nil {
			return "", false, err
		}
		if !ok || !sourceSection.claimsSlice(settingsSlice) {
			continue
		}
		resolvedPath, err := s.resolveSettingsSlicePath(sourceSection.sourcePath, settingsSlice)
		if err != nil {
			return "", false, err
		}
		return resolvedPath, true, nil
	}
	return "", false, nil
}

func sortedProjectSectionIDs(project projectstate.Project) []string {
	sectionIDs := make([]string, 0, len(project.Sections))
	for sectionID := range project.Sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	return sectionIDs
}

func (section settingsProjectJSONSourceSection) claimsSlice(settingsSlice string) bool {
	return section.sectionName == settingsSlice && len(section.jsonSourceKeys) == 1 && section.jsonSourceKeys[0] == settingsSlice
}

func (s *Store) resolveSettingsSlicePath(sourcePath string, settingsSlice string) (string, error) {
	resolvedPath, err := statefs.NormalizePath(sourcePath, filepath.Dir(s.path))
	if err != nil {
		return "", fmt.Errorf("resolve settings slice %q path: %w", settingsSlice, err)
	}
	return resolvedPath, nil
}

func invertSettingsPaths(paths map[string]string) map[string][]string {
	output := make(map[string][]string, len(paths))
	for settingsSlice, path := range paths {
		output[path] = append(output[path], settingsSlice)
	}
	for path := range output {
		sort.Strings(output[path])
	}
	return output
}

func sortedSettingsPaths(pathToSlices map[string][]string) []string {
	paths := make([]string, 0, len(pathToSlices))
	for path := range pathToSlices {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths
}

func (s *Store) lockPaths(ctx context.Context, paths []string) (statefs.UnlockFunc, error) {
	locks := make([]statefs.UnlockFunc, 0, len(paths))
	for _, path := range paths {
		unlock, err := s.locker.Lock(ctx, path)
		if err != nil {
			for i := len(locks) - 1; i >= 0; i-- {
				_ = locks[i]()
			}
			return nil, err
		}
		locks = append(locks, unlock)
	}
	return func() error {
		for i := len(locks) - 1; i >= 0; i-- {
			if err := locks[i](); err != nil {
				return err
			}
		}
		return nil
	}, nil
}

func ensureMissingSettingsTargets(defaults Document, pathToSlices map[string][]string) error {
	defaultContent, err := encodeSettingsObject(defaults)
	if err != nil {
		return err
	}
	for path := range pathToSlices {
		if _, err := os.Stat(path); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("stat settings document: %w", err)
		}
		if err := statefs.AtomicWriteFile(path, defaultContent, defaultFileMode); err != nil {
			return fmt.Errorf("write default settings document: %w", err)
		}
	}
	return nil
}

func loadSettingsObjectForPath(
	path string,
	defaults Document,
	slices []string,
) (map[string]any, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read settings document: %w", err)
	}

	var raw any
	if err := json.Unmarshal(content, &raw); err != nil {
		return nil, fmt.Errorf("decode settings document: %w", err)
	}

	documentRoot, ok := raw.(map[string]any)
	if !ok {
		return nil, ErrSettingsPayloadNotObject
	}
	for _, settingsSlice := range slices {
		existingSlice, hasExisting := documentRoot[settingsSlice]
		if !hasExisting {
			return nil, newValidationError("settings.%s: Field required", settingsSlice)
		}
		if err := validateSettingsSliceValue(settingsSlice, existingSlice, defaults); err != nil {
			return nil, err
		}
	}
	return documentRoot, nil
}

func validateSettingsSliceValue(settingsSlice string, existingSlice any, defaults Document) error {
	if settingsSlice == "languageServer" {
		return validateLanguageServerSettingsBranch(existingSlice, true)
	}
	return validateValueAgainstDefault(
		existingSlice,
		defaults[settingsSlice],
		"settings."+settingsSlice,
		true,
	)
}

func writeSettingsObject(path string, payload map[string]any) error {
	content, err := encodeSettingsObject(payload)
	if err != nil {
		return err
	}
	if err := statefs.AtomicWriteFile(path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write settings document: %w", err)
	}
	return nil
}

func encodeSettingsObject(payload map[string]any) ([]byte, error) {
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode settings document: %w", err)
	}
	return append(content, '\n'), nil
}

package projectstate

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/statefs"
	"setta/internal/watchcode"
)

var (
	ErrWatchCodeWorkspaceRootRequired = errors.New("watch code workspace root is required")
	ErrWatchCodeInputPathInvalid      = errors.New("watch code input path is invalid")
)

type WatchCodeCallableKind string

const (
	WatchCodeCallableKindFunction      WatchCodeCallableKind = "function"
	WatchCodeCallableKindAsyncFunction WatchCodeCallableKind = "async_function"
	WatchCodeCallableKindClassInit     WatchCodeCallableKind = "class_init"
)

type WatchCodeFolder struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive"`
}

type WatchCodeRegistryEntry struct {
	CallableName  string                `json:"callableName"`
	Kind          WatchCodeCallableKind `json:"kind" ts_type:"string"`
	SignatureHash string                `json:"signatureHash"`
	BodyHash      string                `json:"bodyHash"`
	SourcePath    string                `json:"sourcePath"`
	SectionIDs    []string              `json:"sectionIds,omitempty"`
	SectionsCount int                   `json:"sectionsCount,omitempty"`
}

type watchCodeConfigSnapshot struct {
	Enabled bool
	Files   []string
	Folders []WatchCodeFolder
}

type watchCodeFolderKey struct {
	Path      string
	Recursive bool
}

var defaultWatchCodeIgnoreDirNames = map[string]struct{}{
	".venv":           {},
	"__pycache__":     {},
	"node_modules":    {},
	"setta_files":     {},
	"setta_files_dev": {},
}

func (d *Document) SetWatchCodeEnabled(projectID string, enabled bool, workspaceRoot string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.setWatchCodeEnabledWithIgnoredRoots(enabled, workspaceRoot, d.watchCodeIgnoredRoots); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetWatchCodeEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	workspaceRoot string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWatchCodeEnabled(projectID, enabled, workspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetWatchCodeEnabled(enabled bool, workspaceRoot string) error {
	return p.setWatchCodeEnabledWithIgnoredRoots(enabled, workspaceRoot, nil)
}

func (p *Project) setWatchCodeEnabledWithIgnoredRoots(enabled bool, workspaceRoot string, ignoredRoots []string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return err
	}

	previousEnabled := p.WatchCodeEnabled
	p.WatchCodeEnabled = enabled
	if enabled && !previousEnabled {
		return p.baselineWatchCodeOnEnable(workspaceRoot, ignoredRoots)
	}
	return nil
}

func (d *Document) SetWatchCodeInputs(
	projectID string,
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.setWatchCodeInputsWithIgnoredRoots(folders, files, workspaceRoot, d.watchCodeIgnoredRoots); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetWatchCodeInputs(
	ctx context.Context,
	projectID string,
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWatchCodeInputs(projectID, folders, files, workspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetWatchCodeInputs(folders []WatchCodeFolder, files []string, workspaceRoot string) error {
	return p.setWatchCodeInputsWithIgnoredRoots(folders, files, workspaceRoot, nil)
}

func (p *Project) setWatchCodeInputsWithIgnoredRoots(
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
	ignoredRoots []string,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return err
	}

	previousSnapshot := buildWatchCodeConfigSnapshot(*p)
	normalizedFolders, err := normalizeWatchCodeFolders(workspaceRoot, folders)
	if err != nil {
		return err
	}
	normalizedFiles, err := normalizeWatchCodeFiles(workspaceRoot, files)
	if err != nil {
		return err
	}

	p.WatchCodeFolders = normalizedFolders
	p.WatchCodeFiles = normalizedFiles
	if p.WatchCodeEnabled {
		return p.baselineWatchCodeForNewInputs(workspaceRoot, previousSnapshot, ignoredRoots)
	}
	return nil
}

func requireWatchCodeWorkspaceRoot(workspaceRoot string) error {
	if strings.TrimSpace(workspaceRoot) == "" {
		return ErrWatchCodeWorkspaceRootRequired
	}
	return nil
}

func normalizeWatchCodeFiles(workspaceRoot string, files []string) ([]string, error) {
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return nil, err
	}

	output := make([]string, 0, len(files))
	seen := make(map[string]struct{}, len(files))
	for _, raw := range files {
		normalized, ok, err := normalizeWatchCodeInputPath(workspaceRoot, raw, "file")
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		output = append(output, normalized)
	}
	return output, nil
}

func normalizeWatchCodeFolders(workspaceRoot string, folders []WatchCodeFolder) ([]WatchCodeFolder, error) {
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return nil, err
	}

	output := make([]WatchCodeFolder, 0, len(folders))
	seen := make(map[watchCodeFolderKey]struct{}, len(folders))
	for _, folder := range folders {
		normalizedPath, ok, err := normalizeWatchCodeInputPath(workspaceRoot, folder.Path, "folder")
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		key := watchCodeFolderKey{
			Path:      normalizedPath,
			Recursive: folder.Recursive,
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		output = append(output, WatchCodeFolder{
			Path:      normalizedPath,
			Recursive: folder.Recursive,
		})
	}
	return output, nil
}

func normalizeWatchCodeInputPath(workspaceRoot string, raw string, label string) (string, bool, error) {
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return "", false, err
	}

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}

	resolved, err := statefs.ResolveWithinRoot(workspaceRoot, filepath.FromSlash(trimmed), fmt.Sprintf("watch code %s path", label))
	if err != nil {
		return "", false, fmt.Errorf("%w: %s", ErrWatchCodeInputPathInvalid, err)
	}

	relative, err := filepath.Rel(filepath.Clean(workspaceRoot), resolved)
	if err != nil {
		return "", false, fmt.Errorf("%w: resolve relative path: %v", ErrWatchCodeInputPathInvalid, err)
	}
	return filepath.ToSlash(filepath.Clean(relative)), true, nil
}

func buildWatchCodeConfigSnapshot(project Project) watchCodeConfigSnapshot {
	return watchCodeConfigSnapshot{
		Enabled: project.WatchCodeEnabled,
		Files:   append([]string(nil), project.WatchCodeFiles...),
		Folders: cloneWatchCodeFolders(project.WatchCodeFolders),
	}
}

func WatchCodeConfigInputs(document Document) map[string]watchcode.ConfigInputs {
	configs := make(map[string]watchcode.ConfigInputs, len(document.Projects))
	for projectID, project := range document.Projects {
		folders := make([]watchcode.FolderInput, 0, len(project.WatchCodeFolders))
		for _, folder := range project.WatchCodeFolders {
			folders = append(folders, watchcode.FolderInput{
				Path:      folder.Path,
				Recursive: folder.Recursive,
			})
		}
		configs[projectID] = watchcode.ConfigInputs{
			Enabled:      project.WatchCodeEnabled,
			Files:        append([]string(nil), project.WatchCodeFiles...),
			Folders:      folders,
			IgnoredRoots: append([]string(nil), document.watchCodeIgnoredRoots...),
		}
	}
	return configs
}

func (p *Project) baselineWatchCodeOnEnable(workspaceRoot string, ignoredRoots []string) error {
	if err := p.baselineWatchCodeInputs(workspaceRoot, ignoredRoots); err != nil {
		return err
	}
	return p.baselineWatchCodeCodeSections(workspaceRoot)
}

func (p *Project) baselineWatchCodeForNewInputs(
	workspaceRoot string,
	previous watchCodeConfigSnapshot,
	ignoredRoots []string,
) error {
	next := buildWatchCodeConfigSnapshot(*p)
	if !next.Enabled {
		return nil
	}

	previousFiles := make(map[string]struct{}, len(previous.Files))
	for _, filePath := range previous.Files {
		previousFiles[filePath] = struct{}{}
	}
	for _, filePath := range next.Files {
		if _, exists := previousFiles[filePath]; exists {
			continue
		}
		if err := p.baselineWatchCodeFile(workspaceRoot, filePath, ignoredRoots); err != nil {
			return err
		}
	}

	previousFolders := make(map[watchCodeFolderKey]struct{}, len(previous.Folders))
	for _, folder := range previous.Folders {
		previousFolders[watchCodeFolderKey{
			Path:      folder.Path,
			Recursive: folder.Recursive,
		}] = struct{}{}
	}
	for _, folder := range next.Folders {
		key := watchCodeFolderKey{
			Path:      folder.Path,
			Recursive: folder.Recursive,
		}
		if _, exists := previousFolders[key]; exists {
			continue
		}
		if err := p.baselineWatchCodeFolder(workspaceRoot, folder.Path, folder.Recursive, ignoredRoots); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) baselineWatchCodeInputs(workspaceRoot string, ignoredRoots []string) error {
	for _, filePath := range p.WatchCodeFiles {
		if err := p.baselineWatchCodeFile(workspaceRoot, filePath, ignoredRoots); err != nil {
			return err
		}
	}
	for _, folder := range p.WatchCodeFolders {
		if strings.TrimSpace(folder.Path) == "" {
			continue
		}
		if err := p.baselineWatchCodeFolder(workspaceRoot, folder.Path, folder.Recursive, ignoredRoots); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) baselineWatchCodeCodeSections(workspaceRoot string) error {
	for sectionID := range p.Sections {
		_, _, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		if !impl.IsCode() || impl.Code.Language != CodeLanguagePython || impl.Code.Binding == nil {
			continue
		}

		bindingRelativePath, ok, err := normalizeWatchCodeInputPath(workspaceRoot, impl.Code.Binding.Path, "code binding")
		if err != nil {
			return err
		}
		if !ok {
			continue
		}

		code, ok, err := watchCodeBoundSectionSource(*p, sectionID, workspaceRoot, bindingRelativePath)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}

		identities, parsed, err := parseWatchCodeBaselineIdentities(code, bindingRelativePath)
		if err != nil {
			return err
		}
		if !parsed {
			continue
		}

		absolutePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, bindingRelativePath, "code binding")
		if err != nil {
			return err
		}
		p.recordWatchCodeBaseline(absolutePath, identities)
	}
	return nil
}

func watchCodeBoundSectionSource(project Project, sectionID string, workspaceRoot string, bindingRelativePath string) (string, bool, error) {
	payload, err := effectiveSectionPayload(project, sectionID, project.SectionVariantMap[sectionID])
	if err != nil {
		return "", false, err
	}
	if code, ok := payloadRawStringFieldWithPresence(payload, "code"); ok {
		return code, true, nil
	}

	absolutePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, bindingRelativePath, "code binding")
	if err != nil {
		return "", false, err
	}
	raw, ok, err := readWatchCodeFile(absolutePath)
	if err != nil {
		return "", false, err
	}
	if !ok {
		return "", false, nil
	}
	return raw, true, nil
}

func (p *Project) baselineWatchCodeFolder(
	workspaceRoot string,
	relativeFolderPath string,
	recursive bool,
	ignoredRoots []string,
) error {
	absoluteFolderPath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativeFolderPath, "watch code folder path")
	if err != nil {
		return err
	}

	filePaths, err := iterWatchCodePythonFiles(absoluteFolderPath, recursive, ignoredRoots)
	if err != nil {
		return err
	}
	for _, absoluteFilePath := range filePaths {
		relativeFilePath, err := watchCodeRelativePath(workspaceRoot, absoluteFilePath)
		if err != nil {
			return err
		}
		if err := p.baselineWatchCodeAbsoluteFile(workspaceRoot, absoluteFilePath, relativeFilePath); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) baselineWatchCodeFile(workspaceRoot string, relativeFilePath string, ignoredRoots []string) error {
	absoluteFilePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativeFilePath, "watch code file path")
	if err != nil {
		return err
	}
	if shouldIgnoreWatchCodePath(absoluteFilePath, ignoredRoots) {
		return nil
	}
	return p.baselineWatchCodeAbsoluteFile(workspaceRoot, absoluteFilePath, relativeFilePath)
}

func (p *Project) baselineWatchCodeAbsoluteFile(workspaceRoot string, absoluteFilePath string, relativeFilePath string) error {
	raw, ok, err := readWatchCodeFile(absoluteFilePath)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	identities, parsed, err := parseWatchCodeBaselineIdentities(raw, relativeFilePath)
	if err != nil {
		return err
	}
	if !parsed {
		return nil
	}
	p.recordWatchCodeBaseline(absoluteFilePath, identities)
	return nil
}

func resolveWatchCodeAbsolutePath(workspaceRoot string, relativePath string, label string) (string, error) {
	resolved, err := statefs.ResolveWithinRoot(workspaceRoot, filepath.FromSlash(relativePath), label)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrWatchCodeInputPathInvalid, err)
	}
	return resolved, nil
}

func readWatchCodeFile(absolutePath string) (string, bool, error) {
	raw, err := os.ReadFile(absolutePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", false, nil
		}
		return "", false, err
	}
	return string(raw), true, nil
}

func (p *Project) recordWatchCodeBaseline(absolutePath string, identities []string) {
	if p.WatchCodeBaselineByPath == nil {
		p.WatchCodeBaselineByPath = map[string][]string{}
	}
	cloned := append([]string(nil), identities...)
	p.WatchCodeBaselineByPath[absolutePath] = cloned
}

func iterWatchCodePythonFiles(root string, recursive bool, ignoredRoots []string) ([]string, error) {
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, nil
	}
	if shouldIgnoreWatchCodePath(root, ignoredRoots) {
		return nil, nil
	}

	if !recursive {
		entries, err := os.ReadDir(root)
		if err != nil {
			return nil, err
		}
		output := make([]string, 0, len(entries))
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			absolutePath := filepath.Join(root, entry.Name())
			if filepath.Ext(entry.Name()) != ".py" || shouldIgnoreWatchCodePath(absolutePath, ignoredRoots) {
				continue
			}
			output = append(output, absolutePath)
		}
		return output, nil
	}

	output := make([]string, 0)
	err = filepath.WalkDir(root, func(currentPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if errors.Is(walkErr, os.ErrNotExist) {
				return nil
			}
			return walkErr
		}
		if entry.IsDir() {
			if currentPath != root && shouldIgnoreWatchCodePath(currentPath, ignoredRoots) {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(entry.Name()) != ".py" || shouldIgnoreWatchCodePath(currentPath, ignoredRoots) {
			return nil
		}
		output = append(output, currentPath)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return output, nil
}

func shouldIgnoreWatchCodePath(absolutePath string, ignoredRoots []string) bool {
	cleaned := filepath.Clean(absolutePath)
	for _, part := range strings.Split(filepath.ToSlash(cleaned), "/") {
		if _, ignored := defaultWatchCodeIgnoreDirNames[part]; ignored {
			return true
		}
	}
	for _, ignoredRoot := range ignoredRoots {
		if isWatchCodeDescendantOrSelf(cleaned, ignoredRoot) {
			return true
		}
	}
	return false
}

func normalizeWatchCodeIgnoredRoots(roots []string) ([]string, error) {
	output := make([]string, 0, len(roots))
	seen := make(map[string]struct{}, len(roots))
	for _, raw := range roots {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		resolved, err := statefs.NormalizePath(trimmed, "")
		if err != nil {
			return nil, err
		}
		if _, exists := seen[resolved]; exists {
			continue
		}
		seen[resolved] = struct{}{}
		output = append(output, resolved)
	}
	sort.Strings(output)
	return output, nil
}

func isWatchCodeDescendantOrSelf(path string, root string) bool {
	if strings.TrimSpace(root) == "" {
		return false
	}
	relative, err := filepath.Rel(filepath.Clean(root), filepath.Clean(path))
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

func watchCodeRelativePath(workspaceRoot string, absolutePath string) (string, error) {
	relative, err := filepath.Rel(filepath.Clean(workspaceRoot), filepath.Clean(absolutePath))
	if err != nil {
		return "", fmt.Errorf("resolve relative watch code path: %w", err)
	}
	return filepath.ToSlash(filepath.Clean(relative)), nil
}

func parseWatchCodeBaselineIdentities(code string, relativeSourcePath string) ([]string, bool, error) {
	callables, parsed, err := watchcode.ParsePythonCallables(code, relativeSourcePath)
	if err != nil {
		return nil, false, err
	}
	if !parsed {
		return nil, false, nil
	}
	return watchcode.IdentityList(callables), true, nil
}

func cloneWatchCodeFolders(input []WatchCodeFolder) []WatchCodeFolder {
	if input == nil {
		return nil
	}
	cloned := make([]WatchCodeFolder, len(input))
	copy(cloned, input)
	return cloned
}

func cloneWatchCodeRegistry(input map[string]WatchCodeRegistryEntry) map[string]WatchCodeRegistryEntry {
	if input == nil {
		return map[string]WatchCodeRegistryEntry{}
	}
	cloned := make(map[string]WatchCodeRegistryEntry, len(input))
	for identity, entry := range input {
		cloned[identity] = WatchCodeRegistryEntry{
			CallableName:  strings.TrimSpace(entry.CallableName),
			Kind:          entry.Kind,
			SignatureHash: strings.TrimSpace(entry.SignatureHash),
			BodyHash:      strings.TrimSpace(entry.BodyHash),
			SourcePath:    strings.TrimSpace(entry.SourcePath),
			SectionIDs:    append([]string(nil), entry.SectionIDs...),
			SectionsCount: entry.SectionsCount,
		}
	}
	return cloned
}

func cloneStringSliceMap(input map[string][]string) map[string][]string {
	if input == nil {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(input))
	for key, values := range input {
		cloned[key] = append([]string(nil), values...)
	}
	return cloned
}

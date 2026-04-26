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
	ErrWatchCodeProjectDataRequired   = errors.New("watch code project data is required")
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

func (d *Document) SetWatchCodeInputs(
	providerPluginID string,
	projectID string,
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
) error {
	return d.updateWatchCodeProjectData(providerPluginID, projectID, func(project *Project, projectData *WatchCodePluginProjectData, ignoredRoots []string) error {
		return project.setWatchCodeInputsWithIgnoredRoots(projectData, folders, files, workspaceRoot, ignoredRoots)
	})
}

func (d *Document) SetWatchCodeFolders(
	providerPluginID string,
	projectID string,
	folders []WatchCodeFolder,
	workspaceRoot string,
) error {
	return d.updateWatchCodeProjectData(providerPluginID, projectID, func(project *Project, projectData *WatchCodePluginProjectData, ignoredRoots []string) error {
		return project.setWatchCodeInputsWithIgnoredRoots(projectData, folders, projectData.Files, workspaceRoot, ignoredRoots)
	})
}

func (d *Document) SetWatchCodeFiles(
	providerPluginID string,
	projectID string,
	files []string,
	workspaceRoot string,
) error {
	return d.updateWatchCodeProjectData(providerPluginID, projectID, func(project *Project, projectData *WatchCodePluginProjectData, ignoredRoots []string) error {
		return project.setWatchCodeInputsWithIgnoredRoots(projectData, projectData.Folders, files, workspaceRoot, ignoredRoots)
	})
}

func (d *Document) updateWatchCodeProjectData(
	providerPluginID string,
	projectID string,
	update func(project *Project, projectData *WatchCodePluginProjectData, ignoredRoots []string) error,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return err
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	data, existed, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return err
	}
	projectData, _ := data.projectData(project.ID)
	if update == nil {
		return ErrMutationMissing
	}
	if err := update(&project, &projectData, d.watchCodeIgnoredRoots); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	data = data.withProjectData(project.ID, projectData, existed)
	return d.setWatchCodePluginData(pluginID, data, existed)
}

func (r *Runtime) SetWatchCodeInputs(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWatchCodeInputs(providerPluginID, projectID, folders, files, workspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (r *Runtime) SetWatchCodeFolders(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	folders []WatchCodeFolder,
	workspaceRoot string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWatchCodeFolders(providerPluginID, projectID, folders, workspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (r *Runtime) SetWatchCodeFiles(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	files []string,
	workspaceRoot string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWatchCodeFiles(providerPluginID, projectID, files, workspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) setWatchCodeInputsWithIgnoredRoots(
	projectData *WatchCodePluginProjectData,
	folders []WatchCodeFolder,
	files []string,
	workspaceRoot string,
	ignoredRoots []string,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if projectData == nil {
		return ErrWatchCodeProjectDataRequired
	}
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return err
	}

	*projectData = projectData.Normalized()
	previousSnapshot := buildWatchCodeConfigSnapshot(*projectData)
	normalizedFolders, err := normalizeWatchCodeFolders(workspaceRoot, folders)
	if err != nil {
		return err
	}
	normalizedFiles, err := normalizeWatchCodeFiles(workspaceRoot, files)
	if err != nil {
		return err
	}

	projectData.Folders = normalizedFolders
	projectData.Files = normalizedFiles
	return p.baselineWatchCodeForNewInputs(projectData, workspaceRoot, previousSnapshot, ignoredRoots)
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

func buildWatchCodeConfigSnapshot(projectData WatchCodePluginProjectData) watchCodeConfigSnapshot {
	normalized := projectData.Normalized()
	return watchCodeConfigSnapshot{
		Files:   append([]string(nil), normalized.Files...),
		Folders: cloneWatchCodeFolders(normalized.Folders),
	}
}

func WatchCodeConfigInputs(document Document, providerPluginID string) (map[string]watchcode.ConfigInputs, error) {
	data, _, err := document.decodeWatchCodePluginData(providerPluginID)
	if err != nil {
		return nil, err
	}

	configs := make(map[string]watchcode.ConfigInputs, len(document.Projects))
	for projectID := range document.Projects {
		projectData, _ := data.projectData(projectID)
		folders := make([]watchcode.FolderInput, 0, len(projectData.Folders))
		for _, folder := range projectData.Folders {
			folders = append(folders, watchcode.FolderInput{
				Path:      folder.Path,
				Recursive: folder.Recursive,
			})
		}
		configs[projectID] = watchcode.ConfigInputs{
			Files:        append([]string(nil), projectData.Files...),
			Folders:      folders,
			IgnoredRoots: append([]string(nil), document.watchCodeIgnoredRoots...),
		}
	}
	return configs, nil
}

func (p *Project) baselineWatchCodeForNewInputs(
	projectData *WatchCodePluginProjectData,
	workspaceRoot string,
	previous watchCodeConfigSnapshot,
	ignoredRoots []string,
) error {
	next := buildWatchCodeConfigSnapshot(*projectData)

	previousFiles := make(map[string]struct{}, len(previous.Files))
	for _, filePath := range previous.Files {
		previousFiles[filePath] = struct{}{}
	}
	for _, filePath := range next.Files {
		if _, exists := previousFiles[filePath]; exists {
			continue
		}
		if err := p.baselineWatchCodeFile(projectData, workspaceRoot, filePath, ignoredRoots); err != nil {
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
		if err := p.baselineWatchCodeFolder(projectData, workspaceRoot, folder.Path, folder.Recursive, ignoredRoots); err != nil {
			return err
		}
	}

	return nil
}

func isWatchCodePythonBoundSection(impl SectionImpl) bool {
	return impl.IsCode() && impl.Code.Language == CodeLanguagePython && impl.Code.Binding != nil
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
	projectData *WatchCodePluginProjectData,
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
		if err := p.baselineWatchCodeAbsoluteFile(projectData, workspaceRoot, absoluteFilePath, relativeFilePath); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) baselineWatchCodeFile(
	projectData *WatchCodePluginProjectData,
	workspaceRoot string,
	relativeFilePath string,
	ignoredRoots []string,
) error {
	absoluteFilePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativeFilePath, "watch code file path")
	if err != nil {
		return err
	}
	if shouldIgnoreWatchCodePath(absoluteFilePath, ignoredRoots) {
		return nil
	}
	return p.baselineWatchCodeAbsoluteFile(projectData, workspaceRoot, absoluteFilePath, relativeFilePath)
}

func (p *Project) baselineWatchCodeAbsoluteFile(
	projectData *WatchCodePluginProjectData,
	workspaceRoot string,
	absoluteFilePath string,
	relativeFilePath string,
) error {
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
	recordWatchCodeBaseline(projectData, absoluteFilePath, identities)
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

func recordWatchCodeBaseline(projectData *WatchCodePluginProjectData, absolutePath string, identities []string) {
	if projectData == nil {
		return
	}
	if projectData.BaselineByPath == nil {
		projectData.BaselineByPath = map[string][]string{}
	}
	cloned := append([]string(nil), identities...)
	projectData.BaselineByPath[absolutePath] = cloned
}

func iterWatchCodePythonFiles(root string, recursive bool, ignoredRoots []string) ([]string, error) {
	ok, err := watchCodeScanRootExists(root, ignoredRoots)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}

	if !recursive {
		return listWatchCodePythonFiles(root, ignoredRoots)
	}

	return walkWatchCodePythonFiles(root, ignoredRoots)
}

func watchCodeScanRootExists(root string, ignoredRoots []string) (bool, error) {
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if !info.IsDir() || shouldIgnoreWatchCodePath(root, ignoredRoots) {
		return false, nil
	}
	return true, nil
}

func listWatchCodePythonFiles(root string, ignoredRoots []string) ([]string, error) {
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
		if shouldCollectWatchCodePythonFile(absolutePath, entry.Name(), ignoredRoots) {
			output = append(output, absolutePath)
		}
	}
	return output, nil
}

func walkWatchCodePythonFiles(root string, ignoredRoots []string) ([]string, error) {
	output := make([]string, 0)
	err := filepath.WalkDir(root, func(currentPath string, entry fs.DirEntry, walkErr error) error {
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
		if shouldCollectWatchCodePythonFile(currentPath, entry.Name(), ignoredRoots) {
			output = append(output, currentPath)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return output, nil
}

func shouldCollectWatchCodePythonFile(absolutePath string, entryName string, ignoredRoots []string) bool {
	if filepath.Ext(entryName) != ".py" {
		return false
	}
	return !shouldIgnoreWatchCodePath(absolutePath, ignoredRoots)
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

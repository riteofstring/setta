package projectstate

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_python "github.com/tree-sitter/tree-sitter-python/bindings/go"
	"setta/internal/statefs"
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
	Kind          WatchCodeCallableKind `json:"kind"`
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
	if err := project.SetWatchCodeEnabled(enabled, workspaceRoot); err != nil {
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
	if p == nil {
		return ErrProjectNotFound
	}
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return err
	}

	previousEnabled := p.WatchCodeEnabled
	p.WatchCodeEnabled = enabled
	if enabled && !previousEnabled {
		return p.baselineWatchCodeOnEnable(workspaceRoot)
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
	if err := project.SetWatchCodeInputs(folders, files, workspaceRoot); err != nil {
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
		return p.baselineWatchCodeForNewInputs(workspaceRoot, previousSnapshot)
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

func (p *Project) baselineWatchCodeOnEnable(workspaceRoot string) error {
	if err := p.baselineWatchCodeInputs(workspaceRoot); err != nil {
		return err
	}
	return p.baselineWatchCodeCodeSections(workspaceRoot)
}

func (p *Project) baselineWatchCodeForNewInputs(workspaceRoot string, previous watchCodeConfigSnapshot) error {
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
		if err := p.baselineWatchCodeFile(workspaceRoot, filePath); err != nil {
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
		if err := p.baselineWatchCodeFolder(workspaceRoot, folder.Path, folder.Recursive); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) baselineWatchCodeInputs(workspaceRoot string) error {
	for _, filePath := range p.WatchCodeFiles {
		if err := p.baselineWatchCodeFile(workspaceRoot, filePath); err != nil {
			return err
		}
	}
	for _, folder := range p.WatchCodeFolders {
		if strings.TrimSpace(folder.Path) == "" {
			continue
		}
		if err := p.baselineWatchCodeFolder(workspaceRoot, folder.Path, folder.Recursive); err != nil {
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

func (p *Project) baselineWatchCodeFolder(workspaceRoot string, relativeFolderPath string, recursive bool) error {
	absoluteFolderPath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativeFolderPath, "watch code folder path")
	if err != nil {
		return err
	}

	filePaths, err := iterWatchCodePythonFiles(absoluteFolderPath, recursive)
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

func (p *Project) baselineWatchCodeFile(workspaceRoot string, relativeFilePath string) error {
	absoluteFilePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativeFilePath, "watch code file path")
	if err != nil {
		return err
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

func iterWatchCodePythonFiles(root string, recursive bool) ([]string, error) {
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
			if filepath.Ext(entry.Name()) != ".py" || shouldIgnoreWatchCodePath(absolutePath) {
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
			if currentPath != root && shouldIgnoreWatchCodePath(currentPath) {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(entry.Name()) != ".py" || shouldIgnoreWatchCodePath(currentPath) {
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

func shouldIgnoreWatchCodePath(absolutePath string) bool {
	cleaned := filepath.Clean(absolutePath)
	for _, part := range strings.Split(filepath.ToSlash(cleaned), "/") {
		if _, ignored := defaultWatchCodeIgnoreDirNames[part]; ignored {
			return true
		}
	}
	return false
}

func watchCodeRelativePath(workspaceRoot string, absolutePath string) (string, error) {
	relative, err := filepath.Rel(filepath.Clean(workspaceRoot), filepath.Clean(absolutePath))
	if err != nil {
		return "", fmt.Errorf("resolve relative watch code path: %w", err)
	}
	return filepath.ToSlash(filepath.Clean(relative)), nil
}

func parseWatchCodeBaselineIdentities(code string, relativeSourcePath string) ([]string, bool, error) {
	if strings.TrimSpace(code) == "" {
		return []string{}, true, nil
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_python.Language())); err != nil {
		return nil, false, err
	}

	source := []byte(code)
	tree := parser.Parse(source, nil)
	if tree == nil {
		return []string{}, true, nil
	}
	defer tree.Close()

	root := tree.RootNode()
	if root == nil {
		return []string{}, true, nil
	}
	if root.HasError() {
		return nil, false, nil
	}

	modulePath := watchCodeModulePath(relativeSourcePath)
	output := make([]string, 0, root.NamedChildCount())
	for i := uint(0); i < root.NamedChildCount(); i++ {
		definition := unwrapWatchCodeDefinition(root.NamedChild(i))
		if definition == nil {
			continue
		}

		switch definition.Kind() {
		case "function_definition":
			callableName := buildWatchCodeCallableName(modulePath, watchCodeNodeText(definition.ChildByFieldName("name"), source))
			if strings.TrimSpace(callableName) == "" {
				continue
			}
			kind := WatchCodeCallableKindFunction
			if strings.HasPrefix(strings.TrimSpace(watchCodeNodeText(definition, source)), "async def ") {
				kind = WatchCodeCallableKindAsyncFunction
			}
			output = append(output, buildWatchCodeIdentity(callableName, kind))
		case "class_definition":
			callableName := buildWatchCodeCallableName(modulePath, watchCodeNodeText(definition.ChildByFieldName("name"), source))
			if strings.TrimSpace(callableName) == "" {
				continue
			}
			output = append(output, buildWatchCodeIdentity(callableName, WatchCodeCallableKindClassInit))
		}
	}
	return output, true, nil
}

func unwrapWatchCodeDefinition(node *tree_sitter.Node) *tree_sitter.Node {
	if node == nil {
		return nil
	}
	if node.Kind() != "decorated_definition" {
		return node
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		child := node.NamedChild(i)
		switch child.Kind() {
		case "function_definition", "class_definition":
			return child
		}
	}
	return nil
}

func watchCodeNodeText(node *tree_sitter.Node, source []byte) string {
	if node == nil {
		return ""
	}
	return node.Utf8Text(source)
}

func watchCodeModulePath(relativeSourcePath string) string {
	withoutExt := path.Clean(strings.TrimSpace(relativeSourcePath))
	withoutExt = strings.TrimSuffix(withoutExt, path.Ext(withoutExt))
	if withoutExt == "." {
		return ""
	}
	return strings.ReplaceAll(withoutExt, "/", ".")
}

func buildWatchCodeCallableName(modulePath string, symbolName string) string {
	trimmedSymbolName := strings.TrimSpace(symbolName)
	if trimmedSymbolName == "" {
		return ""
	}
	trimmedModulePath := strings.TrimSpace(modulePath)
	if trimmedModulePath == "" {
		return trimmedSymbolName
	}
	return trimmedModulePath + "." + trimmedSymbolName
}

func buildWatchCodeIdentity(callableName string, kind WatchCodeCallableKind) string {
	return callableName + ":" + string(kind)
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

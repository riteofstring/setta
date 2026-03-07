package watchcode

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/statefs"
)

type FolderInput struct {
	Path      string
	Recursive bool
}

type ConfigInputs struct {
	Enabled bool
	Files   []string
	Folders []FolderInput
}

type ConfigSnapshot struct {
	Enabled bool
	Files   []string
	Folders []FolderInput
}

type Manager struct {
	workspaceRoot   string
	configSnapshots map[string]ConfigSnapshot
	watchedDirs     map[string]bool
	pendingDirs     map[string]struct{}
}

func NewManager(workspaceRoot string) (*Manager, error) {
	resolvedWorkspaceRoot, err := statefs.NormalizePath(workspaceRoot, "")
	if err != nil {
		return nil, fmt.Errorf("normalize workspace root: %w", err)
	}
	return &Manager{
		workspaceRoot:   resolvedWorkspaceRoot,
		configSnapshots: map[string]ConfigSnapshot{},
		watchedDirs:     map[string]bool{},
		pendingDirs:     map[string]struct{}{},
	}, nil
}

func (m *Manager) SyncConfigs(configs map[string]ConfigInputs) error {
	if m == nil {
		return nil
	}

	nextSnapshots := make(map[string]ConfigSnapshot, len(configs))
	for configID, config := range configs {
		trimmedConfigID := strings.TrimSpace(configID)
		if trimmedConfigID == "" {
			continue
		}
		snapshot, err := buildConfigSnapshot(m.workspaceRoot, config)
		if err != nil {
			return fmt.Errorf("build watch code snapshot for %q: %w", trimmedConfigID, err)
		}
		nextSnapshots[trimmedConfigID] = snapshot
	}

	m.configSnapshots = nextSnapshots
	m.syncWatchDirs()
	return nil
}

func (m *Manager) DesiredWatchDirs() map[string]bool {
	if m == nil {
		return map[string]bool{}
	}
	return cloneBoolMap(desiredWatchDirsFromSnapshots(m.configSnapshots))
}

func (m *Manager) ConfigSnapshots() map[string]ConfigSnapshot {
	if m == nil {
		return map[string]ConfigSnapshot{}
	}
	output := make(map[string]ConfigSnapshot, len(m.configSnapshots))
	for configID, snapshot := range m.configSnapshots {
		output[configID] = cloneConfigSnapshot(snapshot)
	}
	return output
}

func (m *Manager) WatchedDirs() map[string]bool {
	if m == nil {
		return map[string]bool{}
	}
	return cloneBoolMap(m.watchedDirs)
}

func (m *Manager) PendingDirs() []string {
	if m == nil {
		return []string{}
	}
	output := make([]string, 0, len(m.pendingDirs))
	for path := range m.pendingDirs {
		output = append(output, path)
	}
	sort.Strings(output)
	return output
}

func (m *Manager) PathMatchesWatchInputs(configID string, path string) bool {
	if m == nil {
		return false
	}
	snapshot, ok := m.configSnapshots[strings.TrimSpace(configID)]
	if !ok || !snapshot.Enabled {
		return false
	}
	normalizedPath, err := statefs.ResolveWithinRoot(m.workspaceRoot, path, "watch code path")
	if err != nil {
		return false
	}
	return pathMatchesSnapshot(normalizedPath, snapshot)
}

func (m *Manager) HandleDirectoryCreated(path string) error {
	if m == nil || len(m.pendingDirs) == 0 {
		return nil
	}

	normalizedPath, err := statefs.ResolveWithinRoot(m.workspaceRoot, path, "watch code path")
	if err != nil {
		return err
	}
	for pendingPath := range m.pendingDirs {
		if pendingPath == normalizedPath || isDescendantOrSelf(pendingPath, normalizedPath) {
			m.syncWatchDirs()
			return nil
		}
	}
	return nil
}

func buildConfigSnapshot(workspaceRoot string, config ConfigInputs) (ConfigSnapshot, error) {
	files, err := resolveSnapshotFiles(workspaceRoot, config.Files)
	if err != nil {
		return ConfigSnapshot{}, err
	}
	folders, err := resolveSnapshotFolders(workspaceRoot, config.Folders)
	if err != nil {
		return ConfigSnapshot{}, err
	}
	return ConfigSnapshot{
		Enabled: config.Enabled,
		Files:   files,
		Folders: folders,
	}, nil
}

func resolveSnapshotFiles(workspaceRoot string, files []string) ([]string, error) {
	output := make([]string, 0, len(files))
	seen := make(map[string]struct{}, len(files))
	for _, raw := range files {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		resolved, err := statefs.ResolveWithinRoot(workspaceRoot, filepath.FromSlash(trimmed), "watch code file path")
		if err != nil {
			return nil, err
		}
		if _, ok := seen[resolved]; ok {
			continue
		}
		seen[resolved] = struct{}{}
		output = append(output, resolved)
	}
	sort.Strings(output)
	return output, nil
}

func resolveSnapshotFolders(workspaceRoot string, folders []FolderInput) ([]FolderInput, error) {
	output := make([]FolderInput, 0, len(folders))
	seen := make(map[string]struct{}, len(folders))
	for _, folder := range folders {
		trimmed := strings.TrimSpace(folder.Path)
		if trimmed == "" {
			continue
		}
		resolved, err := statefs.ResolveWithinRoot(workspaceRoot, filepath.FromSlash(trimmed), "watch code folder path")
		if err != nil {
			return nil, err
		}
		key := resolved + ":" + strconvBool(folder.Recursive)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		output = append(output, FolderInput{
			Path:      resolved,
			Recursive: folder.Recursive,
		})
	}
	sort.Slice(output, func(i int, j int) bool {
		if output[i].Path == output[j].Path {
			return !output[i].Recursive && output[j].Recursive
		}
		return output[i].Path < output[j].Path
	})
	return output, nil
}

func desiredWatchDirsFromSnapshots(snapshots map[string]ConfigSnapshot) map[string]bool {
	output := make(map[string]bool)
	for _, snapshot := range snapshots {
		if !snapshot.Enabled {
			continue
		}
		for _, filePath := range snapshot.Files {
			parent := filepath.Dir(filePath)
			mergeDesiredWatchDir(output, parent, false)
		}
		for _, folder := range snapshot.Folders {
			mergeDesiredWatchDir(output, folder.Path, folder.Recursive)
		}
	}
	return output
}

func mergeDesiredWatchDir(output map[string]bool, path string, recursive bool) {
	currentRecursive, exists := output[path]
	if !exists {
		output[path] = recursive
		return
	}
	output[path] = currentRecursive || recursive
}

func (m *Manager) syncWatchDirs() {
	desired := desiredWatchDirsFromSnapshots(m.configSnapshots)
	actual := cloneBoolMap(desired)
	pendingDirs := make(map[string]struct{})
	for path := range desired {
		if pathExists(path) {
			continue
		}
		pendingDirs[path] = struct{}{}
		ancestor := findExistingAncestor(path)
		if ancestor == "" {
			continue
		}
		if _, exists := actual[ancestor]; !exists {
			actual[ancestor] = false
		}
	}
	watchedDirs := make(map[string]bool)
	for path, recursive := range actual {
		if !pathExists(path) {
			continue
		}
		watchedDirs[path] = recursive
	}
	m.watchedDirs = watchedDirs
	m.pendingDirs = pendingDirs
}

func pathMatchesSnapshot(path string, snapshot ConfigSnapshot) bool {
	for _, filePath := range snapshot.Files {
		if path == filePath {
			return true
		}
	}
	for _, folder := range snapshot.Folders {
		if folder.Recursive {
			if isDescendantOrSelf(path, folder.Path) {
				return true
			}
			continue
		}
		if filepath.Dir(path) == folder.Path {
			return true
		}
	}
	return false
}

func isDescendantOrSelf(path string, ancestor string) bool {
	relative, err := filepath.Rel(ancestor, path)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

func findExistingAncestor(path string) string {
	current := filepath.Clean(path)
	for {
		if pathExists(current) {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func cloneBoolMap(source map[string]bool) map[string]bool {
	if source == nil {
		return map[string]bool{}
	}
	output := make(map[string]bool, len(source))
	for key, value := range source {
		output[key] = value
	}
	return output
}

func cloneConfigSnapshot(source ConfigSnapshot) ConfigSnapshot {
	return ConfigSnapshot{
		Enabled: source.Enabled,
		Files:   append([]string(nil), source.Files...),
		Folders: append([]FolderInput(nil), source.Folders...),
	}
}

func strconvBool(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

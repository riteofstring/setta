package watchcode

import (
	"fmt"
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
	Enabled      bool
	Files        []string
	Folders      []FolderInput
	IgnoredRoots []string
}

type ConfigSnapshot struct {
	Enabled      bool
	Files        []string
	Folders      []FolderInput
	IgnoredRoots []string
}

type EventType string

const (
	EventTypeCreated  EventType = "created"
	EventTypeModified EventType = "modified"
	EventTypeDeleted  EventType = "deleted"
	EventTypeMoved    EventType = "moved"
)

type ScanRequest struct {
	ConfigID     string
	Path         string
	BaselineOnly bool
}

type PendingScan struct {
	ConfigID     string
	Path         string
	BaselineOnly bool
	MovedFrom    string
}

type DeleteRequest struct {
	ConfigID string
	Path     string
}

type PendingMove struct {
	ConfigID        string
	DestinationPath string
	SourcePath      string
}

type taskKey struct {
	ConfigID string
	Path     string
}

type Manager struct {
	workspaceRoot    string
	configSnapshots  map[string]ConfigSnapshot
	scheduledScans   map[taskKey]bool
	scheduledDeletes map[taskKey]struct{}
	pendingMoves     map[taskKey]string
}

var defaultIgnoredDirNames = map[string]struct{}{
	".venv":           {},
	"__pycache__":     {},
	"node_modules":    {},
	"setta_files":     {},
	"setta_files_dev": {},
}

func NewManager(workspaceRoot string) (*Manager, error) {
	resolvedWorkspaceRoot, err := statefs.NormalizePath(workspaceRoot, "")
	if err != nil {
		return nil, fmt.Errorf("normalize workspace root: %w", err)
	}
	return &Manager{
		workspaceRoot:    resolvedWorkspaceRoot,
		configSnapshots:  map[string]ConfigSnapshot{},
		scheduledScans:   map[taskKey]bool{},
		scheduledDeletes: map[taskKey]struct{}{},
		pendingMoves:     map[taskKey]string{},
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
	m.discardStaleScheduledState()
	return nil
}

func (m *Manager) DrainScheduledWork() ([]PendingScan, []DeleteRequest) {
	if m == nil {
		return []PendingScan{}, []DeleteRequest{}
	}

	scans := make([]PendingScan, 0, len(m.scheduledScans))
	for key, baselineOnly := range m.scheduledScans {
		scan := PendingScan{
			ConfigID:     key.ConfigID,
			Path:         key.Path,
			BaselineOnly: baselineOnly,
		}
		if movedFrom, ok := m.pendingMoves[key]; ok {
			scan.MovedFrom = movedFrom
			delete(m.pendingMoves, key)
		}
		scans = append(scans, scan)
	}
	sort.Slice(scans, func(i int, j int) bool {
		if scans[i].ConfigID == scans[j].ConfigID {
			return scans[i].Path < scans[j].Path
		}
		return scans[i].ConfigID < scans[j].ConfigID
	})
	clear(m.scheduledScans)

	deletes := make([]DeleteRequest, 0, len(m.scheduledDeletes))
	for key := range m.scheduledDeletes {
		deletes = append(deletes, DeleteRequest{
			ConfigID: key.ConfigID,
			Path:     key.Path,
		})
	}
	sort.Slice(deletes, func(i int, j int) bool {
		if deletes[i].ConfigID == deletes[j].ConfigID {
			return deletes[i].Path < deletes[j].Path
		}
		return deletes[i].ConfigID < deletes[j].ConfigID
	})
	clear(m.scheduledDeletes)

	return scans, deletes
}

func (m *Manager) HandleFileEvent(path string, eventType EventType, destinationPath string) error {
	if m == nil {
		return nil
	}

	switch eventType {
	case EventTypeMoved:
		return m.handleMovedFileEvent(path, destinationPath)
	case EventTypeCreated, EventTypeModified, EventTypeDeleted:
		return m.handleTrackedFileEvent(path, eventType)
	default:
		return fmt.Errorf("unsupported watch code event type %q", eventType)
	}
}

func (m *Manager) handleMovedFileEvent(path string, destinationPath string) error {
	sourcePath, destPath, ok, err := m.resolveMovedPaths(path, destinationPath)
	if err != nil || !ok {
		return err
	}
	for configID, snapshot := range m.configSnapshots {
		m.scheduleMoveForSnapshot(configID, snapshot, sourcePath, destPath)
	}
	return nil
}

func (m *Manager) resolveMovedPaths(path string, destinationPath string) (string, string, bool, error) {
	if strings.TrimSpace(destinationPath) == "" {
		return "", "", false, nil
	}
	sourcePath, err := statefs.ResolveWithinRoot(m.workspaceRoot, path, "watch code path")
	if err != nil {
		return "", "", false, err
	}
	destPath, err := statefs.ResolveWithinRoot(m.workspaceRoot, destinationPath, "watch code path")
	if err != nil {
		return "", "", false, err
	}
	return sourcePath, destPath, true, nil
}

func (m *Manager) scheduleMoveForSnapshot(configID string, snapshot ConfigSnapshot, sourcePath string, destPath string) {
	if !snapshot.Enabled {
		return
	}
	srcMatches := matchesTrackedPythonPath(sourcePath, snapshot)
	destMatches := matchesTrackedPythonPath(destPath, snapshot)
	if destMatches {
		key := taskKey{ConfigID: configID, Path: destPath}
		m.pendingMoves[key] = sourcePath
		m.scheduledScans[key] = false
		return
	}
	if srcMatches {
		m.scheduledDeletes[taskKey{ConfigID: configID, Path: sourcePath}] = struct{}{}
	}
}

func (m *Manager) handleTrackedFileEvent(path string, eventType EventType) error {
	normalizedPath, err := statefs.ResolveWithinRoot(m.workspaceRoot, path, "watch code path")
	if err != nil {
		return err
	}
	if !isPythonSourcePath(normalizedPath) {
		return nil
	}
	for configID, snapshot := range m.configSnapshots {
		m.scheduleTrackedFileEvent(configID, snapshot, normalizedPath, eventType)
	}
	return nil
}

func (m *Manager) scheduleTrackedFileEvent(configID string, snapshot ConfigSnapshot, normalizedPath string, eventType EventType) {
	if !matchesTrackedPythonPath(normalizedPath, snapshot) {
		return
	}
	key := taskKey{ConfigID: configID, Path: normalizedPath}
	if eventType == EventTypeDeleted {
		m.scheduledDeletes[key] = struct{}{}
		return
	}
	m.scheduledScans[key] = false
}

func matchesTrackedPythonPath(normalizedPath string, snapshot ConfigSnapshot) bool {
	if !snapshot.Enabled || !isPythonSourcePath(normalizedPath) || shouldIgnorePath(normalizedPath, snapshot.IgnoredRoots) {
		return false
	}
	return pathMatchesSnapshot(normalizedPath, snapshot)
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
	ignoredRoots, err := resolveIgnoredRoots(config.IgnoredRoots)
	if err != nil {
		return ConfigSnapshot{}, err
	}
	return ConfigSnapshot{
		Enabled:      config.Enabled,
		Files:        files,
		Folders:      folders,
		IgnoredRoots: ignoredRoots,
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

func resolveIgnoredRoots(roots []string) ([]string, error) {
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

func (m *Manager) discardStaleScheduledState() {
	for key := range m.scheduledScans {
		if !m.taskKeyStillMatchesSnapshot(key) {
			delete(m.scheduledScans, key)
		}
	}
	for key := range m.scheduledDeletes {
		if !m.taskKeyStillMatchesSnapshot(key) {
			delete(m.scheduledDeletes, key)
		}
	}
	for key := range m.pendingMoves {
		if !m.taskKeyStillMatchesSnapshot(key) {
			delete(m.pendingMoves, key)
		}
	}
}

func (m *Manager) taskKeyStillMatchesSnapshot(key taskKey) bool {
	snapshot, ok := m.configSnapshots[key.ConfigID]
	if !ok || !snapshot.Enabled {
		return false
	}
	return pathMatchesSnapshot(key.Path, snapshot)
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

func strconvBool(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func isPythonSourcePath(path string) bool {
	return filepath.Ext(path) == ".py"
}

func shouldIgnorePath(path string, ignoredRoots []string) bool {
	cleaned := filepath.Clean(path)
	for _, part := range strings.Split(filepath.ToSlash(cleaned), "/") {
		if _, ok := defaultIgnoredDirNames[part]; ok {
			return true
		}
	}
	for _, ignoredRoot := range ignoredRoots {
		if isDescendantOrSelf(cleaned, ignoredRoot) {
			return true
		}
	}
	return false
}

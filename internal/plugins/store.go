package plugins

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"setta/internal/statefs"
)

const pluginStoreFileMode = 0o644

type StoreOptions struct {
	WorkspaceRoot  string
	SettaFilesRoot string
	SettaHome      string
}

type ScopedPluginRoot struct {
	Scope PluginScope
	Root  string
}

type Store struct {
	workspaceRoot          string
	settaFilesRoot         string
	settaHome              string
	workspacePluginsRoot   string
	settaFilesPluginsRoot  string
	globalPluginsRoot      string
	lockfilePath           string
	pluginsStatePath       string
	pluginsGlobalStatePath string
	installMetadataPath    string
	historyRoot            string
}

func NewStore(options StoreOptions) (*Store, error) {
	workspaceRoot, err := statefs.NormalizePath(options.WorkspaceRoot, "")
	if err != nil {
		if strings.TrimSpace(options.WorkspaceRoot) == "" {
			return nil, ErrWorkspaceRootRequired
		}
		return nil, err
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		if strings.TrimSpace(options.SettaFilesRoot) == "" {
			return nil, ErrSettaFilesRootRequired
		}
		return nil, err
	}
	settaHome, err := statefs.NormalizePath(options.SettaHome, "")
	if err != nil {
		if strings.TrimSpace(options.SettaHome) == "" {
			return nil, ErrSettaHomeRequired
		}
		return nil, err
	}
	return &Store{
		workspaceRoot:          workspaceRoot,
		settaFilesRoot:         settaFilesRoot,
		settaHome:              settaHome,
		workspacePluginsRoot:   filepath.Join(workspaceRoot, ".setta_plugins"),
		settaFilesPluginsRoot:  filepath.Join(settaFilesRoot, "plugins"),
		globalPluginsRoot:      filepath.Join(settaHome, "plugins"),
		lockfilePath:           filepath.Join(workspaceRoot, ".setta_plugins", "plugins.lock.json"),
		pluginsStatePath:       filepath.Join(settaFilesRoot, "plugins_state.json"),
		pluginsGlobalStatePath: filepath.Join(settaHome, "plugins_global_state.json"),
		installMetadataPath:    filepath.Join(settaFilesRoot, "plugins_install_metadata.json"),
		historyRoot:            filepath.Join(settaFilesRoot, "plugins_history"),
	}, nil
}

func (s *Store) WorkspacePluginsRoot() string {
	if s == nil {
		return ""
	}
	return s.workspacePluginsRoot
}

func (s *Store) SettaFilesPluginsRoot() string {
	if s == nil {
		return ""
	}
	return s.settaFilesPluginsRoot
}

func (s *Store) GlobalPluginsRoot() string {
	if s == nil {
		return ""
	}
	return s.globalPluginsRoot
}

func (s *Store) LockfilePath() string {
	if s == nil {
		return ""
	}
	return s.lockfilePath
}

func (s *Store) PluginsStatePath() string {
	if s == nil {
		return ""
	}
	return s.pluginsStatePath
}

func (s *Store) PluginsGlobalStatePath() string {
	if s == nil {
		return ""
	}
	return s.pluginsGlobalStatePath
}

func (s *Store) InstallMetadataPath() string {
	if s == nil {
		return ""
	}
	return s.installMetadataPath
}

func (s *Store) HistoryRoot() string {
	if s == nil {
		return ""
	}
	return s.historyRoot
}

func (s *Store) PluginRoot(scope PluginScope, pluginID string) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}
	normalizedPluginID, err := NormalizePluginID(pluginID)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.scopeRoot(scope), normalizedPluginID), nil
}

func (s *Store) HistoryPluginRoot(scope PluginScope, pluginID string) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}
	normalizedPluginID, err := NormalizePluginID(pluginID)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.historyRoot, string(scope), normalizedPluginID), nil
}

func (s *Store) ScopeCandidates(pluginID string) ([]ScopedPluginRoot, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}
	normalizedPluginID, err := NormalizePluginID(pluginID)
	if err != nil {
		return nil, err
	}
	return []ScopedPluginRoot{
		{Scope: PluginScopeWorkspace, Root: filepath.Join(s.workspacePluginsRoot, normalizedPluginID)},
		{Scope: PluginScopeSettaFiles, Root: filepath.Join(s.settaFilesPluginsRoot, normalizedPluginID)},
		{Scope: PluginScopeGlobal, Root: filepath.Join(s.globalPluginsRoot, normalizedPluginID)},
	}, nil
}

func (s *Store) LoadPluginsState() (PluginsStateFile, error) {
	if s == nil {
		return PluginsStateFile{}, ErrWorkspaceRootRequired
	}
	state, err := readOptionalJSONFile[PluginsStateFile](s.pluginsStatePath)
	if err != nil {
		return PluginsStateFile{}, pluginStoreLoadError(
			err,
			"plugins state",
			s.pluginsStatePath,
			ServiceErrorCodeStateInvalid,
			"Invalid plugins state file: %s",
		)
	}
	return normalizePluginsStateFile(state), nil
}

func (s *Store) SavePluginsState(state PluginsStateFile) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	normalized := normalizePluginsStateFile(state)
	return writeStoreJSONFile(s.pluginsStatePath, normalized)
}

func (s *Store) LoadPluginsGlobalState() (PluginsGlobalStateFile, error) {
	if s == nil {
		return PluginsGlobalStateFile{}, ErrWorkspaceRootRequired
	}
	state, err := readOptionalJSONFile[PluginsGlobalStateFile](s.pluginsGlobalStatePath)
	if err != nil {
		return PluginsGlobalStateFile{}, pluginStoreLoadError(
			err,
			"plugins global state",
			s.pluginsGlobalStatePath,
			ServiceErrorCodeGlobalStateInvalid,
			"Invalid plugins global state file: %s",
		)
	}
	return normalizePluginsGlobalStateFile(state), nil
}

func (s *Store) SavePluginsGlobalState(state PluginsGlobalStateFile) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	normalized := normalizePluginsGlobalStateFile(state)
	return writeStoreJSONFile(s.pluginsGlobalStatePath, normalized)
}

func (s *Store) LoadInstallMetadata() (PluginInstallMetadataFile, error) {
	if s == nil {
		return PluginInstallMetadataFile{}, ErrWorkspaceRootRequired
	}
	metadata, err := readOptionalJSONFile[PluginInstallMetadataFile](s.installMetadataPath)
	if err != nil {
		return PluginInstallMetadataFile{}, pluginStoreLoadError(
			err,
			"plugin install metadata",
			s.installMetadataPath,
			ServiceErrorCodeInstallMetadataInvalid,
			"Invalid plugin install metadata file: %s",
		)
	}
	normalized, err := normalizeInstallMetadataFile(metadata)
	if err != nil {
		return PluginInstallMetadataFile{}, newServiceErrorWithStatus(
			http.StatusUnprocessableEntity,
			ServiceErrorCodeInstallMetadataInvalid,
			"Invalid plugin install metadata file: %s",
			s.installMetadataPath,
		)
	}
	return normalized, nil
}

func (s *Store) SaveInstallMetadata(metadata PluginInstallMetadataFile) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	normalized, err := normalizeInstallMetadataFile(metadata)
	if err != nil {
		return err
	}
	return writeStoreJSONFile(s.installMetadataPath, normalized)
}

func (s *Store) GetInstallMetadata(pluginID string, scope PluginScope) (PluginInstallMetadataEntry, bool, error) {
	normalizedPluginID, err := NormalizePluginID(pluginID)
	if err != nil {
		return PluginInstallMetadataEntry{}, false, err
	}
	metadata, err := s.LoadInstallMetadata()
	if err != nil {
		return PluginInstallMetadataEntry{}, false, err
	}
	entry, ok := metadata.Entries[metadataKey(scope, normalizedPluginID)]
	if !ok {
		return PluginInstallMetadataEntry{}, false, nil
	}
	cloned, ok, err := cloneInstallMetadataEntry(entry)
	if err != nil {
		return PluginInstallMetadataEntry{}, false, err
	}
	return cloned, ok, nil
}

func (s *Store) SetInstallMetadata(entry PluginInstallMetadataEntry) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	normalizedEntry, err := normalizeInstallMetadataEntry(entry)
	if err != nil {
		return err
	}
	metadata, err := s.LoadInstallMetadata()
	if err != nil {
		return err
	}
	key := metadataKey(normalizedEntry.Scope, normalizedEntry.PluginID)
	if existing, ok := metadata.Entries[key]; ok && len(normalizedEntry.History) == 0 {
		normalizedEntry.History = cloneHistoryEntries(existing.History)
	}
	metadata.Entries[key] = normalizedEntry
	return s.SaveInstallMetadata(metadata)
}

func (s *Store) RemoveInstallMetadata(pluginID string, scope PluginScope) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	normalizedPluginID, err := NormalizePluginID(pluginID)
	if err != nil {
		return err
	}
	metadata, err := s.LoadInstallMetadata()
	if err != nil {
		return err
	}
	delete(metadata.Entries, metadataKey(scope, normalizedPluginID))
	return s.SaveInstallMetadata(metadata)
}

func (s *Store) CreateHistorySnapshot(pluginID string, scope PluginScope) (PluginInstallHistoryEntry, error) {
	pluginRoot, err := s.PluginRoot(scope, pluginID)
	if err != nil {
		return PluginInstallHistoryEntry{}, err
	}
	info, err := os.Stat(pluginRoot)
	if err != nil {
		return PluginInstallHistoryEntry{}, fmt.Errorf("stat plugin root %s: %w", pluginRoot, err)
	}
	if !info.IsDir() {
		return PluginInstallHistoryEntry{}, fmt.Errorf("%w: %s", ErrPluginRootInvalid, pluginRoot)
	}
	manifest, err := LoadPluginManifest(pluginRoot, filepath.Base(pluginRoot))
	if err != nil {
		return PluginInstallHistoryEntry{}, err
	}
	digest, err := computeDirectoryDigest(pluginRoot)
	if err != nil {
		return PluginInstallHistoryEntry{}, err
	}
	historyParent, err := s.HistoryPluginRoot(scope, pluginID)
	if err != nil {
		return PluginInstallHistoryEntry{}, err
	}
	if err := os.MkdirAll(historyParent, 0o755); err != nil {
		return PluginInstallHistoryEntry{}, fmt.Errorf("create plugin history root: %w", err)
	}
	now := time.Now().UTC()
	snapshotDir := filepath.Join(historyParent, fmt.Sprintf("%s-%s", now.Format("20060102T150405.000000000Z"), randomHex(4)))
	if err := copyDirectoryTree(pluginRoot, snapshotDir); err != nil {
		return PluginInstallHistoryEntry{}, err
	}
	return PluginInstallHistoryEntry{
		Version:            manifest.Version,
		SourceDigestSHA256: stringPtr(digest),
		SnapshotPath:       snapshotDir,
		TimestampISO:       now.Format(time.RFC3339Nano),
	}, nil
}

func (s *Store) scopeRoot(scope PluginScope) string {
	switch scope {
	case PluginScopeWorkspace:
		return s.workspacePluginsRoot
	case PluginScopeSettaFiles:
		return s.settaFilesPluginsRoot
	default:
		return s.globalPluginsRoot
	}
}

func metadataKey(scope PluginScope, pluginID string) string {
	return fmt.Sprintf("%s:%s", scope, pluginID)
}

func normalizePluginsStateFile(state PluginsStateFile) PluginsStateFile {
	pendingRestartBackendPluginIDs := sortedUniqueStrings(state.PendingRestartBackendPluginIDs)
	normalized := PluginsStateFile{
		EnabledPluginIDs:               sortedUniqueStrings(state.EnabledPluginIDs),
		DisabledPluginIDs:              sortedUniqueStrings(state.DisabledPluginIDs),
		PendingRestartBackendPluginIDs: pendingRestartBackendPluginIDs,
		PendingRestartLanguageServerOnlyPluginIDs: filterSortedStringsToSet(
			sortedUniqueStrings(state.PendingRestartLanguageServerOnlyPluginIDs),
			pendingRestartBackendPluginIDs,
		),
		PluginConfigByID: cloneStringAnyMap(state.PluginConfigByID),
	}
	if normalized.PluginConfigByID == nil {
		normalized.PluginConfigByID = map[string]any{}
	}
	return normalized
}

func normalizePluginsGlobalStateFile(state PluginsGlobalStateFile) PluginsGlobalStateFile {
	return PluginsGlobalStateFile{
		AutoEnabledPluginIDs: sortedUniqueStrings(state.AutoEnabledPluginIDs),
	}
}

func normalizeInstallMetadataFile(metadata PluginInstallMetadataFile) (PluginInstallMetadataFile, error) {
	normalized := PluginInstallMetadataFile{
		Entries: map[string]PluginInstallMetadataEntry{},
	}
	for key, entry := range metadata.Entries {
		normalizedEntry, err := normalizeInstallMetadataEntry(entry)
		if err != nil {
			return PluginInstallMetadataFile{}, fmt.Errorf("invalid install metadata entry %q: %w", key, err)
		}
		normalized.Entries[key] = normalizedEntry
	}
	return normalized, nil
}

func normalizeInstallMetadataEntry(entry PluginInstallMetadataEntry) (PluginInstallMetadataEntry, error) {
	normalizedPluginID, err := NormalizePluginID(entry.PluginID)
	if err != nil {
		return PluginInstallMetadataEntry{}, err
	}
	switch entry.Scope {
	case PluginScopeWorkspace, PluginScopeSettaFiles, PluginScopeGlobal:
	default:
		return PluginInstallMetadataEntry{}, fmt.Errorf("plugin scope is invalid")
	}
	normalized := PluginInstallMetadataEntry{
		PluginID:           normalizedPluginID,
		Scope:              entry.Scope,
		SourceSpec:         strings.TrimSpace(entry.SourceSpec),
		CanonicalSourceKey: strings.TrimSpace(entry.CanonicalSourceKey),
		Version:            strings.TrimSpace(entry.Version),
		History:            cloneHistoryEntries(entry.History),
	}
	if entry.InstallerBackend != nil {
		value := *entry.InstallerBackend
		normalized.InstallerBackend = &value
	}
	if entry.SourceDigestSHA256 != nil {
		trimmed := strings.TrimSpace(*entry.SourceDigestSHA256)
		if trimmed != "" {
			normalized.SourceDigestSHA256 = stringPtr(trimmed)
		}
	}
	if normalized.SourceSpec == "" {
		return PluginInstallMetadataEntry{}, fmt.Errorf("plugin source spec is required")
	}
	if normalized.CanonicalSourceKey == "" {
		return PluginInstallMetadataEntry{}, fmt.Errorf("plugin canonical source key is required")
	}
	if normalized.Version == "" {
		return PluginInstallMetadataEntry{}, fmt.Errorf("plugin version is required")
	}
	if normalized.History == nil {
		normalized.History = []PluginInstallHistoryEntry{}
	}
	return normalized, nil
}

func cloneInstallMetadataEntry(entry PluginInstallMetadataEntry) (PluginInstallMetadataEntry, bool, error) {
	cloned, err := normalizeInstallMetadataEntry(entry)
	if err != nil {
		return PluginInstallMetadataEntry{}, false, err
	}
	return cloned, true, nil
}

func cloneHistoryEntries(entries []PluginInstallHistoryEntry) []PluginInstallHistoryEntry {
	if entries == nil {
		return []PluginInstallHistoryEntry{}
	}
	cloned := make([]PluginInstallHistoryEntry, 0, len(entries))
	for _, entry := range entries {
		clonedEntry := entry
		if entry.SourceDigestSHA256 != nil {
			clonedEntry.SourceDigestSHA256 = stringPtr(*entry.SourceDigestSHA256)
		}
		clonedEntry.Version = strings.TrimSpace(clonedEntry.Version)
		clonedEntry.SnapshotPath = strings.TrimSpace(clonedEntry.SnapshotPath)
		clonedEntry.TimestampISO = strings.TrimSpace(clonedEntry.TimestampISO)
		cloned = append(cloned, clonedEntry)
	}
	return cloned
}

func cloneStringAnyMap(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}
	content, err := json.Marshal(values)
	if err != nil {
		return map[string]any{}
	}
	var cloned map[string]any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return map[string]any{}
	}
	return cloned
}

func sortedUniqueStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	set := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := set[trimmed]; exists {
			continue
		}
		set[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	slices.Sort(normalized)
	return normalized
}

func filterSortedStringsToSet(values []string, allowed []string) []string {
	if len(values) == 0 || len(allowed) == 0 {
		return []string{}
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, value := range allowed {
		allowedSet[value] = struct{}{}
	}
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := allowedSet[value]; !ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func pluginStoreLoadError(
	err error,
	label string,
	path string,
	code ServiceErrorCode,
	messageFormat string,
) error {
	var strictErr *strictJSONFileError
	if errors.As(err, &strictErr) {
		return newServiceErrorWithStatus(http.StatusUnprocessableEntity, code, messageFormat, path)
	}
	return fmt.Errorf("load %s: %w", label, err)
}

func readOptionalJSONFile[T any](path string) (T, error) {
	value, err := readStrictJSONFile[T](path)
	if err != nil {
		if os.IsNotExist(err) {
			var zero T
			return zero, nil
		}
		return *new(T), err
	}
	return value, nil
}

func writeStoreJSONFile(path string, payload any) error {
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", path, err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(path, content, pluginStoreFileMode); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func computeDirectoryDigest(root string) (string, error) {
	resolvedRoot, err := resolveDirectoryDigestRoot(root)
	if err != nil {
		return "", err
	}
	entries, err := collectDirectoryDigestEntries(resolvedRoot)
	if err != nil {
		return "", err
	}
	return encodeDirectoryDigest(resolvedRoot, entries)
}

func copyDirectoryTree(sourceRoot string, destRoot string) error {
	copier := directoryTreeCopier{
		sourceRoot: sourceRoot,
		destRoot:   destRoot,
	}
	return filepath.WalkDir(sourceRoot, copier.walk)
}

func CopyDirectoryTree(sourceRoot string, destRoot string) error {
	return copyDirectoryTree(sourceRoot, destRoot)
}

func resolveDirectoryDigestRoot(root string) (string, error) {
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		if os.IsNotExist(err) {
			resolvedRoot = root
		} else {
			return "", fmt.Errorf("resolve plugin digest root %s: %w", root, err)
		}
	}
	info, err := os.Stat(resolvedRoot)
	if err != nil {
		return "", fmt.Errorf("stat digest root %s: %w", resolvedRoot, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: %s", ErrPluginRootInvalid, resolvedRoot)
	}
	return resolvedRoot, nil
}

func collectDirectoryDigestEntries(root string) ([]string, error) {
	entries := make([]string, 0)
	if err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		relativePath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		entries = append(entries, filepath.ToSlash(relativePath))
		return nil
	}); err != nil {
		return nil, fmt.Errorf("walk plugin root %s: %w", root, err)
	}
	slices.Sort(entries)
	return entries, nil
}

func encodeDirectoryDigest(root string, entries []string) (string, error) {
	hasher := sha256.New()
	for _, relativePath := range entries {
		if err := hashDirectoryDigestEntry(hasher, root, relativePath); err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func hashDirectoryDigestEntry(writer io.Writer, root string, relativePath string) error {
	if _, err := writer.Write([]byte(relativePath)); err != nil {
		return fmt.Errorf("hash plugin path %s: %w", relativePath, err)
	}
	resolvedPath := filepath.Join(root, filepath.FromSlash(relativePath))
	return hashDirectoryDigestFile(writer, resolvedPath)
}

func hashDirectoryDigestFile(writer io.Writer, path string) (err error) {
	handle, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open plugin file %s: %w", path, err)
	}
	defer func() {
		closeErr := handle.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("close plugin file %s: %w", path, closeErr)
		}
	}()
	if _, err := io.Copy(writer, handle); err != nil {
		return fmt.Errorf("hash plugin file %s: %w", path, err)
	}
	return nil
}

type directoryTreeCopier struct {
	sourceRoot string
	destRoot   string
}

func (c directoryTreeCopier) walk(path string, entry fs.DirEntry, walkErr error) error {
	if walkErr != nil {
		return walkErr
	}
	if entry.IsDir() && entry.Name() == "node_modules" {
		return filepath.SkipDir
	}
	targetPath, err := c.targetPath(path)
	if err != nil {
		return err
	}
	if entry.IsDir() {
		return copyDirectoryTreeDirectory(entry, targetPath)
	}
	if entry.Type()&os.ModeSymlink != 0 {
		return copyDirectoryTreeSymlink(path, targetPath)
	}
	if !entry.Type().IsRegular() {
		return fmt.Errorf("copy plugin snapshot: unsupported file mode at %s", path)
	}
	info, err := entry.Info()
	if err != nil {
		return err
	}
	return copyDirectoryTreeFile(path, targetPath, info.Mode().Perm())
}

func (c directoryTreeCopier) targetPath(path string) (string, error) {
	relativePath, err := filepath.Rel(c.sourceRoot, path)
	if err != nil {
		return "", err
	}
	if relativePath == "." {
		return c.destRoot, nil
	}
	return filepath.Join(c.destRoot, relativePath), nil
}

func copyDirectoryTreeDirectory(entry fs.DirEntry, targetPath string) error {
	info, err := entry.Info()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(targetPath, info.Mode().Perm()); err != nil {
		return fmt.Errorf("create plugin snapshot directory %s: %w", targetPath, err)
	}
	return nil
}

func copyDirectoryTreeSymlink(sourcePath string, targetPath string) error {
	linkTarget, err := os.Readlink(sourcePath)
	if err != nil {
		return fmt.Errorf("read plugin snapshot symlink %s: %w", sourcePath, err)
	}
	if err := os.Symlink(linkTarget, targetPath); err != nil {
		return fmt.Errorf("create plugin snapshot symlink %s: %w", targetPath, err)
	}
	return nil
}

func copyDirectoryTreeFile(sourcePath string, targetPath string, permissions fs.FileMode) (err error) {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return fmt.Errorf("create plugin snapshot parent %s: %w", targetPath, err)
	}
	sourceHandle, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open plugin snapshot source %s: %w", sourcePath, err)
	}
	defer func() {
		closeErr := sourceHandle.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("close plugin snapshot source %s: %w", sourcePath, closeErr)
		}
	}()
	destHandle, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, permissions)
	if err != nil {
		return fmt.Errorf("create plugin snapshot file %s: %w", targetPath, err)
	}
	defer func() {
		closeErr := destHandle.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("close plugin snapshot file %s: %w", targetPath, closeErr)
		}
	}()
	if _, err := io.Copy(destHandle, sourceHandle); err != nil {
		return fmt.Errorf("copy plugin snapshot file %s: %w", targetPath, err)
	}
	return nil
}

func randomHex(byteCount int) string {
	if byteCount <= 0 {
		return ""
	}
	buffer := make([]byte, byteCount)
	if _, err := rand.Read(buffer); err != nil {
		return strings.Repeat("0", byteCount*2)
	}
	return hex.EncodeToString(buffer)
}

func stringPtr(value string) *string {
	cloned := value
	return &cloned
}

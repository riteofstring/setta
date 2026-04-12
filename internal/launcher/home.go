package launcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofrs/flock"
	"setta/internal/statefs"
)

const (
	launcherAllowedRootsEnv         = "SETTA_LAUNCHER_ALLOWED_ROOTS"
	recentWorkspacesFileName        = "recent-workspaces.json"
	recentWorkspacesLockFileName    = ".recent-workspaces.lock"
	defaultMaxRecentWorkspaces      = 50
	defaultMaxDirectoryEntries      = 500
	defaultMaxDirectoryScanEntries  = 5000
	defaultMaxDirectoryCursorOffset = 5000
)

type HomeError struct {
	Code    string
	Message string
}

func (e *HomeError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type RecentWorkspaceEntry struct {
	WorkspaceRoot string `json:"workspaceRoot"`
	Pinned        bool   `json:"pinned"`
	LastUsedAt    int64  `json:"lastUsedAt"`
}

type DirectoryEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
	IsSymlink   bool   `json:"isSymlink"`
}

type ListDirectoryInput struct {
	Path     *string
	Cursor   *string
	PageSize *int
}

type DirectoryListing struct {
	CurrentPath *string
	ParentPath  *string
	Entries     []DirectoryEntry
	NextCursor  *string
	HasMore     bool
	Truncated   bool
}

type directoryListRequest struct {
	directory    string
	pageSize     int
	cursorOffset int
}

type HomeServiceOptions struct {
	EnvLookup                func(string) (string, bool)
	Now                      func() time.Time
	MaxRecentWorkspaces      int
	MaxDirectoryEntries      int
	MaxDirectoryScanEntries  int
	MaxDirectoryCursorOffset int
}

type HomeService struct {
	envLookup                func(string) (string, bool)
	now                      func() time.Time
	maxRecentWorkspaces      int
	maxDirectoryEntries      int
	maxDirectoryScanEntries  int
	maxDirectoryCursorOffset int
}

func NewHomeService(options HomeServiceOptions) *HomeService {
	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	maxRecentWorkspaces := options.MaxRecentWorkspaces
	if maxRecentWorkspaces <= 0 {
		maxRecentWorkspaces = defaultMaxRecentWorkspaces
	}
	maxDirectoryEntries := options.MaxDirectoryEntries
	if maxDirectoryEntries <= 0 {
		maxDirectoryEntries = defaultMaxDirectoryEntries
	}
	maxDirectoryScanEntries := options.MaxDirectoryScanEntries
	if maxDirectoryScanEntries <= 0 {
		maxDirectoryScanEntries = defaultMaxDirectoryScanEntries
	}
	maxDirectoryCursorOffset := options.MaxDirectoryCursorOffset
	if maxDirectoryCursorOffset <= 0 {
		maxDirectoryCursorOffset = defaultMaxDirectoryCursorOffset
	}
	return &HomeService{
		envLookup:                envLookup,
		now:                      now,
		maxRecentWorkspaces:      maxRecentWorkspaces,
		maxDirectoryEntries:      maxDirectoryEntries,
		maxDirectoryScanEntries:  maxDirectoryScanEntries,
		maxDirectoryCursorOffset: maxDirectoryCursorOffset,
	}
}

func ResolveScopedSettaHome(defaultSettaHome string, requestedSettaHome string) (string, error) {
	trimmedRequested := strings.TrimSpace(requestedSettaHome)
	if trimmedRequested == "" {
		return resolvePathLoose(defaultSettaHome)
	}
	return resolvePathLoose(trimmedRequested)
}

func (s *HomeService) AllowedRoots() ([]string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user home: %w", err)
	}

	roots := make([]string, 0, 4)
	normalizedHome, err := resolvePathLoose(homeDir)
	if err != nil {
		return nil, err
	}
	roots = append(roots, normalizedHome)

	if rawRoots, ok := s.envLookup(launcherAllowedRootsEnv); ok {
		for _, part := range strings.Split(rawRoots, string(os.PathListSeparator)) {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			normalizedRoot, err := resolvePathLoose(trimmed)
			if err != nil {
				return nil, err
			}
			roots = append(roots, normalizedRoot)
		}
	}

	uniqueRoots := make([]string, 0, len(roots))
	seen := map[string]struct{}{}
	for _, root := range roots {
		if _, ok := seen[root]; ok {
			continue
		}
		seen[root] = struct{}{}
		uniqueRoots = append(uniqueRoots, root)
	}
	return uniqueRoots, nil
}

func (s *HomeService) LoadRecentWorkspaces(settaHome string) ([]RecentWorkspaceEntry, error) {
	return s.withRecentWorkspaceFileLock(settaHome, func(path string, allowedRoots []string) ([]RecentWorkspaceEntry, error) {
		entries, err := s.loadRecentWorkspacesFile(path)
		if err != nil {
			return nil, err
		}
		filtered := filterEntriesWithinAllowedRoots(entries, allowedRoots)
		if len(filtered) != len(entries) {
			if err := writeRecentWorkspacesFile(path, filtered); err != nil {
				return nil, err
			}
		}
		return filtered, nil
	})
}

func (s *HomeService) AddRecentWorkspace(settaHome string, workspaceRoot string, pinned *bool) ([]RecentWorkspaceEntry, error) {
	return s.updateRecentWorkspaces(settaHome, func(entries []RecentWorkspaceEntry, allowedRoots []string) ([]RecentWorkspaceEntry, error) {
		resolvedWorkspaceRoot, err := resolvePathWithinAllowedRoots(workspaceRoot, allowedRoots, true)
		if err != nil {
			return nil, err
		}

		nowUnix := s.now().UTC().Unix()
		entriesByPath := make(map[string]RecentWorkspaceEntry, len(entries))
		for _, entry := range entries {
			entriesByPath[entry.WorkspaceRoot] = entry
		}

		existing, ok := entriesByPath[resolvedWorkspaceRoot]
		if !ok {
			nextPinned := false
			if pinned != nil {
				nextPinned = *pinned
			}
			entriesByPath[resolvedWorkspaceRoot] = RecentWorkspaceEntry{
				WorkspaceRoot: resolvedWorkspaceRoot,
				Pinned:        nextPinned,
				LastUsedAt:    nowUnix,
			}
		} else {
			nextPinned := existing.Pinned
			if pinned != nil {
				nextPinned = *pinned
			}
			if nowUnix < existing.LastUsedAt {
				nowUnix = existing.LastUsedAt
			}
			entriesByPath[resolvedWorkspaceRoot] = RecentWorkspaceEntry{
				WorkspaceRoot: resolvedWorkspaceRoot,
				Pinned:        nextPinned,
				LastUsedAt:    nowUnix,
			}
		}

		nextEntries := make([]RecentWorkspaceEntry, 0, len(entriesByPath))
		for _, entry := range entriesByPath {
			nextEntries = append(nextEntries, entry)
		}
		return sortAndLimitEntries(nextEntries, s.maxRecentWorkspaces), nil
	})
}

func (s *HomeService) RemoveRecentWorkspace(settaHome string, workspaceRoot string) ([]RecentWorkspaceEntry, error) {
	return s.updateRecentWorkspaces(settaHome, func(entries []RecentWorkspaceEntry, allowedRoots []string) ([]RecentWorkspaceEntry, error) {
		resolvedWorkspaceRoot, err := resolvePathWithinAllowedRoots(workspaceRoot, allowedRoots, true)
		if err != nil {
			return nil, err
		}
		nextEntries := make([]RecentWorkspaceEntry, 0, len(entries))
		for _, entry := range entries {
			if entry.WorkspaceRoot == resolvedWorkspaceRoot {
				continue
			}
			nextEntries = append(nextEntries, entry)
		}
		return nextEntries, nil
	})
}

func (s *HomeService) SetRecentWorkspacePinned(settaHome string, workspaceRoot string, pinned bool) ([]RecentWorkspaceEntry, error) {
	return s.updateRecentWorkspaces(settaHome, func(entries []RecentWorkspaceEntry, allowedRoots []string) ([]RecentWorkspaceEntry, error) {
		resolvedWorkspaceRoot, err := resolvePathWithinAllowedRoots(workspaceRoot, allowedRoots, true)
		if err != nil {
			return nil, err
		}

		nowUnix := s.now().UTC().Unix()
		nextEntries := make([]RecentWorkspaceEntry, 0, len(entries)+1)
		found := false
		for _, entry := range entries {
			if entry.WorkspaceRoot != resolvedWorkspaceRoot {
				nextEntries = append(nextEntries, entry)
				continue
			}
			found = true
			nextEntries = append(nextEntries, RecentWorkspaceEntry{
				WorkspaceRoot: entry.WorkspaceRoot,
				Pinned:        pinned,
				LastUsedAt:    entry.LastUsedAt,
			})
		}
		if !found {
			nextEntries = append(nextEntries, RecentWorkspaceEntry{
				WorkspaceRoot: resolvedWorkspaceRoot,
				Pinned:        pinned,
				LastUsedAt:    nowUnix,
			})
		}
		return sortAndLimitEntries(nextEntries, s.maxRecentWorkspaces), nil
	})
}

func (s *HomeService) ListDirectory(input ListDirectoryInput) (DirectoryListing, error) {
	allowedRoots, err := s.AllowedRoots()
	if err != nil {
		return DirectoryListing{}, err
	}

	if shouldListAllowedRoots(input.Path) {
		return listAllowedRootsDirectory(allowedRoots), nil
	}

	request, err := s.resolveDirectoryListRequest(input, allowedRoots)
	if err != nil {
		return DirectoryListing{}, err
	}

	candidateEntries, truncated, err := s.readDirectoryEntries(request.directory, allowedRoots)
	if err != nil {
		return DirectoryListing{}, err
	}
	sortDirectoryEntries(candidateEntries)
	return buildDirectoryListing(request.directory, candidateEntries, request.pageSize, request.cursorOffset, truncated, allowedRoots), nil
}

func (s *HomeService) updateRecentWorkspaces(settaHome string, apply func([]RecentWorkspaceEntry, []string) ([]RecentWorkspaceEntry, error)) ([]RecentWorkspaceEntry, error) {
	return s.withRecentWorkspaceFileLock(settaHome, func(path string, allowedRoots []string) ([]RecentWorkspaceEntry, error) {
		entries, err := s.loadRecentWorkspacesFile(path)
		if err != nil {
			return nil, err
		}
		filteredEntries := filterEntriesWithinAllowedRoots(entries, allowedRoots)
		nextEntries, err := apply(filteredEntries, allowedRoots)
		if err != nil {
			return nil, err
		}
		nextEntries = sortAndLimitEntries(nextEntries, s.maxRecentWorkspaces)
		nextEntries = filterEntriesWithinAllowedRoots(nextEntries, allowedRoots)
		if err := writeRecentWorkspacesFile(path, nextEntries); err != nil {
			return nil, err
		}
		return nextEntries, nil
	})
}

func (s *HomeService) withRecentWorkspaceFileLock(settaHome string, fn func(path string, allowedRoots []string) ([]RecentWorkspaceEntry, error)) ([]RecentWorkspaceEntry, error) {
	allowedRoots, err := s.AllowedRoots()
	if err != nil {
		return nil, err
	}

	lockPath := recentWorkspacesLockPath(settaHome)
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return nil, &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: fmt.Sprintf("Failed acquiring launcher recent-workspaces lock: %s: %v", lockPath, err),
		}
	}

	fileLock := flock.New(lockPath)
	if err := fileLock.Lock(); err != nil {
		return nil, &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: fmt.Sprintf("Failed acquiring launcher recent-workspaces lock: %s: %v", lockPath, err),
		}
	}
	defer fileLock.Close()

	return fn(recentWorkspacesPath(settaHome), allowedRoots)
}

func (s *HomeService) loadRecentWorkspacesFile(path string) ([]RecentWorkspaceEntry, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []RecentWorkspaceEntry{}, nil
		}
		return nil, &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: fmt.Sprintf("Failed reading launcher recent-workspaces file: %s: %v", path, err),
		}
	}

	var rawPayload any
	if err := json.Unmarshal(content, &rawPayload); err != nil {
		return nil, &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: fmt.Sprintf("Invalid launcher recent-workspaces JSON: %s", path),
		}
	}

	return s.normalizeRecentWorkspaceEntries(rawPayload)
}

func (s *HomeService) normalizeRecentWorkspaceEntries(rawPayload any) ([]RecentWorkspaceEntry, error) {
	items, ok := rawPayload.([]any)
	if !ok {
		return nil, &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: "Launcher recent-workspaces payload must be a JSON array.",
		}
	}

	entriesByPath := map[string]RecentWorkspaceEntry{}
	for _, item := range items {
		payload, ok := item.(map[string]any)
		if !ok {
			continue
		}
		rawWorkspaceRoot, ok := payload["workspaceRoot"].(string)
		if !ok || strings.TrimSpace(rawWorkspaceRoot) == "" {
			continue
		}

		normalizedWorkspaceRoot, err := resolvePathLoose(rawWorkspaceRoot)
		if err != nil {
			return nil, &HomeError{
				Code:    "LauncherWorkspaceStore",
				Message: fmt.Sprintf("Failed reading launcher recent-workspaces file: %s", err),
			}
		}

		pinned, _ := payload["pinned"].(bool)
		lastUsedAt := s.normalizeTimestamp(payload["lastUsedAt"])

		previous, ok := entriesByPath[normalizedWorkspaceRoot]
		if !ok {
			entriesByPath[normalizedWorkspaceRoot] = RecentWorkspaceEntry{
				WorkspaceRoot: normalizedWorkspaceRoot,
				Pinned:        pinned,
				LastUsedAt:    lastUsedAt,
			}
			continue
		}

		if lastUsedAt < previous.LastUsedAt {
			lastUsedAt = previous.LastUsedAt
		}
		entriesByPath[normalizedWorkspaceRoot] = RecentWorkspaceEntry{
			WorkspaceRoot: normalizedWorkspaceRoot,
			Pinned:        previous.Pinned || pinned,
			LastUsedAt:    lastUsedAt,
		}
	}

	entries := make([]RecentWorkspaceEntry, 0, len(entriesByPath))
	for _, entry := range entriesByPath {
		entries = append(entries, entry)
	}
	return sortAndLimitEntries(entries, s.maxRecentWorkspaces), nil
}

func (s *HomeService) normalizeTimestamp(rawValue any) int64 {
	switch value := rawValue.(type) {
	case int:
		if value > 0 {
			return int64(value)
		}
	case int64:
		if value > 0 {
			return value
		}
	case float64:
		if value > 0 && value == float64(int64(value)) {
			return int64(value)
		}
	}
	return s.now().UTC().Unix()
}

func (s *HomeService) readDirectoryEntries(directory string, allowedRoots []string) ([]DirectoryEntry, bool, error) {
	handle, err := os.Open(directory)
	if err != nil {
		return nil, false, directoryReadError(directory, err)
	}
	defer handle.Close()

	entries := make([]DirectoryEntry, 0)
	scannedCount := 0
	for {
		children, done, err := readDirectoryChunk(handle, directory)
		if err != nil {
			return nil, false, err
		}
		for _, child := range children {
			scannedCount++
			if scannedCount > s.maxDirectoryScanEntries {
				return entries, true, nil
			}

			entry, visible, err := resolveDirectoryEntry(directory, child, allowedRoots)
			if err != nil {
				return nil, false, err
			}
			if visible {
				entries = append(entries, entry)
			}
		}

		if done {
			return entries, false, nil
		}
	}
}

func (s *HomeService) normalizeDirectoryPageSize(rawPageSize *int) (int, error) {
	if rawPageSize == nil {
		return s.maxDirectoryEntries, nil
	}
	if *rawPageSize < 1 {
		return 0, &HomeError{Code: "BadRequest", Message: "pageSize must be at least 1."}
	}
	if *rawPageSize > s.maxDirectoryEntries {
		return 0, &HomeError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("pageSize must be <= %d.", s.maxDirectoryEntries),
		}
	}
	return *rawPageSize, nil
}

func (s *HomeService) normalizeDirectoryCursor(rawCursor *string) (int, error) {
	if rawCursor == nil {
		return 0, nil
	}
	trimmedCursor := strings.TrimSpace(*rawCursor)
	if trimmedCursor == "" {
		return 0, nil
	}
	if !digitsOnly(trimmedCursor) {
		return 0, &HomeError{Code: "BadRequest", Message: "cursor must be a non-negative integer."}
	}
	cursorOffset, err := strconv.Atoi(trimmedCursor)
	if err != nil {
		return 0, &HomeError{Code: "BadRequest", Message: "cursor must be a non-negative integer."}
	}
	if cursorOffset > s.maxDirectoryCursorOffset {
		return 0, &HomeError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("cursor offset exceeds maximum supported value (%d).", s.maxDirectoryCursorOffset),
		}
	}
	return cursorOffset, nil
}

func sortAndLimitEntries(entries []RecentWorkspaceEntry, limit int) []RecentWorkspaceEntry {
	sortedEntries := append([]RecentWorkspaceEntry(nil), entries...)
	sort.Slice(sortedEntries, func(i int, j int) bool {
		if sortedEntries[i].Pinned != sortedEntries[j].Pinned {
			return sortedEntries[i].Pinned
		}
		if sortedEntries[i].LastUsedAt != sortedEntries[j].LastUsedAt {
			return sortedEntries[i].LastUsedAt > sortedEntries[j].LastUsedAt
		}
		return sortedEntries[i].WorkspaceRoot < sortedEntries[j].WorkspaceRoot
	})
	if len(sortedEntries) > limit {
		return sortedEntries[:limit]
	}
	return sortedEntries
}

func filterEntriesWithinAllowedRoots(entries []RecentWorkspaceEntry, allowedRoots []string) []RecentWorkspaceEntry {
	filtered := make([]RecentWorkspaceEntry, 0, len(entries))
	for _, entry := range entries {
		if isWithinAnyRoot(entry.WorkspaceRoot, allowedRoots) {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func shouldListAllowedRoots(path *string) bool {
	return path == nil || strings.TrimSpace(*path) == ""
}

func listAllowedRootsDirectory(allowedRoots []string) DirectoryListing {
	entries := make([]DirectoryEntry, 0, len(allowedRoots))
	for _, root := range allowedRoots {
		entries = append(entries, DirectoryEntry{
			Name:        launcherPathDisplayName(root),
			Path:        root,
			IsDirectory: true,
			IsSymlink:   pathIsSymlink(root),
		})
	}
	return DirectoryListing{Entries: entries}
}

func (s *HomeService) resolveDirectoryListRequest(input ListDirectoryInput, allowedRoots []string) (directoryListRequest, error) {
	pageSize, err := s.normalizeDirectoryPageSize(input.PageSize)
	if err != nil {
		return directoryListRequest{}, err
	}
	cursorOffset, err := s.normalizeDirectoryCursor(input.Cursor)
	if err != nil {
		return directoryListRequest{}, err
	}
	resolvedDirectory, err := resolvePathWithinAllowedRoots(*input.Path, allowedRoots, false)
	if err != nil {
		return directoryListRequest{}, err
	}
	if err := ensureDirectoryPath(resolvedDirectory); err != nil {
		return directoryListRequest{}, err
	}
	return directoryListRequest{
		directory:    resolvedDirectory,
		pageSize:     pageSize,
		cursorOffset: cursorOffset,
	}, nil
}

func ensureDirectoryPath(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return &HomeError{
				Code:    "PathNotFound",
				Message: fmt.Sprintf("Path does not exist: %s", path),
			}
		}
		return directoryReadError(path, err)
	}
	if !info.IsDir() {
		return &HomeError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("Path is not a directory: %s", path),
		}
	}
	return nil
}

func sortDirectoryEntries(entries []DirectoryEntry) {
	sort.Slice(entries, func(i int, j int) bool {
		if entries[i].IsDirectory != entries[j].IsDirectory {
			return entries[i].IsDirectory
		}
		leftName := strings.ToLower(entries[i].Name)
		rightName := strings.ToLower(entries[j].Name)
		if leftName != rightName {
			return leftName < rightName
		}
		return entries[i].Name < entries[j].Name
	})
}

func buildDirectoryListing(directory string, entries []DirectoryEntry, pageSize int, cursorOffset int, truncated bool, allowedRoots []string) DirectoryListing {
	visibleEntries, nextCursor, hasMore := paginateDirectoryEntries(entries, pageSize, cursorOffset)
	currentPath := directory
	return DirectoryListing{
		CurrentPath: &currentPath,
		ParentPath:  directoryParentPath(directory, allowedRoots),
		Entries:     visibleEntries,
		NextCursor:  nextCursor,
		HasMore:     hasMore,
		Truncated:   truncated,
	}
}

func paginateDirectoryEntries(entries []DirectoryEntry, pageSize int, cursorOffset int) ([]DirectoryEntry, *string, bool) {
	pageStart := cursorOffset
	if pageStart > len(entries) {
		pageStart = len(entries)
	}
	pageEnd := pageStart + pageSize
	if pageEnd > len(entries) {
		pageEnd = len(entries)
	}
	visibleEntries := append([]DirectoryEntry(nil), entries[pageStart:pageEnd]...)
	if len(entries) <= pageEnd {
		return visibleEntries, nil, false
	}
	cursor := strconv.Itoa(cursorOffset + len(visibleEntries))
	return visibleEntries, &cursor, true
}

func directoryParentPath(directory string, allowedRoots []string) *string {
	parent := filepath.Dir(directory)
	if parent == directory || !isWithinAnyRoot(parent, allowedRoots) {
		return nil
	}
	return &parent
}

func writeRecentWorkspacesFile(path string, entries []RecentWorkspaceEntry) error {
	content, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	if err := statefs.AtomicWriteFile(path, content, 0o644); err != nil {
		return &HomeError{
			Code:    "LauncherWorkspaceStore",
			Message: fmt.Sprintf("Failed writing launcher recent-workspaces file: %s: %v", path, err),
		}
	}
	return nil
}

func resolvePathWithinAllowedRoots(rawPath string, allowedRoots []string, allowNonexistent bool) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return "", &HomeError{Code: "BadRequest", Message: "Path must be non-empty."}
	}

	resolvedPath, err := resolvePathLoose(trimmedPath)
	if err != nil {
		return "", &HomeError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("Failed to resolve path: %v", err),
		}
	}

	if !isWithinAnyRoot(resolvedPath, allowedRoots) {
		return "", &HomeError{
			Code:    "PathOutsideAllowedRoots",
			Message: fmt.Sprintf("Path is outside launcher allowed roots: %s. Allowed roots: %s", resolvedPath, strings.Join(allowedRoots, ", ")),
		}
	}

	if !allowNonexistent {
		if _, err := os.Stat(resolvedPath); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return "", &HomeError{
					Code:    "PathNotFound",
					Message: fmt.Sprintf("Path does not exist: %s", resolvedPath),
				}
			}
			return "", &HomeError{
				Code:    "BadRequest",
				Message: fmt.Sprintf("Failed to resolve path: %v", err),
			}
		}
	}

	return resolvedPath, nil
}

func readDirectoryChunk(handle *os.File, directory string) ([]os.DirEntry, bool, error) {
	children, err := handle.ReadDir(256)
	switch {
	case err == nil:
		return children, false, nil
	case errors.Is(err, io.EOF):
		return children, true, nil
	default:
		return nil, false, directoryReadError(directory, err)
	}
}

func resolveDirectoryEntry(directory string, child os.DirEntry, allowedRoots []string) (DirectoryEntry, bool, error) {
	resolvedChild, err := resolvePathLoose(filepath.Join(directory, child.Name()))
	if err != nil {
		return DirectoryEntry{}, false, directoryReadError(directory, err)
	}
	if !isWithinAnyRoot(resolvedChild, allowedRoots) {
		return DirectoryEntry{}, false, nil
	}
	isDirectory, err := isDirectoryEntryPath(resolvedChild)
	if err != nil {
		return DirectoryEntry{}, false, directoryReadError(directory, err)
	}
	return DirectoryEntry{
		Name:        child.Name(),
		Path:        resolvedChild,
		IsDirectory: isDirectory,
		IsSymlink:   child.Type()&os.ModeSymlink != 0,
	}, true, nil
}

func isDirectoryEntryPath(path string) (bool, error) {
	info, err := os.Stat(path)
	if err == nil {
		return info.IsDir(), nil
	}
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func directoryReadError(directory string, err error) *HomeError {
	return &HomeError{
		Code:    "DirectoryReadFailed",
		Message: fmt.Sprintf("Failed to read directory %s: %v", directory, err),
	}
}

func resolvePathLoose(rawPath string) (string, error) {
	return resolvePathLooseWithDepth(rawPath, 0)
}

func resolvePathLooseWithDepth(rawPath string, depth int) (string, error) {
	if depth > 255 {
		return "", fmt.Errorf("too many symlink evaluations while resolving %q", rawPath)
	}

	normalizedPath, err := normalizeLauncherPath(rawPath)
	if err != nil {
		return "", err
	}

	base, components := splitAbsolutePath(normalizedPath)
	current := base
	for idx, component := range components {
		candidate := filepath.Join(current, component)
		info, err := os.Lstat(candidate)
		if err == nil {
			if info.Mode()&os.ModeSymlink != 0 {
				target, err := os.Readlink(candidate)
				if err != nil {
					return "", err
				}
				if !filepath.IsAbs(target) {
					target = filepath.Join(filepath.Dir(candidate), target)
				}
				if len(components[idx+1:]) != 0 {
					target = filepath.Join(append([]string{target}, components[idx+1:]...)...)
				}
				return resolvePathLooseWithDepth(target, depth+1)
			}
			current = candidate
			continue
		}
		if errors.Is(err, fs.ErrNotExist) {
			return filepath.Clean(filepath.Join(append([]string{candidate}, components[idx+1:]...)...)), nil
		}
		return "", err
	}

	return filepath.Clean(current), nil
}

func splitAbsolutePath(path string) (string, []string) {
	volume := filepath.VolumeName(path)
	trimmed := path[len(volume):]
	base := string(os.PathSeparator)
	if volume != "" {
		base = volume + string(os.PathSeparator)
	}
	trimmed = strings.TrimPrefix(trimmed, string(os.PathSeparator))
	if trimmed == "" {
		return filepath.Clean(base), nil
	}
	parts := strings.Split(trimmed, string(os.PathSeparator))
	components := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || part == "." {
			continue
		}
		components = append(components, part)
	}
	return filepath.Clean(base), components
}

func normalizeLauncherPath(rawPath string) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return "", fmt.Errorf("missing path")
	}
	if trimmedPath == "~" || strings.HasPrefix(trimmedPath, "~/") || strings.HasPrefix(trimmedPath, "~\\") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		trimmedPath = filepath.Join(homeDir, strings.TrimLeft(trimmedPath[1:], `/\`))
	}
	if !filepath.IsAbs(trimmedPath) {
		absolutePath, err := filepath.Abs(trimmedPath)
		if err != nil {
			return "", fmt.Errorf("resolve path %q: %w", rawPath, err)
		}
		trimmedPath = absolutePath
	}
	return filepath.Clean(trimmedPath), nil
}

func recentWorkspacesPath(settaHome string) string {
	return filepath.Join(settaHome, "launcher", recentWorkspacesFileName)
}

func recentWorkspacesLockPath(settaHome string) string {
	return filepath.Join(settaHome, "launcher", recentWorkspacesLockFileName)
}

func isWithinAnyRoot(path string, roots []string) bool {
	for _, root := range roots {
		if isWithinRoot(path, root) {
			return true
		}
	}
	return false
}

func isWithinRoot(path string, root string) bool {
	relativePath, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	if relativePath == "." {
		return true
	}
	return relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(os.PathSeparator))
}

func launcherPathDisplayName(path string) string {
	volume := filepath.VolumeName(path)
	if volume != "" {
		return volume
	}
	return path
}

func pathIsSymlink(path string) bool {
	info, err := os.Lstat(path)
	if err != nil {
		return false
	}
	return info.Mode()&fs.ModeSymlink != 0
}

func digitsOnly(value string) bool {
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

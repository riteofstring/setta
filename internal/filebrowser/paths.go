package filebrowser

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/config"
	"setta/internal/statefs"
)

func (s *Service) Download(_ context.Context, token string) (DownloadResult, error) {
	secret, err := s.requireSessionSecret()
	if err != nil {
		return DownloadResult{}, err
	}
	payload, err := validateDownloadToken(strings.TrimSpace(token), secret, s.timeNow())
	if err != nil {
		return DownloadResult{}, err
	}
	resolved, err := s.resolvePathWithinWorkspace(payload.Path, "File path")
	if err != nil {
		return DownloadResult{}, err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DownloadResult{}, &Error{
				Kind:    ErrorPathNotFound,
				Message: "File not found.",
			}
		}
		return DownloadResult{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: "File path is not a file.",
		}
	}
	if !info.Mode().IsRegular() {
		return DownloadResult{}, &Error{
			Kind:    ErrorPathNotFile,
			Message: "File path is not a file.",
		}
	}
	return DownloadResult{
		Path:      resolved,
		MediaType: guessMimeType(resolved),
	}, nil
}

func (s *Service) resolveFolderPath(
	raw string,
	baseFolderPath string,
	allowOutsideWorkspaceRoot bool,
) (string, error) {
	resolvedBase, err := s.resolveFolderBasePath(
		baseFolderPath,
		allowOutsideWorkspaceRoot,
	)
	if err != nil {
		return "", err
	}
	base := s.workspaceRoot
	if resolvedBase != "" {
		base = resolvedBase
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		if resolvedBase == "" {
			return "", &Error{
				Kind:    ErrorInvalidRequest,
				Message: "Missing folder path.",
			}
		}
		return resolvedBase, nil
	}
	resolved, err := statefs.NormalizePath(trimmed, base)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Missing folder path.",
		}
	}
	if allowOutsideWorkspaceRoot {
		return resolved, nil
	}
	return s.ensureWithinWorkspaceRoot(resolved, "Folder path")
}

func (s *Service) resolveFolderBasePath(
	raw string,
	allowOutsideWorkspaceRoot bool,
) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	resolved, err := statefs.NormalizePath(trimmed, s.workspaceRoot)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Invalid base folder path.",
		}
	}
	if allowOutsideWorkspaceRoot {
		return resolved, nil
	}
	return s.ensureWithinWorkspaceRoot(resolved, "Base folder path")
}

func (s *Service) resolvePathWithinWorkspace(raw string, label string) (string, error) {
	resolved, err := statefs.NormalizePath(raw, s.workspaceRoot)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Missing %s.", strings.ToLower(label)),
		}
	}
	return s.ensureWithinWorkspaceRoot(resolved, label)
}

func (s *Service) ensureWithinWorkspaceRoot(resolved string, label string) (string, error) {
	if !isWithinRoot(s.workspaceRoot, resolved) {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: fmt.Sprintf("%s must be within the project root.", label),
		}
	}
	return resolved, nil
}

func (s *Service) resolveFilePathForDownload(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}
	resolved, err := s.resolvePathWithinWorkspace(trimmed, "File path")
	if err != nil {
		return "", false
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil || info.IsDir() {
		return "", false
	}
	return resolved, true
}

func (s *Service) resolveFilePathForEdit(raw string, allowMissing bool) (string, error) {
	resolved, err := s.resolvePathWithinWorkspace(raw, "File path")
	if err != nil {
		return "", err
	}
	info, statErr := os.Stat(resolved)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) && allowMissing {
			return resolved, nil
		}
		if errors.Is(statErr, os.ErrNotExist) {
			return "", &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("File does not exist: %s", raw),
			}
		}
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", raw),
		}
	}
	if !info.Mode().IsRegular() {
		return "", &Error{
			Kind:    ErrorPathNotFile,
			Message: fmt.Sprintf("Path is not a file: %s", raw),
		}
	}
	return resolved, nil
}

func (s *Service) resolveExistingWorkspaceEntry(raw string) (string, error) {
	resolved, err := s.resolvePathWithinWorkspace(raw, "File path")
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(resolved); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Path does not exist: %s", raw),
			}
		}
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", raw),
		}
	}
	return resolved, nil
}

func (s *Service) formatBrowserPath(path string) string {
	resolved, err := statefs.NormalizePath(path, s.workspaceRoot)
	if err != nil {
		return strings.TrimSpace(path)
	}
	return resolved
}

func (s *Service) internalIgnoreRoots() []string {
	roots := make([]string, 0, 2)
	for _, root := range []string{s.settaFilesRoot, s.runtimeRoot} {
		if isWithinRoot(s.workspaceRoot, root) {
			roots = append(roots, root)
		}
	}
	return roots
}

func (s *Service) isUnderIgnoredRoot(path string, ignoredRoots []string) bool {
	for _, root := range ignoredRoots {
		if isWithinRoot(root, path) {
			return true
		}
	}
	info, err := os.Lstat(path)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		return false
	}
	resolved, err := resolveForComparison(path)
	if err != nil {
		return false
	}
	for _, root := range ignoredRoots {
		rootCompare, err := resolveForComparison(root)
		if err != nil {
			continue
		}
		if samePath(rootCompare, resolved) || isWithinRoot(rootCompare, resolved) {
			return true
		}
	}
	return false
}

func (s *Service) isInitializedWorkspaceFolder(path string) bool {
	for _, folderName := range localSettaFolderNames {
		candidate := filepath.Join(path, folderName)
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return true
		}
	}
	globalRoot := config.BuildFilesRootFromBase(s.globalSettaFilesBase, path)
	if info, err := os.Stat(globalRoot); err == nil && info.IsDir() {
		return true
	}
	return false
}

func (s *Service) requireSessionSecret() ([]byte, error) {
	currentSession, ok := s.sessions.CurrentSession()
	if !ok || currentSession == nil || len(currentSession.Secret) == 0 {
		return nil, &Error{
			Kind:    ErrorTokenUnavailable,
			Message: "File browser token secret unavailable.",
		}
	}
	return currentSession.Secret, nil
}

func (s *Service) folderHasPythonSignals(folderPath string) bool {
	internalIgnoreRoots := s.internalIgnoreRoots()
	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		entryPath := filepath.Join(folderPath, entry.Name())
		if s.isUnderIgnoredRoot(entryPath, internalIgnoreRoots) {
			continue
		}
		if shouldIgnoreName(entry.Name(), DefaultIgnorePatterns) {
			continue
		}

		info, statErr := os.Stat(entryPath)
		if statErr != nil || info.IsDir() {
			continue
		}
		if fileHasPythonSignal(entry.Name()) {
			return true
		}
	}
	return false
}

func fileHasPythonSignal(name string) bool {
	lowerName := strings.ToLower(strings.TrimSpace(name))
	if strings.HasSuffix(lowerName, ".py") {
		return true
	}
	_, ok := workspacePythonMarkerFiles[lowerName]
	return ok
}

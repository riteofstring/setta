package filebrowser

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func ensureListFolderTarget(resolved string, rawPath string, missingFolderBehavior string) (bool, error) {
	info, err := os.Stat(resolved)
	if err == nil {
		if info.IsDir() {
			return false, nil
		}
		return false, &Error{
			Kind:    ErrorPathNotDirectory,
			Message: fmt.Sprintf("Path is not a directory: %s", rawPath),
		}
	}
	if errors.Is(err, os.ErrNotExist) {
		if strings.TrimSpace(missingFolderBehavior) == "empty" {
			return true, nil
		}
		return false, &Error{
			Kind:    ErrorPathNotFound,
			Message: fmt.Sprintf("Path does not exist: %s", rawPath),
		}
	}
	return false, &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Failed to stat folder: %s", rawPath),
	}
}

func buildListFolderSettings(request ListFolderRequest) listFolderSettings {
	settings := listFolderSettings{
		ignorePatterns: request.IgnorePatterns,
		maxEntries:     DefaultMaxEntries,
	}
	if settings.ignorePatterns == nil {
		settings.ignorePatterns = DefaultIgnorePatterns
	}
	if request.MaxEntries != nil && *request.MaxEntries >= 0 {
		settings.maxEntries = *request.MaxEntries
	}
	return settings
}

func (s *Service) collectFolderItems(resolved string, request ListFolderRequest, settings listFolderSettings) ([]FolderContentItem, error) {
	entries, err := os.ReadDir(resolved)
	if err != nil {
		return nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read folder: %s", request.FolderPath),
		}
	}
	internalIgnoreRoots := s.internalIgnoreRoots()
	items := make([]FolderContentItem, 0, len(entries))
	for _, entry := range entries {
		entryPath := filepath.Join(resolved, entry.Name())
		if s.isUnderIgnoredRoot(entryPath, internalIgnoreRoots) || shouldIgnoreName(entry.Name(), settings.ignorePatterns) {
			continue
		}
		item, ok := s.buildFolderContentItem(entryPath, entry, request)
		if ok {
			items = append(items, item)
		}
	}
	return items, nil
}

func (s *Service) buildFolderContentItem(entryPath string, entry os.DirEntry, request ListFolderRequest) (FolderContentItem, bool) {
	info, err := os.Stat(entryPath)
	if err != nil {
		return FolderContentItem{}, false
	}
	item := FolderContentItem{
		Name:     entry.Name(),
		Type:     FolderContentItemTypeFile,
		FullPath: s.formatBrowserPath(entryPath),
	}
	if info.IsDir() {
		item.Type = FolderContentItemTypeFolder
	}
	if request.IncludeMtime {
		value := float64(info.ModTime().UnixNano()) / float64(time.Second)
		item.Mtime = &value
	}
	if request.IncludeSize {
		value := info.Size()
		item.Size = &value
	}
	if request.IncludeSettaInitialized && info.IsDir() {
		value := s.isInitializedWorkspaceFolder(entryPath)
		item.IsSettaInitialized = &value
	}
	return item, true
}

func sortFolderContentItems(items []FolderContentItem) {
	sort.Slice(items, func(i int, j int) bool {
		left := items[i]
		right := items[j]
		if left.Type != right.Type {
			return left.Type == FolderContentItemTypeFolder
		}
		return strings.ToLower(left.Name) < strings.ToLower(right.Name)
	})
}

func limitFolderContentItems(items []FolderContentItem, maxEntries int) []FolderContentItem {
	if len(items) <= maxEntries {
		return items
	}
	return append([]FolderContentItem(nil), items[:maxEntries]...)
}

func resolveReadMaxBytes(request FileContentRequest) int64 {
	maxBytes := int64(DefaultMaxFileContentBytes)
	if request.MaxBytes != nil && *request.MaxBytes > 0 && *request.MaxBytes < maxBytes {
		maxBytes = *request.MaxBytes
	}
	return maxBytes
}

func readStableFileContent(path string, maxBytes int64, rawPath string) (fileContentSnapshot, error) {
	file, err := os.Open(path)
	if err != nil {
		return fileContentSnapshot{}, fileReadError(rawPath)
	}
	defer file.Close()

	infoBefore, err := file.Stat()
	if err != nil {
		return fileContentSnapshot{}, fileReadError(rawPath)
	}
	content, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return fileContentSnapshot{}, fileReadError(rawPath)
	}
	infoAfter, err := file.Stat()
	if err != nil {
		return fileContentSnapshot{}, fileReadError(rawPath)
	}
	if int64(len(content)) > maxBytes {
		return fileContentSnapshot{}, &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("File exceeds max size (%d bytes): %s", maxBytes, rawPath),
		}
	}
	if infoBefore.Size() != infoAfter.Size() || infoBefore.ModTime().UnixNano() != infoAfter.ModTime().UnixNano() {
		return fileContentSnapshot{}, &Error{
			Kind:    ErrorConflict,
			Message: "File changed on disk while reading.",
		}
	}
	return fileContentSnapshot{
		content: content,
		info:    infoAfter,
	}, nil
}

func fileReadError(rawPath string) error {
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Failed to read file: %s", rawPath),
	}
}

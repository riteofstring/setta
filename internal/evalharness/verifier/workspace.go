package verifier

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	DefaultMaximumFiles      = 256
	DefaultMaximumFileBytes  = 1024 * 1024
	DefaultMaximumTotalBytes = 8 * 1024 * 1024
)

type SnapshotOptions struct {
	IgnoredDirectoryNames []string
	MaximumFiles          int
	MaximumFileBytes      int64
	MaximumTotalBytes     int64
}

type FileState struct {
	Content    []byte
	Executable bool
}

type WorkspaceSnapshot map[string]FileState

func ReadWorkspace(root string, options SnapshotOptions) (WorkspaceSnapshot, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve workspace root: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("inspect workspace root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("workspace root %s is not a directory", root)
	}
	options = normalizedSnapshotOptions(options)
	if options.MaximumFiles < 1 || options.MaximumFileBytes < 1 || options.MaximumTotalBytes < 1 {
		return nil, errors.New("workspace snapshot limits must be positive")
	}
	ignored := make(map[string]struct{}, len(options.IgnoredDirectoryNames))
	for _, name := range options.IgnoredDirectoryNames {
		if name != filepath.Base(name) || name == "." || name == ".." || strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("ignored directory name %q is invalid", name)
		}
		ignored[name] = struct{}{}
	}
	snapshot := WorkspaceSnapshot{}
	var totalBytes int64
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		if entry.IsDir() {
			if _, skip := ignored[entry.Name()]; skip {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("workspace contains symbolic link %s", relativeWorkspacePath(root, path))
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("workspace contains non-regular file %s", relativeWorkspacePath(root, path))
		}
		if len(snapshot) >= options.MaximumFiles {
			return fmt.Errorf("workspace contains more than %d files", options.MaximumFiles)
		}
		if info.Size() > options.MaximumFileBytes {
			return fmt.Errorf(
				"workspace file %s is %d bytes, maximum is %d",
				relativeWorkspacePath(root, path),
				info.Size(),
				options.MaximumFileBytes,
			)
		}
		totalBytes += info.Size()
		if totalBytes > options.MaximumTotalBytes {
			return fmt.Errorf("workspace files exceed %d total bytes", options.MaximumTotalBytes)
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative := relativeWorkspacePath(root, path)
		snapshot[relative] = FileState{
			Content:    content,
			Executable: info.Mode().Perm()&0o111 != 0,
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("snapshot workspace %s: %w", root, err)
	}
	return snapshot, nil
}

func ChangedFiles(baseline WorkspaceSnapshot, actual WorkspaceSnapshot) []string {
	paths := make(map[string]struct{}, len(baseline)+len(actual))
	for path := range baseline {
		paths[path] = struct{}{}
	}
	for path := range actual {
		paths[path] = struct{}{}
	}
	changed := make([]string, 0, len(paths))
	for path := range paths {
		baselineFile, baselineExists := baseline[path]
		actualFile, actualExists := actual[path]
		if !baselineExists || !actualExists ||
			baselineFile.Executable != actualFile.Executable ||
			!bytes.Equal(baselineFile.Content, actualFile.Content) {
			changed = append(changed, path)
		}
	}
	sort.Strings(changed)
	return changed
}

func normalizedSnapshotOptions(options SnapshotOptions) SnapshotOptions {
	if options.MaximumFiles == 0 {
		options.MaximumFiles = DefaultMaximumFiles
	}
	if options.MaximumFileBytes == 0 {
		options.MaximumFileBytes = DefaultMaximumFileBytes
	}
	if options.MaximumTotalBytes == 0 {
		options.MaximumTotalBytes = DefaultMaximumTotalBytes
	}
	return options
}

func relativeWorkspacePath(root string, path string) string {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(relative)
}

func validateRelativePath(path string) error {
	if path == "" || path == "." {
		return errors.New("path is required")
	}
	if len(path) > MaximumChangedPathBytes {
		return fmt.Errorf("path is %d bytes, maximum is %d", len(path), MaximumChangedPathBytes)
	}
	if strings.Contains(path, `\`) || filepath.IsAbs(path) || filepath.Clean(path) != filepath.FromSlash(path) {
		return fmt.Errorf("path %q must be a clean relative slash path", path)
	}
	if strings.HasPrefix(path, "../") || strings.Contains(path, "/../") {
		return fmt.Errorf("path %q escapes the workspace", path)
	}
	return nil
}

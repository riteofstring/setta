package statefs

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type UnlockFunc func() error

type Locker interface {
	Lock(ctx context.Context, path string) (UnlockFunc, error)
}

type NoopLocker struct{}

func (NoopLocker) Lock(ctx context.Context, _ string) (UnlockFunc, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return func() error {
		return nil
	}, nil
}

func NormalizePath(raw string, base string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("missing path")
	}
	value = os.ExpandEnv(value)
	if value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(value, "~"), string(os.PathSeparator))
		suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
		value = filepath.Join(home, suffix)
	}
	if base != "" && !filepath.IsAbs(value) {
		value = filepath.Join(base, value)
	}
	absValue, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve path %q: %w", raw, err)
	}
	return filepath.Clean(absValue), nil
}

func EnsureWithinRoot(root string, candidate string, label string) (string, error) {
	resolvedRoot, err := NormalizePath(root, "")
	if err != nil {
		return "", err
	}
	resolvedCandidate, err := NormalizePath(candidate, "")
	if err != nil {
		return "", err
	}

	relative, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return "", fmt.Errorf("resolve %s relative path: %w", label, err)
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%s must be within %s", label, resolvedRoot)
	}
	return resolvedCandidate, nil
}

func ResolveWithinRoot(root string, raw string, label string) (string, error) {
	resolvedRoot, err := NormalizePath(root, "")
	if err != nil {
		return "", err
	}
	resolvedCandidate, err := NormalizePath(raw, resolvedRoot)
	if err != nil {
		return "", err
	}
	return EnsureWithinRoot(resolvedRoot, resolvedCandidate, label)
}

func AtomicWriteFile(path string, data []byte, perm os.FileMode) error {
	resolvedPath, err := NormalizePath(path, "")
	if err != nil {
		return err
	}
	parentDir := filepath.Dir(resolvedPath)
	if err := os.MkdirAll(parentDir, 0o755); err != nil {
		return fmt.Errorf("create parent dir: %w", err)
	}

	tmpFile, err := os.CreateTemp(parentDir, ".setta-tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("sync temp file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}
	if perm != 0 {
		if err := os.Chmod(tmpPath, perm); err != nil {
			return fmt.Errorf("chmod temp file: %w", err)
		}
	}
	if err := os.Rename(tmpPath, resolvedPath); err != nil {
		return fmt.Errorf("replace target file: %w", err)
	}
	cleanup = false
	return syncDirectory(parentDir)
}

func syncDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	dirHandle, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open directory for sync: %w", err)
	}
	defer dirHandle.Close()
	if err := dirHandle.Sync(); err != nil {
		return fmt.Errorf("sync directory: %w", err)
	}
	return nil
}

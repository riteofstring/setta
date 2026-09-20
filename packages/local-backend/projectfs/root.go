package projectfs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	ErrClosed            = errors.New("projectfs: root is closed")
	ErrInvalidPath       = errors.New("projectfs: path is invalid")
	ErrIrregularPath     = errors.New("projectfs: path is not admitted")
	ErrMaximumSize       = errors.New("projectfs: file exceeds the size limit")
	ErrReplacementClosed = errors.New("projectfs: replacement is closed")
)

const lockRetryInterval = 10 * time.Millisecond

type Root struct {
	mu        sync.RWMutex
	directory *os.Root
	path      string
	closed    bool
}

type Replacement struct {
	mu        sync.Mutex
	root      *Root
	temporary string
	target    string
	parent    string
	closed    bool
}

func CanonicalRoot(rootPath string) (string, error) {
	if strings.TrimSpace(rootPath) == "" || rootPath != strings.TrimSpace(rootPath) || strings.ContainsRune(rootPath, '\x00') {
		return "", ErrInvalidPath
	}
	absolute, err := filepath.Abs(rootPath)
	if err != nil {
		return "", fmt.Errorf("projectfs: resolve root: %w", err)
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("projectfs: canonicalize root: %w", err)
	}
	info, err := os.Lstat(canonical)
	if err != nil {
		return "", fmt.Errorf("projectfs: inspect root: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", ErrIrregularPath
	}
	return canonical, nil
}

func Open(rootPath string) (*Root, error) {
	canonical, err := CanonicalRoot(rootPath)
	if err != nil {
		return nil, err
	}
	directory, err := os.OpenRoot(canonical)
	if err != nil {
		return nil, fmt.Errorf("projectfs: open root: %w", err)
	}
	return &Root{directory: directory, path: canonical}, nil
}

func (root *Root) Path() string {
	if root == nil {
		return ""
	}
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return ""
	}
	return root.path
}

func (root *Root) Close() error {
	if root == nil {
		return nil
	}
	root.mu.Lock()
	defer root.mu.Unlock()
	if root.closed {
		return nil
	}
	root.closed = true
	return root.directory.Close()
}

func (root *Root) EnsureDirectory(relative string, mode fs.FileMode) error {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return err
	}
	if !validMode(mode) {
		return errors.New("projectfs: directory mode is invalid")
	}
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return ErrClosed
	}
	if err := root.directory.MkdirAll(cleaned, mode); err != nil {
		return fmt.Errorf("projectfs: create directory: %w", err)
	}
	return requireDirectoryTree(root.directory, cleaned)
}

func (root *Root) OpenRegular(relative string) (*os.File, fs.FileInfo, error) {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return nil, nil, err
	}
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return nil, nil, ErrClosed
	}
	return openRegular(root.directory, cleaned)
}

func (root *Root) ReadRegular(relative string, maximum int64) ([]byte, error) {
	if maximum < 0 {
		return nil, errors.New("projectfs: size limit is invalid")
	}
	file, info, err := root.OpenRegular(relative)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if info.Size() > maximum {
		return nil, ErrMaximumSize
	}
	content, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, fmt.Errorf("projectfs: read file: %w", err)
	}
	if int64(len(content)) > maximum {
		return nil, ErrMaximumSize
	}
	return content, nil
}

func (root *Root) WriteExclusive(relative string, content []byte, maximum int64, mode fs.FileMode) error {
	cleaned, err := validateWrite(relative, content, maximum, mode)
	if err != nil {
		return err
	}
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return ErrClosed
	}
	parent := filepath.Dir(cleaned)
	if err := requireDirectory(root.directory, parent); err != nil {
		return err
	}
	file, err := root.directory.OpenFile(cleaned, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("projectfs: create file: %w", err)
	}
	installed := false
	defer func() {
		_ = file.Close()
		if !installed {
			_ = root.directory.Remove(cleaned)
		}
	}()
	if err := writeAndSync(file, content); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("projectfs: close file: %w", err)
	}
	installed = true
	return syncDirectory(root.directory, parent)
}

func (root *Root) StageReplacement(relative string, content []byte, maximum int64, mode fs.FileMode) (*Replacement, error) {
	cleaned, err := validateWrite(relative, content, maximum, mode)
	if err != nil {
		return nil, err
	}
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return nil, ErrClosed
	}
	parent := filepath.Dir(cleaned)
	if err := requireDirectory(root.directory, parent); err != nil {
		return nil, err
	}
	if err := requireReplaceable(root.directory, cleaned); err != nil {
		return nil, err
	}
	temporary, err := temporaryPath(parent)
	if err != nil {
		return nil, err
	}
	file, err := root.directory.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return nil, fmt.Errorf("projectfs: create replacement: %w", err)
	}
	staged := false
	defer func() {
		_ = file.Close()
		if !staged {
			_ = root.directory.Remove(temporary)
		}
	}()
	if err := writeAndSync(file, content); err != nil {
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("projectfs: close replacement: %w", err)
	}
	staged = true
	return &Replacement{root: root, temporary: temporary, target: cleaned, parent: parent}, nil
}

func (root *Root) Replace(relative string, content []byte, maximum int64, mode fs.FileMode) error {
	replacement, err := root.StageReplacement(relative, content, maximum, mode)
	if err != nil {
		return err
	}
	defer replacement.Discard()
	return replacement.Commit()
}

func (replacement *Replacement) Commit() error {
	if replacement == nil {
		return ErrReplacementClosed
	}
	replacement.mu.Lock()
	defer replacement.mu.Unlock()
	if replacement.closed {
		return ErrReplacementClosed
	}
	root := replacement.root
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return ErrClosed
	}
	if err := requireDirectory(root.directory, replacement.parent); err != nil {
		return err
	}
	if err := requireReplaceable(root.directory, replacement.target); err != nil {
		return err
	}
	if err := root.directory.Rename(replacement.temporary, replacement.target); err != nil {
		return fmt.Errorf("projectfs: install replacement: %w", err)
	}
	replacement.closed = true
	return syncDirectory(root.directory, replacement.parent)
}

func (replacement *Replacement) Discard() error {
	if replacement == nil {
		return nil
	}
	replacement.mu.Lock()
	defer replacement.mu.Unlock()
	if replacement.closed {
		return nil
	}
	replacement.closed = true
	root := replacement.root
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return ErrClosed
	}
	if err := root.directory.Remove(replacement.temporary); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("projectfs: discard replacement: %w", err)
	}
	return nil
}

func (root *Root) WithLock(ctx context.Context, relative string, operation func() error) error {
	if ctx == nil || operation == nil {
		return errors.New("projectfs: lock context and operation are required")
	}
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return err
	}
	file, err := root.acquireAdvisoryLock(ctx, cleaned)
	if err != nil {
		return err
	}
	operationErr := operation()
	unlockErr := unlockFile(file)
	closeErr := file.Close()
	return errors.Join(operationErr, wrapError("projectfs: release lock", unlockErr), wrapError("projectfs: close lock", closeErr))
}

func (root *Root) acquireAdvisoryLock(ctx context.Context, relative string) (*os.File, error) {
	root.mu.RLock()
	defer root.mu.RUnlock()
	if root.closed {
		return nil, ErrClosed
	}
	if err := requireDirectory(root.directory, filepath.Dir(relative)); err != nil {
		return nil, err
	}
	file, err := openLockFile(root.directory, relative)
	if err != nil {
		return nil, fmt.Errorf("projectfs: open lock: %w", err)
	}
	if err := requireOpenedRegular(root.directory, relative, file); err != nil {
		_ = file.Close()
		return nil, err
	}
	if err := acquireFileLock(ctx, file); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("projectfs: acquire lock: %w", err)
	}
	return file, nil
}

func openLockFile(root *os.Root, relative string) (*os.File, error) {
	file, err := root.OpenFile(relative, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, fs.ErrExist) {
		return root.OpenFile(relative, os.O_RDWR, 0)
	}
	return file, err
}

func acquireFileLock(ctx context.Context, file *os.File) error {
	for {
		locked, err := tryLockFile(file)
		if err != nil {
			return err
		}
		if locked {
			if err := ctx.Err(); err != nil {
				return errors.Join(err, unlockFile(file))
			}
			return nil
		}
		timer := time.NewTimer(lockRetryInterval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func cleanRelative(relative string) (string, error) {
	if invalidRelativeText(relative) {
		return "", ErrInvalidPath
	}
	for _, part := range strings.Split(relative, "/") {
		if part == "" || part == "." || part == ".." {
			return "", ErrInvalidPath
		}
	}
	cleaned := filepath.Clean(filepath.FromSlash(relative))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", ErrInvalidPath
	}
	return cleaned, nil
}

func invalidRelativeText(relative string) bool {
	return relative == "" ||
		relative != strings.TrimSpace(relative) ||
		strings.ContainsRune(relative, '\x00') ||
		strings.Contains(relative, "\\") ||
		filepath.IsAbs(relative)
}

func validateWrite(relative string, content []byte, maximum int64, mode fs.FileMode) (string, error) {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return "", err
	}
	if maximum < 0 {
		return "", errors.New("projectfs: size limit is invalid")
	}
	if int64(len(content)) > maximum {
		return "", ErrMaximumSize
	}
	if !validMode(mode) {
		return "", errors.New("projectfs: file mode is invalid")
	}
	return cleaned, nil
}

func validMode(mode fs.FileMode) bool {
	return mode != 0 && mode == mode.Perm()
}

func requireDirectoryTree(root *os.Root, relative string) error {
	current := ""
	for _, part := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		if err := requireDirectory(root, current); err != nil {
			return err
		}
	}
	return nil
}

func requireDirectory(root *os.Root, relative string) error {
	if relative == "." {
		return nil
	}
	info, err := root.Lstat(relative)
	if err != nil {
		return fmt.Errorf("projectfs: inspect directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return ErrIrregularPath
	}
	return nil
}

func openRegular(root *os.Root, relative string) (*os.File, fs.FileInfo, error) {
	pathInfo, err := root.Lstat(relative)
	if err != nil {
		return nil, nil, err
	}
	if pathInfo.Mode()&os.ModeSymlink != 0 || !pathInfo.Mode().IsRegular() {
		return nil, nil, ErrIrregularPath
	}
	file, err := root.Open(relative)
	if err != nil {
		return nil, nil, err
	}
	fileInfo, err := file.Stat()
	if err != nil || !fileInfo.Mode().IsRegular() || !os.SameFile(pathInfo, fileInfo) {
		_ = file.Close()
		return nil, nil, ErrIrregularPath
	}
	return file, fileInfo, nil
}

func requireOpenedRegular(root *os.Root, relative string, file *os.File) error {
	pathInfo, pathErr := root.Lstat(relative)
	fileInfo, fileErr := file.Stat()
	if pathErr != nil || fileErr != nil || pathInfo.Mode()&os.ModeSymlink != 0 || !pathInfo.Mode().IsRegular() || !fileInfo.Mode().IsRegular() || !os.SameFile(pathInfo, fileInfo) {
		return ErrIrregularPath
	}
	return nil
}

func requireReplaceable(root *os.Root, relative string) error {
	info, err := root.Lstat(relative)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("projectfs: inspect target: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return ErrIrregularPath
	}
	return nil
}

func temporaryPath(parent string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("projectfs: create replacement identity: %w", err)
	}
	return filepath.Join(parent, ".setta-replacement-"+hex.EncodeToString(value)), nil
}

func writeAndSync(file *os.File, content []byte) error {
	for len(content) > 0 {
		written, err := file.Write(content)
		if err != nil {
			return fmt.Errorf("projectfs: write file: %w", err)
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		content = content[written:]
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("projectfs: sync file: %w", err)
	}
	return nil
}

func syncDirectory(root *os.Root, relative string) error {
	directory, err := root.Open(relative)
	if err != nil {
		return fmt.Errorf("projectfs: open directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("projectfs: sync directory: %w", err)
	}
	return nil
}

func wrapError(prefix string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", prefix, err)
}

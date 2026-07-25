package controlplane

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
)

const maximumSecretBytes = 16 * 1024

type SecretStore interface {
	ReadSecret(context.Context, string) ([]byte, error)
}

type MutableSecretStore interface {
	SecretStore
	DeleteSecret(context.Context, string) error
	WriteSecret(context.Context, string, []byte) error
}

type FileSecretStore struct {
	directory string
	mu        sync.RWMutex
}

func OpenFileSecretStore(directory string) (*FileSecretStore, error) {
	if directory == "" || !filepath.IsAbs(directory) {
		return nil, errors.New("control-plane secret directory must be absolute")
	}
	if err := ensurePrivateDirectory(directory, "control-plane secret"); err != nil {
		return nil, err
	}
	return &FileSecretStore{directory: filepath.Clean(directory)}, nil
}

func (store *FileSecretStore) WriteSecret(ctx context.Context, reference string, secret []byte) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.writeSecret(ctx, reference, secret)
}

func (store *FileSecretStore) writeSecret(ctx context.Context, reference string, secret []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateSecretReference(reference); err != nil {
		return err
	}
	if err := validateRuntimeCredential(secret); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(store.directory, ".secret-*")
	if err != nil {
		return fmt.Errorf("create temporary control-plane secret: %w", err)
	}
	temporaryPath := temporary.Name()
	sealed := false
	defer func() {
		if !sealed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("restrict temporary control-plane secret: %w", err)
	}
	if _, err := temporary.Write(secret); err != nil {
		return fmt.Errorf("write temporary control-plane secret: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary control-plane secret: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary control-plane secret: %w", err)
	}
	if err := os.Rename(temporaryPath, store.path(reference)); err != nil {
		return fmt.Errorf("install control-plane secret: %w", err)
	}
	sealed = true
	return syncDirectory(store.directory)
}

func (store *FileSecretStore) ReadSecret(ctx context.Context, reference string) ([]byte, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return store.readSecret(ctx, reference)
}

func (store *FileSecretStore) readSecret(ctx context.Context, reference string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateSecretReference(reference); err != nil {
		return nil, err
	}
	path := store.path(reference)
	file, err := openPrivateSecret(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	secret, err := io.ReadAll(io.LimitReader(file, maximumSecretBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read control-plane secret: %w", err)
	}
	if err := validateRuntimeCredential(secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func openPrivateSecret(path string) (*os.File, error) {
	pathInfo, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("inspect control-plane secret path: %w", err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("control-plane secret must be a private regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open control-plane secret: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("inspect control-plane secret: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || !os.SameFile(pathInfo, info) {
		_ = file.Close()
		return nil, errors.New("control-plane secret must be a private regular file")
	}
	return file, nil
}

func ensurePrivateDirectory(path string, label string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return fmt.Errorf("create %s directory: %w", label, err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect %s directory: %w", label, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s path must be a non-symlink directory", label)
	}
	if err := os.Chmod(path, 0o700); err != nil {
		return fmt.Errorf("restrict %s directory: %w", label, err)
	}
	return nil
}

func (store *FileSecretStore) DeleteSecret(ctx context.Context, reference string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateSecretReference(reference); err != nil {
		return err
	}
	if err := os.Remove(store.path(reference)); errors.Is(err, os.ErrNotExist) {
		return ErrNotFound
	} else if err != nil {
		return fmt.Errorf("delete control-plane secret: %w", err)
	}
	return syncDirectory(store.directory)
}

func (store *FileSecretStore) path(reference string) string {
	return filepath.Join(store.directory, reference+".secret")
}

func validateRuntimeCredential(secret []byte) error {
	if len(secret) == 0 || len(secret) > maximumSecretBytes {
		return errors.New("runtime credential must be between 1 byte and 16 KiB")
	}
	for _, character := range secret {
		if character < 0x21 || character > 0x7e {
			return errors.New("runtime credential must contain only visible ASCII")
		}
	}
	return nil
}

func syncDirectory(directory string) error {
	handle, err := os.Open(directory)
	if err != nil {
		return fmt.Errorf("open control-plane secret directory: %w", err)
	}
	defer handle.Close()
	if err := handle.Sync(); err != nil {
		return fmt.Errorf("sync control-plane secret directory: %w", err)
	}
	return nil
}

var _ MutableSecretStore = (*FileSecretStore)(nil)

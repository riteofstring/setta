package durable

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func ReadRegular(path string, maximum int64) ([]byte, error) {
	entry, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() || entry.Size() > maximum {
		return nil, errors.New("durable: file is not an admitted regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(entry, opened) {
		return nil, errors.New("durable: file identity changed while opening")
	}
	data, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, errors.New("durable: file exceeds the byte limit")
	}
	return data, nil
}

func WriteJSON(path string, value any, mode os.FileMode, maximum int64) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("durable: encode JSON: %w", err)
	}
	encoded = append(encoded, '\n')
	if int64(len(encoded)) > maximum {
		return errors.New("durable: JSON exceeds the byte limit")
	}
	return Replace(path, encoded, mode)
}

func Replace(path string, content []byte, mode os.FileMode) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("durable: create directory: %w", err)
	}
	file, err := os.CreateTemp(directory, ".replacement-*")
	if err != nil {
		return fmt.Errorf("durable: stage replacement: %w", err)
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(mode); err != nil {
		_ = file.Close()
		return fmt.Errorf("durable: set replacement mode: %w", err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("durable: write replacement: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("durable: sync replacement: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("durable: close replacement: %w", err)
	}
	if err := replaceFile(temporary, path); err != nil {
		return fmt.Errorf("durable: install replacement: %w", err)
	}
	return SyncDirectory(directory)
}

func RequireDirectory(path string) error {
	entry, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if entry.Mode()&os.ModeSymlink != 0 || !entry.IsDir() {
		return errors.New("durable: path is not a regular directory")
	}
	return nil
}

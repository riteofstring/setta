package appspec

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const defaultFileMode = 0o644

var ErrPluginIDRequired = errors.New("app spec store plugin id is required")

type Store struct {
	pluginID string
}

func ForPlugin(pluginID string) (Store, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return Store{}, ErrPluginIDRequired
	}
	return Store{pluginID: trimmedPluginID}, nil
}

func MustForPlugin(pluginID string) Store {
	store, err := ForPlugin(pluginID)
	if err != nil {
		panic(err)
	}
	return store
}

func (s Store) RootPath() string {
	return path.Join("plugins", s.pluginID, "app_specs")
}

func (s Store) JoinPath(name string) string {
	return path.Join(s.RootPath(), name)
}

func (s Store) DefaultPath() string {
	return s.JoinPath("app.json")
}

func (s Store) ResolvePath(root string, appSpecPath string) (string, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return "", fmt.Errorf("resolve app spec root: %w", err)
	}
	appSpecsRoot := filepath.Join(resolvedRoot, filepath.FromSlash(s.RootPath()))
	resolvedPath, err := statefs.NormalizePath(appSpecPath, resolvedRoot)
	if err != nil {
		return "", err
	}
	resolvedPath, err = statefs.EnsureWithinRoot(appSpecsRoot, resolvedPath, "app spec path")
	if err != nil {
		return "", fmt.Errorf(
			"app spec path must live under %q in the project root: %w",
			s.RootPath(),
			err,
		)
	}
	return resolvedPath, nil
}

func (s Store) NormalizePath(root string, appSpecPath string) (string, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return "", fmt.Errorf("resolve app spec root: %w", err)
	}
	resolvedPath, err := s.ResolvePath(resolvedRoot, appSpecPath)
	if err != nil {
		return "", err
	}
	relativePath, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil {
		return "", fmt.Errorf("resolve app spec relative path: %w", err)
	}
	return filepath.ToSlash(relativePath), nil
}

func (s Store) Read(root string, appSpecPath string) (any, error) {
	resolvedPath, err := s.ResolvePath(root, appSpecPath)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read app spec: %w", err)
	}

	trimmedContent := bytes.TrimSpace(content)
	if len(trimmedContent) == 0 {
		return nil, nil
	}

	var payload any
	if err := json.Unmarshal(trimmedContent, &payload); err != nil {
		return nil, fmt.Errorf("decode app spec: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return nil, nil
	}
	return payload, nil
}

func (s Store) Write(root string, appSpecPath string, appSpec any) error {
	resolvedPath, err := s.ResolvePath(root, appSpecPath)
	if err != nil {
		return err
	}

	content, err := json.MarshalIndent(appSpec, "", "  ")
	if err != nil {
		return fmt.Errorf("encode app spec: %w", err)
	}
	content = append(content, '\n')

	if err := statefs.AtomicWriteFile(resolvedPath, content, defaultFileMode); err != nil {
		return fmt.Errorf("write app spec: %w", err)
	}
	return nil
}

func isEmptyJSONValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case bool:
		return !typed
	case string:
		return typed == ""
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	case float64:
		return typed == 0
	default:
		return false
	}
}

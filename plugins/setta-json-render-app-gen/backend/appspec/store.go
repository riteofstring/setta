package appspec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const defaultFileMode = 0o644
const defaultProviderPluginID = "setta-json-render-app-gen"

type Store struct {
	pluginID string
}

func ForPlugin(pluginID string) Store {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		trimmedPluginID = defaultProviderPluginID
	}
	return Store{pluginID: trimmedPluginID}
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

func RootPath() string {
	return ForPlugin("").RootPath()
}

func JoinPath(name string) string {
	return ForPlugin("").JoinPath(name)
}

func DefaultPath() string {
	return ForPlugin("").DefaultPath()
}

func ResolvePath(root string, appSpecPath string) (string, error) {
	return ForPlugin("").ResolvePath(root, appSpecPath)
}

func NormalizePath(root string, appSpecPath string) (string, error) {
	return ForPlugin("").NormalizePath(root, appSpecPath)
}

func Read(root string, appSpecPath string) (any, error) {
	return ForPlugin("").Read(root, appSpecPath)
}

func Write(root string, appSpecPath string, appSpec any) error {
	return ForPlugin("").Write(root, appSpecPath, appSpec)
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

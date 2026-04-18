package plugins

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const pluginManifestFileName = "setta.plugin.json"

func NormalizePluginID(raw string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if normalized == "" {
		return "", fmt.Errorf("%w: plugin id must be non-empty", ErrPluginIDInvalid)
	}
	first := normalized[0]
	if !isASCIIAlphaNumeric(first) {
		return "", fmt.Errorf("%w: plugin id must start with an alphanumeric character", ErrPluginIDInvalid)
	}
	for index := 0; index < len(normalized); index++ {
		char := normalized[index]
		if isASCIIAlphaNumeric(char) || char == '-' || char == '_' || char == '.' {
			continue
		}
		return "", fmt.Errorf("%w: plugin id may contain only alphanumeric characters, '-', '_', and '.'", ErrPluginIDInvalid)
	}
	return normalized, nil
}

func LoadPluginManifest(pluginRoot string, expectedPluginID string) (PluginManifest, error) {
	manifestPath := filepath.Join(pluginRoot, pluginManifestFileName)
	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		return PluginManifest{}, err
	}
	normalizedExpectedPluginID, err := NormalizePluginID(expectedPluginID)
	if err != nil {
		return PluginManifest{}, fmt.Errorf("%w: %v", ErrPluginManifestInvalid, err)
	}
	if manifest.ID != normalizedExpectedPluginID {
		return PluginManifest{}, fmt.Errorf("%w: manifest id %q does not match plugin root %q", ErrPluginManifestInvalid, manifest.ID, expectedPluginID)
	}
	return manifest, nil
}

func loadPluginManifestFile(manifestPath string) (PluginManifest, error) {
	manifest, err := readStrictJSONFile[PluginManifest](manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return PluginManifest{}, fmt.Errorf("%w: %s", ErrPluginManifestNotFound, manifestPath)
		}
		return PluginManifest{}, fmt.Errorf("%w: decode %s: %v", ErrPluginManifestInvalid, manifestPath, err)
	}
	if manifest.SchemaVersion != 1 {
		return PluginManifest{}, fmt.Errorf("%w: %d", ErrPluginManifestUnsupported, manifest.SchemaVersion)
	}
	normalizedPluginID, err := NormalizePluginID(manifest.ID)
	if err != nil {
		return PluginManifest{}, fmt.Errorf("%w: %v", ErrPluginManifestInvalid, err)
	}
	manifest.ID = normalizedPluginID
	manifest.Name = strings.TrimSpace(manifest.Name)
	if manifest.Name == "" {
		return PluginManifest{}, fmt.Errorf("%w: plugin name is required for %s", ErrPluginManifestInvalid, manifest.ID)
	}
	manifest.Version = strings.TrimSpace(manifest.Version)
	if manifest.Version == "" {
		return PluginManifest{}, fmt.Errorf("%w: plugin version is required for %s", ErrPluginManifestInvalid, manifest.ID)
	}
	manifest.SettaVersionRange = strings.TrimSpace(manifest.SettaVersionRange)
	if manifest.SettaVersionRange == "" {
		manifest.SettaVersionRange = ">=0.0.0"
	}
	if manifest.Capabilities == nil {
		manifest.Capabilities = []string{}
	}
	return manifest, nil
}

func ResolvePluginBackendEntrypoint(pluginRoot string, manifest PluginManifest) (string, error) {
	if manifest.Backend == nil {
		return "", fmt.Errorf("%w: %s", ErrPluginManifestInvalid, manifest.ID)
	}
	entrypoint := strings.TrimSpace(manifest.Backend.Entrypoint)
	if entrypoint == "" {
		return "", fmt.Errorf("%w: plugin backend entrypoint is required for %s", ErrPluginManifestInvalid, manifest.ID)
	}
	return resolveManifestRegularFile(pluginRoot, entrypoint, "plugin backend entrypoint")
}

func ValidatePluginManifestPaths(pluginRoot string, manifest PluginManifest) error {
	if err := validatePluginBackendPaths(pluginRoot, manifest); err != nil {
		return err
	}
	if err := validatePluginFrontendPaths(pluginRoot, manifest); err != nil {
		return err
	}
	if err := validatePluginContentPaths(pluginRoot, manifest); err != nil {
		return err
	}
	return validateOptionalManifestJSONObjectFile(pluginRoot, manifest.ConfigSchemaPath, "plugin config schema")
}

func validatePluginBackendPaths(pluginRoot string, manifest PluginManifest) error {
	if manifest.Backend == nil {
		return nil
	}
	_, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest)
	return err
}

func validatePluginFrontendPaths(pluginRoot string, manifest PluginManifest) error {
	if manifest.Frontend == nil {
		return nil
	}
	if err := validateRequiredManifestRegularFile(pluginRoot, manifest.Frontend.Entrypoint, "plugin frontend entrypoint", manifest.ID); err != nil {
		return err
	}
	return validateOptionalManifestRegularFile(pluginRoot, manifest.Frontend.Style, "plugin frontend style")
}

func validatePluginContentPaths(pluginRoot string, manifest PluginManifest) error {
	if manifest.Content == nil {
		return nil
	}
	if err := validateOptionalManifestDirectory(pluginRoot, manifest.Content.BlueprintsDir, "plugin content blueprintsDir"); err != nil {
		return err
	}
	if err := validateOptionalManifestDirectory(pluginRoot, manifest.Content.ProjectTemplatesDir, "plugin content projectTemplatesDir"); err != nil {
		return err
	}
	return validateOptionalManifestDirectory(pluginRoot, manifest.Content.PromptsDir, "plugin content promptsDir")
}

func validateRequiredManifestRegularFile(pluginRoot string, relativePath string, label string, pluginID string) error {
	if strings.TrimSpace(relativePath) == "" {
		return fmt.Errorf("%w: %s is required for %s", ErrPluginManifestInvalid, label, pluginID)
	}
	return validateOptionalManifestRegularFile(pluginRoot, relativePath, label)
}

func validateOptionalManifestRegularFile(pluginRoot string, relativePath string, label string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	_, err := resolveManifestRegularFile(pluginRoot, relativePath, label)
	return err
}

func validateOptionalManifestJSONObjectFile(pluginRoot string, relativePath string, label string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	resolvedPath, err := resolveManifestRegularFile(pluginRoot, relativePath, label)
	if err != nil {
		return err
	}
	_, err = readManifestJSONObjectFile(resolvedPath)
	return err
}

func validateOptionalManifestDirectory(pluginRoot string, relativePath string, label string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	_, err := resolveManifestDirectory(pluginRoot, relativePath, label)
	return err
}

func resolveManifestRegularFile(pluginRoot string, relativePath string, label string) (string, error) {
	resolvedPath, err := statefs.ResolveWithinRoot(pluginRoot, relativePath, label)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrPluginManifestInvalid, err)
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %s", ErrPluginManifestInvalid, resolvedPath)
		}
		return "", fmt.Errorf("stat %s %s: %w", label, resolvedPath, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: %s", ErrPluginManifestInvalid, resolvedPath)
	}
	return resolvedPath, nil
}

func resolveManifestDirectory(pluginRoot string, relativePath string, label string) (string, error) {
	resolvedPath, err := statefs.ResolveWithinRoot(pluginRoot, relativePath, label)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrPluginManifestInvalid, err)
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %s", ErrPluginManifestInvalid, resolvedPath)
		}
		return "", fmt.Errorf("stat %s %s: %w", label, resolvedPath, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: %s", ErrPluginManifestInvalid, resolvedPath)
	}
	return resolvedPath, nil
}

func readStrictJSONFile[T any](path string) (T, error) {
	var value T
	content, err := os.ReadFile(path)
	if err != nil {
		return value, err
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, &strictJSONFileError{err: err}
	}
	if decoder.More() {
		return value, &strictJSONFileError{err: fmt.Errorf("trailing JSON content")}
	}
	return value, nil
}

func readManifestJSONObjectFile(path string) (map[string]any, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("%w: invalid JSON in %s: %v", ErrPluginManifestInvalid, path, err)
	}
	value, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%w: %s must contain a JSON object", ErrPluginManifestInvalid, path)
	}
	return value, nil
}

type strictJSONFileError struct {
	err error
}

func (e *strictJSONFileError) Error() string {
	if e == nil || e.err == nil {
		return ""
	}
	return e.err.Error()
}

func (e *strictJSONFileError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

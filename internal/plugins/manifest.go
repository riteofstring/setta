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
	if normalizedPluginID != expectedPluginID {
		return PluginManifest{}, fmt.Errorf("%w: manifest id %q does not match plugin root %q", ErrPluginManifestInvalid, normalizedPluginID, expectedPluginID)
	}
	manifest.ID = normalizedPluginID
	manifest.Name = strings.TrimSpace(manifest.Name)
	if manifest.Name == "" {
		return PluginManifest{}, fmt.Errorf("%w: plugin name is required for %s", ErrPluginManifestInvalid, expectedPluginID)
	}
	manifest.Version = strings.TrimSpace(manifest.Version)
	if manifest.Version == "" {
		return PluginManifest{}, fmt.Errorf("%w: plugin version is required for %s", ErrPluginManifestInvalid, expectedPluginID)
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
	if manifest.Backend != nil {
		if _, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest); err != nil {
			return err
		}
	}
	if manifest.Frontend != nil {
		entrypoint := strings.TrimSpace(manifest.Frontend.Entrypoint)
		if entrypoint == "" {
			return fmt.Errorf("%w: plugin frontend entrypoint is required for %s", ErrPluginManifestInvalid, manifest.ID)
		}
		if _, err := resolveManifestRegularFile(pluginRoot, entrypoint, "plugin frontend entrypoint"); err != nil {
			return err
		}
		style := strings.TrimSpace(manifest.Frontend.Style)
		if style != "" {
			if _, err := resolveManifestRegularFile(pluginRoot, style, "plugin frontend style"); err != nil {
				return err
			}
		}
	}
	if manifest.Content != nil {
		if strings.TrimSpace(manifest.Content.BlueprintsDir) != "" {
			if _, err := resolveManifestDirectory(pluginRoot, manifest.Content.BlueprintsDir, "plugin content blueprintsDir"); err != nil {
				return err
			}
		}
		if strings.TrimSpace(manifest.Content.ProjectTemplatesDir) != "" {
			if _, err := resolveManifestDirectory(pluginRoot, manifest.Content.ProjectTemplatesDir, "plugin content projectTemplatesDir"); err != nil {
				return err
			}
		}
		if strings.TrimSpace(manifest.Content.PromptsDir) != "" {
			if _, err := resolveManifestDirectory(pluginRoot, manifest.Content.PromptsDir, "plugin content promptsDir"); err != nil {
				return err
			}
		}
	}
	if strings.TrimSpace(manifest.ConfigSchemaPath) != "" {
		if _, err := resolveManifestRegularFile(pluginRoot, manifest.ConfigSchemaPath, "plugin config schema"); err != nil {
			return err
		}
	}
	return nil
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
		return value, err
	}
	if decoder.More() {
		return value, fmt.Errorf("trailing JSON content")
	}
	return value, nil
}

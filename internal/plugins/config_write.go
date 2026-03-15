package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

type ConfigWriteOptions struct {
	PluginID string
	Config   map[string]any
}

type PluginConfigValidationResult struct {
	OK bool `json:"ok"`
}

type PluginConfigWriteResult struct {
	PluginID   string                       `json:"pluginId"`
	Config     map[string]any               `json:"config"`
	Validation PluginConfigValidationResult `json:"validation"`
}

func (s *Service) WriteConfig(_ context.Context, options ConfigWriteOptions) (PluginConfigWriteResult, error) {
	if s == nil {
		return PluginConfigWriteResult{}, ErrWorkspaceRootRequired
	}
	if options.Config == nil {
		return PluginConfigWriteResult{}, newServiceError(ServiceErrorCodeConfigInvalid, "Plugin config must be a JSON object.")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, err := s.resolveHighestPrecedenceEntryLocked(options.PluginID)
	if err != nil {
		return PluginConfigWriteResult{}, err
	}
	if entry.Manifest == nil {
		return PluginConfigWriteResult{}, newServiceError(ServiceErrorCodeConfigInvalid, "Plugin manifest missing for plugin: %s", options.PluginID)
	}
	if err := validatePluginConfig(entry, options.Config); err != nil {
		return PluginConfigWriteResult{}, err
	}

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return PluginConfigWriteResult{}, err
	}
	if state.PluginConfigByID == nil {
		state.PluginConfigByID = map[string]any{}
	}
	savedConfig := cloneStringAnyMap(options.Config)
	state.PluginConfigByID[pluginConfigKey(entry.PluginID, entry.Scope)] = savedConfig
	if err := s.store.SavePluginsState(state); err != nil {
		return PluginConfigWriteResult{}, err
	}
	if _, err := s.rescanLocked(); err != nil {
		return PluginConfigWriteResult{}, err
	}

	return PluginConfigWriteResult{
		PluginID: entry.PluginID,
		Config:   cloneStringAnyMap(savedConfig),
		Validation: PluginConfigValidationResult{
			OK: true,
		},
	}, nil
}

func validatePluginConfig(entry DiscoveredPlugin, config map[string]any) error {
	if entry.Manifest == nil {
		return newServiceError(ServiceErrorCodeConfigInvalid, "Plugin manifest missing for plugin: %s", entry.PluginID)
	}

	trimmedSchemaPath := strings.TrimSpace(entry.Manifest.ConfigSchemaPath)
	if trimmedSchemaPath == "" {
		return nil
	}

	schemaPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedSchemaPath, "plugin config schema")
	if err != nil {
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema path: %s", trimmedSchemaPath)
	}

	schema, err := loadPluginConfigSchema(schemaPath)
	if err != nil {
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema JSON: %s", schemaPath)
	}

	resolved, err := schema.Resolve(&jsonschema.ResolveOptions{
		BaseURI: schemaFileURI(schemaPath),
		Loader:  pluginConfigSchemaLoader(),
	})
	if err != nil {
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema JSON: %s", schemaPath)
	}
	if err := resolved.Validate(config); err != nil {
		return newServiceError(ServiceErrorCodeConfigInvalid, "Invalid plugin config for %s: %s", entry.PluginID, err.Error())
	}
	return nil
}

func loadPluginConfigSchema(schemaPath string) (*jsonschema.Schema, error) {
	payload, err := os.ReadFile(schemaPath)
	if err != nil {
		return nil, err
	}
	var schema jsonschema.Schema
	if err := json.Unmarshal(payload, &schema); err != nil {
		return nil, err
	}
	return &schema, nil
}

func pluginConfigSchemaLoader() jsonschema.Loader {
	return func(uri *url.URL) (*jsonschema.Schema, error) {
		if uri == nil {
			return nil, fmt.Errorf("plugin config schema URI is required")
		}
		resolvedURI := *uri
		resolvedURI.Fragment = ""
		if resolvedURI.Scheme != "" && resolvedURI.Scheme != "file" {
			return nil, fmt.Errorf("plugin config schema refs must use local files: %s", resolvedURI.String())
		}
		schemaPath := resolvedURI.Path
		if strings.TrimSpace(schemaPath) == "" {
			return nil, fmt.Errorf("plugin config schema path is empty")
		}
		return loadPluginConfigSchema(schemaPath)
	}
}

func schemaFileURI(schemaPath string) string {
	return (&url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(schemaPath),
	}).String()
}

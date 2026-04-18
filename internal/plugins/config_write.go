package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

type ConfigWriteOptions struct {
	PluginID                          string
	Config                            map[string]any
	ExpectedCurrentConfig             map[string]any
	SkipWriteIfCurrentMatchesExpected bool
}

type PluginConfigValidationResult struct {
	OK bool `json:"ok"`
}

type PluginConfigWriteResponse struct {
	PluginID   string                       `json:"pluginId"`
	Config     map[string]any               `json:"config"`
	Validation PluginConfigValidationResult `json:"validation"`
}

type preparedPluginConfigWrite struct {
	entry         DiscoveredPlugin
	state         PluginsStateFile
	currentConfig map[string]any
	requested     map[string]any
}

func (s *Service) WriteConfig(_ context.Context, options ConfigWriteOptions) (PluginConfigWriteResponse, error) {
	if s == nil {
		return PluginConfigWriteResponse{}, ErrWorkspaceRootRequired
	}
	if options.Config == nil {
		return PluginConfigWriteResponse{}, newServiceError(ServiceErrorCodeConfigInvalid, "Plugin config must be a JSON object.")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	prepared, err := s.preparePluginConfigWriteLocked(options)
	if err != nil {
		return PluginConfigWriteResponse{}, err
	}

	if response, skipWrite := pluginConfigWriteNoopResponse(prepared, options.SkipWriteIfCurrentMatchesExpected); skipWrite {
		return response, nil
	}

	return s.persistPluginConfigWriteLocked(prepared)
}

func (s *Service) preparePluginConfigWriteLocked(options ConfigWriteOptions) (preparedPluginConfigWrite, error) {
	entry, err := s.resolveHighestPrecedenceEntryLocked(options.PluginID)
	if err != nil {
		return preparedPluginConfigWrite{}, err
	}
	if entry.Manifest == nil {
		return preparedPluginConfigWrite{}, invalidPluginConfigWriteTargetError(entry, options.PluginID)
	}
	if err := validatePluginConfig(entry, options.Config); err != nil {
		return preparedPluginConfigWrite{}, err
	}

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return preparedPluginConfigWrite{}, err
	}
	currentConfig := runtimeCurrentConfig(entry, &state)
	if expectedCurrentConfig := cloneStringAnyMap(options.ExpectedCurrentConfig); expectedCurrentConfig != nil && !reflect.DeepEqual(currentConfig, expectedCurrentConfig) {
		return preparedPluginConfigWrite{}, newServiceError(
			ServiceErrorCodeConfigChanged,
			"Plugin %s config changed since pre-write validation.",
			entry.PluginID,
		)
	}

	return preparedPluginConfigWrite{
		entry:         entry,
		state:         state,
		currentConfig: currentConfig,
		requested:     cloneStringAnyMap(options.Config),
	}, nil
}

func pluginConfigWriteNoopResponse(
	prepared preparedPluginConfigWrite,
	skipWriteIfCurrentMatchesExpected bool,
) (PluginConfigWriteResponse, bool) {
	if skipWriteIfCurrentMatchesExpected {
		return pluginConfigWriteResponse(prepared.entry.PluginID, prepared.currentConfig), true
	}
	if reflect.DeepEqual(prepared.currentConfig, prepared.requested) {
		return pluginConfigWriteResponse(prepared.entry.PluginID, prepared.currentConfig), true
	}
	return PluginConfigWriteResponse{}, false
}

func invalidPluginConfigWriteTargetError(entry DiscoveredPlugin, pluginID string) error {
	for _, entryError := range entry.Errors {
		if entryError.Code != string(ServiceErrorCodeConfigSchemaInvalid) {
			continue
		}
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "%s", entryError.Message)
	}
	return newServiceError(
		ServiceErrorCodeConfigInvalid,
		"Plugin manifest missing for plugin: %s",
		pluginID,
	)
}

func (s *Service) persistPluginConfigWriteLocked(prepared preparedPluginConfigWrite) (PluginConfigWriteResponse, error) {
	if prepared.state.PluginConfigByID == nil {
		prepared.state.PluginConfigByID = map[string]any{}
	}
	prepared.state.PluginConfigByID[pluginConfigKey(prepared.entry.PluginID, prepared.entry.Scope)] = prepared.requested
	if err := s.store.SavePluginsState(prepared.state); err != nil {
		return PluginConfigWriteResponse{}, err
	}
	if _, err := s.rescanLocked(); err != nil {
		return PluginConfigWriteResponse{}, err
	}
	return pluginConfigWriteResponse(prepared.entry.PluginID, prepared.requested), nil
}

func pluginConfigWriteResponse(pluginID string, config map[string]any) PluginConfigWriteResponse {
	return PluginConfigWriteResponse{
		PluginID: pluginID,
		Config:   cloneStringAnyMap(config),
		Validation: PluginConfigValidationResult{
			OK: true,
		},
	}
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

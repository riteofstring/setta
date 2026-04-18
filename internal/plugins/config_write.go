package plugins

import (
	"context"
	"encoding/json"
	"errors"
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
	entry                  DiscoveredPlugin
	state                  PluginsStateFile
	configKey              string
	currentConfig          map[string]any
	currentPersistedConfig any
	hadCurrentPersisted    bool
	requested              map[string]any
}

type committedPluginConfigWrite struct {
	response  PluginConfigWriteResponse
	rollback  pluginConfigWriteRollback
	persisted bool
}

type pluginConfigWriteRollback struct {
	configKey         string
	writtenConfig     any
	previousConfig    any
	hadPreviousConfig bool
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

	committed, err := s.writeConfigLocked(options)
	if err != nil {
		return PluginConfigWriteResponse{}, err
	}
	return committed.response, nil
}

func (s *Service) WriteConfigTransactional(
	_ context.Context,
	options ConfigWriteOptions,
	apply func(PluginConfigWriteResponse) error,
) (PluginConfigWriteResponse, error) {
	if s == nil {
		return PluginConfigWriteResponse{}, ErrWorkspaceRootRequired
	}
	if options.Config == nil {
		return PluginConfigWriteResponse{}, newServiceError(ServiceErrorCodeConfigInvalid, "Plugin config must be a JSON object.")
	}

	s.mu.Lock()
	committed, err := s.writeConfigLocked(options)
	s.mu.Unlock()
	if err != nil {
		return PluginConfigWriteResponse{}, err
	}
	if !committed.persisted || apply == nil {
		return committed.response, nil
	}

	if err := apply(committed.response); err != nil {
		if rollbackErr := s.rollbackPluginConfigWrite(committed.rollback); rollbackErr != nil {
			return PluginConfigWriteResponse{}, errors.Join(err, fmt.Errorf("restore previous plugin config: %w", rollbackErr))
		}
		return PluginConfigWriteResponse{}, err
	}
	return committed.response, nil
}

func (s *Service) writeConfigLocked(options ConfigWriteOptions) (committedPluginConfigWrite, error) {
	prepared, err := s.preparePluginConfigWriteLocked(options)
	if err != nil {
		return committedPluginConfigWrite{}, err
	}

	if response, skipWrite := pluginConfigWriteNoopResponse(prepared, options.SkipWriteIfCurrentMatchesExpected); skipWrite {
		return committedPluginConfigWrite{response: response}, nil
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
	configKey := pluginConfigKeyForEntry(entry)
	currentPersistedConfig, hadCurrentPersisted := state.PluginConfigByID[configKey]
	currentConfig := runtimeCurrentConfig(entry, &state)
	if expectedCurrentConfig := cloneStringAnyMap(options.ExpectedCurrentConfig); expectedCurrentConfig != nil && !reflect.DeepEqual(currentConfig, expectedCurrentConfig) {
		return preparedPluginConfigWrite{}, newServiceError(
			ServiceErrorCodeConfigChanged,
			"Plugin %s config changed since pre-write validation.",
			entry.PluginID,
		)
	}

	return preparedPluginConfigWrite{
		entry:                  entry,
		state:                  state,
		configKey:              configKey,
		currentConfig:          currentConfig,
		currentPersistedConfig: cloneJSONValue(currentPersistedConfig),
		hadCurrentPersisted:    hadCurrentPersisted,
		requested:              cloneStringAnyMap(options.Config),
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

func (s *Service) persistPluginConfigWriteLocked(prepared preparedPluginConfigWrite) (committedPluginConfigWrite, error) {
	rollback := pluginConfigWriteRollback{
		configKey:         prepared.configKey,
		writtenConfig:     cloneJSONValue(prepared.requested),
		previousConfig:    cloneJSONValue(prepared.currentPersistedConfig),
		hadPreviousConfig: prepared.hadCurrentPersisted,
	}
	nextState := normalizePluginsStateFile(prepared.state)
	nextState.PluginConfigByID[prepared.configKey] = cloneJSONValue(prepared.requested)
	if err := s.store.SavePluginsState(nextState); err != nil {
		return committedPluginConfigWrite{}, err
	}
	if _, err := s.rescanLocked(); err != nil {
		if rollbackErr := s.rollbackPluginConfigWriteLocked(rollback); rollbackErr != nil {
			return committedPluginConfigWrite{}, errors.Join(err, fmt.Errorf("restore previous plugin config: %w", rollbackErr))
		}
		return committedPluginConfigWrite{}, err
	}
	return committedPluginConfigWrite{
		response:  pluginConfigWriteResponse(prepared.entry.PluginID, prepared.requested),
		rollback:  rollback,
		persisted: true,
	}, nil
}

func (s *Service) rollbackPluginConfigWrite(rollback pluginConfigWriteRollback) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rollbackPluginConfigWriteLocked(rollback)
}

func (s *Service) rollbackPluginConfigWriteLocked(rollback pluginConfigWriteRollback) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	nextState, err := applyPluginConfigWriteRollback(normalizePluginsStateFile(state), rollback)
	if err != nil {
		return err
	}
	if err := s.store.SavePluginsState(nextState); err != nil {
		return err
	}
	_, err = s.rescanLocked()
	return err
}

func applyPluginConfigWriteRollback(state PluginsStateFile, rollback pluginConfigWriteRollback) (PluginsStateFile, error) {
	currentConfig, hasCurrentConfig := state.PluginConfigByID[rollback.configKey]
	if !hasCurrentConfig || !reflect.DeepEqual(currentConfig, rollback.writtenConfig) {
		return PluginsStateFile{}, fmt.Errorf("plugin config changed before rollback for %s", rollback.configKey)
	}

	if rollback.hadPreviousConfig {
		state.PluginConfigByID[rollback.configKey] = cloneJSONValue(rollback.previousConfig)
		return state, nil
	}

	delete(state.PluginConfigByID, rollback.configKey)
	return state, nil
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

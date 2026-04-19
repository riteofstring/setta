package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"reflect"
	"runtime"
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

type PluginConfigSnapshot struct {
	Config map[string]any
	Exists bool
}

type preparedPluginConfigWrite struct {
	entry         DiscoveredPlugin
	state         PluginsStateFile
	currentConfig map[string]any
	requested     map[string]any
}

func (s *Service) CurrentConfigSnapshot(pluginID string) (PluginConfigSnapshot, error) {
	if s == nil {
		return PluginConfigSnapshot{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, _, snapshot, err := s.loadPluginConfigSnapshotLocked(pluginID)
	if err != nil {
		return PluginConfigSnapshot{}, err
	}
	return snapshot, nil
}

func (s *Service) RestoreConfig(pluginID string, snapshot PluginConfigSnapshot, expectedCurrentConfig map[string]any) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, state, currentSnapshot, err := s.loadPluginConfigSnapshotLocked(pluginID)
	if err != nil {
		return err
	}
	if expectedCurrentConfig != nil && !reflect.DeepEqual(currentSnapshot.Config, cloneStringAnyMap(expectedCurrentConfig)) {
		return newServiceError(
			ServiceErrorCodeConfigChanged,
			"Plugin %s config changed since rollback validation.",
			entry.PluginID,
		)
	}

	applyPluginConfigSnapshot(&state, entry, snapshot)
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	_, err = s.rescanLocked()
	return err
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
	entry, state, currentSnapshot, err := s.loadPluginConfigSnapshotLocked(options.PluginID)
	if err != nil {
		return preparedPluginConfigWrite{}, err
	}
	if entry.Manifest == nil {
		return preparedPluginConfigWrite{}, newServiceError(
			ServiceErrorCodeConfigInvalid,
			"Plugin manifest missing for plugin: %s",
			options.PluginID,
		)
	}
	if err := validatePluginConfig(entry, options.Config); err != nil {
		return preparedPluginConfigWrite{}, err
	}
	if expectedCurrentConfig := cloneStringAnyMap(options.ExpectedCurrentConfig); expectedCurrentConfig != nil && !reflect.DeepEqual(currentSnapshot.Config, expectedCurrentConfig) {
		return preparedPluginConfigWrite{}, newServiceError(
			ServiceErrorCodeConfigChanged,
			"Plugin %s config changed since pre-write validation.",
			entry.PluginID,
		)
	}

	return preparedPluginConfigWrite{
		entry:         entry,
		state:         state,
		currentConfig: currentSnapshot.Config,
		requested:     cloneStringAnyMap(options.Config),
	}, nil
}

func (s *Service) loadPluginConfigSnapshotLocked(pluginID string) (DiscoveredPlugin, PluginsStateFile, PluginConfigSnapshot, error) {
	entry, err := s.resolveHighestPrecedenceEntryLocked(pluginID)
	if err != nil {
		return DiscoveredPlugin{}, PluginsStateFile{}, PluginConfigSnapshot{}, err
	}
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoveredPlugin{}, PluginsStateFile{}, PluginConfigSnapshot{}, err
	}
	return entry, state, pluginConfigSnapshot(entry, &state), nil
}

func pluginConfigSnapshot(entry DiscoveredPlugin, pluginsState *PluginsStateFile) PluginConfigSnapshot {
	if pluginsState == nil || pluginsState.PluginConfigByID == nil {
		return PluginConfigSnapshot{Config: map[string]any{}}
	}
	rawValue, ok := pluginsState.PluginConfigByID[pluginConfigKey(entry.PluginID, entry.Scope)]
	if !ok || rawValue == nil {
		return PluginConfigSnapshot{Config: map[string]any{}}
	}
	currentConfig, ok := rawValue.(map[string]any)
	if !ok {
		return PluginConfigSnapshot{Config: map[string]any{}}
	}
	return PluginConfigSnapshot{
		Config: cloneStringAnyMap(currentConfig),
		Exists: true,
	}
}

func applyPluginConfigSnapshot(state *PluginsStateFile, entry DiscoveredPlugin, snapshot PluginConfigSnapshot) {
	if state == nil {
		return
	}
	key := pluginConfigKey(entry.PluginID, entry.Scope)
	if !snapshot.Exists {
		if state.PluginConfigByID != nil {
			delete(state.PluginConfigByID, key)
			if len(state.PluginConfigByID) == 0 {
				state.PluginConfigByID = nil
			}
		}
		return
	}
	if state.PluginConfigByID == nil {
		state.PluginConfigByID = map[string]any{}
	}
	state.PluginConfigByID[key] = cloneStringAnyMap(snapshot.Config)
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

func (s *Service) persistPluginConfigWriteLocked(prepared preparedPluginConfigWrite) (PluginConfigWriteResponse, error) {
	applyPluginConfigSnapshot(&prepared.state, prepared.entry, PluginConfigSnapshot{
		Config: prepared.requested,
		Exists: true,
	})
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
	document, ok, err := loadPluginConfigSchemaDocument(entry)
	if err != nil {
		if !ok {
			return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema path for %s", entry.PluginID)
		}
		return invalidPluginConfigSchemaError(document.Path)
	}
	if !ok {
		return nil
	}
	if err := document.Resolved.Validate(config); err != nil {
		return newServiceError(ServiceErrorCodeConfigInvalid, "Invalid plugin config for %s: %s", entry.PluginID, err.Error())
	}
	return nil
}

func loadPluginConfigSchema(schemaPath string) (*jsonschema.Schema, error) {
	payload, err := loadPluginConfigSchemaPayload(schemaPath)
	if err != nil {
		return nil, err
	}
	return parsePluginConfigSchema(payload)
}

func parsePluginConfigSchema(payload []byte) (*jsonschema.Schema, error) {
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
		schemaPath, err := pluginConfigSchemaPathFromFileURI(&resolvedURI)
		if err != nil {
			return nil, err
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

func pluginConfigSchemaPathFromFileURI(uri *url.URL) (string, error) {
	return pluginConfigSchemaPathFromFileURIForOS(uri, runtime.GOOS)
}

func pluginConfigSchemaPathFromFileURIForOS(uri *url.URL, goos string) (string, error) {
	if uri == nil {
		return "", fmt.Errorf("plugin config schema URI is required")
	}
	if uri.Scheme != "" && uri.Scheme != "file" {
		return "", fmt.Errorf("plugin config schema refs must use local files: %s", uri.String())
	}

	host := strings.TrimSpace(uri.Host)
	if strings.EqualFold(host, "localhost") {
		host = ""
	}
	path := uri.Path

	if goos == "windows" {
		switch {
		case host != "":
			path = `\\` + host + windowsPathFromSlash(path)
		case len(path) >= 3 && path[0] == '/' && path[2] == ':':
			path = windowsPathFromSlash(path[1:])
		default:
			path = windowsPathFromSlash(path)
		}
	} else {
		if host != "" {
			path = "//" + host + path
		}
		path = filepath.FromSlash(path)
	}

	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("plugin config schema path is empty")
	}
	return filepath.Clean(path), nil
}

func windowsPathFromSlash(path string) string {
	return strings.ReplaceAll(path, "/", `\`)
}

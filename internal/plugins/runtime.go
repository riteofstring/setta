package plugins

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/config"
	"setta/internal/statefs"
)

const (
	pluginListSchemaVersion    = 1
	pluginRuntimeSchemaVersion = 1

	redactedSourcePathPrefix         = "[redacted]"
	redactedCanonicalSourceKeyPrefix = "redacted:"
)

type AssetURLBuilder func(pluginID string, relativePath string, sourceDigestSHA256 *string) string

type RuntimeOptions struct {
	AssetURLBuilder AssetURLBuilder
}

type FrontendDescriptor struct {
	EntrypointURL *string `json:"entrypointUrl"`
	StyleURL      *string `json:"styleUrl"`
}

type ContentDescriptor struct {
	HasBlueprints       bool `json:"hasBlueprints"`
	HasProjectTemplates bool `json:"hasProjectTemplates"`
	HasPrompts          bool `json:"hasPrompts"`
}

type ConfigDescriptor struct {
	HasSchema                 bool           `json:"hasSchema"`
	SchemaJSON                map[string]any `json:"schemaJson"`
	SchemaJSONDigestSHA256    *string        `json:"schemaJsonDigestSha256"`
	CurrentConfig             map[string]any `json:"currentConfig"`
	CurrentConfigDigestSHA256 *string        `json:"currentConfigDigestSha256"`
}

type ListEntry struct {
	PluginID              string                  `json:"pluginId"`
	Name                  string                  `json:"name"`
	Version               string                  `json:"version"`
	SourceScope           PluginScope             `json:"sourceScope"`
	SourceScopeLabel      string                  `json:"sourceScopeLabel"`
	SourceManager         PluginSourceManager     `json:"sourceManager"`
	SourceManagerHint     *string                 `json:"sourceManagerHint"`
	CanonicalSourceKey    string                  `json:"canonicalSourceKey"`
	SourceDigestSHA256    *string                 `json:"sourceDigestSha256"`
	Frontend              FrontendDescriptor      `json:"frontend"`
	Content               ContentDescriptor       `json:"content"`
	Config                ConfigDescriptor        `json:"config"`
	EffectiveCapabilities []string                `json:"effectiveCapabilities"`
	EnablementSource      *PluginEnablementSource `json:"enablementSource"`
	RestartRequired       bool                    `json:"restartRequired"`
}

type ListResponse struct {
	SchemaVersion     int               `json:"schemaVersion"`
	ServerMode        config.Mode       `json:"serverMode"`
	RestartCapability RestartCapability `json:"restartCapability"`
	Plugins           []ListEntry       `json:"plugins"`
}

type RuntimeResponse struct {
	SchemaVersion int            `json:"schemaVersion"`
	List          ListResponse   `json:"list"`
	Status        StatusResponse `json:"status"`
}

func (s *Service) Runtime(options RuntimeOptions) (RuntimeResponse, error) {
	if s == nil {
		return RuntimeResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return RuntimeResponse{}, err
	}

	redactSourceDetails := shouldRedactRuntimeSourceDetails(snapshot.ServerMode)
	redactConfigDetails := shouldRedactRuntimeConfigDetails(snapshot.ServerMode)
	redactedSourcePathByPath := map[string]string{}
	if redactSourceDetails {
		redactedSourcePathByPath = buildRedactedSourcePathMap(snapshot.Plugins)
	}

	var pluginsState *PluginsStateFile
	if !redactConfigDetails {
		state, err := s.store.LoadPluginsState()
		if err != nil {
			return RuntimeResponse{}, err
		}
		pluginsState = &state
	}

	restartCapability := s.restartCapability()
	statusRuntimeDetails := s.loadStatusRuntimeDetailsLocked(snapshot)
	return RuntimeResponse{
		SchemaVersion: pluginRuntimeSchemaVersion,
		List: ListResponse{
			SchemaVersion:     pluginListSchemaVersion,
			ServerMode:        snapshot.ServerMode,
			RestartCapability: restartCapability,
			Plugins: s.buildRuntimeListEntries(
				snapshot.Plugins,
				pluginsState,
				options.AssetURLBuilder,
				redactSourceDetails,
				redactConfigDetails,
			),
		},
		Status: buildRuntimeStatusResponse(
			snapshot,
			restartCapability,
			redactSourceDetails,
			redactedSourcePathByPath,
			statusRuntimeDetails,
		),
	}, nil
}

func (s *Service) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}

	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", pluginID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return "", err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", trimmedPluginID)
	}

	resolvedPath, err := statefs.ResolveWithinRoot(entry.SourcePath, assetPath, "plugin asset path")
	if err != nil {
		return "", newServiceError(ServiceErrorCodeAssetInvalidPath, "Invalid plugin asset path: %s", strings.TrimSpace(assetPath))
	}

	allowedRoots, err := pluginFrontendAssetRoots(entry)
	if err != nil {
		return "", err
	}

	allowed := false
	for _, root := range allowedRoots {
		if _, err := statefs.EnsureWithinRoot(root, resolvedPath, "plugin asset path"); err == nil {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin asset not found: %s", strings.TrimSpace(assetPath))
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin asset not found: %s", strings.TrimSpace(assetPath))
		}
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin asset not found: %s", strings.TrimSpace(assetPath))
	}
	return resolvedPath, nil
}

func (s *Service) buildRuntimeListEntries(
	entries []DiscoveredPlugin,
	pluginsState *PluginsStateFile,
	assetURLBuilder AssetURLBuilder,
	redactSourceDetails bool,
	redactConfigDetails bool,
) []ListEntry {
	listEntries := make([]ListEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}

		listEntries = append(listEntries, ListEntry{
			PluginID:           entry.PluginID,
			Name:               entry.Name,
			Version:            entry.Version,
			SourceScope:        entry.Scope,
			SourceScopeLabel:   string(entry.Scope),
			SourceManager:      entry.SourceManager,
			SourceManagerHint:  optionalStringPointer(entry.SourceManagerHint),
			CanonicalSourceKey: runtimeCanonicalSourceKey(entry, redactSourceDetails),
			SourceDigestSHA256: cloneOptionalString(entry.SourceDigestSHA256),
			Frontend:           buildRuntimeFrontendDescriptor(entry, assetURLBuilder),
			Content:            buildRuntimeContentDescriptor(entry),
			Config: buildRuntimeConfigDescriptor(
				entry,
				pluginsState,
				redactConfigDetails,
			),
			EffectiveCapabilities: append([]string(nil), entry.EffectiveCapabilities...),
			EnablementSource:      cloneOptionalEnablementSource(entry.EnablementSource),
			RestartRequired:       entry.RestartRequired,
		})
	}
	return listEntries
}

func buildRuntimeFrontendDescriptor(entry DiscoveredPlugin, assetURLBuilder AssetURLBuilder) FrontendDescriptor {
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return FrontendDescriptor{}
	}
	return FrontendDescriptor{
		EntrypointURL: buildRuntimeAssetURL(entry, entry.Manifest.Frontend.Entrypoint, assetURLBuilder),
		StyleURL:      buildRuntimeAssetURL(entry, entry.Manifest.Frontend.Style, assetURLBuilder),
	}
}

func buildRuntimeAssetURL(entry DiscoveredPlugin, relativePath string, assetURLBuilder AssetURLBuilder) *string {
	if assetURLBuilder == nil || entry.Manifest == nil {
		return nil
	}
	trimmedPath := strings.TrimSpace(relativePath)
	if trimmedPath == "" {
		return nil
	}
	resolvedPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedPath, "plugin asset path")
	if err != nil {
		return nil
	}
	normalizedRelativePath, err := filepath.Rel(entry.SourcePath, resolvedPath)
	if err != nil {
		return nil
	}
	normalizedRelativePath = filepath.ToSlash(normalizedRelativePath)
	if normalizedRelativePath == "." || strings.HasPrefix(normalizedRelativePath, "../") {
		return nil
	}
	urlValue := assetURLBuilder(entry.PluginID, normalizedRelativePath, cloneOptionalString(entry.SourceDigestSHA256))
	if strings.TrimSpace(urlValue) == "" {
		return nil
	}
	return &urlValue
}

func buildRuntimeContentDescriptor(entry DiscoveredPlugin) ContentDescriptor {
	if entry.Manifest == nil || entry.Manifest.Content == nil {
		return ContentDescriptor{}
	}
	return ContentDescriptor{
		HasBlueprints:       runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.BlueprintsDir),
		HasProjectTemplates: runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.ProjectTemplatesDir),
		HasPrompts:          runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.PromptsDir),
	}
}

func buildRuntimeConfigDescriptor(entry DiscoveredPlugin, pluginsState *PluginsStateFile, redactConfigDetails bool) ConfigDescriptor {
	hasSchema, schemaJSON, schemaDigest := buildRuntimeConfigSchemaDescriptor(entry)
	if redactConfigDetails {
		return ConfigDescriptor{
			HasSchema:                 hasSchema,
			SchemaJSON:                nil,
			SchemaJSONDigestSHA256:    nil,
			CurrentConfig:             map[string]any{},
			CurrentConfigDigestSHA256: nil,
		}
	}

	currentConfig := runtimeCurrentConfig(entry, pluginsState)
	return ConfigDescriptor{
		HasSchema:                 hasSchema,
		SchemaJSON:                schemaJSON,
		SchemaJSONDigestSHA256:    schemaDigest,
		CurrentConfig:             currentConfig,
		CurrentConfigDigestSHA256: runtimeDigestJSONValue(currentConfig),
	}
}

func buildRuntimeConfigSchemaDescriptor(entry DiscoveredPlugin) (bool, map[string]any, *string) {
	if entry.Manifest == nil {
		return false, nil, nil
	}
	trimmedPath := strings.TrimSpace(entry.Manifest.ConfigSchemaPath)
	if trimmedPath == "" {
		return false, nil, nil
	}
	schemaPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedPath, "plugin config schema")
	if err != nil {
		return false, nil, nil
	}
	payload, err := os.ReadFile(schemaPath)
	if err != nil {
		return true, nil, nil
	}
	var schemaJSON map[string]any
	if err := json.Unmarshal(payload, &schemaJSON); err != nil {
		return true, nil, nil
	}
	return true, schemaJSON, runtimeDigestJSONValue(schemaJSON)
}

func runtimeCurrentConfig(entry DiscoveredPlugin, pluginsState *PluginsStateFile) map[string]any {
	if pluginsState == nil || pluginsState.PluginConfigByID == nil {
		return map[string]any{}
	}
	rawValue, ok := pluginsState.PluginConfigByID[pluginConfigKey(entry.PluginID, entry.Scope)]
	if !ok || rawValue == nil {
		return map[string]any{}
	}
	currentConfig, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloneStringAnyMap(currentConfig)
}

func runtimeDirectoryHasFiles(pluginRoot string, relativePath string) bool {
	trimmedPath := strings.TrimSpace(relativePath)
	if trimmedPath == "" {
		return false
	}
	resolvedPath, err := resolveManifestDirectory(pluginRoot, trimmedPath, "plugin content directory")
	if err != nil {
		return false
	}
	foundFile := false
	_ = filepath.Walk(resolvedPath, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		foundFile = true
		return filepath.SkipAll
	})
	return foundFile
}

func runtimeDigestJSONValue(value any) *string {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	sum := sha256.Sum256(payload)
	digest := hex.EncodeToString(sum[:])
	return &digest
}

func buildRuntimeStatusResponse(
	snapshot DiscoverySnapshot,
	capability RestartCapability,
	redactSourceDetails bool,
	redactedSourcePathByPath map[string]string,
	detailsByPluginID map[string]pluginStatusRuntimeDetails,
) StatusResponse {
	entries := make([]StatusEntry, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		entries = append(entries, buildRuntimeStatusEntry(entry, redactSourceDetails, redactedSourcePathByPath, detailsByPluginID[entry.PluginID]))
	}
	return StatusResponse{
		SchemaVersion:     pluginStatusSchemaVersion,
		ServerMode:        snapshot.ServerMode,
		RestartCapability: capability,
		Plugins:           entries,
	}
}

func buildRuntimeStatusEntry(entry DiscoveredPlugin, redactSourceDetails bool, redactedSourcePathByPath map[string]string, details pluginStatusRuntimeDetails) StatusEntry {
	statusEntry := statusEntryFromDiscoveredPlugin(entry, details)
	if !redactSourceDetails {
		return statusEntry
	}

	statusEntry.SourcePath = redactedSourcePathByPath[entry.SourcePath]
	statusEntry.CanonicalSourceKey = redactedCanonicalSourceKey(
		entry.PluginID,
		entry.Scope,
		entry.SourceManager,
		entry.SourcePath,
	)
	if entry.ShadowedBySourcePath != "" {
		shadowedValue := redactedSourcePathByPath[entry.ShadowedBySourcePath]
		statusEntry.ShadowedBySourcePath = &shadowedValue
	}
	return statusEntry
}

func buildRedactedSourcePathMap(entries []DiscoveredPlugin) map[string]string {
	sourceEntryByPath := make(map[string]DiscoveredPlugin, len(entries))
	pathsToRedact := map[string]struct{}{}
	for _, entry := range entries {
		sourceEntryByPath[entry.SourcePath] = entry
		pathsToRedact[entry.SourcePath] = struct{}{}
		if entry.ShadowedBySourcePath != "" {
			pathsToRedact[entry.ShadowedBySourcePath] = struct{}{}
		}
	}

	redacted := make(map[string]string, len(pathsToRedact))
	for sourcePath := range pathsToRedact {
		entry, ok := sourceEntryByPath[sourcePath]
		if !ok {
			redacted[sourcePath] = redactedUnknownSourcePath(sourcePath)
			continue
		}
		redacted[sourcePath] = redactedSourcePath(entry.PluginID, entry.Scope, entry.SourceManager, entry.SourcePath)
	}
	return redacted
}

func shouldRedactRuntimeSourceDetails(mode config.Mode) bool {
	return mode == config.ModeShare || mode == config.ModeApp
}

func shouldRedactRuntimeConfigDetails(mode config.Mode) bool {
	return mode == config.ModeShare || mode == config.ModeApp
}

func runtimeCanonicalSourceKey(entry DiscoveredPlugin, redactSourceDetails bool) string {
	if !redactSourceDetails {
		return entry.CanonicalSourceKey
	}
	return redactedCanonicalSourceKey(entry.PluginID, entry.Scope, entry.SourceManager, entry.SourcePath)
}

func redactedCanonicalSourceKey(pluginID string, scope PluginScope, sourceManager PluginSourceManager, sourcePath string) string {
	token := redactedSourceToken(sourcePath)
	return redactedCanonicalSourceKeyPrefix + string(scope) + ":" + string(sourceManager) + ":" + pluginID + ":" + token
}

func redactedSourcePath(pluginID string, scope PluginScope, sourceManager PluginSourceManager, sourcePath string) string {
	token := redactedSourceToken(sourcePath)
	return redactedSourcePathPrefix + ":" + string(scope) + ":" + string(sourceManager) + ":" + pluginID + ":" + token
}

func redactedUnknownSourcePath(sourcePath string) string {
	return redactedSourcePathPrefix + ":unknown:" + redactedSourceToken(sourcePath)
}

func redactedSourceToken(sourcePath string) string {
	sum := sha256.Sum256([]byte(sourcePath))
	return hex.EncodeToString(sum[:])[:12]
}

func pluginFrontendAssetRoots(entry DiscoveredPlugin) ([]string, error) {
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
	}

	roots := map[string]struct{}{}
	resolvedEntrypoint, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Frontend.Entrypoint, "plugin frontend entrypoint")
	if err != nil {
		return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
	}
	roots[filepath.Dir(resolvedEntrypoint)] = struct{}{}
	if strings.TrimSpace(entry.Manifest.Frontend.Style) != "" {
		resolvedStyle, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Frontend.Style, "plugin frontend style")
		if err != nil {
			return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
		}
		roots[filepath.Dir(resolvedStyle)] = struct{}{}
	}

	values := make([]string, 0, len(roots))
	for root := range roots {
		values = append(values, root)
	}
	sort.Strings(values)
	return values, nil
}

func findRuntimeActiveEntry(entries []DiscoveredPlugin, pluginID string) (DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID != pluginID {
			continue
		}
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		return entry, true
	}
	return DiscoveredPlugin{}, false
}

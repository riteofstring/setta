package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/config"
	"setta/internal/statefs"
)

const pluginManifestFileName = "setta.plugin.json"

var (
	ErrFilesystemWorkerSpecResolverWorkspaceRootRequired = errors.New("plugins: workspace root is required")
	ErrFilesystemWorkerSpecResolverSettaFilesRootNeeded  = errors.New("plugins: setta files root is required")
	ErrFilesystemWorkerSpecResolverSettaHomeRequired     = errors.New("plugins: setta home is required")
	ErrFilesystemWorkerSpecResolverPythonBinaryRequired  = errors.New("plugins: worker python binary is required")
	ErrFilesystemWorkerSpecResolverServerModeRequired    = errors.New("plugins: server mode is required")
	ErrFilesystemWorkerSpecResolverServerModeInvalid     = errors.New("plugins: server mode is unsupported")
	ErrFilesystemWorkerSpecResolverTargetIDRequired      = errors.New("plugins: plugin codegen target id is required")
	ErrFilesystemWorkerSpecResolverTargetIDInvalid       = errors.New("plugins: plugin codegen target id must be <plugin-id>:<local-id>")
	ErrFilesystemWorkerSpecResolverPluginNotFound        = errors.New("plugins: plugin codegen target plugin was not found")
	ErrFilesystemWorkerSpecResolverPluginDisabled        = errors.New("plugins: plugin codegen target plugin is disabled")
	ErrFilesystemWorkerSpecResolverPluginRootInvalid     = errors.New("plugins: plugin root must be a directory")
	ErrFilesystemWorkerSpecResolverManifestNotFound      = errors.New("plugins: plugin manifest was not found")
	ErrFilesystemWorkerSpecResolverManifestInvalid       = errors.New("plugins: plugin manifest is invalid")
	ErrFilesystemWorkerSpecResolverManifestUnsupported   = errors.New("plugins: plugin manifest schema version is unsupported")
	ErrFilesystemWorkerSpecResolverBackendRequired       = errors.New("plugins: plugin backend entrypoint is required")
	ErrFilesystemWorkerSpecResolverCodegenCapability     = errors.New("plugins: registerCodegenTarget capability is required")
)

var (
	resolverKnownPluginCapabilities = map[string]struct{}{
		"registerSectionKinds":         {},
		"registerPane":                 {},
		"registerCommand":              {},
		"registerTopNavBarItem":        {},
		"registerContextMenu":          {},
		"readProjectState":             {},
		"subscribeProjectState":        {},
		"emitListenerEvents":           {},
		"registerMcpTools":             {},
		"registerLanguageServer":       {},
		"registerExternalAgentAdapter": {},
		"registerCodegenTarget":        {},
		"registerRouter":               {},
		"registerListenerEndpoint":     {},
		"registerStaticDir":            {},
		"writeWorkspacePlugins":        {},
	}
	resolverHostBlockedCapabilities = map[string]struct{}{
		"registerContextMenu": {},
	}
	resolverModeAllowedCapabilities = map[config.Mode]map[string]struct{}{
		config.ModeIDE:      resolverKnownPluginCapabilities,
		config.ModeLauncher: resolverKnownPluginCapabilities,
		config.ModeShare: {
			"registerSectionKinds":  {},
			"registerPane":          {},
			"registerCommand":       {},
			"registerTopNavBarItem": {},
			"readProjectState":      {},
			"subscribeProjectState": {},
			"emitListenerEvents":    {},
		},
		config.ModeApp: {
			"registerSectionKinds":  {},
			"registerPane":          {},
			"registerCommand":       {},
			"registerTopNavBarItem": {},
			"readProjectState":      {},
			"subscribeProjectState": {},
			"emitListenerEvents":    {},
		},
	}
)

type FilesystemWorkerSpecResolverOptions struct {
	WorkspaceRoot    string
	SettaFilesRoot   string
	SettaHome        string
	RuntimeProvider  WorkerRuntimeProvider
	PythonBinary     string
	ServerMode       config.Mode
	Environment      []string
	WorkingDirectory string
}

type FilesystemWorkerSpecResolver struct {
	workspacePluginsRoot  string
	settaFilesPluginsRoot string
	globalPluginsRoot     string
	pluginsStatePath      string
	pluginsGlobalState    string
	runtimeProvider       WorkerRuntimeProvider
	serverMode            config.Mode
}

type filesystemPluginManifest struct {
	SchemaVersion     int                               `json:"schemaVersion"`
	ID                string                            `json:"id"`
	Name              string                            `json:"name"`
	Version           string                            `json:"version"`
	SettaVersionRange string                            `json:"settaVersionRange"`
	EnabledByDefault  bool                              `json:"enabledByDefault"`
	Backend           *filesystemPluginBackendManifest  `json:"backend,omitempty"`
	Frontend          *filesystemPluginFrontendManifest `json:"frontend,omitempty"`
	Content           *filesystemPluginContentManifest  `json:"content,omitempty"`
	ConfigSchemaPath  string                            `json:"configSchemaPath,omitempty"`
	Capabilities      []string                          `json:"capabilities"`
}

type filesystemPluginBackendManifest struct {
	Entrypoint string `json:"entrypoint"`
}

type filesystemPluginFrontendManifest struct {
	Entrypoint string `json:"entrypoint"`
	Style      string `json:"style,omitempty"`
}

type filesystemPluginContentManifest struct {
	BlueprintsDir       string `json:"blueprintsDir,omitempty"`
	ProjectTemplatesDir string `json:"projectTemplatesDir,omitempty"`
	PromptsDir          string `json:"promptsDir,omitempty"`
}

type filesystemPluginsState struct {
	EnabledPluginIDs  []string `json:"enabledPluginIds"`
	DisabledPluginIDs []string `json:"disabledPluginIds"`
}

type filesystemPluginsGlobalState struct {
	AutoEnabledPluginIDs []string `json:"autoEnabledPluginIds"`
}

type filesystemPluginScope string

const (
	filesystemPluginScopeWorkspace  filesystemPluginScope = "workspace"
	filesystemPluginScopeSettaFiles filesystemPluginScope = "setta_files"
	filesystemPluginScopeGlobal     filesystemPluginScope = "global"
)

func NewFilesystemWorkerSpecResolver(options FilesystemWorkerSpecResolverOptions) (*FilesystemWorkerSpecResolver, error) {
	workspaceRoot, err := statefs.NormalizePath(options.WorkspaceRoot, "")
	if err != nil {
		return nil, ErrFilesystemWorkerSpecResolverWorkspaceRootRequired
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, ErrFilesystemWorkerSpecResolverSettaFilesRootNeeded
	}
	settaHome, err := statefs.NormalizePath(options.SettaHome, "")
	if err != nil {
		return nil, ErrFilesystemWorkerSpecResolverSettaHomeRequired
	}

	serverMode := options.ServerMode
	if serverMode == "" {
		return nil, ErrFilesystemWorkerSpecResolverServerModeRequired
	}
	if _, ok := resolverModeAllowedCapabilities[serverMode]; !ok {
		return nil, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverServerModeInvalid, serverMode)
	}

	runtimeProvider := options.RuntimeProvider
	if runtimeProvider == nil {
		pythonBinary := strings.TrimSpace(options.PythonBinary)
		if pythonBinary == "" {
			return nil, ErrFilesystemWorkerSpecResolverPythonBinaryRequired
		}

		workingDirectory := ""
		if strings.TrimSpace(options.WorkingDirectory) != "" {
			workingDirectory, err = statefs.NormalizePath(options.WorkingDirectory, "")
			if err != nil {
				return nil, fmt.Errorf("resolve plugin worker working directory: %w", err)
			}
		}

		runtimeProvider = WorkerRuntimeProviderFunc(func(context.Context) (WorkerRuntime, error) {
			return WorkerRuntime{
				PythonBinary:     pythonBinary,
				Environment:      append([]string(nil), options.Environment...),
				WorkingDirectory: workingDirectory,
			}, nil
		})
	}

	return &FilesystemWorkerSpecResolver{
		workspacePluginsRoot:  filepath.Join(workspaceRoot, ".setta_plugins"),
		settaFilesPluginsRoot: filepath.Join(settaFilesRoot, "plugins"),
		globalPluginsRoot:     filepath.Join(settaHome, "plugins"),
		pluginsStatePath:      filepath.Join(settaFilesRoot, "plugins_state.json"),
		pluginsGlobalState:    filepath.Join(settaHome, "plugins_global_state.json"),
		runtimeProvider:       runtimeProvider,
		serverMode:            serverMode,
	}, nil
}

func (r *FilesystemWorkerSpecResolver) ResolvePluginCodegenWorkerSpec(ctx context.Context, targetID string) (BackendWorkerSpec, error) {
	if r == nil {
		return BackendWorkerSpec{}, ErrFilesystemWorkerSpecResolverPluginNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return BackendWorkerSpec{}, err
	}

	pluginID, _, err := parsePluginCodegenTargetID(targetID)
	if err != nil {
		return BackendWorkerSpec{}, err
	}

	pluginsState, err := r.loadPluginsState()
	if err != nil {
		return BackendWorkerSpec{}, err
	}
	globalState, err := r.loadPluginsGlobalState()
	if err != nil {
		return BackendWorkerSpec{}, err
	}

	for _, candidate := range r.scopeCandidates(pluginID) {
		if err := ctx.Err(); err != nil {
			return BackendWorkerSpec{}, err
		}

		info, err := os.Stat(candidate.root)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return BackendWorkerSpec{}, fmt.Errorf("stat plugin root %s: %w", candidate.root, err)
		}
		if !info.IsDir() {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginRootInvalid, candidate.root)
		}

		manifest, entrypoint, err := loadFilesystemPluginManifest(candidate.root, pluginID)
		if err != nil {
			return BackendWorkerSpec{}, err
		}
		if !resolveFilesystemPluginEnabled(pluginID, candidate.scope, manifest.EnabledByDefault, pluginsState, globalState) {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginDisabled, pluginID)
		}

		requestedCapabilities, effectiveCapabilities, err := resolveFilesystemPluginCapabilities(manifest.Capabilities, r.serverMode)
		if err != nil {
			return BackendWorkerSpec{}, err
		}
		if !containsCapability(effectiveCapabilities, CapabilityRegisterCodegenTarget) {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverCodegenCapability, pluginID)
		}

		runtime, err := r.runtimeProvider.ResolveWorkerRuntime(ctx)
		if err != nil {
			return BackendWorkerSpec{}, err
		}

		return BackendWorkerSpec{
			PythonBinary:          runtime.PythonBinary,
			PluginID:              manifest.ID,
			PluginVersion:         manifest.Version,
			PluginRoot:            candidate.root,
			Entrypoint:            entrypoint,
			ServerMode:            string(r.serverMode),
			RequestedCapabilities: requestedCapabilities,
			EffectiveCapabilities: effectiveCapabilities,
			Environment:           runtime.Environment,
			WorkingDirectory:      runtime.WorkingDirectory,
		}, nil
	}

	return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginNotFound, pluginID)
}

type filesystemPluginScopeCandidate struct {
	scope filesystemPluginScope
	root  string
}

func (r *FilesystemWorkerSpecResolver) scopeCandidates(pluginID string) []filesystemPluginScopeCandidate {
	return []filesystemPluginScopeCandidate{
		{
			scope: filesystemPluginScopeWorkspace,
			root:  filepath.Join(r.workspacePluginsRoot, pluginID),
		},
		{
			scope: filesystemPluginScopeSettaFiles,
			root:  filepath.Join(r.settaFilesPluginsRoot, pluginID),
		},
		{
			scope: filesystemPluginScopeGlobal,
			root:  filepath.Join(r.globalPluginsRoot, pluginID),
		},
	}
}

func parsePluginCodegenTargetID(targetID string) (string, string, error) {
	trimmedTargetID := strings.TrimSpace(targetID)
	if trimmedTargetID == "" {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDRequired
	}
	pluginID, localTargetID, ok := strings.Cut(trimmedTargetID, ":")
	if !ok {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDInvalid
	}
	normalizedPluginID, err := normalizeFilesystemPluginID(pluginID)
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(localTargetID) == "" {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDInvalid
	}
	return normalizedPluginID, strings.TrimSpace(localTargetID), nil
}

func loadFilesystemPluginManifest(pluginRoot string, expectedPluginID string) (filesystemPluginManifest, string, error) {
	manifestPath := filepath.Join(pluginRoot, pluginManifestFileName)
	manifest, err := loadJSONFile[filesystemPluginManifest](manifestPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return filesystemPluginManifest{}, "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverManifestNotFound, manifestPath)
		}
		return filesystemPluginManifest{}, "", err
	}
	if manifest.SchemaVersion != 1 {
		return filesystemPluginManifest{}, "", fmt.Errorf("%w: %d", ErrFilesystemWorkerSpecResolverManifestUnsupported, manifest.SchemaVersion)
	}

	normalizedPluginID, err := normalizeFilesystemPluginID(manifest.ID)
	if err != nil {
		return filesystemPluginManifest{}, "", err
	}
	if normalizedPluginID != expectedPluginID {
		return filesystemPluginManifest{}, "", fmt.Errorf("%w: manifest id %q does not match plugin root %q", ErrFilesystemWorkerSpecResolverManifestInvalid, normalizedPluginID, expectedPluginID)
	}
	manifest.ID = normalizedPluginID
	manifest.Name = strings.TrimSpace(manifest.Name)
	if manifest.Name == "" {
		return filesystemPluginManifest{}, "", fmt.Errorf("%w: plugin name is required for %s", ErrFilesystemWorkerSpecResolverManifestInvalid, expectedPluginID)
	}
	manifest.Version = strings.TrimSpace(manifest.Version)
	if manifest.Version == "" {
		return filesystemPluginManifest{}, "", fmt.Errorf("%w: plugin version is required for %s", ErrFilesystemWorkerSpecResolverManifestInvalid, expectedPluginID)
	}

	entrypoint, err := resolveFilesystemBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return filesystemPluginManifest{}, "", err
	}
	return manifest, entrypoint, nil
}

func resolveFilesystemBackendEntrypoint(pluginRoot string, manifest filesystemPluginManifest) (string, error) {
	if manifest.Backend == nil {
		return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, manifest.ID)
	}
	entrypoint := strings.TrimSpace(manifest.Backend.Entrypoint)
	if entrypoint == "" {
		return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, manifest.ID)
	}
	resolvedEntrypoint, err := statefs.ResolveWithinRoot(pluginRoot, entrypoint, "plugin backend entrypoint")
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrFilesystemWorkerSpecResolverBackendRequired, err)
	}
	info, err := os.Stat(resolvedEntrypoint)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, resolvedEntrypoint)
		}
		return "", fmt.Errorf("stat plugin backend entrypoint %s: %w", resolvedEntrypoint, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, resolvedEntrypoint)
	}
	return resolvedEntrypoint, nil
}

func normalizeFilesystemPluginID(raw string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if normalized == "" {
		return "", fmt.Errorf("%w: plugin id must be non-empty", ErrFilesystemWorkerSpecResolverManifestInvalid)
	}
	first := normalized[0]
	if !isASCIIAlphaNumeric(first) {
		return "", fmt.Errorf("%w: plugin id must start with an alphanumeric character", ErrFilesystemWorkerSpecResolverManifestInvalid)
	}
	for index := 0; index < len(normalized); index++ {
		char := normalized[index]
		if isASCIIAlphaNumeric(char) || char == '-' || char == '_' || char == '.' {
			continue
		}
		return "", fmt.Errorf("%w: plugin id may contain only alphanumeric characters, '-', '_', and '.'", ErrFilesystemWorkerSpecResolverManifestInvalid)
	}
	return normalized, nil
}

func resolveFilesystemPluginCapabilities(requested []string, serverMode config.Mode) ([]string, []string, error) {
	allowed, ok := resolverModeAllowedCapabilities[serverMode]
	if !ok {
		return nil, nil, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverServerModeInvalid, serverMode)
	}

	normalizedRequested := make([]string, 0, len(requested))
	seen := make(map[string]struct{}, len(requested))
	for _, capability := range requested {
		trimmedCapability := strings.TrimSpace(capability)
		if trimmedCapability == "" {
			return nil, nil, fmt.Errorf("%w: manifest capability must be non-empty", ErrFilesystemWorkerSpecResolverManifestInvalid)
		}
		if _, ok := resolverKnownPluginCapabilities[trimmedCapability]; !ok {
			return nil, nil, fmt.Errorf("%w: unknown capability %q", ErrFilesystemWorkerSpecResolverManifestInvalid, trimmedCapability)
		}
		if _, exists := seen[trimmedCapability]; exists {
			return nil, nil, fmt.Errorf("%w: duplicate capability %q", ErrFilesystemWorkerSpecResolverManifestInvalid, trimmedCapability)
		}
		seen[trimmedCapability] = struct{}{}
		normalizedRequested = append(normalizedRequested, trimmedCapability)
	}

	effective := make([]string, 0, len(normalizedRequested))
	for _, capability := range normalizedRequested {
		if _, blocked := resolverHostBlockedCapabilities[capability]; blocked {
			continue
		}
		if _, ok := allowed[capability]; ok {
			effective = append(effective, capability)
		}
	}
	return normalizedRequested, effective, nil
}

func resolveFilesystemPluginEnabled(
	pluginID string,
	scope filesystemPluginScope,
	manifestEnabledByDefault bool,
	pluginsState filesystemPluginsState,
	globalState filesystemPluginsGlobalState,
) bool {
	if containsString(pluginsState.DisabledPluginIDs, pluginID) {
		return false
	}
	if containsString(pluginsState.EnabledPluginIDs, pluginID) {
		return true
	}
	if scope == filesystemPluginScopeGlobal && containsString(globalState.AutoEnabledPluginIDs, pluginID) {
		return true
	}
	return manifestEnabledByDefault
}

func (r *FilesystemWorkerSpecResolver) loadPluginsState() (filesystemPluginsState, error) {
	state, err := loadOptionalJSONFile[filesystemPluginsState](r.pluginsStatePath)
	if err != nil {
		return filesystemPluginsState{}, fmt.Errorf("load plugins state: %w", err)
	}
	return state, nil
}

func (r *FilesystemWorkerSpecResolver) loadPluginsGlobalState() (filesystemPluginsGlobalState, error) {
	state, err := loadOptionalJSONFile[filesystemPluginsGlobalState](r.pluginsGlobalState)
	if err != nil {
		return filesystemPluginsGlobalState{}, fmt.Errorf("load plugins global state: %w", err)
	}
	return state, nil
}

func loadOptionalJSONFile[T any](path string) (T, error) {
	value, err := loadJSONFile[T](path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			var zero T
			return zero, nil
		}
		return *new(T), err
	}
	return value, nil
}

func loadJSONFile[T any](path string) (T, error) {
	var value T
	content, err := os.ReadFile(path)
	if err != nil {
		return value, err
	}

	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, fmt.Errorf("%w: decode %s: %v", ErrFilesystemWorkerSpecResolverManifestInvalid, path, err)
	}
	if decoder.More() {
		return value, fmt.Errorf("%w: decode %s: trailing JSON content", ErrFilesystemWorkerSpecResolverManifestInvalid, path)
	}
	return value, nil
}

func containsCapability(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func isASCIIAlphaNumeric(value byte) bool {
	return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') || (value >= '0' && value <= '9')
}

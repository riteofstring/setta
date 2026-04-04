package mcpx

import (
	"context"
	"errors"

	"setta/internal/plugins"
	"setta/internal/tools"
)

const pluginSourceUnverifiedWarning = "Source is unverified. Install only from trusted owners."

type pluginInstallResponse struct {
	PluginID              string                     `json:"pluginId"`
	Version               string                     `json:"version"`
	SourceScope           plugins.PluginScope        `json:"sourceScope"`
	SourceScopeLabel      string                     `json:"sourceScopeLabel"`
	SourcePath            string                     `json:"sourcePath"`
	CanonicalSourceKey    string                     `json:"canonicalSourceKey"`
	SourceDigestSHA256    *string                    `json:"sourceDigestSha256"`
	RequestedCapabilities []string                   `json:"requestedCapabilities"`
	TrustStatus           string                     `json:"trustStatus"`
	TrustWarning          string                     `json:"trustWarning"`
	Components            []string                   `json:"components"`
	State                 plugins.PluginRuntimeState `json:"state"`
	RestartRequired       bool                       `json:"restartRequired"`
}

type pluginUninstallResponse struct {
	PluginID         string              `json:"pluginId"`
	RemovedFromScope plugins.PluginScope `json:"removedFromScope"`
	RestartRequired  bool                `json:"restartRequired"`
}

type pluginUpdateResponse struct {
	PluginID           string  `json:"pluginId"`
	FromVersion        string  `json:"fromVersion"`
	ToVersion          string  `json:"toVersion"`
	SourceDigestSHA256 *string `json:"sourceDigestSha256"`
	RestartRequired    bool    `json:"restartRequired"`
}

type pluginRollbackResponse struct {
	PluginID           string  `json:"pluginId"`
	RestoredVersion    string  `json:"restoredVersion"`
	SourceDigestSHA256 *string `json:"sourceDigestSha256"`
	RestartRequired    bool    `json:"restartRequired"`
}

type pluginsRescanResponse struct {
	SchemaVersion    int    `json:"schemaVersion"`
	ServerMode       string `json:"serverMode"`
	InstalledPlugins int    `json:"installedPlugins"`
	ActivePlugins    int    `json:"activePlugins"`
}

func newInstallPluginHandler(server *Server) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		sourceSpec, err := readRequiredStringArgument(arguments, "sourceSpec")
		if err != nil {
			return nil, err
		}
		scope, err := readOptionalPluginScopeArgument(arguments, "scope")
		if err != nil {
			return nil, err
		}
		installer, err := readOptionalPluginInstallerArgument(arguments, "installer")
		if err != nil {
			return nil, err
		}
		enable, err := readPluginBoolArgumentWithDefault(arguments, "enable", true)
		if err != nil {
			return nil, err
		}
		force, err := readPluginBoolArgumentWithDefault(arguments, "force", false)
		if err != nil {
			return nil, err
		}

		runtime, err := requirePluginMutations(server)
		if err != nil {
			return nil, err
		}

		result, err := runtime.Install(ctx, plugins.InstallOptions{
			SourceSpec: sourceSpec,
			Scope:      scope,
			Installer:  installer,
			Enable:     enable,
			Force:      force,
		})
		if err != nil {
			return nil, normalizePluginMutationToolError(err)
		}
		return buildPluginInstallResponse(result), nil
	}
}

func newUninstallPluginHandler(server *Server) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		pluginID, err := readRequiredStringArgument(arguments, "pluginId")
		if err != nil {
			return nil, err
		}
		scope, err := readOptionalPluginScopeArgument(arguments, "scope")
		if err != nil {
			return nil, err
		}

		runtime, err := requirePluginMutations(server)
		if err != nil {
			return nil, err
		}

		result, err := runtime.Uninstall(ctx, plugins.UninstallOptions{
			PluginID: pluginID,
			Scope:    scope,
		})
		if err != nil {
			return nil, normalizePluginMutationToolError(err)
		}
		return pluginUninstallResponse{
			PluginID:         result.PluginID,
			RemovedFromScope: result.RemovedFromScope,
			RestartRequired:  result.RestartRequired,
		}, nil
	}
}

func newRescanPluginsHandler(server *Server) tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		runtime, err := requirePluginMutations(server)
		if err != nil {
			return nil, err
		}
		snapshot, err := runtime.Rescan()
		if err != nil {
			return nil, normalizePluginMutationToolError(err)
		}
		return pluginsRescanResponse{
			SchemaVersion:    1,
			ServerMode:       string(snapshot.ServerMode),
			InstalledPlugins: snapshot.InstalledPlugins,
			ActivePlugins:    snapshot.ActivePlugins,
		}, nil
	}
}

func newUpdatePluginHandler(server *Server) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		pluginID, err := readRequiredStringArgument(arguments, "pluginId")
		if err != nil {
			return nil, err
		}
		scope, err := readOptionalPluginScopeArgument(arguments, "scope")
		if err != nil {
			return nil, err
		}
		to, err := readOptionalNonBlankStringArgument(arguments, "to")
		if err != nil {
			return nil, err
		}

		runtime, err := requirePluginMutations(server)
		if err != nil {
			return nil, err
		}

		result, err := runtime.Update(ctx, plugins.UpdateOptions{
			PluginID: pluginID,
			Scope:    scope,
			To:       to,
		})
		if err != nil {
			return nil, normalizePluginMutationToolError(err)
		}
		return pluginUpdateResponse{
			PluginID:           result.PluginID,
			FromVersion:        result.FromVersion,
			ToVersion:          result.ToVersion,
			SourceDigestSHA256: cloneStringPtr(result.SourceDigestSHA256),
			RestartRequired:    result.RestartRequired,
		}, nil
	}
}

func newRollbackPluginHandler(server *Server) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		pluginID, err := readRequiredStringArgument(arguments, "pluginId")
		if err != nil {
			return nil, err
		}
		scope, err := readOptionalPluginScopeArgument(arguments, "scope")
		if err != nil {
			return nil, err
		}

		runtime, err := requirePluginMutations(server)
		if err != nil {
			return nil, err
		}

		result, err := runtime.Rollback(ctx, plugins.RollbackOptions{
			PluginID: pluginID,
			Scope:    scope,
		})
		if err != nil {
			return nil, normalizePluginMutationToolError(err)
		}
		return pluginRollbackResponse{
			PluginID:           result.PluginID,
			RestoredVersion:    result.RestoredVersion,
			SourceDigestSHA256: cloneStringPtr(result.SourceDigestSHA256),
			RestartRequired:    result.RestartRequired,
		}, nil
	}
}

func requirePluginMutations(server *Server) (pluginMutationProvider, error) {
	if server == nil || server.pluginMutations == nil {
		return nil, newToolError("internal_error", "Plugin mutation runtime is unavailable.")
	}
	return server.pluginMutations, nil
}

func readOptionalPluginScopeArgument(arguments map[string]any, key string) (*plugins.PluginScope, error) {
	value, err := readOptionalNonBlankStringArgument(arguments, key)
	if err != nil {
		return nil, err
	}
	if value == "" {
		return nil, nil
	}
	scope := plugins.PluginScope(value)
	normalized, err := plugins.NormalizeScope(&scope)
	if err != nil {
		return nil, normalizePluginMutationToolError(err)
	}
	return &normalized, nil
}

func readOptionalPluginInstallerArgument(arguments map[string]any, key string) (*plugins.PluginInstallerBackend, error) {
	value, err := readOptionalNonBlankStringArgument(arguments, key)
	if err != nil {
		return nil, err
	}
	if value == "" {
		return nil, nil
	}
	backend := plugins.PluginInstallerBackend(value)
	switch backend {
	case plugins.PluginInstallerBackendAuto, plugins.PluginInstallerBackendPip, plugins.PluginInstallerBackendUV:
		return &backend, nil
	default:
		return nil, newToolError("invalid_arguments", "Invalid plugin installer backend: %q", value)
	}
}

func readPluginBoolArgumentWithDefault(arguments map[string]any, key string, defaultValue bool) (bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return defaultValue, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return value, nil
}

func buildPluginInstallResponse(result plugins.PluginInstallResponse) pluginInstallResponse {
	return pluginInstallResponse{
		PluginID:              result.PluginID,
		Version:               result.Version,
		SourceScope:           result.SourceScope,
		SourceScopeLabel:      string(result.SourceScope),
		SourcePath:            result.SourcePath,
		CanonicalSourceKey:    result.CanonicalSourceKey,
		SourceDigestSHA256:    cloneStringPtr(result.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), result.RequestedCapabilities...),
		TrustStatus:           "unverified",
		TrustWarning:          pluginSourceUnverifiedWarning,
		Components:            append([]string(nil), result.Components...),
		State:                 result.State,
		RestartRequired:       result.RestartRequired,
	}
}

func normalizePluginMutationToolError(err error) error {
	if err == nil {
		return nil
	}
	var serviceErr *plugins.ServiceError
	if errors.As(err, &serviceErr) {
		switch serviceErr.Code {
		case plugins.ServiceErrorCodeSourceFetchFailed:
			return newToolError("internal_error", "%s", err.Error())
		case plugins.ServiceErrorCodeManagedExternally,
			plugins.ServiceErrorCodeNotFound,
			plugins.ServiceErrorCodeRollbackUnavailable,
			plugins.ServiceErrorCodeScopeInvalid,
			plugins.ServiceErrorCodeSourceInvalid,
			plugins.ServiceErrorCodeSourceSchemeUnsupported,
			plugins.ServiceErrorCodeTargetExists,
			plugins.ServiceErrorCodeTargetTraversal,
			plugins.ServiceErrorCodeUninstallScopeRequired,
			plugins.ServiceErrorCodeUpdateUnavailable:
			return newToolError("invalid_arguments", "%s", err.Error())
		default:
			return newToolError("internal_error", "%s", err.Error())
		}
	}
	switch {
	case errors.Is(err, plugins.ErrPluginIDInvalid),
		errors.Is(err, plugins.ErrPluginRootInvalid),
		errors.Is(err, plugins.ErrPluginManifestNotFound),
		errors.Is(err, plugins.ErrPluginManifestInvalid),
		errors.Is(err, plugins.ErrPluginManifestUnsupported):
		return newToolError("invalid_arguments", "%s", err.Error())
	default:
		return newToolError("internal_error", "%s", err.Error())
	}
}

func pluginScopeSchema() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{string(plugins.PluginScopeWorkspace), string(plugins.PluginScopeSettaFiles), string(plugins.PluginScopeGlobal)},
		"description": "Optional plugin scope: workspace, setta_files, or global.",
	}
}

func pluginInstallerSchema() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{string(plugins.PluginInstallerBackendAuto), string(plugins.PluginInstallerBackendPip), string(plugins.PluginInstallerBackendUV)},
		"description": "Optional installer backend: auto, pip, or uv.",
	}
}

func pluginInstallResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pluginId": map[string]any{"type": "string"},
			"version":  map[string]any{"type": "string"},
			"sourceScope": map[string]any{
				"type": "string",
			},
			"sourceScopeLabel": map[string]any{
				"type": "string",
			},
			"sourcePath":         map[string]any{"type": "string"},
			"canonicalSourceKey": map[string]any{"type": "string"},
			"sourceDigestSha256": map[string]any{"type": []string{"string", "null"}},
			"requestedCapabilities": map[string]any{
				"type":  "array",
				"items": map[string]any{"type": "string"},
			},
			"trustStatus":  map[string]any{"type": "string"},
			"trustWarning": map[string]any{"type": "string"},
			"components": map[string]any{
				"type":  "array",
				"items": map[string]any{"type": "string"},
			},
			"state":           map[string]any{"type": "string"},
			"restartRequired": map[string]any{"type": "boolean"},
		},
		"required": []string{
			"pluginId",
			"version",
			"sourceScope",
			"sourceScopeLabel",
			"sourcePath",
			"canonicalSourceKey",
			"requestedCapabilities",
			"trustStatus",
			"trustWarning",
			"components",
			"state",
			"restartRequired",
		},
	}
}

func pluginUninstallResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pluginId": map[string]any{"type": "string"},
			"removedFromScope": map[string]any{
				"type": "string",
			},
			"restartRequired": map[string]any{"type": "boolean"},
		},
		"required": []string{"pluginId", "removedFromScope", "restartRequired"},
	}
}

func pluginUpdateResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pluginId":    map[string]any{"type": "string"},
			"fromVersion": map[string]any{"type": "string"},
			"toVersion":   map[string]any{"type": "string"},
			"sourceDigestSha256": map[string]any{
				"type": []string{"string", "null"},
			},
			"restartRequired": map[string]any{"type": "boolean"},
		},
		"required": []string{"pluginId", "fromVersion", "toVersion", "restartRequired"},
	}
}

func pluginRollbackResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pluginId":        map[string]any{"type": "string"},
			"restoredVersion": map[string]any{"type": "string"},
			"sourceDigestSha256": map[string]any{
				"type": []string{"string", "null"},
			},
			"restartRequired": map[string]any{"type": "boolean"},
		},
		"required": []string{"pluginId", "restoredVersion", "restartRequired"},
	}
}

func pluginsRescanResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"schemaVersion":    map[string]any{"type": "integer"},
			"serverMode":       map[string]any{"type": "string"},
			"installedPlugins": map[string]any{"type": "integer"},
			"activePlugins":    map[string]any{"type": "integer"},
		},
		"required": []string{"schemaVersion", "serverMode", "installedPlugins", "activePlugins"},
	}
}

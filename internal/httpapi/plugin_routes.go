package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
	"setta/internal/plugins"
)

const RoutePluginsRuntime = "/plugins/runtime"
const RoutePluginsRescan = "/plugins/rescan"
const RoutePluginsInstall = "/plugins/install"
const RoutePluginsLink = "/plugins/link"
const RoutePluginsUninstall = "/plugins/uninstall"
const RoutePluginsUpdate = "/plugins/update"
const RoutePluginsRollback = "/plugins/rollback"
const RoutePluginsEnable = "/plugins/enable"
const RoutePluginsDisable = "/plugins/disable"
const RoutePluginsConfig = "/plugins/config"
const RoutePluginsLockWrite = "/plugins/lock/write"
const RoutePluginsLockApply = "/plugins/lock/apply"
const RoutePluginsRestart = "/plugins/restart"
const RoutePluginsAssetWildcard = "/plugins/{pluginId}/*"

type PluginRouteDependencies struct {
	ModePolicy modes.Policy
	Service    PluginRouteService
}

type PluginRootRouteDependencies struct {
	Service        PluginRootRouteService
	Auth           *auth.Service
	TrustedOrigins *frontendorigins.Service
}

type PluginAssetService interface {
	ResolveAssetPath(pluginID string, assetPath string) (string, error)
	ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error)
}

type PluginRootRouteService interface {
	PluginAssetService
	LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error)
	DispatchRegisteredBackendRoute(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error)
}

type PluginRouteService interface {
	PluginRootRouteService
	InvokeRegisteredListenerEndpoint(ctx context.Context, request plugins.BackendListenerEndpointRequest) (any, bool, error)
	Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error)
	GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error)
	ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error)
	WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error
	Rescan() (plugins.DiscoverySnapshot, error)
	Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error)
	Link(options plugins.LinkOptions) (plugins.PluginInstallResponse, error)
	Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error)
	Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error)
	Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error)
	Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error)
	Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error)
	WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error)
	WriteLockfile() (plugins.PluginLockWriteResponse, error)
	ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResponse, error)
	Restart(ctx context.Context) (plugins.PluginRestartResponse, error)
}

type PluginsRescanResponse struct {
	SchemaVersion    int         `json:"schemaVersion"`
	ServerMode       config.Mode `json:"serverMode"`
	InstalledPlugins int         `json:"installedPlugins"`
	ActivePlugins    int         `json:"activePlugins"`
}

type PluginEnableDisableRequest struct {
	PluginID string `json:"pluginId"`
}

type PluginLinkRequest struct {
	LocalPluginRoot string               `json:"localPluginRoot"`
	Scope           *plugins.PluginScope `json:"scope"`
	Enable          *bool                `json:"enable"`
	Force           *bool                `json:"force"`
}

type PluginInstallRequest struct {
	SourceSpec string                          `json:"sourceSpec"`
	Scope      *plugins.PluginScope            `json:"scope"`
	Installer  *plugins.PluginInstallerBackend `json:"installer"`
	Enable     *bool                           `json:"enable"`
	Force      *bool                           `json:"force"`
}

type PluginUninstallRequest struct {
	PluginID string               `json:"pluginId"`
	Scope    *plugins.PluginScope `json:"scope"`
}

type PluginUpdateRequest struct {
	PluginID string               `json:"pluginId"`
	Scope    *plugins.PluginScope `json:"scope"`
	To       *string              `json:"to"`
}

type PluginRollbackRequest struct {
	PluginID string               `json:"pluginId"`
	Scope    *plugins.PluginScope `json:"scope"`
}

type PluginConfigWriteRequest struct {
	PluginID string         `json:"pluginId"`
	Config   map[string]any `json:"config"`
}

type PluginLockApplyRequest struct {
	Check bool `json:"check"`
}

func RegisterPluginRoutes(router chi.Router, deps PluginRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin routes: router is required")
	}
	if deps.Service == nil {
		return fmt.Errorf("plugin routes: plugin service is required")
	}

	registerOpenAPIGet[plugins.PluginRuntimeResponse](
		router,
		"getPluginsRuntime",
		RoutePluginsRuntime,
		pluginRuntimeHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Get the current plugin runtime state."),
	)

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	registerOpenAPIPostNoRequest[PluginsRescanResponse](
		ideRouter,
		"rescanPlugins",
		RoutePluginsRescan,
		pluginRescanHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Rescan installed plugins and return the updated runtime counts."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginInstallRequest, plugins.PluginInstallResponse](
		ideRouter,
		"installPlugin",
		RoutePluginsInstall,
		pluginInstallHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Install a plugin from a supported source."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginLinkRequest, plugins.PluginInstallResponse](
		ideRouter,
		"linkPlugin",
		RoutePluginsLink,
		pluginLinkHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Link a local plugin directory into the runtime."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginUninstallRequest, plugins.PluginUninstallResponse](
		ideRouter,
		"uninstallPlugin",
		RoutePluginsUninstall,
		pluginUninstallHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Uninstall a plugin from the selected scope."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginUpdateRequest, plugins.PluginUpdateResponse](
		ideRouter,
		"updatePlugin",
		RoutePluginsUpdate,
		pluginUpdateHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Update an installed plugin."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginRollbackRequest, plugins.PluginRollbackResponse](
		ideRouter,
		"rollbackPlugin",
		RoutePluginsRollback,
		pluginRollbackHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Roll back a plugin to the previous installed version."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginEnableDisableRequest, plugins.PluginEnableDisableResponse](
		ideRouter,
		"enablePlugin",
		RoutePluginsEnable,
		pluginEnableDisableHandler(deps.Service.Enable),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Enable an installed plugin."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginEnableDisableRequest, plugins.PluginEnableDisableResponse](
		ideRouter,
		"disablePlugin",
		RoutePluginsDisable,
		pluginEnableDisableHandler(deps.Service.Disable),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Disable an installed plugin."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginConfigWriteRequest, plugins.PluginConfigWriteResponse](
		ideRouter,
		"writePluginConfig",
		RoutePluginsConfig,
		pluginConfigHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Write schema-backed plugin configuration values."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPostNoRequest[plugins.PluginLockWriteResponse](
		ideRouter,
		"writePluginLockfile",
		RoutePluginsLockWrite,
		pluginLockWriteHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Write the plugin lockfile for the current runtime."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PluginLockApplyRequest, plugins.PluginLockApplyResponse](
		ideRouter,
		"applyPluginLockfile",
		RoutePluginsLockApply,
		pluginLockApplyHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Apply the plugin lockfile to the current runtime."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPostNoRequest[plugins.PluginRestartResponse](
		ideRouter,
		"restartPlugins",
		RoutePluginsRestart,
		pluginRestartHandler(deps),
		withOpenAPITags("Plugins"),
		withOpenAPISummary("Restart the plugin runtime when supported."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func RegisterPluginRootRoutes(router chi.Router, deps PluginRootRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin root routes: router is required")
	}
	if deps.Service == nil {
		return fmt.Errorf("plugin root routes: plugin service is required")
	}

	router.Get(RoutePluginsAssetWildcard, pluginAssetHandler(deps))
	router.Handle("/*", pluginBackendRootHandler(deps))
	return nil
}

func pluginRuntimeHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response, err := deps.Service.Runtime(plugins.RuntimeOptions{
			AssetURLBuilder: buildPluginAssetURL,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginRescanHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshot, err := deps.Service.Rescan()
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, PluginsRescanResponse{
			SchemaVersion:    1,
			ServerMode:       snapshot.ServerMode,
			InstalledPlugins: snapshot.InstalledPlugins,
			ActivePlugins:    snapshot.ActivePlugins,
		})
	}
}

func pluginEnableDisableHandler(operation func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginEnableDisableRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := operation(r.Context(), plugins.EnableDisableOptions{
			PluginID: payload.PluginID,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginInstallHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginInstallRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		enable := true
		if payload.Enable != nil {
			enable = *payload.Enable
		}
		force := false
		if payload.Force != nil {
			force = *payload.Force
		}
		scope, err := normalizePluginInstallScope(payload.Scope)
		if err != nil {
			writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", err.Error())
			return
		}

		response, err := deps.Service.Install(r.Context(), plugins.InstallOptions{
			SourceSpec: payload.SourceSpec,
			Scope:      scope,
			Installer:  payload.Installer,
			Enable:     enable,
			Force:      force,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func normalizePluginInstallScope(raw *plugins.PluginScope) (*plugins.PluginScope, error) {
	if raw == nil {
		return nil, nil
	}

	switch *raw {
	case plugins.PluginScopeWorkspace, plugins.PluginScopeGlobal:
		return raw, nil
	default:
		return nil, fmt.Errorf("Invalid install scope: %q. Use \"workspace\" or \"global\".", string(*raw))
	}
}

func pluginLinkHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginLinkRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		enable := true
		if payload.Enable != nil {
			enable = *payload.Enable
		}
		force := false
		if payload.Force != nil {
			force = *payload.Force
		}

		response, err := deps.Service.Link(plugins.LinkOptions{
			LocalPluginRoot: payload.LocalPluginRoot,
			Scope:           payload.Scope,
			Enable:          enable,
			Force:           force,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginUninstallHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginUninstallRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Service.Uninstall(r.Context(), plugins.UninstallOptions{
			PluginID: payload.PluginID,
			Scope:    payload.Scope,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginUpdateHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginUpdateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		to := ""
		if payload.To != nil {
			to = *payload.To
		}

		response, err := deps.Service.Update(r.Context(), plugins.UpdateOptions{
			PluginID: payload.PluginID,
			Scope:    payload.Scope,
			To:       to,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginRollbackHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginRollbackRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Service.Rollback(r.Context(), plugins.RollbackOptions{
			PluginID: payload.PluginID,
			Scope:    payload.Scope,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginConfigHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginConfigWriteRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Service.WriteConfig(r.Context(), plugins.ConfigWriteOptions{
			PluginID: payload.PluginID,
			Config:   payload.Config,
		})
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginLockWriteHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response, err := deps.Service.WriteLockfile()
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginLockApplyHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PluginLockApplyRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Service.ApplyLockfile(r.Context(), payload.Check)
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginRestartHandler(deps PluginRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response, err := deps.Service.Restart(r.Context())
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pluginAssetHandler(deps PluginRootRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pluginID := chi.URLParam(r, "pluginId")
		assetPath, err := url.PathUnescape(chi.URLParam(r, "*"))
		if err != nil {
			writeError(w, r, http.StatusBadRequest, string(plugins.ServiceErrorCodeAssetInvalidPath), "Invalid plugin asset path.")
			return
		}

		resolvedPath, err := deps.Service.ResolveAssetPath(pluginID, assetPath)
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}

		if isImmutablePluginAssetVersion(r.URL.Query().Get("v")) {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, resolvedPath)
	}
}

func pluginStaticDirHandler(deps PluginRootRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestPath, err := url.PathUnescape(r.URL.EscapedPath())
		if err != nil {
			writeError(w, r, http.StatusBadRequest, string(plugins.ServiceErrorCodeAssetInvalidPath), "Invalid plugin backend static asset path.")
			return
		}

		resolvedPath, matched, err := deps.Service.ResolveRegisteredStaticAssetPath(requestPath)
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		if !matched {
			writeError(w, r, http.StatusNotFound, "not_found", "Route not found.")
			return
		}

		http.ServeFile(w, r, resolvedPath)
	}
}

func pluginBackendRootHandler(deps PluginRootRouteDependencies) http.HandlerFunc {
	staticHandler := pluginStaticDirHandler(deps)
	return func(w http.ResponseWriter, r *http.Request) {
		requestPath, err := url.PathUnescape(r.URL.EscapedPath())
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_path", "Invalid route path.")
			return
		}

		routeLookup, err := deps.Service.LookupRegisteredBackendRoute(r.Method, requestPath)
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}

		if routeLookup.Matched {
			dispatchHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := dispatchRegisteredPluginBackendRoute(w, r, requestPath, deps); err != nil {
					writePluginRouteError(w, r, err)
				}
			})
			if deps.Auth != nil && deps.Auth.Enabled() {
				authMiddleware(deps.Auth, deps.TrustedOrigins)(dispatchHandler).ServeHTTP(w, r)
				return
			}
			dispatchHandler.ServeHTTP(w, r)
			return
		}

		if routeLookup.PathExists {
			writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
			return
		}

		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			staticHandler.ServeHTTP(w, r)
			return
		}

		writeError(w, r, http.StatusNotFound, "not_found", "Route not found.")
	}
}

func dispatchRegisteredPluginBackendRoute(w http.ResponseWriter, r *http.Request, requestPath string, deps PluginRootRouteDependencies) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("read plugin backend request body: %w", err)
	}

	modeInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		return fmt.Errorf("plugin backend route request is missing mode info")
	}

	backendRequest := plugins.BackendHTTPRequest{
		Context: plugins.BackendRequestContext{
			ServerMode:     modeInfo.Policy.Mode(),
			HasAuth:        false,
			ShareSessionID: strings.TrimSpace(modeInfo.ShareSessionID),
		},
		Method:   r.Method,
		Path:     requestPath,
		RawQuery: r.URL.RawQuery,
		Headers:  cloneBackendRequestHeaders(r.Header),
		Body:     body,
	}
	if authInfo, ok := auth.RequestInfoFromRequest(r); ok {
		backendRequest.Context.HasAuth = true
		backendRequest.Context.SessionID = strings.TrimSpace(authInfo.SessionID)
	}

	response, matched, err := deps.Service.DispatchRegisteredBackendRoute(r.Context(), backendRequest)
	if err != nil {
		return err
	}
	if !matched {
		writeError(w, r, http.StatusNotFound, "not_found", "Route not found.")
		return nil
	}

	if err := writePluginBackendHTTPResponse(w, response); err != nil {
		return err
	}
	return nil
}

func cloneBackendRequestHeaders(headers http.Header) map[string][]string {
	if len(headers) == 0 {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(headers))
	for key, values := range headers {
		cloned[key] = append([]string(nil), values...)
	}
	return cloned
}

func writePluginBackendHTTPResponse(w http.ResponseWriter, response plugins.BackendHTTPResponse) error {
	validatedHeaders := make(http.Header)
	for key, values := range response.Headers {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" || strings.EqualFold(trimmedKey, "Content-Length") {
			continue
		}
		if err := validatePluginBackendHTTPHeaderName(trimmedKey); err != nil {
			return err
		}
		for _, value := range values {
			if err := validatePluginBackendHTTPHeaderValue(value); err != nil {
				return err
			}
			validatedHeaders.Add(trimmedKey, value)
		}
	}
	for key, values := range validatedHeaders {
		w.Header()[key] = append([]string(nil), values...)
	}
	w.WriteHeader(response.StatusCode)
	if len(response.Body) == 0 || pluginBackendHTTPStatusDisallowsBody(response.StatusCode) {
		return nil
	}
	_, _ = w.Write(response.Body)
	return nil
}

func pluginBackendHTTPStatusDisallowsBody(status int) bool {
	return (status >= 100 && status < 200) ||
		status == http.StatusNoContent ||
		status == http.StatusResetContent ||
		status == http.StatusNotModified
}

func validatePluginBackendHTTPHeaderName(name string) error {
	if strings.ContainsAny(name, "\r\n") {
		return invalidPluginBackendHTTPHeaderError("Plugin backend response returned headers containing newline characters.")
	}
	for index := 0; index < len(name); index++ {
		if !pluginBackendHTTPHeaderNameByteAllowed(name[index]) {
			return invalidPluginBackendHTTPHeaderError("Plugin backend response returned non-latin-1 header name or value.")
		}
	}
	return nil
}

func validatePluginBackendHTTPHeaderValue(value string) error {
	if strings.ContainsAny(value, "\r\n") {
		return invalidPluginBackendHTTPHeaderError("Plugin backend response returned headers containing newline characters.")
	}
	for _, char := range value {
		if char > 0xFF {
			return invalidPluginBackendHTTPHeaderError("Plugin backend response returned non-latin-1 header name or value.")
		}
		if (char < 0x20 && char != '\t') || char == 0x7f {
			return invalidPluginBackendHTTPHeaderError("Plugin backend response returned non-latin-1 header name or value.")
		}
	}
	return nil
}

func pluginBackendHTTPHeaderNameByteAllowed(char byte) bool {
	if char >= '0' && char <= '9' {
		return true
	}
	if char >= 'a' && char <= 'z' {
		return true
	}
	if char >= 'A' && char <= 'Z' {
		return true
	}
	switch char {
	case '!', '#', '$', '%', '&', '\'', '*', '+', '-', '.', '^', '_', '`', '|', '~':
		return true
	default:
		return false
	}
}

func invalidPluginBackendHTTPHeaderError(message string) error {
	return &plugins.ServiceError{
		Code:    plugins.ServiceErrorCodeBackendRuntimeInvalid,
		Message: message,
		Status:  http.StatusBadGateway,
	}
}

func buildPluginAssetURL(pluginID string, relativePath string, sourceDigestSHA256 *string) string {
	baseURL := buildPluginAssetBaseURL(RoutePluginsAssetWildcard, pluginID, relativePath)
	if baseURL == "" {
		return ""
	}
	if sourceDigestSHA256 == nil || strings.TrimSpace(*sourceDigestSHA256) == "" {
		return baseURL
	}
	return baseURL + "?v=" + url.QueryEscape(strings.TrimSpace(*sourceDigestSHA256))
}

func buildPluginAssetBaseURL(routePattern string, pluginID string, relativePath string) string {
	trimmedPluginID := strings.TrimSpace(pluginID)
	trimmedRelativePath := strings.TrimSpace(relativePath)
	if trimmedPluginID == "" || trimmedRelativePath == "" {
		return ""
	}

	basePattern := strings.TrimSuffix(routePattern, "*")
	if !strings.Contains(basePattern, "{pluginId}") {
		return ""
	}

	baseURL := strings.Replace(basePattern, "{pluginId}", url.PathEscape(trimmedPluginID), 1)
	baseURL = strings.TrimRight(baseURL, "/")

	encodedSegments := make([]string, 0)
	for _, segment := range strings.Split(trimmedRelativePath, "/") {
		if segment == "" {
			continue
		}
		encodedSegments = append(encodedSegments, url.PathEscape(segment))
	}
	if len(encodedSegments) == 0 {
		return ""
	}
	return baseURL + "/" + strings.Join(encodedSegments, "/")
}

func isImmutablePluginAssetVersion(value string) bool {
	if len(value) != 64 {
		return false
	}
	for index := 0; index < len(value); index++ {
		char := value[index]
		if char >= '0' && char <= '9' {
			continue
		}
		if char >= 'a' && char <= 'f' {
			continue
		}
		return false
	}
	return true
}

func writePluginRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var serviceErr *plugins.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status != 0 {
			writeError(w, r, serviceErr.Status, string(serviceErr.Code), serviceErr.Message)
			return
		}
		switch serviceErr.Code {
		case plugins.ServiceErrorCodeNotFound, plugins.ServiceErrorCodeAssetNotFound, plugins.ServiceErrorCodeLockfileNotFound:
			writeError(w, r, http.StatusNotFound, string(serviceErr.Code), serviceErr.Message)
			return
		case plugins.ServiceErrorCodeRestartFailed:
			writeError(w, r, http.StatusServiceUnavailable, string(serviceErr.Code), serviceErr.Message)
			return
		case plugins.ServiceErrorCodeAssetInvalidPath, plugins.ServiceErrorCodeConfigInvalid, plugins.ServiceErrorCodeConfigSchemaInvalid:
			writeError(w, r, http.StatusBadRequest, string(serviceErr.Code), serviceErr.Message)
			return
		default:
			writeError(w, r, http.StatusBadRequest, string(serviceErr.Code), serviceErr.Message)
			return
		}
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

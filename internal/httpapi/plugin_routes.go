package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
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

type PluginRouteDependencies struct {
	ModePolicy modes.Policy
	Service    *plugins.Service
}

type PluginRootRouteDependencies struct {
	Service        *plugins.Service
	BackendRuntime *plugins.BackendRouteRuntime
}

func RegisterPluginRoutes(router chi.Router, deps PluginRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin routes: router is required")
	}
	if deps.Service == nil {
		return fmt.Errorf("plugin routes: plugin service is required")
	}

	router.Get(RoutePluginsRuntime, pluginRuntimeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsRescan, pluginRescanHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsInstall, pluginInstallHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsLink, pluginLinkHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsUninstall, pluginUninstallHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsUpdate, pluginUpdateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsRollback, pluginRollbackHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsEnable, pluginEnableDisableHandler(deps.Service.Enable))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsDisable, pluginEnableDisableHandler(deps.Service.Disable))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsConfig, pluginConfigHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsLockWrite, pluginLockWriteHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsLockApply, pluginLockApplyHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsRestart, pluginRestartHandler(deps))
	return nil
}

func RegisterPluginRootRoutes(router chi.Router, deps PluginRootRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin root routes: router is required")
	}
	if deps.Service == nil {
		return fmt.Errorf("plugin root routes: plugin service is required")
	}

	router.Get("/plugins/{pluginId}/*", pluginAssetHandler(deps))
	if deps.BackendRuntime != nil {
		router.Get("/plugin-static/{pluginId}/*", pluginStaticAssetHandler(deps))
	}
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
	type pluginRescanResponse struct {
		SchemaVersion    int    `json:"schemaVersion"`
		ServerMode       string `json:"serverMode"`
		InstalledPlugins int    `json:"installedPlugins"`
		ActivePlugins    int    `json:"activePlugins"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		snapshot, err := deps.Service.Rescan()
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, pluginRescanResponse{
			SchemaVersion:    1,
			ServerMode:       string(snapshot.ServerMode),
			InstalledPlugins: snapshot.InstalledPlugins,
			ActivePlugins:    snapshot.ActivePlugins,
		})
	}
}

func pluginEnableDisableHandler(operation func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error)) http.HandlerFunc {
	type enableDisablePluginRequest struct {
		PluginID string `json:"pluginId"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[enableDisablePluginRequest](r)
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
	type installPluginRequest struct {
		SourceSpec string                          `json:"sourceSpec"`
		Scope      *plugins.PluginScope            `json:"scope"`
		Installer  *plugins.PluginInstallerBackend `json:"installer"`
		Enable     *bool                           `json:"enable"`
		Force      *bool                           `json:"force"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[installPluginRequest](r)
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

		response, err := deps.Service.Install(r.Context(), plugins.InstallOptions{
			SourceSpec: payload.SourceSpec,
			Scope:      payload.Scope,
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

func pluginLinkHandler(deps PluginRouteDependencies) http.HandlerFunc {
	type linkPluginRequest struct {
		LocalPluginRoot string               `json:"localPluginRoot"`
		Scope           *plugins.PluginScope `json:"scope"`
		Enable          *bool                `json:"enable"`
		Force           *bool                `json:"force"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[linkPluginRequest](r)
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
	type uninstallPluginRequest struct {
		PluginID string               `json:"pluginId"`
		Scope    *plugins.PluginScope `json:"scope"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[uninstallPluginRequest](r)
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
	type updatePluginRequest struct {
		PluginID string               `json:"pluginId"`
		Scope    *plugins.PluginScope `json:"scope"`
		To       *string              `json:"to"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[updatePluginRequest](r)
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
	type rollbackPluginRequest struct {
		PluginID string               `json:"pluginId"`
		Scope    *plugins.PluginScope `json:"scope"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[rollbackPluginRequest](r)
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
	type writePluginConfigRequest struct {
		PluginID string         `json:"pluginId"`
		Config   map[string]any `json:"config"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[writePluginConfigRequest](r)
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
	type pluginLockApplyRequest struct {
		Check bool `json:"check"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[pluginLockApplyRequest](r)
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

func pluginStaticAssetHandler(deps PluginRootRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pluginID := chi.URLParam(r, "pluginId")
		assetPath, err := url.PathUnescape(chi.URLParam(r, "*"))
		if err != nil {
			writeError(w, r, http.StatusBadRequest, string(plugins.ServiceErrorCodeAssetInvalidPath), "Invalid plugin static asset path.")
			return
		}

		resolvedPath, err := deps.BackendRuntime.ResolveStaticAssetPath(pluginID, assetPath)
		if err != nil {
			writePluginRouteError(w, r, err)
			return
		}

		http.ServeFile(w, r, resolvedPath)
	}
}

func buildPluginAssetURL(pluginID string, relativePath string, sourceDigestSHA256 *string) string {
	trimmedPluginID := strings.TrimSpace(pluginID)
	trimmedRelativePath := strings.TrimSpace(relativePath)
	if trimmedPluginID == "" || trimmedRelativePath == "" {
		return ""
	}

	encodedSegments := []string{url.PathEscape(trimmedPluginID)}
	for _, segment := range strings.Split(trimmedRelativePath, "/") {
		if segment == "" {
			continue
		}
		encodedSegments = append(encodedSegments, url.PathEscape(segment))
	}
	baseURL := "/plugins/" + strings.Join(encodedSegments, "/")
	if sourceDigestSHA256 == nil || strings.TrimSpace(*sourceDigestSHA256) == "" {
		return baseURL
	}
	return baseURL + "?v=" + url.QueryEscape(strings.TrimSpace(*sourceDigestSHA256))
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

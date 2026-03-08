package httpapi

import (
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
const RoutePluginsConfig = "/plugins/config"
const RoutePluginsRestart = "/plugins/restart"

type PluginRouteDependencies struct {
	ModePolicy modes.Policy
	Service    *plugins.Service
}

type PluginRootRouteDependencies struct {
	Service *plugins.Service
}

func RegisterPluginRoutes(router chi.Router, deps PluginRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin routes: router is required")
	}
	if deps.Service == nil {
		return fmt.Errorf("plugin routes: plugin service is required")
	}

	router.Get(RoutePluginsRuntime, pluginRuntimeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePluginsConfig, pluginConfigHandler(deps))
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
		case plugins.ServiceErrorCodeNotFound, plugins.ServiceErrorCodeAssetNotFound:
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

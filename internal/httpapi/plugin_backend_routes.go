package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/plugins"
)

const (
	RoutePluginsBackendBase     = "/plugins/{pluginId}"
	RoutePluginsBackendWildcard = "/plugins/{pluginId}/*"
	RoutePluginsBackendDispatch = "/plugins/{pluginId}{routePath}"
)

type PluginBackendRouteDependencies struct {
	ModePolicy modes.Policy
	Runtime    PluginBackendRuntime
}

type PluginBackendRuntime interface {
	MatchRoute(method string, path string) (plugins.BackendRoute, map[string]string, bool)
	AllowedMethods(path string) []string
	ProxyRoute(ctx context.Context, route plugins.BackendRoute, request *http.Request, pathParams map[string]string) (plugins.BackendRouteResponse, error)
}

func RegisterPluginBackendRoutes(router chi.Router, deps PluginBackendRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("plugin backend routes: router is required")
	}
	if deps.Runtime == nil {
		return nil
	}

	handler := pluginBackendRouteHandler(deps.Runtime)
	router.With(RequireIDEMode(deps.ModePolicy)).Handle(RoutePluginsBackendBase, handler)
	router.With(RequireIDEMode(deps.ModePolicy)).Handle(RoutePluginsBackendWildcard, handler)
	return nil
}

func pluginBackendRouteHandler(runtime PluginBackendRuntime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		routePath := pluginBackendRouteMatchPath(r.URL.Path)
		route, pathParams, ok := runtime.MatchRoute(r.Method, routePath)
		if !ok {
			allowedMethods := runtime.AllowedMethods(routePath)
			if len(allowedMethods) != 0 {
				w.Header().Set("Allow", strings.Join(allowedMethods, ", "))
				writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
				return
			}
			writeError(w, r, http.StatusNotFound, "not_found", "Route not found.")
			return
		}

		response, err := runtime.ProxyRoute(r.Context(), route, r, pathParams)
		if err != nil {
			writePluginBackendRouteError(w, err)
			return
		}
		writePluginBackendRouteResponse(w, response)
	}
}

func pluginBackendRouteMatchPath(path string) string {
	trimmedPath := strings.TrimSpace(path)
	if strings.HasPrefix(trimmedPath, apiPrefix) {
		trimmedPath = strings.TrimPrefix(trimmedPath, apiPrefix)
	}
	if trimmedPath == "" {
		return "/"
	}
	if !strings.HasPrefix(trimmedPath, "/") {
		return "/" + trimmedPath
	}
	return trimmedPath
}

func writePluginBackendRouteError(w http.ResponseWriter, err error) {
	statusCode := http.StatusBadGateway
	code := "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
	message := "Plugin backend route call failed."

	var proxyErr *plugins.BackendRouteProxyError
	if errors.As(err, &proxyErr) {
		statusCode = proxyErr.StatusCode
		if proxyErr.Code != "" {
			code = proxyErr.Code
		}
		if proxyErr.Message != "" {
			message = proxyErr.Message
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if encodeErr := json.NewEncoder(w).Encode(map[string]string{
		"code":    code,
		"message": message,
	}); encodeErr != nil {
		panic(encodeErr)
	}
}

func writePluginBackendRouteResponse(w http.ResponseWriter, response plugins.BackendRouteResponse) {
	for _, header := range response.Headers {
		w.Header().Add(header.Name, header.Value)
	}
	contentType := pluginBackendRouteResponseContentType(response)
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	w.WriteHeader(response.StatusCode)
	if response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusResetContent || response.StatusCode == http.StatusNotModified {
		return
	}
	if response.BinaryBodyPresent {
		if _, err := w.Write(response.BinaryBody); err != nil {
			panic(err)
		}
		return
	}

	if contentType != "" && !pluginBackendRouteContentTypeIsJSON(contentType) {
		if _, err := w.Write(pluginBackendRouteTextBody(response)); err != nil {
			panic(err)
		}
		return
	}
	if !response.BodyPresent {
		return
	}
	if err := json.NewEncoder(w).Encode(response.Body); err != nil {
		panic(err)
	}
}

func pluginBackendRouteTextBody(response plugins.BackendRouteResponse) []byte {
	if !response.BodyPresent || response.Body == nil {
		return []byte{}
	}
	switch value := response.Body.(type) {
	case string:
		return []byte(value)
	case []byte:
		return append([]byte(nil), value...)
	case []rune:
		return []byte(string(value))
	case map[string]any, []any:
		encoded, err := json.Marshal(value)
		if err != nil {
			panic(err)
		}
		return encoded
	default:
		return []byte(fmt.Sprint(value))
	}
}

func pluginBackendRouteContentTypeIsJSON(rawContentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(rawContentType, ";")[0]))
	return mediaType == "application/json" || strings.HasSuffix(mediaType, "+json")
}

func pluginBackendRouteResponseContentType(response plugins.BackendRouteResponse) string {
	if response.MediaType != "" {
		return response.MediaType
	}
	for _, header := range response.Headers {
		if strings.EqualFold(header.Name, "content-type") {
			return header.Value
		}
	}
	if response.BodyPresent {
		return "application/json"
	}
	return ""
}

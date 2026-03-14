package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"setta/internal/auth"
	"setta/internal/frontendbindings"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/wsapi"
)

type listenerBuiltInEndpointInvoker struct {
	authService *auth.Service
	routes      map[string]listenerBuiltInRoute

	mu      sync.RWMutex
	handler http.Handler
}

type listenerBuiltInRoute struct {
	method string
	path   string
}

type listenerEndpointErrorResponse struct {
	Error listenerEndpointErrorDetail `json:"error"`
}

type listenerEndpointErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func newListenerBuiltInEndpointInvoker(authService *auth.Service) (*listenerBuiltInEndpointInvoker, error) {
	routes, err := buildListenerBuiltInRoutes()
	if err != nil {
		return nil, err
	}
	return &listenerBuiltInEndpointInvoker{
		authService: authService,
		routes:      routes,
	}, nil
}

func buildListenerBuiltInRoutes() (map[string]listenerBuiltInRoute, error) {
	pathsByRouteName := make(map[string]string)
	for _, group := range frontendbindings.CurrentRouteGroups() {
		if group.ConstName != "GoHTTPRoutes" {
			continue
		}
		for _, route := range group.Routes {
			pathsByRouteName[route.Name] = httpapi.RouteAPIPrefix + route.Path
		}
	}

	routes := make(map[string]listenerBuiltInRoute)
	for _, spec := range frontendbindings.CurrentEndpoints() {
		if spec.RouteCollection != "GoHTTPRoutes" || spec.Method != http.MethodPost || spec.PathParamsType != nil || spec.BinaryResponse {
			continue
		}

		path, ok := pathsByRouteName[spec.RouteName]
		if !ok {
			return nil, fmt.Errorf("listener built-in endpoint %s references unknown GoHTTP route %s", spec.FunctionName, spec.RouteName)
		}
		routes[spec.FunctionName] = listenerBuiltInRoute{
			method: spec.Method,
			path:   path,
		}
	}

	return routes, nil
}

func (i *listenerBuiltInEndpointInvoker) SetHandler(handler http.Handler) {
	if i == nil {
		return
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	i.handler = handler
}

func (i *listenerBuiltInEndpointInvoker) InvokeBuiltInListenerEndpoint(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if i == nil {
		return nil, false, nil
	}

	route, ok := i.routes[endpointName]
	if !ok {
		return nil, false, nil
	}

	handler := i.currentHandler()
	if handler == nil {
		return nil, true, fmt.Errorf("built-in listener endpoint handler is not configured")
	}

	result, err := i.dispatch(ctx, handler, info, route, payload)
	return result, true, err
}

func (i *listenerBuiltInEndpointInvoker) currentHandler() http.Handler {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.handler
}

func (i *listenerBuiltInEndpointInvoker) dispatch(
	ctx context.Context,
	handler http.Handler,
	info wsapi.ConnectionInfo,
	route listenerBuiltInRoute,
	payload map[string]any,
) (any, error) {
	if payload == nil {
		payload = map[string]any{}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal built-in listener endpoint payload: %w", err)
	}

	request, err := http.NewRequestWithContext(listenerEndpointRequestContext(ctx, info), route.method, "http://listener.internal"+route.path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build built-in listener endpoint request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")

	if err := i.applyScope(request, info); err != nil {
		return nil, err
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	result := response.Result()
	defer result.Body.Close()

	responseBody, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("read built-in listener endpoint response: %w", err)
	}
	if result.StatusCode < http.StatusOK || result.StatusCode >= http.StatusMultipleChoices {
		return nil, parseListenerEndpointHTTPError(result.StatusCode, responseBody)
	}

	trimmedBody := bytes.TrimSpace(responseBody)
	if len(trimmedBody) == 0 || bytes.Equal(trimmedBody, []byte("null")) {
		return nil, nil
	}

	var responsePayload any
	if err := json.Unmarshal(trimmedBody, &responsePayload); err != nil {
		return nil, fmt.Errorf("decode built-in listener endpoint response: %w", err)
	}
	return responsePayload, nil
}

func (i *listenerBuiltInEndpointInvoker) applyScope(request *http.Request, info wsapi.ConnectionInfo) error {
	if request == nil {
		return nil
	}

	if info.Modes.Policy.IsDeployment() {
		if shareSessionID := strings.TrimSpace(info.Modes.ShareSessionID); shareSessionID != "" {
			request.Header.Set(modes.ShareSessionHeaderName, shareSessionID)
		}
		return nil
	}

	if i.authService == nil || !i.authService.SupportsSessionAuth() {
		return nil
	}

	token, _, err := i.authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		return fmt.Errorf("mint auth cookie for built-in listener endpoint: %w", err)
	}

	sessionID := strings.TrimSpace(info.Auth.SessionID)
	if sessionID == "" {
		currentSession, ok := i.authService.CurrentSession()
		if !ok {
			return fmt.Errorf("missing current session for built-in listener endpoint")
		}
		sessionID = currentSession.Metadata.ID
	}

	cookieName, err := i.authService.CookieName(sessionID)
	if err != nil {
		return fmt.Errorf("resolve auth cookie for built-in listener endpoint: %w", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	return nil
}

func listenerEndpointRequestContext(_ context.Context, info wsapi.ConnectionInfo) context.Context {
	requestContext := modes.ContextWithRequestInfo(context.Background(), info.Modes)
	if info.HasAuth {
		requestContext = auth.ContextWithRequestInfo(requestContext, info.Auth)
	}
	return requestContext
}

func parseListenerEndpointHTTPError(statusCode int, responseBody []byte) error {
	trimmedBody := bytes.TrimSpace(responseBody)
	if len(trimmedBody) == 0 {
		return fmt.Errorf("listener endpoint request failed with status %d", statusCode)
	}

	var payload listenerEndpointErrorResponse
	if err := json.Unmarshal(trimmedBody, &payload); err == nil && strings.TrimSpace(payload.Error.Message) != "" {
		errorCode := strings.TrimSpace(payload.Error.Code)
		if errorCode == "" {
			return fmt.Errorf("%s", payload.Error.Message)
		}
		return fmt.Errorf("%s: %s", errorCode, payload.Error.Message)
	}

	return fmt.Errorf("listener endpoint request failed with status %d: %s", statusCode, string(trimmedBody))
}

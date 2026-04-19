package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
	"setta/internal/pythonsdkcontracts"
)

const apiPrefix = "/api"
const RouteAPIPrefix = apiPrefix
const RouteSDKRuntimeHandshake = "/sdkRuntimeHandshake"

type InfoService interface {
	ServerMode(context.Context) string
	RuntimeInfo(context.Context) RuntimeInfo
	SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake
}

type RuntimeInfo struct {
	Mode   string            `json:"mode"`
	Paths  RuntimePaths      `json:"paths"`
	Policy RuntimePathPolicy `json:"policy"`
	Auth   RuntimeAuth       `json:"auth"`
}

type RuntimePaths struct {
	WorkspaceRoot      string `json:"workspaceRoot"`
	DeploymentRoot     string `json:"deploymentRoot,omitempty"`
	SettaHome          string `json:"settaHome"`
	ProfileLookupHome  string `json:"profileLookupHome"`
	Profile            string `json:"profile,omitempty"`
	SettaFilesRoot     string `json:"settaFilesRoot"`
	SettaFilesLocation string `json:"settaFilesLocation"`
	RuntimeRoot        string `json:"runtimeRoot"`
}

type RuntimePathPolicy struct {
	GlobalSettaFilesBase string `json:"globalSettaFilesBase"`
	AutoMode             string `json:"autoMode"`
}

type RuntimeAuth struct {
	AuthCookieName string `json:"authCookieName,omitempty"`
}

type Dependencies struct {
	Logger                    *slog.Logger
	Info                      InfoService
	Auth                      *auth.Service
	TrustedOrigins            *frontendorigins.Service
	ModePolicy                modes.Policy
	RegisterRoot              func(chi.Router)
	RegisterAuthenticatedRoot func(chi.Router)
	Register                  func(chi.Router)
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId,omitempty"`
}

type validationErrorResponse struct {
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
	Data       any    `json:"data"`
}

func registerCoreRuntimeOpenAPIRoutes(router chi.Router, info InfoService) {
	registerOpenAPIGet[ServerModeResponse](
		router,
		"getServerMode",
		RouteGetServerMode,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, ServerModeResponse{
				Mode: openAPIServerMode(config.Mode(info.ServerMode(r.Context()))),
			})
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the current backend server mode."),
	)
	registerOpenAPIGet[RuntimeInfo](
		router,
		"getRuntimeInfo",
		"/runtimeInfo",
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.RuntimeInfo(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get runtime path and auth metadata for the current backend."),
	)
	registerOpenAPIGet[pythonsdkcontracts.RunningBackendVersionHandshake](
		router,
		"sdkRuntimeHandshake",
		RouteSDKRuntimeHandshake,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.SDKRuntimeHandshake(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the running backend version handshake for the local SDK."),
	)
}

func validateHandlerDependencies(deps Dependencies) error {
	if deps.Logger == nil {
		return fmt.Errorf("logger is required")
	}
	if deps.Info == nil {
		return fmt.Errorf("info service is required")
	}
	return nil
}

func handlerAuthEnabled(authService *auth.Service) bool {
	return authService != nil && authService.Enabled()
}

func registerBootstrapRoutes(router chi.Router, deps Dependencies) {
	if !handlerAuthEnabled(deps.Auth) {
		return
	}
	router.Get(bootstrapPagePath+"/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, bootstrapPagePath, http.StatusTemporaryRedirect)
	})
	router.Get(bootstrapPagePath, bootstrapPageHandler())
	router.Post("/__setta__/bootstrap/consume", bootstrapConsumeHandler(deps.Auth, deps.TrustedOrigins))
}

func registerAuthenticatedRootRoutes(openAPIRouter chi.Router, deps Dependencies) {
	if deps.RegisterAuthenticatedRoot == nil {
		return
	}
	if !handlerAuthEnabled(deps.Auth) {
		deps.RegisterAuthenticatedRoot(openAPIRouter)
		return
	}
	openAPIRouter.Group(func(r chi.Router) {
		r.Use(authMiddleware(deps.Auth, deps.TrustedOrigins))
		deps.RegisterAuthenticatedRoot(r)
	})
}

func registerAPIRoutes(openAPIRouter chi.Router, openAPIDocument *huma.OpenAPI, deps Dependencies) {
	openAPIRouter.Route(apiPrefix, func(r chi.Router) {
		if handlerAuthEnabled(deps.Auth) {
			r.Use(authMiddleware(deps.Auth, deps.TrustedOrigins))
		}
		apiRouter := wrapRouterWithOpenAPI(r, openAPIDocument)
		registerCoreRuntimeOpenAPIRoutes(apiRouter, deps.Info)
		apiRouter.Get("/openapi.json", openAPIDocumentHandler(openAPIDocument))
		if deps.Register != nil {
			deps.Register(apiRouter)
		}
	})
}

func NewHandler(deps Dependencies) (http.Handler, error) {
	if err := validateHandlerDependencies(deps); err != nil {
		return nil, err
	}

	router := chi.NewRouter()
	openAPIDocument := newOpenAPIDocument()
	openAPIRouter := wrapRouterWithOpenAPI(router, openAPIDocument)
	router.Use(corsMiddleware(deps.Auth, deps.TrustedOrigins))
	router.Use(requestIDMiddleware)
	router.Use(modeContextMiddleware(deps.ModePolicy))
	router.Use(recoveryMiddleware(deps.Logger))
	router.Use(accessLogMiddleware(deps.Logger))

	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusNotFound, "not_found", "Route not found.")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
	})

	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	if deps.RegisterRoot != nil {
		deps.RegisterRoot(openAPIRouter)
	}
	registerBootstrapRoutes(router, deps)
	registerAuthenticatedRootRoutes(openAPIRouter, deps)
	registerAPIRoutes(openAPIRouter, openAPIDocument, deps)

	return router, nil
}

func RequireIDEMode(policy modes.Policy) func(http.Handler) http.Handler {
	return modeRequirementMiddleware(policy, policy.RequireIDE)
}

func RequireFullIDERuntime(policy modes.Policy) func(http.Handler) http.Handler {
	return modeRequirementMiddleware(policy, policy.RequireFullIDE)
}

func RequireShareSession(resolver modes.Resolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestInfo, err := resolver.ResolveRequest(r)
			if err != nil {
				if writeModesError(w, r, err) {
					return
				}
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			next.ServeHTTP(w, withModesRequestInfo(r, requestInfo))
		})
	}
}

type bootstrapConsumeRequestPayload struct {
	Token               string `json:"token"`
	LauncherOrigin      string `json:"launcherOrigin"`
	LauncherOriginProof string `json:"launcherOriginProof"`
}

type bootstrapConsumeAuthState struct {
	currentSession    *auth.CurrentSession
	cookieToken       string
	authCookiePayload auth.AuthCookiePayload
}

func bootstrapConsumeHandler(authService *auth.Service, trustedOrigins *frontendorigins.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[bootstrapConsumeRequestPayload](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		now := time.Now().UTC()
		authState, ok := bootstrapConsumeAuthStateOrWriteError(w, r, authService, payload, now)
		if !ok {
			return
		}

		launcherOrigin, ok := trustBootstrapLauncherOriginOrWriteError(
			w,
			r,
			trustedOrigins,
			payload,
			authState.currentSession,
			authState.authCookiePayload.Exp,
		)
		if !ok {
			return
		}
		if err := authService.SetAuthCookie(w, r, authState.cookieToken); err != nil {
			writeAuthMiddlewareError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, bootstrapConsumeResponsePayload(launcherOrigin))
	}
}

func bootstrapConsumeAuthStateOrWriteError(
	w http.ResponseWriter,
	r *http.Request,
	authService *auth.Service,
	payload bootstrapConsumeRequestPayload,
	now time.Time,
) (bootstrapConsumeAuthState, bool) {
	token := strings.TrimSpace(payload.Token)
	if token == "" {
		token = auth.ExtractBearerToken(r.Header)
	}

	if _, err := authService.ConsumeBootstrapToken(token, now); err != nil {
		writeBootstrapConsumeTokenError(w, r, err)
		return bootstrapConsumeAuthState{}, false
	}

	currentSession, ok := authService.CurrentSession()
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "missing_session", "Missing session.")
		return bootstrapConsumeAuthState{}, false
	}

	cookieToken, authCookiePayload, err := authService.MintAuthCookie(now)
	if err != nil {
		writeError(w, r, http.StatusUnauthorized, "missing_session", "Missing session.")
		return bootstrapConsumeAuthState{}, false
	}

	return bootstrapConsumeAuthState{
		currentSession:    currentSession,
		cookieToken:       cookieToken,
		authCookiePayload: authCookiePayload,
	}, true
}

func writeBootstrapConsumeTokenError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, auth.ErrMissingToken):
		writeError(w, r, http.StatusUnauthorized, "missing_token", "Missing token.")
	case errors.Is(err, auth.ErrMissingCurrentSession):
		writeError(w, r, http.StatusUnauthorized, "missing_session", "Missing session.")
	default:
		writeError(w, r, http.StatusUnauthorized, "invalid_token", "Invalid token.")
	}
}

func trustBootstrapLauncherOriginOrWriteError(
	w http.ResponseWriter,
	r *http.Request,
	trustedOrigins *frontendorigins.Service,
	payload bootstrapConsumeRequestPayload,
	currentSession *auth.CurrentSession,
	expiresAt int64,
) (string, bool) {
	launcherOrigin := verifiedBootstrapLauncherOrigin(payload, currentSession)
	if launcherOrigin == "" || trustedOrigins == nil {
		return "", true
	}
	if _, err := trustedOrigins.TrustOrigin(launcherOrigin, currentSession.Metadata.ID, expiresAt); err != nil {
		var unavailable *frontendorigins.StoreUnavailableError
		if errors.As(err, &unavailable) {
			writeError(w, r, http.StatusServiceUnavailable, "trusted_frontend_origin_store_unavailable", "Trusted frontend origin store unavailable")
			return "", false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return "", false
	}
	return launcherOrigin, true
}

func verifiedBootstrapLauncherOrigin(
	payload bootstrapConsumeRequestPayload,
	currentSession *auth.CurrentSession,
) string {
	if currentSession == nil {
		return ""
	}

	normalizedLauncherOrigin := frontendorigins.NormalizeOrigin(payload.LauncherOrigin)
	if normalizedLauncherOrigin == "" {
		return ""
	}
	if !frontendorigins.ValidateLauncherOriginHandoffProof(
		currentSession.Metadata.ID,
		normalizedLauncherOrigin,
		payload.LauncherOriginProof,
		currentSession.Secret,
	) {
		return ""
	}
	return normalizedLauncherOrigin
}

func bootstrapConsumeResponsePayload(launcherOrigin string) map[string]string {
	responsePayload := map[string]string{"status": "ok"}
	if launcherOrigin != "" {
		responsePayload["launcherOrigin"] = launcherOrigin
	}
	return responsePayload
}

func authMiddleware(authService *auth.Service, trustedOrigins *frontendorigins.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			now := time.Now().UTC()
			cookieValue, ok := authService.ReadAuthCookie(r)
			if ok {
				requestInfo, err := authService.ValidateAuthCookie(cookieValue, now)
				if err == nil {
					if strings.HasPrefix(r.URL.Path, apiPrefix) && authService.ShouldRefreshAuthCookie(requestInfo, now) {
						requestInfo, err = mintAndAttachSessionAuthCookie(w, r, authService, trustedOrigins, requestInfo.SessionID, now)
						if err != nil {
							writeAuthMiddlewareError(w, r, err)
							return
						}
					}
					next.ServeHTTP(w, r.WithContext(auth.ContextWithRequestInfo(r.Context(), requestInfo)))
					return
				}
			}

			if shouldAutoAuthDevRequest(r, trustedOrigins, currentSessionID(authService)) {
				requestInfo, err := mintAndAttachSessionAuthCookie(w, r, authService, trustedOrigins, currentSessionID(authService), now)
				if err != nil {
					writeAuthMiddlewareError(w, r, err)
					return
				}
				next.ServeHTTP(w, r.WithContext(auth.ContextWithRequestInfo(r.Context(), requestInfo)))
				return
			}
			writeUnauthorizedAuthResponse(w, r)
		})
	}
}

func mintAndAttachSessionAuthCookie(
	w http.ResponseWriter,
	r *http.Request,
	authService *auth.Service,
	trustedOrigins *frontendorigins.Service,
	sessionID string,
	now time.Time,
) (auth.RequestInfo, error) {
	token, payload, err := authService.MintAuthCookie(now)
	if err != nil {
		return auth.RequestInfo{}, err
	}
	if trustedOrigins != nil && strings.TrimSpace(sessionID) != "" {
		if err := trustedOrigins.RefreshSessionExpiry(sessionID, payload.Exp); err != nil {
			var unavailable *frontendorigins.StoreUnavailableError
			if !errors.As(err, &unavailable) {
				return auth.RequestInfo{}, err
			}
		}
	}
	if err := authService.SetAuthCookie(w, r, token); err != nil {
		return auth.RequestInfo{}, err
	}
	return authService.ValidateAuthCookie(token, now)
}

func writeUnauthorizedAuthResponse(w http.ResponseWriter, r *http.Request) {
	if requiresJSONUnauthorizedAuthResponse(r.URL.Path) {
		writeError(w, r, http.StatusUnauthorized, "unauthorized", "Unauthorized.")
		return
	}
	writeUnauthorizedBootstrapHTML(w)
}

func requiresJSONUnauthorizedAuthResponse(path string) bool {
	if strings.HasPrefix(path, apiPrefix) {
		return true
	}
	return path == RouteMCPToolCall
}

func writeAuthMiddlewareError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, auth.ErrMissingCurrentSession) {
		writeError(w, r, http.StatusUnauthorized, "missing_session", "Missing session.")
		return
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

func shouldAutoAuthDevRequest(r *http.Request, trustedOrigins *frontendorigins.Service, sessionID string) bool {
	if strings.TrimSpace(os.Getenv(devFrontendPortEnv)) == "" {
		return false
	}
	clientHost := requestClientHost(r)
	if clientHost != "127.0.0.1" && clientHost != "::1" {
		return false
	}
	return frontendorigins.HasTrustedFrontendOrigin(r, trustedOrigins, sessionID)
}

func requestClientHost(r *http.Request) string {
	if r == nil {
		return ""
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func modeContextMiddleware(policy modes.Policy) func(http.Handler) http.Handler {
	resolvedPolicy := modes.NewPolicy(policy.Mode())

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestInfo, ok := modes.RequestInfoFromRequest(r)
			if !ok {
				requestInfo = modes.RequestInfo{Policy: resolvedPolicy}
			} else {
				requestInfo.Policy = resolvedPolicy
			}
			next.ServeHTTP(w, withModesRequestInfo(r, requestInfo))
		})
	}
}

func modeRequirementMiddleware(policy modes.Policy, require func() error) func(http.Handler) http.Handler {
	resolvedPolicy := modes.NewPolicy(policy.Mode())

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if err := require(); err != nil {
				if writeModesError(w, r, err) {
					return
				}
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}

			requestInfo, ok := modes.RequestInfoFromRequest(r)
			if !ok {
				requestInfo = modes.RequestInfo{Policy: resolvedPolicy}
			} else {
				requestInfo.Policy = resolvedPolicy
			}
			next.ServeHTTP(w, withModesRequestInfo(r, requestInfo))
		})
	}
}

func writeModesError(w http.ResponseWriter, r *http.Request, err error) bool {
	var violation *modes.Violation
	if errors.As(err, &violation) {
		writeError(w, r, violation.StatusCode, violation.Code, violation.Message)
		return true
	}

	var missingShareSession *modes.MissingShareSessionError
	if errors.As(err, &missingShareSession) {
		writeError(w, r, http.StatusBadRequest, "missing_share_session", missingShareSession.Error())
		return true
	}

	var unknownShareSession *modes.UnknownShareSessionError
	if errors.As(err, &unknownShareSession) {
		writeError(w, r, http.StatusNotFound, "unknown_share_session", unknownShareSession.Error())
		return true
	}

	return false
}

func withModesRequestInfo(r *http.Request, requestInfo modes.RequestInfo) *http.Request {
	return r.WithContext(modes.ContextWithRequestInfo(r.Context(), requestInfo))
}

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := buildRequestID()
		ctx := context.WithValue(r.Context(), requestIDContextKey{}, requestID)
		w.Header().Set("X-Request-Id", requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func recoveryMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error(
						"http panic recovered",
						slog.String("request_id", requestIDFromContext(r.Context())),
						slog.String("method", r.Method),
						slog.String("path", r.URL.Path),
						slog.Any("panic", recovered),
					)
					writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func accessLogMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			startedAt := time.Now()
			next.ServeHTTP(recorder, r)
			logger.Info(
				"http request complete",
				slog.String("request_id", requestIDFromContext(r.Context())),
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", recorder.status),
				slog.Duration("duration", time.Since(startedAt)),
			)
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		panic(err)
	}
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code string, message string) {
	writeJSON(w, status, errorResponse{
		Error: errorDetail{
			Code:      code,
			Message:   message,
			RequestID: requestIDFromContext(r.Context()),
		},
	})
}

func writeDetail(w http.ResponseWriter, status int, detail any) {
	writeJSON(w, status, map[string]any{"detail": detail})
}

func writeValidationError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, validationErrorResponse{
		StatusCode: 10422,
		Message:    message,
		Data:       nil,
	})
}

type rawJSONBodyContextKey struct{}

func decodeJSONBody[T any](r *http.Request) (T, error) {
	var payload T
	if r.Body == nil {
		return payload, nil
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	*r = *r.WithContext(context.WithValue(r.Context(), rawJSONBodyContextKey{}, append([]byte(nil), bodyBytes...)))

	if len(strings.TrimSpace(string(bodyBytes))) == 0 {
		return payload, nil
	}
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	return payload, nil
}

func rawJSONBodyFromRequest(r *http.Request) []byte {
	if r == nil {
		return nil
	}
	value, _ := r.Context().Value(rawJSONBodyContextKey{}).([]byte)
	return append([]byte(nil), value...)
}

func requestHasTopLevelJSONField(r *http.Request, field string, allowNull bool) (bool, error) {
	body := bytes.TrimSpace(rawJSONBodyFromRequest(r))
	if len(body) == 0 {
		body = []byte("{}")
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return false, err
	}

	value, ok := fields[field]
	if !ok {
		return false, nil
	}
	if !allowNull && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return false, nil
	}
	return true, nil
}

type requestIDContextKey struct{}

func requestIDFromContext(ctx context.Context) string {
	value, _ := ctx.Value(requestIDContextKey{}).(string)
	return value
}

func buildRequestID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err == nil {
		return hex.EncodeToString(buf[:])
	}
	return fmt.Sprintf("req-%d", time.Now().UnixNano())
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Flush() {
	flusher, ok := r.ResponseWriter.(http.Flusher)
	if !ok {
		return
	}
	flusher.Flush()
}

func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

func (r *statusRecorder) Push(target string, opts *http.PushOptions) error {
	pusher, ok := r.ResponseWriter.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}
	return pusher.Push(target, opts)
}

func (r *statusRecorder) ReadFrom(reader io.Reader) (int64, error) {
	readerFrom, ok := r.ResponseWriter.(io.ReaderFrom)
	if ok {
		return readerFrom.ReadFrom(reader)
	}
	return io.Copy(r.ResponseWriter, reader)
}

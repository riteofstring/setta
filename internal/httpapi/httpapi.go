package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

const apiPrefix = "/api"

type InfoService interface {
	ServerMode(context.Context) string
	RuntimeInfo(context.Context) RuntimeInfo
}

type RuntimeInfo struct {
	Mode   string            `json:"mode"`
	Paths  RuntimePaths      `json:"paths"`
	Policy RuntimePathPolicy `json:"policy"`
	Auth   RuntimeAuth       `json:"auth"`
}

type RuntimePaths struct {
	WorkspaceRoot      string `json:"workspaceRoot"`
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
	Logger   *slog.Logger
	Info     InfoService
	Register func(chi.Router)
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId,omitempty"`
}

func NewHandler(deps Dependencies) (http.Handler, error) {
	if deps.Logger == nil {
		return nil, fmt.Errorf("logger is required")
	}
	if deps.Info == nil {
		return nil, fmt.Errorf("info service is required")
	}

	router := chi.NewRouter()
	router.Use(requestIDMiddleware)
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

	router.Route(apiPrefix, func(r chi.Router) {
		r.Get("/serverMode", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{
				"mode": deps.Info.ServerMode(r.Context()),
			})
		})
		r.Get("/runtimeInfo", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, deps.Info.RuntimeInfo(r.Context()))
		})
		if deps.Register != nil {
			deps.Register(r)
		}
	})

	return router, nil
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

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

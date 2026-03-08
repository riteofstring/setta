package httpapi

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
)

const (
	RouteGetBackendInitStatus = "/backendInitStatus"
	RouteGetAuthRefreshStatus = "/authRefreshStatus"
	RouteGetServerMode        = "/serverMode"
	RouteGetSettaHomeInfo     = "/settaHomeInfo"
)

type StatusRouteDependencies struct {
	ModePolicy               modes.Policy
	SettaHome                string
	GlobalSettaFilesBase     string
	ActiveSettaFilesLocation string
	SettaFilesRoot           string
	AuthRefreshWindowSeconds int
	WorktreeName             string
	ReadyAt                  time.Time
}

type backendInitEvent struct {
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type backendInitStatusResponse struct {
	Events                         []backendInitEvent `json:"events"`
	IsReady                        bool               `json:"isReady"`
	Error                          *string            `json:"error"`
	AuthCookieRefreshWindowSeconds int                `json:"authCookieRefreshWindowSeconds"`
	WorktreeName                   *string            `json:"worktreeName"`
}

type authRefreshStatusResponse struct {
	AuthCookieRefreshWindowSeconds int `json:"authCookieRefreshWindowSeconds"`
}

type settaHomeInfoResponse struct {
	SettaHome                string  `json:"settaHome"`
	GlobalSettaFilesBase     string  `json:"globalSettaFilesBase"`
	ActiveSettaFilesLocation *string `json:"activeSettaFilesLocation"`
	LLMConfigPath            string  `json:"llmConfigPath"`
}

func RegisterStatusRoutes(router chi.Router, deps StatusRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("status routes: router is required")
	}
	if deps.ReadyAt.IsZero() {
		deps.ReadyAt = time.Now().UTC()
	}

	router.Get(RouteGetBackendInitStatus, getBackendInitStatusHandler(deps))
	router.Get(RouteGetAuthRefreshStatus, getAuthRefreshStatusHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetSettaHomeInfo, getSettaHomeInfoHandler(deps))
	return nil
}

func getBackendInitStatusHandler(deps StatusRouteDependencies) http.HandlerFunc {
	readyAt := deps.ReadyAt.UTC()
	worktreeName := optionalTrimmedString(deps.WorktreeName)
	events := []backendInitEvent{{
		Message:   "Go backend ready",
		Timestamp: readyAt,
	}}

	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, backendInitStatusResponse{
			Events:                         events,
			IsReady:                        true,
			Error:                          nil,
			AuthCookieRefreshWindowSeconds: deps.AuthRefreshWindowSeconds,
			WorktreeName:                   worktreeName,
		})
	}
}

func getAuthRefreshStatusHandler(deps StatusRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, authRefreshStatusResponse{
			AuthCookieRefreshWindowSeconds: deps.AuthRefreshWindowSeconds,
		})
	}
}

func getSettaHomeInfoHandler(deps StatusRouteDependencies) http.HandlerFunc {
	settaHome := strings.TrimSpace(deps.SettaHome)
	globalSettaFilesBase := strings.TrimSpace(deps.GlobalSettaFilesBase)
	activeSettaFilesLocation := optionalTrimmedString(deps.ActiveSettaFilesLocation)
	llmConfigPath := filepath.Join(strings.TrimSpace(deps.SettaFilesRoot), "llm_config.json")

	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, settaHomeInfoResponse{
			SettaHome:                settaHome,
			GlobalSettaFilesBase:     globalSettaFilesBase,
			ActiveSettaFilesLocation: activeSettaFilesLocation,
			LLMConfigPath:            llmConfigPath,
		})
	}
}

func optionalTrimmedString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/pathreveal"
)

const (
	RouteGetBackendInitStatus       = "/backendInitStatus"
	RouteGetAuthRefreshStatus       = "/authRefreshStatus"
	RouteGetServerMode              = "/serverMode"
	RouteGetSettaHomeInfo           = "/settaHomeInfo"
	RouteRevealPathInOSFileExplorer = "/revealPathInOsFileExplorer"
)

type StatusRouteDependencies struct {
	ModePolicy               modes.Policy
	SettaHome                string
	GlobalSettaFilesBase     string
	ActiveSettaFilesLocation string
	SettaFilesRoot           string
	RevealPath               *pathreveal.Service
	AuthRefreshWindowSeconds int
	WorktreeName             string
	ReadyAt                  time.Time
}

type BackendInitEvent struct {
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type BackendInitStatusResponse struct {
	Events                         []BackendInitEvent `json:"events"`
	IsReady                        bool               `json:"isReady"`
	Error                          *string            `json:"error"`
	AuthCookieRefreshWindowSeconds int                `json:"authCookieRefreshWindowSeconds"`
	WorktreeName                   *string            `json:"worktreeName"`
}

type AuthRefreshStatusResponse struct {
	AuthCookieRefreshWindowSeconds int `json:"authCookieRefreshWindowSeconds"`
}

type ServerModeResponse struct {
	Mode string `json:"mode"`
}

type SettaHomeInfoResponse struct {
	SettaHome                string  `json:"settaHome"`
	GlobalSettaFilesBase     string  `json:"globalSettaFilesBase"`
	ActiveSettaFilesLocation *string `json:"activeSettaFilesLocation"`
	LLMConfigPath            string  `json:"llmConfigPath"`
}

type RevealPathInOSFileExplorerRequest struct {
	Path string `json:"path"`
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
	if deps.RevealPath != nil {
		router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteRevealPathInOSFileExplorer, revealPathInOSFileExplorerHandler(deps.RevealPath))
	}
	return nil
}

func getBackendInitStatusHandler(deps StatusRouteDependencies) http.HandlerFunc {
	readyAt := deps.ReadyAt.UTC()
	worktreeName := optionalTrimmedString(deps.WorktreeName)
	events := []BackendInitEvent{{
		Message:   "Go backend ready",
		Timestamp: readyAt,
	}}

	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, BackendInitStatusResponse{
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
		writeJSON(w, http.StatusOK, AuthRefreshStatusResponse{
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
		writeJSON(w, http.StatusOK, SettaHomeInfoResponse{
			SettaHome:                settaHome,
			GlobalSettaFilesBase:     globalSettaFilesBase,
			ActiveSettaFilesLocation: activeSettaFilesLocation,
			LLMConfigPath:            llmConfigPath,
		})
	}
}

func revealPathInOSFileExplorerHandler(service *pathreveal.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[RevealPathInOSFileExplorerRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if err := service.Reveal(r.Context(), payload.Path); err != nil {
			writeRevealPathError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func optionalTrimmedString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func writeRevealPathError(w http.ResponseWriter, r *http.Request, err error) {
	var revealErr *pathreveal.Error
	if !errors.As(err, &revealErr) {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return
	}
	switch revealErr.Kind {
	case pathreveal.ErrorInvalidRequest:
		writeError(w, r, http.StatusBadRequest, "invalid_request", revealErr.Message)
	case pathreveal.ErrorNotFound:
		writeError(w, r, http.StatusNotFound, "path_not_found", revealErr.Message)
	case pathreveal.ErrorUnavailable, pathreveal.ErrorExecution:
		writeError(w, r, http.StatusInternalServerError, "path_reveal_failed", revealErr.Message)
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

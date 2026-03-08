package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

const (
	RouteLoadAllProjectMetadata = "/loadAllProjectMetadata"
	RouteLoadProjectConfig      = "/loadProjectConfig"
	RouteSetProjectConfigName   = "/setProjectConfigName"
	RouteGetNotifications       = "/getNotifications"
	RouteDeleteNotification     = "/deleteNotification"
)

type ProjectShellRouteDependencies struct {
	ModePolicy    modes.Policy
	Shell         ProjectShellService
	Notifications ProjectNotificationService
}

type ProjectShellService interface {
	LoadAllProjectMetadata(ctx context.Context) (projectshell.AllProjectMetadata, error)
	LoadProjectConfig(ctx context.Context, projectConfigName string) (projectview.SingleConfig, error)
	SetProjectConfigName(ctx context.Context, projectConfigID string, newName string) error
}

type ProjectNotificationService interface {
	GetNotifications(ctx context.Context, projectConfigID string) ([]notifications.Notification, error)
	DeleteNotification(ctx context.Context, notificationID string) (bool, error)
}

type ProjectLoadRequest struct {
	ProjectConfigName string `json:"projectConfigName"`
}

type SetProjectConfigNameRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	NewName         string `json:"newName"`
}

type GetNotificationsRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type DeleteNotificationRequest struct {
	NotificationID string `json:"notificationId"`
}

func RegisterProjectShellRoutes(router chi.Router, deps ProjectShellRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.Shell == nil {
			return fmt.Errorf("project shell service is required in ide mode")
		}
		if deps.Notifications == nil {
			return fmt.Errorf("project notification service is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteLoadAllProjectMetadata, loadAllProjectMetadataHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteLoadProjectConfig, loadProjectConfigHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectConfigName, setProjectConfigNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetNotifications, getNotificationsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteNotification, deleteNotificationHandler(deps))
	return nil
}

func loadAllProjectMetadataHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := decodeJSONBody[struct{}](r); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Shell == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		metadata, err := deps.Shell.LoadAllProjectMetadata(r.Context())
		if err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, metadata)
	}
}

func loadProjectConfigHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ProjectLoadRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Shell == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectStateView, err := deps.Shell.LoadProjectConfig(r.Context(), strings.TrimSpace(payload.ProjectConfigName))
		if err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectStateView)
	}
}

func setProjectConfigNameHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectConfigNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Shell == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.Shell.SetProjectConfigName(r.Context(), payload.ProjectConfigID, payload.NewName); err != nil {
			writeProjectNameMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func getNotificationsHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetNotificationsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Notifications == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		entries, err := deps.Notifications.GetNotifications(r.Context(), payload.ProjectConfigID)
		if err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}

func deleteNotificationHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteNotificationRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Notifications == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.Notifications.DeleteNotification(r.Context(), payload.NotificationID); err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func writeProjectShellRouteError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectLookupNameRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_name_required", "Project config name is required.")
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, notifications.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, notifications.ErrNotificationIDRequired):
		writeError(w, r, http.StatusBadRequest, "notification_id_required", "Notification id is required.")
	case errors.Is(err, projectstate.ErrProjectNameAmbiguous):
		writeError(w, r, http.StatusConflict, "project_config_name_ambiguous", "Project config name resolves to multiple projects.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case projectstate.IsInvalidProjectNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

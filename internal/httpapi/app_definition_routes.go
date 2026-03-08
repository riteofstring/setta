package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/appspec"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const (
	RouteGetAppDefinition      = "/getAppDefinition"
	RouteSetAppDefinition      = "/setAppDefinition"
	RouteValidateAppDefinition = "/validateAppDefinition"
	RouteGetAppCatalog         = "/getAppCatalog"
)

type AppDefinitionRouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
}

type GetAppDefinitionRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
}

type SetAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecPath    *string                  `json:"appSpecPath"`
	AppSpecVersion *string                  `json:"appSpecVersion"`
	CatalogID      *string                  `json:"catalogId"`
	Routes         *[]projectstate.AppRoute `json:"routes"`
	DataBindings   *map[string]any          `json:"dataBindings"`
	Actions        *map[string]any          `json:"actions"`
	Theme          *map[string]any          `json:"theme"`
	Assets         *[]any                   `json:"assets"`
}

type ValidateAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecVersion *string                  `json:"appSpecVersion"`
	CatalogID      *string                  `json:"catalogId"`
	Routes         *[]projectstate.AppRoute `json:"routes"`
	DataBindings   *map[string]any          `json:"dataBindings"`
	Actions        *map[string]any          `json:"actions"`
	Theme          *map[string]any          `json:"theme"`
	Assets         *[]any                   `json:"assets"`
}

func RegisterAppDefinitionRoutes(router chi.Router, deps AppDefinitionRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.ProjectState == nil {
		return fmt.Errorf("project-state app-definition runtime is required in ide mode")
	}

	guard := RequireFullIDERuntime(deps.ModePolicy)
	router.With(guard).Get(RouteGetAppCatalog, getAppCatalogHandler())
	router.With(guard).Post(RouteGetAppDefinition, getAppDefinitionHandler(deps))
	router.With(guard).Post(RouteValidateAppDefinition, validateAppDefinitionHandler(deps))
	router.With(guard).Post(RouteSetAppDefinition, setAppDefinitionHandler(deps))
	return nil
}

func getAppCatalogHandler() http.HandlerFunc {
	catalog := appspec.DefaultCatalog()
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, catalog)
	}
}

func getAppDefinitionHandler(deps AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[GetAppDefinitionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		result, err := deps.ProjectState.GetAppDefinition(projectMutationContext(r.Context(), payload.FrontendOpID))
		if err != nil {
			writeAppDefinitionRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func validateAppDefinitionHandler(deps AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[ValidateAppDefinitionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		result, err := deps.ProjectState.ValidateAppDefinition(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectstate.ValidateAppDefinitionInput{
				AppSpec:        payload.AppSpec,
				AppSpecVersion: payload.AppSpecVersion,
				CatalogID:      payload.CatalogID,
				Routes:         payload.Routes,
				DataBindings:   payload.DataBindings,
				Actions:        payload.Actions,
				Theme:          payload.Theme,
				Assets:         payload.Assets,
			},
		)
		if err != nil {
			writeAppDefinitionRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func setAppDefinitionHandler(deps AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[SetAppDefinitionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		_, result, err := deps.ProjectState.SetAppDefinition(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectstate.SetAppDefinitionInput{
				AppSpec:        payload.AppSpec,
				AppSpecPath:    payload.AppSpecPath,
				AppSpecVersion: payload.AppSpecVersion,
				CatalogID:      payload.CatalogID,
				Routes:         payload.Routes,
				DataBindings:   payload.DataBindings,
				Actions:        payload.Actions,
				Theme:          payload.Theme,
				Assets:         payload.Assets,
			},
		)
		if err != nil {
			writeAppDefinitionRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func writeAppDefinitionRouteError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrAppSpecStoreUnsupported):
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	case errors.Is(err, projectstate.ErrAppSpecPathUnconfigured),
		errors.Is(err, projectstate.ErrAppSpecNotFound):
		writeError(w, r, http.StatusNotFound, "app_spec_not_found", err.Error())
	default:
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", err.Error())
	}
}

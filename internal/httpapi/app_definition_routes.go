package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"sort"

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
	ModePolicy modes.Policy
	Service    projectstate.AppDefinitionRuntime
}

type GetAppDefinitionRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
}

type SetAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId,omitempty"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecPath    *string                  `json:"appSpecPath,omitempty"`
	AppSpecVersion *string                  `json:"appSpecVersion,omitempty"`
	CatalogID      *string                  `json:"catalogId,omitempty"`
	Routes         *[]projectstate.AppRoute `json:"routes,omitempty"`
	DataBindings   *map[string]any          `json:"dataBindings,omitempty"`
	Actions        *map[string]any          `json:"actions,omitempty"`
	Theme          *map[string]any          `json:"theme,omitempty"`
	Assets         *[]any                   `json:"assets,omitempty"`
}

type ValidateAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId,omitempty"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecVersion *string                  `json:"appSpecVersion,omitempty"`
	CatalogID      *string                  `json:"catalogId,omitempty"`
	Routes         *[]projectstate.AppRoute `json:"routes,omitempty"`
	DataBindings   *map[string]any          `json:"dataBindings,omitempty"`
	Actions        *map[string]any          `json:"actions,omitempty"`
	Theme          *map[string]any          `json:"theme,omitempty"`
	Assets         *[]any                   `json:"assets,omitempty"`
}

type AppCatalogPropResponse struct {
	Type       appspec.PropType `json:"type"`
	Responsive bool             `json:"responsive,omitempty"`
	Required   bool             `json:"required,omitempty"`
	Min        *float64         `json:"min,omitempty"`
	Max        *float64         `json:"max,omitempty"`
	Enum       []any            `json:"enum,omitempty"`
	Default    any              `json:"default,omitempty"`
}

type AppCatalogComponentResponse struct {
	Type     string                            `json:"type"`
	Children bool                              `json:"children"`
	Props    map[string]AppCatalogPropResponse `json:"props,omitempty"`
}

type AppCatalogActionResponse struct {
	Name string `json:"name"`
}

type AppCatalogResponse struct {
	ID         string                        `json:"id"`
	Version    string                        `json:"version"`
	Components []AppCatalogComponentResponse `json:"components"`
	Actions    []AppCatalogActionResponse    `json:"actions"`
}

func RegisterAppDefinitionRoutes(router chi.Router, deps AppDefinitionRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}

	registerOpenAPIGet[AppCatalogResponse](
		router,
		"getAppCatalog",
		RouteGetAppCatalog,
		getAppCatalogHandler(),
		withOpenAPITags("App Definition"),
		withOpenAPISummary("Get the built-in standalone app component catalog."),
	)
	registerOpenAPIPost[GetAppDefinitionRequest, projectstate.AppDefinitionReadResult](
		router,
		"getAppDefinition",
		RouteGetAppDefinition,
		getAppDefinitionHandler(deps),
		withOpenAPITags("App Definition"),
		withOpenAPISummary("Load the current app definition and resolved app spec."),
		withOpenAPIModeRequirement("not-deployment"),
	)
	registerOpenAPIPost[ValidateAppDefinitionRequest, projectstate.AppDefinitionValidationResult](
		router,
		"validateAppDefinition",
		RouteValidateAppDefinition,
		validateAppDefinitionHandler(deps),
		withOpenAPITags("App Definition"),
		withOpenAPISummary("Validate an app definition payload against the current catalog."),
		withOpenAPIModeRequirement("not-deployment"),
	)
	registerOpenAPIPost[SetAppDefinitionRequest, projectstate.AppDefinitionMutationResult](
		router,
		"setAppDefinition",
		RouteSetAppDefinition,
		setAppDefinitionHandler(deps),
		withOpenAPITags("App Definition"),
		withOpenAPISummary("Persist a standalone app definition."),
		withOpenAPIModeRequirement("not-deployment"),
	)
	return nil
}

func getAppCatalogHandler() http.HandlerFunc {
	catalog := buildAppCatalogResponse(appspec.DefaultCatalog())
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, catalog)
	}
}

func buildAppCatalogResponse(catalog appspec.Catalog) AppCatalogResponse {
	componentNames := make([]string, 0, len(catalog.Components))
	for name := range catalog.Components {
		componentNames = append(componentNames, name)
	}
	sort.Strings(componentNames)

	components := make([]AppCatalogComponentResponse, 0, len(componentNames))
	for _, name := range componentNames {
		component := catalog.Components[name]
		props := make(map[string]AppCatalogPropResponse, len(component.Props))
		for propName, prop := range component.Props {
			props[propName] = AppCatalogPropResponse{
				Type:       prop.Type,
				Responsive: prop.Responsive,
				Required:   prop.Required,
				Min:        prop.Min,
				Max:        prop.Max,
				Enum:       append([]any(nil), prop.Enum...),
				Default:    prop.Default,
			}
		}
		components = append(components, AppCatalogComponentResponse{
			Type:     component.Type,
			Children: component.Children,
			Props:    props,
		})
	}

	actionNames := make([]string, 0, len(catalog.Actions))
	for name := range catalog.Actions {
		actionNames = append(actionNames, name)
	}
	sort.Strings(actionNames)

	actions := make([]AppCatalogActionResponse, 0, len(actionNames))
	for _, name := range actionNames {
		actions = append(actions, AppCatalogActionResponse{Name: name})
	}

	return AppCatalogResponse{
		ID:         catalog.ID,
		Version:    catalog.Version,
		Components: components,
		Actions:    actions,
	}
}

func getAppDefinitionHandler(deps AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			writeDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := decodeJSONBody[GetAppDefinitionRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		result, err := deps.Service.GetAppDefinition(projectMutationContext(r.Context(), payload.FrontendOpID))
		if err != nil {
			writeAppDefinitionRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func validateAppDefinitionHandler(deps AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			writeDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := decodeJSONBody[ValidateAppDefinitionRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			writeValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		result, err := deps.Service.ValidateAppDefinition(
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
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			writeDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := decodeJSONBody[SetAppDefinitionRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			writeValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		_, result, err := deps.Service.SetAppDefinition(
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

func appDefinitionModeDetail(policy modes.Policy) (string, bool) {
	if policy.IsDeployment() {
		return "Deployment mode disallows structural changes.", true
	}
	return "", false
}

func writeAppDefinitionRouteError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrAppSpecStoreUnsupported):
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	case errors.Is(err, projectstate.ErrAppSpecPathUnconfigured),
		errors.Is(err, projectstate.ErrAppSpecNotFound):
		writeDetail(w, http.StatusNotFound, err.Error())
	default:
		writeDetail(w, http.StatusUnprocessableEntity, err.Error())
	}
}

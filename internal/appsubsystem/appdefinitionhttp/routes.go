package appdefinitionhttp

import (
	"errors"
	"fmt"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type RouteDependencies struct {
	ModePolicy modes.Policy
	Service    appdefinition.Runtime
}

func RegisterRoutes(router chi.Router, deps RouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	httpapi.RegisterOpenAPIGet[AppCatalogResponse](
		router,
		"getAppCatalog",
		httpapi.RouteGetAppCatalog,
		getAppCatalogHandler(),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Get the built-in standalone app component catalog."),
	)
	httpapi.RegisterOpenAPIPost[GetAppDefinitionRequest, appdefinition.ReadResult](
		router,
		"getAppDefinition",
		httpapi.RouteGetAppDefinition,
		getAppDefinitionHandler(deps.ModePolicy, deps.Service),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Load the current app definition and resolved app spec."),
		httpapi.WithOpenAPIModeRequirement("not-deployment"),
	)
	httpapi.RegisterOpenAPIPost[ValidateAppDefinitionRequest, appdefinition.ValidationResult](
		router,
		"validateAppDefinition",
		httpapi.RouteValidateAppDefinition,
		validateAppDefinitionHandler(deps.ModePolicy, deps.Service),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Validate an app definition payload against the current catalog."),
		httpapi.WithOpenAPIModeRequirement("not-deployment"),
	)
	httpapi.RegisterOpenAPIPost[SetAppDefinitionRequest, appdefinition.MutationResult](
		router,
		"setAppDefinition",
		httpapi.RouteSetAppDefinition,
		setAppDefinitionHandler(deps.ModePolicy, deps.Service),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Persist a standalone app definition."),
		httpapi.WithOpenAPIModeRequirement("not-deployment"),
	)
	return nil
}

func getAppCatalogHandler() http.HandlerFunc {
	catalog := buildAppCatalogResponse(appspec.DefaultCatalog())
	return func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteJSON(w, http.StatusOK, catalog)
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

func getAppDefinitionHandler(
	modePolicy modes.Policy,
	service appdefinition.Runtime,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(modePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[GetAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		result, err := service.GetAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
		)
		if err != nil {
			writeRouteError(w, r, err)
			return
		}
		httpapi.WriteJSON(w, http.StatusOK, result)
	}
}

func validateAppDefinitionHandler(
	modePolicy modes.Policy,
	service appdefinition.Runtime,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(modePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[ValidateAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		result, err := service.ValidateAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
			appdefinition.ValidateInput{
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
			writeRouteError(w, r, err)
			return
		}
		httpapi.WriteJSON(w, http.StatusOK, result)
	}
}

func setAppDefinitionHandler(
	modePolicy modes.Policy,
	service appdefinition.Runtime,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(modePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[SetAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		_, result, err := service.SetAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
			appdefinition.SetInput{
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
			writeRouteError(w, r, err)
			return
		}
		httpapi.WriteJSON(w, http.StatusOK, result)
	}
}

func appDefinitionModeDetail(policy modes.Policy) (string, bool) {
	if policy.IsDeployment() {
		return "Deployment mode disallows structural changes.", true
	}
	return "", false
}

func writeRouteError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	case errors.Is(err, appdefinition.ErrAppSpecPathUnconfigured),
		errors.Is(err, appdefinition.ErrAppSpecNotFound):
		httpapi.WriteDetail(w, http.StatusNotFound, err.Error())
	default:
		httpapi.WriteDetail(w, http.StatusUnprocessableEntity, err.Error())
	}
}

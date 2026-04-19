package settajsonrenderappgenbackend

import (
	"errors"
	"fmt"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"setta/internal/appspec"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func RegisterAppDefinitionRoutes(router chi.Router, deps httpapi.AppDefinitionRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}

	httpapi.RegisterOpenAPIGet[httpapi.AppCatalogResponse](
		router,
		"getAppCatalog",
		httpapi.RouteGetAppCatalog,
		getAppCatalogHandler(),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Get the built-in standalone app component catalog."),
	)
	httpapi.RegisterOpenAPIPost[httpapi.GetAppDefinitionRequest, projectstate.AppDefinitionReadResult](
		router,
		"getAppDefinition",
		httpapi.RouteGetAppDefinition,
		getAppDefinitionHandler(deps),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Load the current app definition and resolved app spec."),
		httpapi.WithOpenAPIModeRequirement("not-deployment"),
	)
	httpapi.RegisterOpenAPIPost[httpapi.ValidateAppDefinitionRequest, projectstate.AppDefinitionValidationResult](
		router,
		"validateAppDefinition",
		httpapi.RouteValidateAppDefinition,
		validateAppDefinitionHandler(deps),
		httpapi.WithOpenAPITags("App Definition"),
		httpapi.WithOpenAPISummary("Validate an app definition payload against the current catalog."),
		httpapi.WithOpenAPIModeRequirement("not-deployment"),
	)
	httpapi.RegisterOpenAPIPost[httpapi.SetAppDefinitionRequest, projectstate.AppDefinitionMutationResult](
		router,
		"setAppDefinition",
		httpapi.RouteSetAppDefinition,
		setAppDefinitionHandler(deps),
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

func buildAppCatalogResponse(catalog appspec.Catalog) httpapi.AppCatalogResponse {
	componentNames := make([]string, 0, len(catalog.Components))
	for name := range catalog.Components {
		componentNames = append(componentNames, name)
	}
	sort.Strings(componentNames)

	components := make([]httpapi.AppCatalogComponentResponse, 0, len(componentNames))
	for _, name := range componentNames {
		component := catalog.Components[name]
		props := make(map[string]httpapi.AppCatalogPropResponse, len(component.Props))
		for propName, prop := range component.Props {
			props[propName] = httpapi.AppCatalogPropResponse{
				Type:       prop.Type,
				Responsive: prop.Responsive,
				Required:   prop.Required,
				Min:        prop.Min,
				Max:        prop.Max,
				Enum:       append([]any(nil), prop.Enum...),
				Default:    prop.Default,
			}
		}
		components = append(components, httpapi.AppCatalogComponentResponse{
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

	actions := make([]httpapi.AppCatalogActionResponse, 0, len(actionNames))
	for _, name := range actionNames {
		actions = append(actions, httpapi.AppCatalogActionResponse{Name: name})
	}

	return httpapi.AppCatalogResponse{
		ID:         catalog.ID,
		Version:    catalog.Version,
		Components: components,
		Actions:    actions,
	}
}

func getAppDefinitionHandler(deps httpapi.AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[httpapi.GetAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		result, err := deps.Service.GetAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
		)
		if err != nil {
			writeAppDefinitionRouteError(w, r, err)
			return
		}
		httpapi.WriteJSON(w, http.StatusOK, result)
	}
}

func validateAppDefinitionHandler(deps httpapi.AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[httpapi.ValidateAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		result, err := deps.Service.ValidateAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
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
		httpapi.WriteJSON(w, http.StatusOK, result)
	}
}

func setAppDefinitionHandler(deps httpapi.AppDefinitionRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := appDefinitionModeDetail(deps.ModePolicy); blocked {
			httpapi.WriteDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.Service == nil {
			httpapi.WriteDetail(w, http.StatusNotFound, "Project manager not available.")
			return
		}
		payload, err := httpapi.DecodeJSONBody[httpapi.SetAppDefinitionRequest](r)
		if err != nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.AppSpec == nil {
			httpapi.WriteValidationError(w, http.StatusUnprocessableEntity, "appSpec: Field required")
			return
		}

		_, result, err := deps.Service.SetAppDefinition(
			httpapi.ProjectMutationContext(r.Context(), payload.FrontendOpID),
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
		httpapi.WriteJSON(w, http.StatusOK, result)
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
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	case errors.Is(err, projectstate.ErrAppSpecPathUnconfigured),
		errors.Is(err, projectstate.ErrAppSpecNotFound):
		httpapi.WriteDetail(w, http.StatusNotFound, err.Error())
	default:
		httpapi.WriteDetail(w, http.StatusUnprocessableEntity, err.Error())
	}
}

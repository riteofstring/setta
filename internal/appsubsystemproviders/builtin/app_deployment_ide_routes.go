package settajsonrenderappgenbackend

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystemproviders/builtin/appdeploymenthttp"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type AppDeploymentIDERouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Catalog      *deployments.Catalog
	AppPublisher deployments.AppPublishService
	PluginID     string
}

type appDeploymentNameRouteParams struct {
	DeploymentName string `json:"deploymentName"`
}

func RegisterAppDeploymentIDERoutes(
	router chi.Router,
	deps AppDeploymentIDERouteDependencies,
) error {
	if err := validateAppDeploymentIDERouteDependencies(router, deps); err != nil {
		return err
	}
	if !deps.ModePolicy.IsIDE() {
		return nil
	}

	ideRouter := router.With(httpapi.RequireIDEMode(deps.ModePolicy))
	httpapi.RegisterOpenAPIGet[[]httpapi.DeploymentMetadataResponse](
		ideRouter,
		"listAppDeployments",
		httpapi.RouteAppDeployments,
		httpapi.ListDeploymentMetadataHandler(deps.Catalog, deployments.TypeApp),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("List published app deployments."),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	httpapi.RegisterOpenAPIGet[[]httpapi.DeploymentMetadataResponse](
		ideRouter,
		"listAppDeploymentVersions",
		httpapi.RouteAppDeploymentVersions,
		httpapi.ListDeploymentVersionMetadataHandler(deps.Catalog, deployments.TypeApp),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("List published versions for an app deployment."),
		httpapi.WithOpenAPIPathParams[appDeploymentNameRouteParams](),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	httpapi.RegisterOpenAPIGet[httpapi.DeploymentMetadataResponse](
		ideRouter,
		"getAppDeploymentLatest",
		httpapi.RouteAppDeploymentLatest,
		httpapi.LatestDeploymentMetadataHandler(deps.Catalog, deployments.TypeApp),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Get the latest published version for an app deployment."),
		httpapi.WithOpenAPIPathParams[appDeploymentNameRouteParams](),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	httpapi.RegisterOpenAPIPost[appdeploymenthttp.PublishAppDeploymentRequest, httpapi.DeploymentMetadataResponse](
		ideRouter,
		"publishAppDeployment",
		httpapi.RouteAppDeployments,
		publishAppDeploymentHandler(deps.ProjectState, deps.AppPublisher),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Publish the current project config as an app deployment."),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	return nil
}

func validateAppDeploymentIDERouteDependencies(
	router chi.Router,
	deps AppDeploymentIDERouteDependencies,
) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsIDE() {
		return nil
	}
	documentOnly := httpapi.OpenAPIDocumentOnlyFromRouter(router)
	if deps.ProjectState == nil && !documentOnly {
		return fmt.Errorf("project state is required in ide mode")
	}
	if deps.Catalog == nil && !documentOnly {
		return fmt.Errorf("deployment catalog is required in ide mode")
	}
	if deps.AppPublisher == nil && !documentOnly {
		return fmt.Errorf("app deployment publisher is required in ide mode")
	}
	return nil
}

func publishAppDeploymentHandler(
	projectState *projectstate.Runtime,
	publisher deployments.AppPublishService,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := httpapi.DecodeStrictJSONBody[appdeploymenthttp.PublishAppDeploymentRequest](r)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			httpapi.WriteError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		result, err := publisher.Publish(r.Context(), deployments.AppPublishRequest{
			ProjectState:       projectState,
			ProjectID:          projectConfigID,
			DeploymentName:     payload.DeploymentName,
			PolicyOverrides:    payload.AppPolicyOverrides,
			ListenerEntrypoint: strings.TrimSpace(payload.ListenerEntrypoint),
			ListenerEnabled:    httpapi.ListenerEnabledOrDefault(payload.ListenerEnabled),
		})
		if err != nil {
			handleAppDeploymentPublishError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, httpapi.DeploymentMetadataResponseFromMetadata(result.Metadata))
	}
}

func handleAppDeploymentPublishError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, deployments.ErrAppPublishAppDefinitionMissing):
		httpapi.WriteError(w, r, http.StatusBadRequest, "app_definition_required", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecPathRequired):
		httpapi.WriteError(w, r, http.StatusBadRequest, "app_spec_path_required", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecNotFound):
		httpapi.WriteError(w, r, http.StatusBadRequest, "app_spec_not_found", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecInvalid):
		httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_app_spec", err.Error())
	default:
		httpapi.HandleDeploymentPublishError(w, r, err)
	}
}

package appdeploymenthttp

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type IDERouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Catalog      *deployments.Catalog
	AppPublisher deployments.AppPublishService
}

type deploymentNameRouteParams struct {
	DeploymentName string `json:"deploymentName"`
}

func RegisterIDERoutes(router chi.Router, deps IDERouteDependencies) error {
	if err := validateIDERouteDependencies(router, deps); err != nil {
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
		httpapi.WithOpenAPIAppSubsystemFrontendSDK(),
	)
	httpapi.RegisterOpenAPIGet[[]httpapi.DeploymentMetadataResponse](
		ideRouter,
		"listAppDeploymentVersions",
		httpapi.RouteAppDeploymentVersions,
		httpapi.ListDeploymentVersionMetadataHandler(deps.Catalog, deployments.TypeApp),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("List published versions for an app deployment."),
		httpapi.WithOpenAPIPathParams[deploymentNameRouteParams](),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	httpapi.RegisterOpenAPIGet[httpapi.DeploymentMetadataResponse](
		ideRouter,
		"getAppDeploymentLatest",
		httpapi.RouteAppDeploymentLatest,
		httpapi.LatestDeploymentMetadataHandler(deps.Catalog, deployments.TypeApp),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Get the latest published version for an app deployment."),
		httpapi.WithOpenAPIPathParams[deploymentNameRouteParams](),
		httpapi.WithOpenAPIModeRequirement("ide"),
	)
	httpapi.RegisterOpenAPIPost[PublishAppDeploymentRequest, httpapi.DeploymentMetadataResponse](
		ideRouter,
		"publishAppDeployment",
		httpapi.RouteAppDeployments,
		publishDeploymentHandler(deps.ProjectState, deps.AppPublisher),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Publish the current project config as an app deployment."),
		httpapi.WithOpenAPIModeRequirement("ide"),
		httpapi.WithOpenAPIAppSubsystemFrontendSDK(),
	)
	return nil
}

func validateIDERouteDependencies(router chi.Router, deps IDERouteDependencies) error {
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

func publishDeploymentHandler(
	projectState *projectstate.Runtime,
	publisher deployments.AppPublishService,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := httpapi.DecodeStrictJSONBody[PublishAppDeploymentRequest](r)
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
			handlePublishError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, httpapi.DeploymentMetadataResponseFromMetadata(result.Metadata))
	}
}

func handlePublishError(w http.ResponseWriter, r *http.Request, err error) {
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

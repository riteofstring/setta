package appdeploymenthttp

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/apppublish"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectview"
)

type deploymentVersionRouteParams struct {
	DeploymentName string `json:"deploymentName"`
	Version        string `json:"version"`
}

func RegisterDeploymentRoutes(
	router chi.Router,
	deps httpapi.DeploymentRouteDependencies,
	pluginID string,
) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsApp() {
		return nil
	}
	if deps.Deployment == nil && !httpapi.OpenAPIDocumentOnlyFromRouter(router) {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}
	storage, err := appdefinition.StorageForPlugin(pluginID)
	if err != nil {
		return err
	}

	httpapi.RegisterOpenAPIPostNoRequest[AppDeploymentSessionResponse](
		router,
		"getAppDeploymentCurrentSession",
		httpapi.RouteAppDeploymentCurrentSession,
		currentDeploymentSessionHandler(deps.Deployment),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Get or create the current app deployment session."),
		httpapi.WithOpenAPIModeRequirement("app"),
		httpapi.WithOpenAPIAppSubsystemFrontendSDK(),
	)
	appSessionRouter := router.With(httpapi.RequireShareSession(modes.Resolver{
		Policy: deps.ModePolicy,
		Store:  deps.Deployment,
	}))
	httpapi.RegisterOpenAPIGet[AppDeploymentStateResponse](
		appSessionRouter,
		"getAppDeploymentState",
		httpapi.RouteAppDeploymentState,
		deploymentStateHandler(deps.Deployment, storage, pluginID),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Load the default project state and app definition for an app deployment session."),
		httpapi.WithOpenAPIPathParams[deploymentVersionRouteParams](),
		httpapi.WithOpenAPIModeRequirement("app"),
		httpapi.WithOpenAPIAppSubsystemFrontendSDK(),
	)
	httpapi.RegisterOpenAPIPost[httpapi.LoadDeploymentProjectConfigRequest, AppDeploymentStateResponse](
		appSessionRouter,
		"getAppDeploymentProjectConfig",
		httpapi.RouteAppDeploymentProjectConfig,
		deploymentProjectConfigHandler(deps.Deployment, storage, pluginID),
		httpapi.WithOpenAPITags("App Deployments"),
		httpapi.WithOpenAPISummary("Load a specific project config and app definition from an app deployment session."),
		httpapi.WithOpenAPIPathParams[deploymentVersionRouteParams](),
		httpapi.WithOpenAPIModeRequirement("app"),
		httpapi.WithOpenAPIAppSubsystemFrontendSDK(),
	)
	return nil
}

func currentDeploymentSessionHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, err := httpapi.CurrentDeploymentSession(runtime, r)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		manifest := runtime.Manifest()
		httpapi.WriteJSON(w, http.StatusOK, AppDeploymentSessionResponse{
			DeploymentName:         manifest.DeploymentName,
			DeploymentVersion:      manifest.DeploymentVersion,
			ShareSessionID:         session.ID,
			SessionRunCount:        session.RunCount,
			DefaultProjectConfigID: manifest.DefaultProjectID,
			ProjectMetadata:        httpapi.DeploymentProjectMetadataFromRuntime(runtime),
			AppPolicy:              runtime.Policy(),
			Manifest:               &manifest,
		})
	}
}

func deploymentStateHandler(
	runtime *deployments.Runtime,
	storage appdefinition.DocumentStorage,
	pluginID string,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !httpapi.RequireDeploymentMatch(w, r, runtime, "App") {
			return
		}

		snapshot, err := httpapi.CurrentDeploymentSnapshot(runtime, r)
		if err != nil {
			httpapi.HandleDeploymentProjectStateError(w, r, err)
			return
		}
		projectState, err := projectview.DefaultSingleConfig(snapshot.Document)
		if err != nil {
			httpapi.HandleDeploymentProjectStateError(w, r, err)
			return
		}
		storedAppDefinition := storage.StoredDocumentAppDefinitionRaw(snapshot.Document)
		appSpec, err := apppublish.LoadPublishedAppSpecFromRuntime(
			runtime,
			storedAppDefinition,
			pluginID,
		)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		appDefinitionPayload, err := appdefinition.DecodeStoredAppDefinition(storedAppDefinition)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, AppDeploymentStateResponse{
			ProjectState:  projectState,
			AppDefinition: appDefinitionPayload,
			AppSpec:       appSpec,
			AppPolicy:     runtime.Policy(),
		})
	}
}

func deploymentProjectConfigHandler(
	runtime *deployments.Runtime,
	storage appdefinition.DocumentStorage,
	pluginID string,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !httpapi.RequireDeploymentMatch(w, r, runtime, "App") {
			return
		}

		payload, err := httpapi.DecodeStrictJSONBody[httpapi.LoadDeploymentProjectConfigRequest](r)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			httpapi.WriteError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		if err := httpapi.EnsureDeploymentListener(runtime, r, projectConfigID); err != nil {
			httpapi.HandleDeploymentProjectStateError(w, r, err)
			return
		}

		snapshot, err := httpapi.CurrentDeploymentSnapshot(runtime, r)
		if err != nil {
			httpapi.HandleDeploymentProjectStateError(w, r, err)
			return
		}

		projectState, err := projectview.SingleConfigByProjectID(snapshot.Document, projectConfigID)
		if err != nil {
			httpapi.HandleDeploymentProjectStateError(w, r, err)
			return
		}
		storedAppDefinition := storage.StoredDocumentAppDefinitionRaw(snapshot.Document)
		appSpec, err := apppublish.LoadPublishedAppSpecFromRuntime(
			runtime,
			storedAppDefinition,
			pluginID,
		)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		appDefinitionPayload, err := appdefinition.DecodeStoredAppDefinition(storedAppDefinition)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, AppDeploymentStateResponse{
			ProjectState:  projectState,
			AppDefinition: appDefinitionPayload,
			AppSpec:       appSpec,
			AppPolicy:     runtime.Policy(),
		})
	}
}

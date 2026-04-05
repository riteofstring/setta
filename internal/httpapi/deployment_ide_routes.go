package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const RouteShareDeployments = "/share/deployments"
const RouteShareDeploymentVersions = "/share/deployments/{deploymentName}/versions"
const RouteShareDeploymentLatest = "/share/deployments/{deploymentName}/latest"
const RouteAppDeployments = "/app/deployments"
const RouteAppDeploymentVersions = "/app/deployments/{deploymentName}/versions"
const RouteAppDeploymentLatest = "/app/deployments/{deploymentName}/latest"

type DeploymentIDERouteDependencies struct {
	ModePolicy     modes.Policy
	ProjectState   *projectstate.Runtime
	Catalog        *deployments.Catalog
	SharePublisher *deployments.SharePublisher
	AppPublisher   *deployments.AppPublisher
}

type DeploymentMetadataResponse struct {
	DeploymentName     string    `json:"deploymentName"`
	DeploymentVersion  string    `json:"deploymentVersion"`
	DefaultProjectID   string    `json:"defaultProjectConfigId"`
	DefaultProjectName string    `json:"defaultProjectConfigName"`
	CreatedAt          time.Time `json:"createdAt"`
	DeploymentRoot     string    `json:"deploymentRoot"`
	PolicyPath         string    `json:"policyPath"`
}

type PublishShareDeploymentRequest struct {
	DeploymentName       string                            `json:"deploymentName"`
	ProjectConfigID      string                            `json:"projectConfigId"`
	SharePolicyOverrides *deployments.SharePolicyOverrides `json:"sharePolicyOverrides"`
	ListenerEntrypoint   string                            `json:"listenerEntrypoint"`
	ListenerEnabled      *bool                             `json:"listenerEnabled"`
}

type PublishAppDeploymentRequest struct {
	DeploymentName     string                          `json:"deploymentName"`
	ProjectConfigID    string                          `json:"projectConfigId"`
	AppPolicyOverrides *deployments.AppPolicyOverrides `json:"appPolicyOverrides"`
	ListenerEntrypoint string                          `json:"listenerEntrypoint"`
	ListenerEnabled    *bool                           `json:"listenerEnabled"`
}

func RegisterDeploymentIDERoutes(router chi.Router, deps DeploymentIDERouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsIDE() {
		return nil
	}
	if deps.ProjectState == nil {
		return fmt.Errorf("project state is required in ide mode")
	}
	if deps.Catalog == nil {
		return fmt.Errorf("deployment catalog is required in ide mode")
	}
	if deps.SharePublisher == nil {
		return fmt.Errorf("share deployment publisher is required in ide mode")
	}
	if deps.AppPublisher == nil {
		return fmt.Errorf("app deployment publisher is required in ide mode")
	}

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	registerOpenAPIGet[[]DeploymentMetadataResponse](
		ideRouter,
		"listShareDeployments",
		RouteShareDeployments,
		listDeploymentMetadataHandler(deps.Catalog, deployments.TypeShare),
		withOpenAPITags("Share Deployments"),
		withOpenAPISummary("List published share deployments."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIGet[[]DeploymentMetadataResponse](
		ideRouter,
		"listShareDeploymentVersions",
		RouteShareDeploymentVersions,
		listDeploymentVersionMetadataHandler(deps.Catalog, deployments.TypeShare),
		withOpenAPITags("Share Deployments"),
		withOpenAPISummary("List published versions for a share deployment."),
		withOpenAPIPathParams[deploymentNameRouteParams](),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIGet[DeploymentMetadataResponse](
		ideRouter,
		"getShareDeploymentLatest",
		RouteShareDeploymentLatest,
		latestDeploymentMetadataHandler(deps.Catalog, deployments.TypeShare),
		withOpenAPITags("Share Deployments"),
		withOpenAPISummary("Get the latest published version for a share deployment."),
		withOpenAPIPathParams[deploymentNameRouteParams](),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PublishShareDeploymentRequest, DeploymentMetadataResponse](
		ideRouter,
		"publishShareDeployment",
		RouteShareDeployments,
		publishShareDeploymentHandler(deps.ProjectState, deps.SharePublisher),
		withOpenAPITags("Share Deployments"),
		withOpenAPISummary("Publish the current project config as a share deployment."),
		withOpenAPIModeRequirement("ide"),
	)

	registerOpenAPIGet[[]DeploymentMetadataResponse](
		ideRouter,
		"listAppDeployments",
		RouteAppDeployments,
		listDeploymentMetadataHandler(deps.Catalog, deployments.TypeApp),
		withOpenAPITags("App Deployments"),
		withOpenAPISummary("List published app deployments."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIGet[[]DeploymentMetadataResponse](
		ideRouter,
		"listAppDeploymentVersions",
		RouteAppDeploymentVersions,
		listDeploymentVersionMetadataHandler(deps.Catalog, deployments.TypeApp),
		withOpenAPITags("App Deployments"),
		withOpenAPISummary("List published versions for an app deployment."),
		withOpenAPIPathParams[deploymentNameRouteParams](),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIGet[DeploymentMetadataResponse](
		ideRouter,
		"getAppDeploymentLatest",
		RouteAppDeploymentLatest,
		latestDeploymentMetadataHandler(deps.Catalog, deployments.TypeApp),
		withOpenAPITags("App Deployments"),
		withOpenAPISummary("Get the latest published version for an app deployment."),
		withOpenAPIPathParams[deploymentNameRouteParams](),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[PublishAppDeploymentRequest, DeploymentMetadataResponse](
		ideRouter,
		"publishAppDeployment",
		RouteAppDeployments,
		publishAppDeploymentHandler(deps.ProjectState, deps.AppPublisher),
		withOpenAPITags("App Deployments"),
		withOpenAPISummary("Publish the current project config as an app deployment."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func listDeploymentMetadataHandler(catalog *deployments.Catalog, deploymentType deployments.Type) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := catalog.List(r.Context(), deploymentType)
		if err != nil {
			handleDeploymentCatalogError(w, r, err, deploymentType, "")
			return
		}
		writeJSON(w, http.StatusOK, deploymentMetadataResponses(entries))
	}
}

func listDeploymentVersionMetadataHandler(catalog *deployments.Catalog, deploymentType deployments.Type) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deploymentName := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
		entries, err := catalog.ListVersions(r.Context(), deploymentName, deploymentType)
		if err != nil {
			handleDeploymentCatalogError(w, r, err, deploymentType, deploymentName)
			return
		}
		writeJSON(w, http.StatusOK, deploymentMetadataResponses(entries))
	}
}

func latestDeploymentMetadataHandler(catalog *deployments.Catalog, deploymentType deployments.Type) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deploymentName := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
		entry, err := catalog.Latest(r.Context(), deploymentName, deploymentType)
		if err != nil {
			handleDeploymentCatalogError(w, r, err, deploymentType, deploymentName)
			return
		}
		writeJSON(w, http.StatusOK, deploymentMetadataResponseFromMetadata(entry))
	}
}

func publishShareDeploymentHandler(projectState *projectstate.Runtime, publisher *deployments.SharePublisher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[PublishShareDeploymentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		result, err := publisher.Publish(r.Context(), deployments.SharePublishRequest{
			ProjectState:       projectState,
			ProjectID:          projectConfigID,
			DeploymentName:     payload.DeploymentName,
			PolicyOverrides:    payload.SharePolicyOverrides,
			ListenerEntrypoint: strings.TrimSpace(payload.ListenerEntrypoint),
			ListenerEnabled:    listenerEnabledOrDefault(payload.ListenerEnabled),
		})
		if err != nil {
			handleDeploymentPublishError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, deploymentMetadataResponseFromMetadata(result.Metadata))
	}
}

func publishAppDeploymentHandler(projectState *projectstate.Runtime, publisher *deployments.AppPublisher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[PublishAppDeploymentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		result, err := publisher.Publish(r.Context(), deployments.AppPublishRequest{
			ProjectState:       projectState,
			ProjectID:          projectConfigID,
			DeploymentName:     payload.DeploymentName,
			PolicyOverrides:    payload.AppPolicyOverrides,
			ListenerEntrypoint: strings.TrimSpace(payload.ListenerEntrypoint),
			ListenerEnabled:    listenerEnabledOrDefault(payload.ListenerEnabled),
		})
		if err != nil {
			handleDeploymentPublishError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, deploymentMetadataResponseFromMetadata(result.Metadata))
	}
}

func deploymentMetadataResponses(entries []deployments.Metadata) []DeploymentMetadataResponse {
	responses := make([]DeploymentMetadataResponse, 0, len(entries))
	for _, entry := range entries {
		responses = append(responses, deploymentMetadataResponseFromMetadata(entry))
	}
	return responses
}

func deploymentMetadataResponseFromMetadata(metadata deployments.Metadata) DeploymentMetadataResponse {
	return DeploymentMetadataResponse{
		DeploymentName:     metadata.DeploymentName,
		DeploymentVersion:  metadata.DeploymentVersion,
		DefaultProjectID:   metadata.DefaultProjectID,
		DefaultProjectName: metadata.DefaultProjectName,
		CreatedAt:          metadata.CreatedAt,
		DeploymentRoot:     metadata.DeploymentRoot,
		PolicyPath:         metadata.PolicyPath,
	}
}

func listenerEnabledOrDefault(value *bool) bool {
	if value == nil {
		return true
	}
	return *value
}

func handleDeploymentCatalogError(w http.ResponseWriter, r *http.Request, err error, deploymentType deployments.Type, deploymentName string) {
	switch {
	case isInvalidDeploymentNameError(err):
		writeError(w, r, http.StatusBadRequest, "invalid_deployment_name", err.Error())
	case errors.Is(err, deployments.ErrDeploymentNotFound):
		writeError(
			w,
			r,
			http.StatusNotFound,
			"not_found",
			fmt.Sprintf("%s deployment not found: %s", deploymentTypeLabel(deploymentType), strings.TrimSpace(deploymentName)),
		)
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func handleDeploymentPublishError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case isInvalidDeploymentNameError(err):
		writeError(w, r, http.StatusBadRequest, "invalid_deployment_name", err.Error())
	case errors.Is(err, deployments.ErrDeploymentRunSnapshotModeNeverDenied), errors.Is(err, deployments.ErrPolicyRunSnapshotModeInvalid):
		writeError(w, r, http.StatusBadRequest, "invalid_deployment_policy", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppDefinitionMissing):
		writeError(w, r, http.StatusBadRequest, "app_definition_required", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecPathRequired):
		writeError(w, r, http.StatusBadRequest, "app_spec_path_required", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecNotFound):
		writeError(w, r, http.StatusBadRequest, "app_spec_not_found", err.Error())
	case errors.Is(err, deployments.ErrAppPublishAppSpecInvalid):
		writeError(w, r, http.StatusBadRequest, "invalid_app_spec", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func isInvalidDeploymentNameError(err error) bool {
	return errors.Is(err, deployments.ErrDeploymentNameRequired) ||
		errors.Is(err, deployments.ErrDeploymentNameSingleSegment) ||
		errors.Is(err, deployments.ErrDeploymentNameReserved)
}

func deploymentTypeLabel(deploymentType deployments.Type) string {
	switch deploymentType {
	case deployments.TypeApp:
		return "App"
	default:
		return "Share"
	}
}

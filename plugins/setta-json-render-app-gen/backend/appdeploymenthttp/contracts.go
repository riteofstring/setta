package appdeploymenthttp

import (
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

type AppDeploymentSessionResponse struct {
	DeploymentName         string                               `json:"deploymentName"`
	DeploymentVersion      string                               `json:"deploymentVersion"`
	ShareSessionID         string                               `json:"shareSessionId"`
	SessionRunCount        int                                  `json:"sessionRunCount"`
	DefaultProjectConfigID string                               `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
	AppPolicy              deployments.Policy                   `json:"appPolicy"`
	Manifest               *deployments.Manifest                `json:"manifest,omitempty"`
}

type AppDeploymentStateResponse struct {
	ProjectState  projectview.SingleConfig    `json:"projectState"`
	AppDefinition *projectstate.AppDefinition `json:"appDefinition"`
	AppSpec       any                         `json:"appSpec"`
	AppPolicy     deployments.Policy          `json:"appPolicy"`
}

type PublishAppDeploymentRequest struct {
	DeploymentName     string                          `json:"deploymentName"`
	ProjectConfigID    string                          `json:"projectConfigId"`
	AppPolicyOverrides *deployments.AppPolicyOverrides `json:"appPolicyOverrides"`
	ListenerEntrypoint string                          `json:"listenerEntrypoint"`
	ListenerEnabled    *bool                           `json:"listenerEnabled"`
}

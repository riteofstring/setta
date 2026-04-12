package httpapi

type deploymentNameRouteParams struct {
	DeploymentName string `json:"deploymentName"`
}

type deploymentVersionRouteParams struct {
	DeploymentName string `json:"deploymentName"`
	Version        string `json:"version"`
}

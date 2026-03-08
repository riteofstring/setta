package deployments

import (
	"path/filepath"

	"setta/internal/statefs"
)

func DefaultRuntimeRoot(deploymentRoot string) (string, error) {
	resolvedDeploymentRoot, err := statefs.NormalizePath(deploymentRoot, "")
	if err != nil {
		return "", err
	}

	manifest, err := LoadManifest(resolvedDeploymentRoot)
	if err != nil {
		return "", err
	}

	deploymentsRoot := filepath.Dir(filepath.Dir(resolvedDeploymentRoot))
	baseRoot := filepath.Dir(resolvedDeploymentRoot)
	if filepath.Base(deploymentsRoot) == "deployments" {
		baseRoot = filepath.Dir(deploymentsRoot)
	}

	return statefs.NormalizePath(
		filepath.Join(baseRoot, "deployment_runtime", manifest.DeploymentName, manifest.DeploymentVersion),
		"",
	)
}

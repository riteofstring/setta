package deployments

import (
	"path/filepath"
	"testing"
)

func TestDefaultRuntimeRootUsesDeploymentsParentWhenRootMatchesDeploymentTree(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	deploymentRoot := filepath.Join(baseRoot, "deployments", "demo-share", "v2")
	writeDeploymentJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
	})

	runtimeRoot, err := DefaultRuntimeRoot(deploymentRoot)
	if err != nil {
		t.Fatalf("default runtime root: %v", err)
	}

	expectedRoot := filepath.Join(baseRoot, "deployment_runtime", "demo-share", "v2")
	if runtimeRoot != expectedRoot {
		t.Fatalf("expected runtime root %q, got %q", expectedRoot, runtimeRoot)
	}
}

func TestDefaultRuntimeRootUsesDeploymentParentForArbitraryRoots(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	deploymentRoot := filepath.Join(baseRoot, "exports", "share-copy")
	writeDeploymentJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
	})

	runtimeRoot, err := DefaultRuntimeRoot(deploymentRoot)
	if err != nil {
		t.Fatalf("default runtime root: %v", err)
	}

	expectedRoot := filepath.Join(baseRoot, "exports", "deployment_runtime", "demo-share", "v2")
	if runtimeRoot != expectedRoot {
		t.Fatalf("expected runtime root %q, got %q", expectedRoot, runtimeRoot)
	}
}

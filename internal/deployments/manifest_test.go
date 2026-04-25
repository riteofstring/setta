package deployments

import "testing"

func TestManifestNormalizedAcceptsPluginOwnedDeploymentTypes(t *testing.T) {
	t.Parallel()

	manifest, err := (Manifest{
		Version:           1,
		DeploymentName:    "demo-plugin",
		DeploymentType:    Type(" plugin-app "),
		DefaultProjectID:  "project-alpha",
		DeploymentVersion: "v7",
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize manifest: %v", err)
	}
	if manifest.DeploymentType != Type("plugin-app") {
		t.Fatalf("expected trimmed plugin deployment type, got %q", manifest.DeploymentType)
	}
}

func TestManifestNormalizedRequiresDeploymentType(t *testing.T) {
	t.Parallel()

	_, err := (Manifest{
		Version:           1,
		DeploymentName:    "demo-plugin",
		DeploymentType:    Type("   "),
		DefaultProjectID:  "project-alpha",
		DeploymentVersion: "v7",
	}).Normalized()
	if err != ErrDeploymentTypeRequired {
		t.Fatalf("expected deployment type required error, got %v", err)
	}
}

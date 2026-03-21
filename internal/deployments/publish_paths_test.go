package deployments

import (
	"path/filepath"
	"testing"

	"setta/internal/statefs"
)

func TestResolveDeploymentStructuredDataPathRejectsAbsoluteAndEscapeAndAllowsNested(t *testing.T) {
	t.Parallel()

	deploymentRoot := t.TempDir()

	t.Run("rejects absolute", func(t *testing.T) {
		t.Parallel()

		absolutePath := filepath.Join(t.TempDir(), "abs.json")
		if _, err := statefs.ResolveWithinRoot(deploymentRoot, absolutePath, "deployment structured data"); err == nil {
			t.Fatal("expected absolute path outside deployment root to fail")
		}
	})

	t.Run("rejects escape", func(t *testing.T) {
		t.Parallel()

		if _, err := statefs.ResolveWithinRoot(deploymentRoot, filepath.FromSlash("../outside.json"), "deployment structured data"); err == nil {
			t.Fatal("expected escape path to fail")
		}
	})

	t.Run("allows nested relative", func(t *testing.T) {
		t.Parallel()

		resolved, err := statefs.ResolveWithinRoot(deploymentRoot, filepath.FromSlash("json_sources/source.json"), "deployment structured data")
		if err != nil {
			t.Fatalf("resolve nested path: %v", err)
		}

		want := filepath.Join(deploymentRoot, "json_sources", "source.json")
		if resolved != want {
			t.Fatalf("expected %q, got %q", want, resolved)
		}
	})
}

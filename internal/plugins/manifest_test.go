package plugins

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidatePluginManifestPaths(t *testing.T) {
	t.Run("accepts existing optional paths", func(t *testing.T) {
		pluginRoot := t.TempDir()
		mustWriteManifestTestFile(t, pluginRoot, "frontend/dist/index.js")
		mustWriteManifestTestFile(t, pluginRoot, "frontend/dist/index.css")
		mustMkdirManifestTestDir(t, pluginRoot, "content/blueprints")
		mustMkdirManifestTestDir(t, pluginRoot, "content/project_templates")
		mustMkdirManifestTestDir(t, pluginRoot, "content/prompts")
		mustWriteManifestTestFile(t, pluginRoot, "config/schema.json")

		err := ValidatePluginManifestPaths(pluginRoot, PluginManifest{
			ID: "setta-fixture",
			Frontend: &PluginFrontendManifest{
				Entrypoint: "frontend/dist/index.js",
				Style:      "frontend/dist/index.css",
			},
			Content: &PluginContentManifest{
				BlueprintsDir:       "content/blueprints",
				ProjectTemplatesDir: "content/project_templates",
				PromptsDir:          "content/prompts",
			},
			ConfigSchemaPath: "config/schema.json",
		})
		if err != nil {
			t.Fatalf("ValidatePluginManifestPaths returned error: %v", err)
		}
	})

	t.Run("requires frontend entrypoint when frontend manifest exists", func(t *testing.T) {
		err := ValidatePluginManifestPaths(t.TempDir(), PluginManifest{
			ID:       "setta-fixture",
			Frontend: &PluginFrontendManifest{},
		})
		if !errors.Is(err, ErrPluginManifestInvalid) {
			t.Fatalf("expected invalid manifest error, got %v", err)
		}
		if !strings.Contains(err.Error(), "plugin frontend entrypoint is required for setta-fixture") {
			t.Fatalf("expected frontend entrypoint message, got %v", err)
		}
	})

	t.Run("rejects missing configured content directories", func(t *testing.T) {
		err := ValidatePluginManifestPaths(t.TempDir(), PluginManifest{
			ID: "setta-fixture",
			Content: &PluginContentManifest{
				PromptsDir: "content/prompts",
			},
		})
		if !errors.Is(err, ErrPluginManifestInvalid) {
			t.Fatalf("expected invalid manifest error, got %v", err)
		}
		if !strings.Contains(err.Error(), filepath.FromSlash("content/prompts")) {
			t.Fatalf("expected missing prompts path in error, got %v", err)
		}
	})

	t.Run("rejects config schema directories", func(t *testing.T) {
		pluginRoot := t.TempDir()
		mustMkdirManifestTestDir(t, pluginRoot, "config/schema.json")

		err := ValidatePluginManifestPaths(pluginRoot, PluginManifest{
			ID:               "setta-fixture",
			ConfigSchemaPath: "config/schema.json",
		})
		if !errors.Is(err, ErrPluginManifestInvalid) {
			t.Fatalf("expected invalid manifest error, got %v", err)
		}
		if !strings.Contains(err.Error(), filepath.FromSlash("config/schema.json")) {
			t.Fatalf("expected config schema path in error, got %v", err)
		}
	})
}

func mustWriteManifestTestFile(t *testing.T, pluginRoot string, relativePath string) {
	t.Helper()

	absolutePath := filepath.Join(pluginRoot, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		t.Fatalf("mkdir parent for %s: %v", relativePath, err)
	}
	if err := os.WriteFile(absolutePath, []byte("fixture"), 0o644); err != nil {
		t.Fatalf("write %s: %v", relativePath, err)
	}
}

func mustMkdirManifestTestDir(t *testing.T, pluginRoot string, relativePath string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(pluginRoot, filepath.FromSlash(relativePath)), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", relativePath, err)
	}
}

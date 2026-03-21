package plugins

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeBackendProbeResponseRejectsInvalidRoutePaths(t *testing.T) {
	// Backend route registrations must fail closed on traversal, empty, and whitespace segments.
	pluginRoot := t.TempDir()
	testCases := map[string]string{
		"missing-leading-slash": "../escape",
		"empty-segment":         "/foo//bar",
		"encoded-traversal":     "/%2e%2e/escape",
		"whitespace":            "/with space",
	}

	for name, invalidPath := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
				Routes: []PluginRegisteredBackendRoute{{
					Path:    invalidPath,
					Methods: []string{"GET"},
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid route path %q to fail", invalidPath)
			}
			if !strings.Contains(err.Error(), "route 0: route path") {
				t.Fatalf("expected route path validation error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendProbeResponseRejectsInvalidStaticDirRoutePrefixes(t *testing.T) {
	// Backend static-dir registrations must reject invalid URL prefixes before route mounting.
	pluginRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pluginRoot, "backend", "static"), 0o755); err != nil {
		t.Fatalf("mkdir backend static dir: %v", err)
	}
	testCases := map[string]string{
		"missing-leading-slash-traversal": "../escape",
		"encoded-traversal":               "/%2e%2e/escape",
		"empty-segment":                   "fixture//nested",
		"whitespace":                      "fixture with spaces",
	}

	for name, invalidPrefix := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend-static-router", backendProbeResponse{
				StaticDirs: []PluginRegisteredStaticDir{{
					RoutePrefix: invalidPrefix,
					Dir:         "backend/static",
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid static dir route prefix %q to fail", invalidPrefix)
			}
			if !strings.Contains(err.Error(), "static dir 0: routePrefix") {
				t.Fatalf("expected static dir routePrefix validation error, got %v", err)
			}
		})
	}
}

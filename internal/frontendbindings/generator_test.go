package frontendbindings

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	assertGoldenFile(t, "generated_go_routes.ts", bindings.RoutesTS)
	assertGoldenFile(t, "generated_go_types.ts", bindings.TypesTS)
	assertGoldenFile(t, "generated_go_endpoints.ts", bindings.EndpointsTS)
}

func assertGoldenFile(t *testing.T, name string, actual string) {
	t.Helper()

	path := filepath.Join("testdata", name)
	expectedBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	expected := strings.TrimSpace(string(expectedBytes))
	if strings.TrimSpace(actual) != expected {
		t.Fatalf("unexpected generated output for %s:\n%s", name, actual)
	}
}

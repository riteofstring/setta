package pythonsharedconstants

import (
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	t.Helper()

	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	for _, snippet := range []string{
		"WORKSPACE_ROOT_ENV = \"SETTA_WORKSPACE_ROOT\"",
		"DEFAULT_HOST = \"127.0.0.1\"",
		"LOCAL_CORE_PROTOCOL_VERSION = 1",
		"LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES = \"listener_render_realtime_dependency_values\"",
	} {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated python constants missing %q:\n%s", snippet, generated.PythonModule)
		}
	}
}

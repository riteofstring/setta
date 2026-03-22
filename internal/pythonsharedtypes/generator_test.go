package pythonsharedtypes

import (
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	t.Helper()

	types, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	for _, snippet := range []string{
		"class SettaSharedTypeModel(BaseModel):",
		"model_config = ConfigDict(extra=\"forbid\")",
		"class Route(str, Enum):",
	} {
		if !strings.Contains(types.PythonModule, snippet) {
			t.Fatalf("generated python shared types missing %q:\n%s", snippet, types.PythonModule)
		}
	}
}

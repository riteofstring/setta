package pythonsharedtypes

import (
	"strings"
	"testing"
)

func TestBuildUsesSchemaGeneratedGoValueDefaultsForProjectConfig(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		`allowJsonSourceKeyEdits: bool = True`,
		`hasPythonCodegenTarget: bool = False`,
		`previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"`,
		`TypeAdapter(ProjectRunCapabilities).validate_json("{\"canRunFromMain\":false,\"mainRunDisabledReason\":null,\"effectiveEntrySectionId\":null}")`,
		`TypeAdapter(Viewport | None).validate_json("{\"x\":0,\"y\":0,\"zoom\":1}")`,
		`sectionPathSlugsById: dict[ID, str] = Field(default_factory=dict)`,
		`windowSpaceIdsBySlug: dict[str, list[ID]] = Field(default_factory=dict)`,
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing ProjectConfig default snippet %q", snippet)
		}
	}
}

func TestBuildUsesSchemaGeneratedGoValueDefaultsForUnpatchedOwnerTypes(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		`class BrowserSavedSearchTypeFilters(BaseModel):`,
		`image: bool = True`,
		`video: bool = True`,
		`audio: bool = True`,
		`text: bool = True`,
		`data: bool = True`,
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing owner default snippet %q", snippet)
		}
	}
}

func TestBuildUsesAuthoritativeSharedRouteInventory(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if !strings.Contains(generated.PythonModule, `API_PREFIX = "/api"`) {
		t.Fatalf("expected generated routes to include API prefix route")
	}
	if !strings.Contains(generated.PythonModule, `LISTENER_BY_ID = "/ws/listeners/{listenerID}"`) {
		t.Fatalf("expected generated routes to include listener route")
	}
	if !strings.Contains(generated.PythonModule, `from pydantic import TypeAdapter`) {
		t.Fatalf("expected generated module to import TypeAdapter for structured go_value defaults")
	}
}

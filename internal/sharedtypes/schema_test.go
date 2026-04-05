package sharedtypes

import (
	"reflect"
	"testing"

	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/stringenumvalues"
	"setta/internal/wsapi"
)

func TestBuildSchemaDocumentIncludesAuthoritativeEnumValues(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	schema := document.Defs["SectionType"]
	if schema == nil {
		t.Fatalf("expected SectionType schema in $defs")
	}

	values, ok, err := stringenumvalues.Default().Values(reflect.TypeOf(projectstate.FrontendSectionType("")))
	if err != nil {
		t.Fatalf("enum discovery error = %v", err)
	}
	if !ok || len(values) == 0 {
		t.Fatalf("expected authoritative SectionType enum values")
	}
	if got, want := len(schema.Enum), len(values); got != want {
		t.Fatalf("SectionType enum count = %d, want %d", got, want)
	}
}

func TestBuildSchemaDocumentUsesProjectCodegenTargetUnionForProjectConfig(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	unionSchema := document.Defs["ProjectCodegenTarget"]
	if unionSchema == nil {
		t.Fatalf("expected ProjectCodegenTarget schema in $defs")
	}
	if got := len(unionSchema.AnyOf); got != 2 {
		t.Fatalf("ProjectCodegenTarget anyOf count = %d, want 2", got)
	}

	projectConfigSchema := document.Defs["ProjectConfig"]
	if projectConfigSchema == nil {
		t.Fatalf("expected ProjectConfig schema in $defs")
	}
	codegenTargetsSchema := projectConfigSchema.Properties["codegenTargets"]
	if codegenTargetsSchema == nil || codegenTargetsSchema.Items == nil {
		t.Fatalf("expected ProjectConfig.codegenTargets array schema with items")
	}
	if got := len(codegenTargetsSchema.Items.AnyOf); got != 2 {
		t.Fatalf("ProjectConfig.codegenTargets anyOf count = %d, want 2", got)
	}
}

func TestBuildSemanticSidecarUsesAuthoritativeRoutesAndDefaults(t *testing.T) {
	t.Parallel()

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

	routeByName := map[string]string{}
	for _, route := range sidecar.Routes {
		routeByName[route.Name] = route.Path
	}
	if got := routeByName["API_PREFIX"]; got != httpapi.RouteAPIPrefix {
		t.Fatalf("API_PREFIX route = %q, want %q", got, httpapi.RouteAPIPrefix)
	}
	if got := routeByName["LISTENER_BY_ID"]; got != wsapi.RouteListenerByID {
		t.Fatalf("LISTENER_BY_ID route = %q, want %q", got, wsapi.RouteListenerByID)
	}

	foundViewportDefault := false
	foundPythonSharedProjectConfigDefault := false
	for _, entry := range sidecar.Defaults {
		if entry.Type == "Viewport" && entry.Profile == DefaultProfileFrontend {
			foundViewportDefault = true
		}
		if entry.Type == "ProjectConfig" && entry.Profile == DefaultProfilePythonShared {
			config, ok := entry.Value.(projectview.ProjectConfig)
			if !ok {
				t.Fatalf("ProjectConfig default value type = %T, want projectview.ProjectConfig", entry.Value)
			}
			if config.PreviewImgColor != projectview.PythonSharedDefaultProjectConfig().PreviewImgColor {
				t.Fatalf("python shared ProjectConfig preview color = %q, want %q", config.PreviewImgColor, projectview.PythonSharedDefaultProjectConfig().PreviewImgColor)
			}
			foundPythonSharedProjectConfigDefault = true
		}
	}
	if !foundViewportDefault {
		t.Fatalf("expected shared sidecar to include Viewport default entry")
	}
	if !foundPythonSharedProjectConfigDefault {
		t.Fatalf("expected shared sidecar to include python_shared ProjectConfig default entry")
	}
}

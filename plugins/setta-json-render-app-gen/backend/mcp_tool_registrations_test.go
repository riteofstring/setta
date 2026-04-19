package settajsonrenderappgenbackend

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/tools"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type stubAppDefinitionRuntime struct{}

var _ projectstate.AppDefinitionRuntime = (*stubAppDefinitionRuntime)(nil)

func (stubAppDefinitionRuntime) GetAppDefinition(context.Context) (projectstate.AppDefinitionReadResult, error) {
	return projectstate.AppDefinitionReadResult{}, nil
}

func (stubAppDefinitionRuntime) ValidateAppDefinition(context.Context, projectstate.ValidateAppDefinitionInput) (projectstate.AppDefinitionValidationResult, error) {
	return projectstate.AppDefinitionValidationResult{}, nil
}

func (stubAppDefinitionRuntime) SetAppDefinition(context.Context, projectstate.SetAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func (stubAppDefinitionRuntime) StreamAppDefinition(context.Context, projectstate.StreamAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func (stubAppDefinitionRuntime) UpdateAppDefinition(context.Context, any) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func TestBuildMCPToolRegistrationsKeepsFrozenToolSet(t *testing.T) {
	t.Parallel()

	registrations := BuildMCPToolRegistrations(stubAppDefinitionRuntime{})
	names := make([]string, 0, len(registrations))
	for _, registration := range registrations {
		names = append(names, registration.Spec.Name)
	}

	for _, name := range []string{
		"get_app_catalog",
		"list_app_components",
		"get_app_definition",
		"validate_app_definition",
		"set_app_definition",
		"stream_app_definition",
		"update_app_definition",
	} {
		if !slices.Contains(names, name) {
			t.Fatalf("expected %s in app subsystem tool registrations, got %#v", name, names)
		}
	}

	streamRegistration := registrations[5]
	if streamRegistration.Spec.Name != "stream_app_definition" {
		t.Fatalf("expected stream_app_definition registration at frozen position, got %q", streamRegistration.Spec.Name)
	}
	preview := streamRegistration.Spec.Metadata.ToolArgumentPreview
	if preview == nil || preview.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("expected app-spec patch preview metadata, got %#v", preview)
	}
}

func TestBuildMCPToolRegistrationsWithoutServiceLeavesOnlyCatalogTools(t *testing.T) {
	t.Parallel()

	registrations := BuildMCPToolRegistrations(nil)
	if len(registrations) != 2 {
		t.Fatalf("expected only catalog tools without runtime service, got %#v", registrations)
	}
	if registrations[0].Spec.Name != "get_app_catalog" || registrations[1].Spec.Name != "list_app_components" {
		t.Fatalf("expected frozen catalog tool order, got %#v", registrations)
	}
}

func TestBuildMCPToolRegistrationsWorkThroughServerContributions(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:                t.TempDir(),
		ProjectState:                 runtime,
		SkipDefaultAppSubsystemTools: true,
		ContributedToolRegistrations: BuildMCPToolRegistrations(appDefinitionServiceForTest(runtime)),
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	requestContext := mcpx.ToolRequestContext{
		Meta: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	}

	setResult, err := server.InvokeTool(context.Background(), "set_app_definition", map[string]any{
		"projectConfigId": "project-alpha",
		"appSpec": map[string]any{
			"root": "root",
			"elements": map[string]any{
				"root": map[string]any{
					"key":  "root",
					"type": "Stack",
				},
			},
		},
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_app_definition: %v", err)
	}
	if setResult == nil || setResult.IsError {
		t.Fatalf("expected set_app_definition success, got %#v", setResult)
	}

	getResult, err := server.InvokeTool(context.Background(), "get_app_definition", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke get_app_definition: %v", err)
	}
	if getResult == nil || getResult.IsError {
		t.Fatalf("expected get_app_definition success, got %#v", getResult)
	}

	payload := mustStructuredMap(t, getResult.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.DefaultPath(), appDefinition["appSpecPath"])
	}
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if payload["appSpec"] == nil || storedSpec == nil {
		t.Fatalf("expected stored app spec payload, got %#v", payload["appSpec"])
	}

	streamResult, err := server.InvokeTool(context.Background(), "stream_app_definition", map[string]any{
		"projectConfigId": "project-alpha",
		"patches":         "{\"op\":\"set\",\"path\":\"/not-allowed\",\"value\":1}",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke stream_app_definition: %v", err)
	}
	if streamResult == nil || !streamResult.IsError {
		t.Fatalf("expected invalid stream_app_definition error, got %#v", streamResult)
	}
	streamPayload := mustStructuredMap(t, streamResult.StructuredContent)
	if streamPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", streamPayload["code"])
	}
}

func openPersistedPluginAppDefinitionRuntime(t *testing.T) (string, *projectstate.Runtime) {
	t.Helper()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return root, runtime
}

func mustStructuredMap(t *testing.T, value any) map[string]any {
	t.Helper()

	if mapped, ok := value.(map[string]any); ok {
		return mapped
	}
	t.Fatalf("expected structured map, got %#v", value)
	return nil
}

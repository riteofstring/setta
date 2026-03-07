package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"setta/internal/projectstate"
)

// ALWAYS_ASK should rename the section immediately but hold dependent value
// edits in pending storage until the user accepts the prompt.
func TestRenameRefactorServiceSetSectionNameAlwaysAskStoresPendingAndDefersValueChange(t *testing.T) {
	t.Parallel()

	projectRuntime, settingsRuntime := openRenameRefactorTestRuntimes(t, projectstate.RenameRefactorModeAlwaysAsk)
	service := openRenameRefactorTestService(t, projectRuntime, settingsRuntime)

	ctx := projectstate.ContextWithFrontendOpID(context.Background(), "rename-op-1")
	if err := service.SetSectionName(ctx, "project-alpha", "source", "Renamed Section"); err != nil {
		t.Fatalf("set section name: %v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := project.Sections["source"].Name; got != "Renamed Section" {
		t.Fatalf("expected renamed section name, got %q", got)
	}
	if got := renameRefactorConsumerParamValue(t, project); got != "state.Source_Section + state.Source_Section" {
		t.Fatalf("expected dependent param value to remain unchanged before accept, got %q", got)
	}

	pending := service.pendingByOpID["rename-op-1"]
	if pending.ProjectID != "project-alpha" {
		t.Fatalf("expected pending project-alpha entry, got %#v", pending)
	}
	if len(pending.ChangedValues) != 1 {
		t.Fatalf("expected one pending changed value, got %#v", pending.ChangedValues)
	}
}

// Accepting a pending rename should apply the planned value rewrites and clear
// the prompt state for that frontend op.
func TestRenameRefactorServiceAcceptRenameRefactorAppliesPendingChanges(t *testing.T) {
	t.Parallel()

	projectRuntime, settingsRuntime := openRenameRefactorTestRuntimes(t, projectstate.RenameRefactorModeAlwaysAsk)
	service := openRenameRefactorTestService(t, projectRuntime, settingsRuntime)

	ctx := projectstate.ContextWithFrontendOpID(context.Background(), "rename-op-accept")
	if err := service.SetSectionName(ctx, "project-alpha", "source", "Renamed Section"); err != nil {
		t.Fatalf("set section name: %v", err)
	}
	if err := service.AcceptRenameRefactor(context.Background(), "project-alpha", "rename-op-accept"); err != nil {
		t.Fatalf("accept rename refactor: %v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := renameRefactorConsumerParamValue(t, project); got != "state.Renamed_Section + state.Renamed_Section" {
		t.Fatalf("expected accepted rename to update dependent param value, got %q", got)
	}
	if _, ok := service.pendingByOpID["rename-op-accept"]; ok {
		t.Fatalf("expected accepted rename prompt to clear pending state, got %#v", service.pendingByOpID)
	}
}

// Declining a prompt should drop the pending plan without mutating dependent
// values, and later acceptance for the same op should fail loudly.
func TestRenameRefactorServiceDeclineRenameRefactorClearsPendingWithoutApplying(t *testing.T) {
	t.Parallel()

	projectRuntime, settingsRuntime := openRenameRefactorTestRuntimes(t, projectstate.RenameRefactorModeAlwaysAsk)
	service := openRenameRefactorTestService(t, projectRuntime, settingsRuntime)

	ctx := projectstate.ContextWithFrontendOpID(context.Background(), "rename-op-decline")
	if err := service.SetSectionName(ctx, "project-alpha", "source", "Renamed Section"); err != nil {
		t.Fatalf("set section name: %v", err)
	}
	if err := service.DeclineRenameRefactor(context.Background(), "project-alpha", "rename-op-decline"); err != nil {
		t.Fatalf("decline rename refactor: %v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := renameRefactorConsumerParamValue(t, project); got != "state.Source_Section + state.Source_Section" {
		t.Fatalf("expected declined rename to preserve dependent param value, got %q", got)
	}
	if _, ok := service.pendingByOpID["rename-op-decline"]; ok {
		t.Fatalf("expected declined rename prompt to clear pending state, got %#v", service.pendingByOpID)
	}
	if err := service.AcceptRenameRefactor(context.Background(), "project-alpha", "rename-op-decline"); !errors.Is(err, projectstate.ErrRenameRefactorPendingNotFound) {
		t.Fatalf("expected missing pending rename after decline, got %v", err)
	}
}

// ALWAYS_RENAME should apply the graph-planned value updates in the same
// mutation instead of leaving work in pending prompt storage.
func TestRenameRefactorServiceSetSectionNameAlwaysRenameAppliesChangesImmediately(t *testing.T) {
	t.Parallel()

	projectRuntime, settingsRuntime := openRenameRefactorTestRuntimes(t, projectstate.RenameRefactorModeAlwaysRename)
	service := openRenameRefactorTestService(t, projectRuntime, settingsRuntime)

	ctx := projectstate.ContextWithFrontendOpID(context.Background(), "rename-op-auto")
	if err := service.SetSectionName(ctx, "project-alpha", "source", "Renamed Section"); err != nil {
		t.Fatalf("set section name: %v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := renameRefactorConsumerParamValue(t, project); got != "state.Renamed_Section + state.Renamed_Section" {
		t.Fatalf("expected auto rename to update dependent param value, got %q", got)
	}
	if _, ok := service.pendingByOpID["rename-op-auto"]; ok {
		t.Fatalf("expected ALWAYS_RENAME not to leave pending prompt state, got %#v", service.pendingByOpID)
	}
}

func openRenameRefactorTestService(
	t *testing.T,
	projectRuntime *projectstate.Runtime,
	settingsRuntime *projectstate.Runtime,
) *renameRefactorService {
	t.Helper()

	service, err := newRenameRefactorService(renameRefactorServiceOptions{
		ProjectState: projectRuntime,
		Settings:     settingsRuntime,
	})
	if err != nil {
		t.Fatalf("new rename refactor service: %v", err)
	}
	return service
}

func openRenameRefactorTestRuntimes(
	t *testing.T,
	mode projectstate.RenameRefactorMode,
) (*projectstate.Runtime, *projectstate.Runtime) {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": renameRefactorServiceTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	settingsRuntime, err := projectstate.OpenOverlayRuntime(renameRefactorSettingsDocument(t, mode))
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	return projectRuntime, settingsRuntime
}

func renameRefactorConsumerParamValue(t *testing.T, project projectstate.Project) string {
	t.Helper()

	payload, _, _, _, err := project.ResolveSectionCodeObject("consumer", "consumer-param")
	if err != nil {
		t.Fatalf("resolve consumer param: %v", err)
	}
	value, ok := payload["value"].(string)
	if !ok {
		t.Fatalf("expected string value payload, got %#v", payload["value"])
	}
	return value
}

func renameRefactorServiceTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"source", "consumer"},
		SectionVariantMap: map[string]string{
			"source":   "source-variant-1",
			"consumer": "consumer-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"source": {
				ID:               "source",
				Name:             "Source Section",
				VariantIDs:       []string{"source-variant-1"},
				DefaultVariantID: "source-variant-1",
			},
			"consumer": {
				ID:               "consumer",
				Name:             "Consumer",
				VariantIDs:       []string{"consumer-variant-1"},
				DefaultVariantID: "consumer-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant-1":   {ID: "source-variant-1", ImplID: "source-impl-1"},
			"consumer-variant-1": {ID: "consumer-variant-1", ImplID: "consumer-impl-1"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl-1": {
				ID:      "source-impl-1",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "source-impl-1", "type": "Callable", "callable": "source-callable", "codeObjVariantMap": map[string]any{"source-callable": "source-callable-variant-1"}}),
			},
			"consumer-impl-1": {
				ID:   "consumer-impl-1",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustRenameRefactorRawJSON(t, map[string]any{
					"id":       "consumer-impl-1",
					"type":     "Callable",
					"callable": "consumer-callable",
					"codeObjVariantMap": map[string]any{
						"consumer-callable": "consumer-callable-variant-1",
						"consumer-param":    "consumer-param-variant-1",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"source-callable": {
				ID:               "source-callable",
				Name:             "build_source",
				VariantIDs:       []string{"source-callable-variant-1"},
				DefaultVariantID: "source-callable-variant-1",
			},
			"consumer-callable": {
				ID:               "consumer-callable",
				Name:             "consume",
				VariantIDs:       []string{"consumer-callable-variant-1"},
				DefaultVariantID: "consumer-callable-variant-1",
			},
			"consumer-param": {
				ID:               "consumer-param",
				Name:             "script",
				VariantIDs:       []string{"consumer-param-variant-1"},
				DefaultVariantID: "consumer-param-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"source-callable-variant-1":   {ID: "source-callable-variant-1", ImplID: "source-callable-impl-1"},
			"consumer-callable-variant-1": {ID: "consumer-callable-variant-1", ImplID: "consumer-callable-impl-1"},
			"consumer-param-variant-1":    {ID: "consumer-param-variant-1", ImplID: "consumer-param-impl-1"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"source-callable-impl-1": {
				ID:      "source-callable-impl-1",
				Type:    "CodeCallable",
				Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "source-callable-impl-1", "type": "CodeCallable", "children": []string{}}),
			},
			"consumer-callable-impl-1": {
				ID:      "consumer-callable-impl-1",
				Type:    "CodeCallable",
				Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "consumer-callable-impl-1", "type": "CodeCallable", "children": []string{"consumer-param"}}),
			},
			"consumer-param-impl-1": {
				ID:      "consumer-param-impl-1",
				Type:    "CodeParam",
				Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "consumer-param-impl-1", "type": "CodeParam", "value": "state.Source_Section + state.Source_Section"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize rename refactor test project: %v", err)
	}
	return project
}

func renameRefactorSettingsDocument(t *testing.T, mode projectstate.RenameRefactorMode) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]projectstate.Project{
			"settings-home": {
				ID:                 "settings-home",
				Name:               "settings",
				TopLevelSectionIDs: []string{"backend-section"},
				SectionVariantMap: map[string]string{
					"backend-section": "backend-variant",
				},
				Sections: map[string]projectstate.Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"backend-variant": {ID: "backend-variant", ImplID: "backend-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: projectstate.SectionKind("frontend"),
						Payload: mustRenameRefactorRawJSON(t, map[string]any{
							"id":              "backend-impl",
							"type":            "Dict",
							"topLevelParamId": "backend-root",
							"codeObjVariantMap": map[string]any{
								"backend-root":   "backend-root-variant",
								"rename-setting": "rename-setting-variant",
							},
						}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"rename-setting": {
						ID:               "rename-setting",
						Name:             "renameRefactorMode",
						VariantIDs:       []string{"rename-setting-variant"},
						DefaultVariantID: "rename-setting-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"backend-root-variant":   {ID: "backend-root-variant", ImplID: "backend-root-impl"},
					"rename-setting-variant": {ID: "rename-setting-variant", ImplID: "rename-setting-impl"},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"backend-root-impl": {
						ID:      "backend-root-impl",
						Type:    "NestedParam",
						Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "backend-root-impl", "type": "NestedParam", "children": []string{"rename-setting"}}),
					},
					"rename-setting-impl": {
						ID:      "rename-setting-impl",
						Type:    "TextParam",
						Payload: mustRenameRefactorRawJSON(t, map[string]any{"id": "rename-setting-impl", "type": "TextParam", "value": string(mode)}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize rename refactor settings document: %v", err)
	}
	return document
}

func mustRenameRefactorRawJSON(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return raw
}

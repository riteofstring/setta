package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeSetParentDefaultChildSectionTypeUpdatesGroupAndListRoot(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": childDefaultsTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetParentDefaultChildSectionType(context.Background(), "project-alpha", "group-section", "Dict"); err != nil {
		t.Fatalf("SetParentDefaultChildSectionType for group returned error: %v", err)
	}
	if _, err := runtime.SetParentDefaultChildSectionType(context.Background(), "project-alpha", "list-root-section", "TextBlock"); err != nil {
		t.Fatalf("SetParentDefaultChildSectionType for list root returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	groupPayload, err := effectiveSectionPayload(project, "group-section", "group-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload group-section: %v", err)
	}
	if got := payloadStringField(groupPayload, "defaultChildSectionType"); got != "Dict" {
		t.Fatalf("expected group default child Dict, got %q", got)
	}

	listRootPayload, err := effectiveSectionPayload(project, "list-root-section", "list-root-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload list-root-section: %v", err)
	}
	if got := payloadStringField(listRootPayload, "defaultChildSectionType"); got != "TextBlock" {
		t.Fatalf("expected list root default child TextBlock, got %q", got)
	}
}

func TestRuntimeSetParentDefaultChildSectionTypeRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": childDefaultsTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetParentDefaultChildSectionType(context.Background(), "project-alpha", "plain-section", "Dict"); !errors.Is(err, ErrDefaultChildSectionParentRequired) {
		t.Fatalf("expected ErrDefaultChildSectionParentRequired, got %v", err)
	}
	if _, err := runtime.SetParentDefaultChildSectionType(context.Background(), "project-alpha", "group-section", "GlobalVariables"); !errors.Is(err, ErrDefaultChildSectionTypeInvalid) {
		t.Fatalf("expected ErrDefaultChildSectionTypeInvalid, got %v", err)
	}
}

func TestRuntimeSetListRootViewModeUpdatesEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": childDefaultsTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetListRootViewMode(context.Background(), "project-alpha", "list-root-section", ListRootViewModeTaskList); err != nil {
		t.Fatalf("SetListRootViewMode returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	listRootPayload, err := effectiveSectionPayload(project, "list-root-section", "list-root-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload list-root-section: %v", err)
	}
	if got := payloadStringField(listRootPayload, "viewMode"); got != string(ListRootViewModeTaskList) {
		t.Fatalf("expected list root view mode %q, got %q", ListRootViewModeTaskList, got)
	}
}

func TestRuntimeSetListRootViewModeSupportsDocumentedModes(t *testing.T) {
	t.Parallel()

	for _, viewMode := range []ListRootViewMode{
		ListRootViewModeDefault,
		ListRootViewModeTaskList,
		ListRootViewModeKanban,
	} {
		runtime, err := OpenOverlayRuntime(Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]Project{
				"project-alpha": childDefaultsTestProject(t),
			},
		})
		if err != nil {
			t.Fatalf("open overlay runtime for %s: %v", viewMode, err)
		}

		if _, err := runtime.SetListRootViewMode(context.Background(), "project-alpha", "list-root-section", viewMode); err != nil {
			_ = runtime.Close()
			t.Fatalf("SetListRootViewMode(%s) returned error: %v", viewMode, err)
		}

		project := runtime.Snapshot().Document.Projects["project-alpha"]
		listRootPayload, err := effectiveSectionPayload(project, "list-root-section", "list-root-variant")
		closeErr := runtime.Close()
		if err != nil {
			t.Fatalf("effectiveSectionPayload list-root-section for %s: %v", viewMode, err)
		}
		if closeErr != nil {
			t.Fatalf("close runtime for %s: %v", viewMode, closeErr)
		}
		if got := payloadStringField(listRootPayload, "viewMode"); got != string(viewMode) {
			t.Fatalf("expected list root view mode %q, got %q", viewMode, got)
		}
	}
}

func TestRuntimeSetListRootViewModeRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": childDefaultsTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetListRootViewMode(context.Background(), "project-alpha", "group-section", ListRootViewModeKanban); !errors.Is(err, ErrListRootSectionRequired) {
		t.Fatalf("expected ErrListRootSectionRequired, got %v", err)
	}
	if _, err := runtime.SetListRootViewMode(context.Background(), "project-alpha", "list-root-section", ListRootViewMode("grid")); !errors.Is(err, ErrListRootViewModeInvalid) {
		t.Fatalf("expected ErrListRootViewModeInvalid, got %v", err)
	}
}

func childDefaultsTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"group-section":     "group-variant",
			"list-root-section": "list-root-variant",
			"plain-section":     "plain-variant",
		},
		Sections: map[string]Section{
			"group-section": {
				ID:               "group-section",
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"list-root-section": {
				ID:               "list-root-section",
				Name:             "ListRoot",
				VariantIDs:       []string{"list-root-variant"},
				DefaultVariantID: "list-root-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"group-variant":     {ID: "group-variant", ImplID: "group-impl"},
			"list-root-variant": {ID: "list-root-variant", ImplID: "list-root-impl"},
			"plain-variant":     {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"group-impl": {
				ID:   "group-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"defaultChildSectionType": "Callable",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
				}),
			},
			"list-root-impl": {
				ID:   "list-root-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                      "list-root-impl",
					"type":                    "ListRoot",
					"children":                []string{},
					"defaultChildSectionType": "Callable",
					"viewMode":                "default",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize child defaults test project: %v", err)
	}
	return project
}

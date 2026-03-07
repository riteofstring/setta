package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeSetViewportSyncsActiveViewMode(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
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

	viewport := &Viewport{X: 12.5, Y: -3.25, Zoom: 1.4}
	if _, err := runtime.SetViewport(context.Background(), "project-alpha", viewport); err != nil {
		t.Fatalf("SetViewport returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.Viewport, viewport) {
		t.Fatalf("expected project viewport %#v, got %#v", viewport, project.Viewport)
	}
	if !project.ViewportInitialized {
		t.Fatal("expected project viewport to be initialized")
	}

	viewMode := project.ViewModes["focus"]
	if !reflect.DeepEqual(viewMode.Viewport, viewport) {
		t.Fatalf("expected view-mode viewport %#v, got %#v", viewport, viewMode.Viewport)
	}
	if !viewMode.ViewportInitialized {
		t.Fatal("expected active view mode viewport to be initialized")
	}

	if _, err := runtime.SetViewport(context.Background(), "project-alpha", nil); err != nil {
		t.Fatalf("clearing viewport returned error: %v", err)
	}
	project = runtime.Snapshot().Document.Projects["project-alpha"]
	if project.Viewport != nil {
		t.Fatalf("expected project viewport to clear, got %#v", project.Viewport)
	}
	if project.ViewportInitialized {
		t.Fatal("expected project viewport initialized=false after clear")
	}
	if project.ViewModes["focus"].Viewport != nil {
		t.Fatalf("expected active view mode viewport to clear, got %#v", project.ViewModes["focus"].Viewport)
	}
	if project.ViewModes["focus"].ViewportInitialized {
		t.Fatal("expected active view mode viewport initialized=false after clear")
	}
}

func TestRuntimeTogglePositionLocksValidatesBeforeApplying(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
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

	_, err = runtime.TogglePositionLocks(context.Background(), "project-alpha", []string{"callable-section", "missing-section"})
	if !errors.Is(err, ErrSectionNotFound) {
		t.Fatalf("expected ErrSectionNotFound, got %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	callablePayload, err := effectiveSectionPayload(project, "callable-section", "callable-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload callable-section: %v", err)
	}
	if payloadBoolField(callablePayload, "positionAndSizeLocked") {
		t.Fatal("expected callable section to remain unlocked after failed toggle")
	}

	if _, err := runtime.TogglePositionLocks(context.Background(), "project-alpha", []string{"callable-section", "plain-section"}); err != nil {
		t.Fatalf("TogglePositionLocks returned error: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	callablePayload, err = effectiveSectionPayload(project, "callable-section", "callable-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload callable-section after toggle: %v", err)
	}
	plainPayload, err := effectiveSectionPayload(project, "plain-section", "plain-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload plain-section after toggle: %v", err)
	}
	if !payloadBoolField(callablePayload, "positionAndSizeLocked") {
		t.Fatal("expected callable section to be locked")
	}
	if !payloadBoolField(plainPayload, "positionAndSizeLocked") {
		t.Fatal("expected plain section to be locked")
	}
}

func TestRuntimeLayoutPresentationMutationsUpdateProjectAndEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
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

	if _, err := runtime.SetShowParamDisplayNames(context.Background(), "project-alpha", true); err != nil {
		t.Fatalf("SetShowParamDisplayNames returned error: %v", err)
	}
	if _, err := runtime.SetActiveIDs(context.Background(), "project-alpha", []string{"callable-section", "plain-section"}); err != nil {
		t.Fatalf("SetActiveIDs returned error: %v", err)
	}
	if _, err := runtime.ToggleMinimized(context.Background(), "project-alpha", "callable-section"); err != nil {
		t.Fatalf("ToggleMinimized returned error: %v", err)
	}

	tagColor := "#123456"
	if _, err := runtime.SetSectionTagColor(context.Background(), "project-alpha", "callable-section", &tagColor); err != nil {
		t.Fatalf("SetSectionTagColor returned error: %v", err)
	}
	styleColor := "#654321"
	if _, err := runtime.SetSectionStyleColor(context.Background(), "project-alpha", "callable-section", &styleColor); err != nil {
		t.Fatalf("SetSectionStyleColor returned error: %v", err)
	}
	if _, err := runtime.SetCallableHideParams(context.Background(), "project-alpha", "callable-section", true); err != nil {
		t.Fatalf("SetCallableHideParams returned error: %v", err)
	}
	if _, err := runtime.SetSectionHideUnpinnedParams(context.Background(), "project-alpha", "callable-section", true); err != nil {
		t.Fatalf("SetSectionHideUnpinnedParams returned error: %v", err)
	}
	if _, err := runtime.SetSectionPinnedParams(context.Background(), "project-alpha", "callable-section", []string{"param-b", "param-c"}); err != nil {
		t.Fatalf("SetSectionPinnedParams returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true")
	}
	if !reflect.DeepEqual(project.ActiveIDs, []string{"callable-section", "plain-section"}) {
		t.Fatalf("expected active ids to persist, got %#v", project.ActiveIDs)
	}

	payload, err := effectiveSectionPayload(project, "callable-section", "callable-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload callable-section: %v", err)
	}
	if !payloadBoolField(payload, "isMinimized") {
		t.Fatal("expected callable section to be minimized")
	}
	if got := payloadRawStringField(payload, "tagColor"); got != "#123456" {
		t.Fatalf("expected tagColor #123456, got %q", got)
	}
	if got := payloadRawStringField(payload, "styleColor"); got != "#654321" {
		t.Fatalf("expected styleColor #654321, got %q", got)
	}
	if !payloadBoolField(payload, "hideParams") {
		t.Fatal("expected hideParams=true")
	}
	if !payloadBoolField(payload, "hideUnpinnedParams") {
		t.Fatal("expected hideUnpinnedParams=true")
	}
	if got := payloadStringArrayField(payload, "pinnedParams"); !reflect.DeepEqual(got, []string{"param-b", "param-c"}) {
		t.Fatalf("expected pinned params [param-b param-c], got %#v", got)
	}
}

func layoutPresentationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		ViewModes: map[string]ViewMode{
			"focus": {
				ID: "focus",
			},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"plain-section":    "plain-variant",
		},
		Sections: map[string]Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize layout presentation test project: %v", err)
	}
	return project
}

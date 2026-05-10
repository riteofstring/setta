package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeBrowserSectionMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime := newBrowserSectionMutationRuntime(t)
	setBrowserSectionColumnWidths(t, runtime)
	assertBrowserAreaViewModesUpdatePayload(t, runtime)
	seedBrowserSectionSavedSearches(t, runtime)

	payload := browserSectionMutationPayload(t, runtime)
	assertBrowserSectionSettingsPayload(t, payload)
	assertBrowserSectionSavedSearchesPayload(t, payload)
}

func newBrowserSectionMutationRuntime(t *testing.T) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": browserSectionMutationTestProject(t),
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
	return runtime
}

func setBrowserSectionColumnWidths(t *testing.T, runtime *Runtime) {
	t.Helper()

	columnWidth := 240.5
	typesColumnWidth := 160.0
	if _, err := runtime.SetBrowserColumnWidths(context.Background(), "project-alpha", "browser-section", &columnWidth, &typesColumnWidth); err != nil {
		t.Fatalf("SetBrowserColumnWidths returned error: %v", err)
	}
}

func browserSectionMutationPayload(t *testing.T, runtime *Runtime) map[string]any {
	t.Helper()

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "browser-section", "browser-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload browser-section: %v", err)
	}
	return payload
}

func assertBrowserAreaViewModesUpdatePayload(t *testing.T, runtime *Runtime) {
	t.Helper()

	for _, viewMode := range []BrowserAreaViewMode{
		BrowserAreaViewModeList,
		BrowserAreaViewModeThumbnail,
		BrowserAreaViewModeCarousel,
	} {
		if _, err := runtime.SetBrowserAreaViewMode(context.Background(), "project-alpha", "browser-section", viewMode); err != nil {
			t.Fatalf("SetBrowserAreaViewMode(%s) returned error: %v", viewMode, err)
		}
		if got := payloadRawStringField(browserSectionMutationPayload(t, runtime), "viewMode"); got != string(viewMode) {
			t.Fatalf("expected viewMode %q, got %q", viewMode, got)
		}
	}
}

func seedBrowserSectionSavedSearches(t *testing.T, runtime *Runtime) {
	t.Helper()

	if _, err := runtime.SetBrowserHideColumn(context.Background(), "project-alpha", "browser-section", true); err != nil {
		t.Fatalf("SetBrowserHideColumn returned error: %v", err)
	}
	if _, err := runtime.SetBrowserSavedSearches(context.Background(), "project-alpha", "browser-section", []BrowserSavedSearch{
		{
			ID:          "search-images",
			Name:        "Images",
			Query:       "png",
			SearchScope: BrowserSearchScopeLocal,
			TypeFilters: &BrowserSavedSearchTypeFilters{
				Image: true,
				Video: false,
				Audio: false,
				Text:  false,
				Data:  false,
			},
			Color:     "#ef4444",
			QuickInfo: "Only images",
		},
		{
			ID:    "search-defaults",
			Name:  "Defaulted",
			Query: "todo",
		},
		{
			ID:          "search-recursive",
			Name:        "Recursive",
			Query:       "notes",
			SearchScope: BrowserSearchScopeRecursive,
		},
	}); err != nil {
		t.Fatalf("SetBrowserSavedSearches returned error: %v", err)
	}
}

func assertBrowserSectionSettingsPayload(t *testing.T, payload map[string]any) {
	t.Helper()

	if got, ok := payload["columnWidth"].(float64); !ok || got != 240.5 {
		t.Fatalf("expected columnWidth 240.5, got %#v", payload["columnWidth"])
	}
	if got, ok := payload["typesColumnWidth"].(float64); !ok || got != 160.0 {
		t.Fatalf("expected typesColumnWidth 160.0, got %#v", payload["typesColumnWidth"])
	}
	assertPayloadStringFields(t, payload, map[string]string{"viewMode": string(BrowserAreaViewModeCarousel)})
	assertPayloadBoolFields(t, payload, []string{"hideColumn"})
}

func assertBrowserSectionSavedSearchesPayload(t *testing.T, payload map[string]any) {
	t.Helper()

	rawSavedSearches, ok := payload["savedSearches"].([]any)
	if !ok || len(rawSavedSearches) != 3 {
		t.Fatalf("expected three saved searches, got %#v", payload["savedSearches"])
	}

	firstSavedSearch, ok := rawSavedSearches[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first saved search object, got %#v", rawSavedSearches[0])
	}
	if firstSavedSearch["id"] != "search-images" {
		t.Fatalf("expected first saved search id search-images, got %#v", firstSavedSearch["id"])
	}
	if firstSavedSearch["searchScope"] != string(BrowserSearchScopeLocal) {
		t.Fatalf("expected local search scope, got %#v", firstSavedSearch["searchScope"])
	}
	firstTypeFilters, ok := firstSavedSearch["typeFilters"].(map[string]any)
	if !ok {
		t.Fatalf("expected first saved search typeFilters object, got %#v", firstSavedSearch["typeFilters"])
	}
	if firstTypeFilters["image"] != true || firstTypeFilters["video"] != false {
		t.Fatalf("expected first saved search type filters to persist, got %#v", firstTypeFilters)
	}

	secondSavedSearch, ok := rawSavedSearches[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search object, got %#v", rawSavedSearches[1])
	}
	if secondSavedSearch["searchScope"] != string(BrowserSearchScopeRecursive) {
		t.Fatalf("expected blank searchScope to normalize to recursive, got %#v", secondSavedSearch["searchScope"])
	}
	secondTypeFilters, ok := secondSavedSearch["typeFilters"].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search typeFilters object, got %#v", secondSavedSearch["typeFilters"])
	}
	for _, key := range []string{"image", "video", "audio", "text", "data"} {
		if secondTypeFilters[key] != true {
			t.Fatalf("expected default type filter %s=true, got %#v", key, secondTypeFilters[key])
		}
	}

	thirdSavedSearch, ok := rawSavedSearches[2].(map[string]any)
	if !ok {
		t.Fatalf("expected third saved search object, got %#v", rawSavedSearches[2])
	}
	if thirdSavedSearch["searchScope"] != string(BrowserSearchScopeRecursive) {
		t.Fatalf("expected explicit recursive search scope, got %#v", thirdSavedSearch["searchScope"])
	}
}

func TestRuntimeBrowserSectionMutationsRejectInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": browserSectionMutationTestProject(t),
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

	if _, err := runtime.SetBrowserColumnWidths(context.Background(), "project-alpha", "plain-section", nil, nil); !errors.Is(err, ErrBrowserSectionRequired) {
		t.Fatalf("expected ErrBrowserSectionRequired from SetBrowserColumnWidths, got %v", err)
	}
	if _, err := runtime.SetBrowserAreaViewMode(context.Background(), "project-alpha", "plain-section", BrowserAreaViewModeList); !errors.Is(err, ErrBrowserSectionRequired) {
		t.Fatalf("expected ErrBrowserSectionRequired from SetBrowserAreaViewMode against plain section, got %v", err)
	}
	if _, err := runtime.SetBrowserHideColumn(context.Background(), "project-alpha", "plain-section", true); !errors.Is(err, ErrBrowserSectionRequired) {
		t.Fatalf("expected ErrBrowserSectionRequired from SetBrowserHideColumn, got %v", err)
	}
	if _, err := runtime.SetBrowserSavedSearches(context.Background(), "project-alpha", "plain-section", nil); !errors.Is(err, ErrBrowserSectionRequired) {
		t.Fatalf("expected ErrBrowserSectionRequired from SetBrowserSavedSearches, got %v", err)
	}
	if _, err := runtime.SetBrowserAreaViewMode(context.Background(), "project-alpha", "browser-section", BrowserAreaViewMode("grid")); !errors.Is(err, ErrBrowserAreaViewModeInvalid) {
		t.Fatalf("expected ErrBrowserAreaViewModeInvalid, got %v", err)
	}
	if _, err := runtime.SetBrowserSavedSearches(context.Background(), "project-alpha", "browser-section", []BrowserSavedSearch{{
		ID:          "search-invalid",
		SearchScope: BrowserSearchScope("global"),
	}}); !errors.Is(err, ErrBrowserSearchScopeInvalid) {
		t.Fatalf("expected ErrBrowserSearchScopeInvalid, got %v", err)
	}
}

func browserSectionMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"browser-section": "browser-variant",
			"plain-section":   "plain-variant",
		},
		Sections: map[string]Section{
			"browser-section": {
				ID:               "browser-section",
				Name:             "Browser Section",
				VariantIDs:       []string{"browser-variant"},
				DefaultVariantID: "browser-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"browser-variant": {
				ID:     "browser-variant",
				ImplID: "browser-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"browser-impl": {
				ID:   "browser-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":               "browser-impl",
					"type":             "Browser",
					"folder":           "",
					"hideColumn":       false,
					"columnWidth":      nil,
					"typesColumnWidth": nil,
					"viewMode":         "list",
					"savedSearches":    []any{},
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
		t.Fatalf("normalize browser section mutation project: %v", err)
	}
	return project
}

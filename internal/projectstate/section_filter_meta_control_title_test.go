package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestRuntimeSetSectionParamFilterPersistsRawString(t *testing.T) {
	t.Parallel()

	runtime := openSectionFilterMetaControlTitleTestRuntime(t)

	if _, err := runtime.SetSectionParamFilter(context.Background(), "project-alpha", "params-section", "   "); err != nil {
		t.Fatalf("SetSectionParamFilter returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionParamFilter: %v", err)
	}
	payload, err := effectiveSectionPayload(project, "params-section", "params-variant")
	if err != nil {
		t.Fatalf("effective payload after SetSectionParamFilter: %v", err)
	}
	if got, ok := payload["paramFilter"].(string); !ok || got != "   " {
		t.Fatalf("expected raw paramFilter whitespace to persist, got %#v", payload["paramFilter"])
	}
}

func TestRuntimeSetSectionParamFilterRejectsUnsupportedSectionType(t *testing.T) {
	t.Parallel()

	runtime := openSectionFilterMetaControlTitleTestRuntime(t)

	_, err := runtime.SetSectionParamFilter(context.Background(), "project-alpha", "code-section", "alpha")
	if !errors.Is(err, ErrSectionParamFilterUnsupported) {
		t.Fatalf("expected ErrSectionParamFilterUnsupported, got %v", err)
	}
}

func TestRuntimeSetMetaControlShowSectionTitlePersistsValue(t *testing.T) {
	t.Parallel()

	runtime := openSectionFilterMetaControlTitleTestRuntime(t)

	if _, err := runtime.SetMetaControlShowSectionTitle(context.Background(), "project-alpha", "meta-section", true); err != nil {
		t.Fatalf("SetMetaControlShowSectionTitle returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetMetaControlShowSectionTitle: %v", err)
	}
	payload, err := effectiveSectionPayload(project, "meta-section", "meta-variant")
	if err != nil {
		t.Fatalf("effective payload after SetMetaControlShowSectionTitle: %v", err)
	}
	if got, ok := payload["showSectionTitle"].(bool); !ok || !got {
		t.Fatalf("expected showSectionTitle=true, got %#v", payload["showSectionTitle"])
	}
}

func TestRuntimeSetMetaControlShowSectionTitleRejectsNonMetaControlSection(t *testing.T) {
	t.Parallel()

	runtime := openSectionFilterMetaControlTitleTestRuntime(t)

	_, err := runtime.SetMetaControlShowSectionTitle(context.Background(), "project-alpha", "params-section", true)
	if !errors.Is(err, ErrMetaControlSectionRequired) {
		t.Fatalf("expected ErrMetaControlSectionRequired, got %v", err)
	}
}

func openSectionFilterMetaControlTitleTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"params-section",
			"meta-section",
			"code-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"params-section": {X: 10, Y: 20},
			"meta-section":   {X: 20, Y: 30},
			"code-section":   {X: 30, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"params-section": "params-variant",
			"meta-section":   "meta-variant",
			"code-section":   "code-variant",
		},
		Sections: map[string]Section{
			"params-section": {
				ID:               "params-section",
				Name:             "Params",
				VariantIDs:       []string{"params-variant"},
				DefaultVariantID: "params-variant",
			},
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"params-variant": {ID: "params-variant", ImplID: "params-impl"},
			"meta-variant":   {ID: "meta-variant", ImplID: "meta-impl"},
			"code-variant":   {ID: "code-variant", ImplID: "code-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"params-impl": {
				ID:      "params-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustSectionFilterMetaControlTitleRawJSON(t, map[string]any{"id": "params-impl", "type": "Dict", "paramFilter": "", "codeObjVariantMap": map[string]any{}}),
			},
			"meta-impl": {
				ID:      "meta-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustSectionFilterMetaControlTitleRawJSON(t, map[string]any{"id": "meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustSectionFilterMetaControlTitleRawJSON(t, map[string]any{"id": "code-impl", "type": "Code", "codeLanguage": "python", "code": "print('alpha')\n", "children": []any{}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section filter/meta control project: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func mustSectionFilterMetaControlTitleRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return encoded
}

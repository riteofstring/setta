package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
)

func TestDocumentNormalizedSupportsFrontendSourceFields(t *testing.T) {
	t.Parallel()

	document := newFrontendSourceTestDocument(t)

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize rich project document: %v", err)
	}

	if normalized.AppDefinition == nil {
		t.Fatal("expected app definition to be preserved")
	}
	if len(normalized.AppDefinition.Routes) != 1 {
		t.Fatalf("expected one app route, got %d", len(normalized.AppDefinition.Routes))
	}

	project := normalized.Projects["project-alpha"]
	if project.ActiveViewModeID != "focus" {
		t.Fatalf("expected active view mode focus, got %q", project.ActiveViewModeID)
	}
	if project.CodeObjImpls["param-impl"].Type != "TextParam" {
		t.Fatalf("expected code object impl type TextParam, got %q", project.CodeObjImpls["param-impl"].Type)
	}
	if string(project.SectionImpls["impl-main"].Payload) == "" {
		t.Fatal("expected section impl payload to be preserved")
	}
}

func TestDocumentCloneDeepCopiesFrontendSourceFields(t *testing.T) {
	t.Parallel()

	original := newFrontendSourceTestDocument(t)
	cloned := original.Clone()

	clonedProject := cloned.Projects["project-alpha"]
	clonedProject.ActiveIDs[0] = "changed-active"
	layout := clonedProject.TopLevelSections["section-main"]
	layout.X = 999
	clonedProject.TopLevelSections["section-main"] = layout
	viewMode := clonedProject.ViewModes["focus"]
	sectionLayout := viewMode.TopLevelSections["section-main"]
	sectionLayout.Y = 777
	viewMode.TopLevelSections["section-main"] = sectionLayout
	clonedProject.ViewModes["focus"] = viewMode
	clonedProject.CodegenTargets[0].Payload[1] = 'X'
	clonedSectionImpl := clonedProject.SectionImpls["impl-main"]
	clonedSectionImpl.Payload[1] = 'X'
	clonedProject.SectionImpls["impl-main"] = clonedSectionImpl
	clonedCodeObj := clonedProject.CodeObjs["param-root"]
	clonedCodeObj.SharedModifier[1] = 'X'
	clonedProject.CodeObjs["param-root"] = clonedCodeObj
	cloned.Projects["project-alpha"] = clonedProject
	cloned.AppDefinition.Theme[1] = 'X'

	originalProject := original.Projects["project-alpha"]
	if originalProject.ActiveIDs[0] != "section-main" {
		t.Fatalf("expected original active id section-main, got %q", originalProject.ActiveIDs[0])
	}
	if originalProject.TopLevelSections["section-main"].X != 10 {
		t.Fatalf("expected original top-level section x=10, got %v", originalProject.TopLevelSections["section-main"].X)
	}
	if originalProject.ViewModes["focus"].TopLevelSections["section-main"].Y != 20 {
		t.Fatalf("expected original view-mode layout y=20, got %v", originalProject.ViewModes["focus"].TopLevelSections["section-main"].Y)
	}
	if string(originalProject.CodegenTargets[0].Payload) != `{"language":"python","genCodePrefix":"prefix","generateMetadata":true}` {
		t.Fatalf("expected original codegen payload to stay unchanged, got %s", string(originalProject.CodegenTargets[0].Payload))
	}
	if string(originalProject.SectionImpls["impl-main"].Payload) != `{"id":"impl-main","type":"Code","code":"print('hello')","codeLanguage":"python","children":[]}` {
		t.Fatalf("expected original section impl payload to stay unchanged, got %s", string(originalProject.SectionImpls["impl-main"].Payload))
	}
	if string(originalProject.CodeObjs["param-root"].SharedModifier) != `{"description":"A param"}` {
		t.Fatalf("expected original code object modifier to stay unchanged, got %s", string(originalProject.CodeObjs["param-root"].SharedModifier))
	}
	if original.AppDefinition == nil {
		t.Fatal("expected original app definition to exist")
	}
	if string(original.AppDefinition.Theme) != `{"colors":{"bg":"white"}}` {
		t.Fatalf("expected original app definition theme to stay unchanged, got %s", string(original.AppDefinition.Theme))
	}
}

func TestStoreSaveRoundTripsRichFrontendSourceDocument(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := newFrontendSourceTestDocument(t)
	expected, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize rich project document: %v", err)
	}

	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save rich project document: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load rich project document: %v", err)
	}
	if loaded.DefaultProjectID != expected.DefaultProjectID {
		t.Fatalf("expected default project id %q, got %q", expected.DefaultProjectID, loaded.DefaultProjectID)
	}
	if loaded.AppDefinition == nil {
		t.Fatal("expected app definition to round-trip")
	}
	assertJSONEqual(t, expected.AppDefinition.Actions, loaded.AppDefinition.Actions, "app actions")

	loadedProject := loaded.Projects["project-alpha"]
	expectedProject := expected.Projects["project-alpha"]
	if loadedProject.ActiveViewModeID != expectedProject.ActiveViewModeID {
		t.Fatalf("expected active view mode %q, got %q", expectedProject.ActiveViewModeID, loadedProject.ActiveViewModeID)
	}
	if loadedProject.ViewModes["focus"].TopLevelSections["section-main"].X != expectedProject.ViewModes["focus"].TopLevelSections["section-main"].X {
		t.Fatalf("expected view-mode layout x=%v, got %v", expectedProject.ViewModes["focus"].TopLevelSections["section-main"].X, loadedProject.ViewModes["focus"].TopLevelSections["section-main"].X)
	}
	assertJSONEqual(t, expectedProject.CodegenTargets[0].Payload, loadedProject.CodegenTargets[0].Payload, "codegen payload")
	assertJSONEqual(t, expectedProject.SectionImpls["impl-main"].Payload, loadedProject.SectionImpls["impl-main"].Payload, "section impl payload")
	assertJSONEqual(t, expectedProject.CodeObjImpls["param-impl"].Payload, loadedProject.CodeObjImpls["param-impl"].Payload, "code object impl payload")
}

func TestDocumentNormalizedRejectsInvalidFrontendPayloadJSON(t *testing.T) {
	t.Parallel()

	document := newFrontendSourceTestDocument(t)
	project := document.Projects["project-alpha"]
	invalidImpl := project.CodeObjImpls["param-impl"]
	invalidImpl.Payload = RawJSON(`{`)
	project.CodeObjImpls["param-impl"] = invalidImpl
	document.Projects["project-alpha"] = project

	_, err := document.Normalized()
	if !errors.Is(err, ErrFrontendPayloadInvalid) {
		t.Fatalf("expected invalid frontend payload error, got %v", err)
	}
}

func newFrontendSourceTestDocument(t *testing.T) Document {
	t.Helper()

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		AppDefinition: &AppDefinition{
			AppSpecVersion: "v1",
			CatalogID:      "setta.app.default",
			AppSpecPath:    "app_specs/app.json",
			Routes: []AppRoute{
				{Path: "/", Name: "Home", RootKey: "root"},
			},
			DataBindings: mustRawJSON(t, `{"title":"hello"}`),
			Actions:      mustRawJSON(t, `{"submit":{"type":"run"}}`),
			Theme:        mustRawJSON(t, `{"colors":{"bg":"white"}}`),
			Assets:       mustRawJSON(t, `[{"type":"image","path":"hero.png"}]`),
		},
		Projects: map[string]Project{
			"project-alpha": {
				ID:                      "project-alpha",
				Name:                    "Alpha",
				ShowParamDisplayNames:   true,
				AllowJSONSourceKeyEdits: true,
				PreviewImgColor:         "bg-blue-500/60",
				Viewport:                &Viewport{X: 1, Y: 2, Zoom: 0.75},
				ViewportInitialized:     true,
				ViewModes: map[string]ViewMode{
					"focus": {
						ID:                  "focus",
						Name:                "Focus",
						IsUserFacing:        true,
						Viewport:            &Viewport{X: 10, Y: 20, Zoom: 0.5},
						ViewportInitialized: true,
						TopLevelSections: map[string]TopLevelSectionLayout{
							"section-main": {X: 10, Y: 20},
						},
					},
				},
				ActiveViewModeID: "focus",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: "python",
						Payload:  mustRawJSON(t, `{"language":"python","genCodePrefix":"prefix","generateMetadata":true}`),
					},
				},
				GeneratedCodeBinding:     &CodeFileBinding{Path: "generated/main.py"},
				GeneratedMetadataBinding: &CodeFileBinding{Path: "generated/meta.json", AccessMode: CodeFileAccessModeReadOnly},
				EntryCodeBlockID:         "section-main",
				TopLevelSectionIDs:       []string{"section-main"},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"section-main": {X: 10, Y: 20},
				},
				SectionVariantMap: map[string]string{
					"section-main": "variant-main",
				},
				ActiveIDs: []string{"section-main"},
				Edges: []Edge{
					{
						ID:              "edge-1",
						SourceSectionID: "section-main",
						SourceVariantID: "variant-main",
						SourcePortID:    "out",
						TargetSectionID: "section-main",
						TargetVariantID: "variant-main",
						TargetPortID:    "in",
						Type:            "default",
						Style:           mustRawJSON(t, `{"stroke":"red"}`),
						Data:            mustRawJSON(t, `{"kind":"graph"}`),
					},
				},
				AgenticEdges: []AgenticEdge{
					{
						ID:              "agent-edge-1",
						SourceSectionID: "section-main",
						TargetSectionID: "section-main",
						Kind:            "context",
						ContextMode:     "reference_only",
						Style:           mustRawJSON(t, `{"opacity":0.7}`),
					},
				},
				Sections: map[string]Section{
					"section-main": {
						ID:               "section-main",
						Name:             "Main Section",
						DisplayName:      "Main Display",
						VariantIDs:       []string{"variant-main"},
						DefaultVariantID: "variant-main",
						SharedModifier:   mustRawJSON(t, `{"isFrozen":true}`),
						UnsharedKeys:     []string{"code"},
					},
				},
				SectionVariants: map[string]SectionVariant{
					"variant-main": {
						ID:               "variant-main",
						Name:             "Python",
						ImplID:           "impl-main",
						NonPresetImplIDs: []string{"impl-main"},
						Modifier:         mustRawJSON(t, `{"codeLanguage":"python"}`),
					},
				},
				SectionImpls: map[string]SectionImpl{
					"impl-main": {
						ID:      "impl-main",
						Kind:    SectionKindCode,
						Payload: mustRawJSON(t, `{"id":"impl-main","type":"Code","code":"print('hello')","codeLanguage":"python","children":[]}`),
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
							Binding:  &CodeFileBinding{Path: "sections/main.py"},
						},
					},
				},
				CodeObjs: map[string]CodeObject{
					"param-root": {
						ID:               "param-root",
						Name:             "Input",
						DisplayName:      "Input",
						VariantIDs:       []string{"param-var"},
						DefaultVariantID: "param-var",
						SharedModifier:   mustRawJSON(t, `{"description":"A param"}`),
					},
				},
				CodeObjVariants: map[string]CodeObjectVariant{
					"param-var": {
						ID:       "param-var",
						Name:     "Default",
						ImplID:   "param-impl",
						Modifier: mustRawJSON(t, `{"value":"42"}`),
					},
				},
				CodeObjImpls: map[string]CodeObjectImpl{
					"param-impl": {
						ID:      "param-impl",
						Type:    "TextParam",
						Payload: mustRawJSON(t, `{"id":"param-impl","type":"TextParam","value":"42"}`),
					},
				},
			},
		},
	}
}

func mustRawJSON(t *testing.T, raw string) RawJSON {
	t.Helper()

	if !json.Valid([]byte(raw)) {
		t.Fatalf("invalid raw JSON test fixture: %s", raw)
	}
	return RawJSON(raw)
}

func assertJSONEqual(t *testing.T, expected RawJSON, actual RawJSON, label string) {
	t.Helper()

	var expectedValue any
	if err := json.Unmarshal(expected, &expectedValue); err != nil {
		t.Fatalf("unmarshal expected %s: %v", label, err)
	}
	var actualValue any
	if err := json.Unmarshal(actual, &actualValue); err != nil {
		t.Fatalf("unmarshal actual %s: %v", label, err)
	}
	if !reflect.DeepEqual(actualValue, expectedValue) {
		t.Fatalf("expected %s %s, got %s", label, string(expected), string(actual))
	}
}

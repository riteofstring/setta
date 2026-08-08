package mcpx

import (
	"encoding/json"
	"reflect"
	"testing"

	"setta/internal/projectview"
	"setta/internal/tools"
)

func TestResolveToolTargetsMapsExplicitSectionAndCodeObjectTargets(t *testing.T) {
	t.Parallel()

	projectView := testTargetResolutionProjectView()
	resolved, err := resolveToolTargets(
		tools.Metadata{
			IDPathsByType: map[tools.IDType][]string{
				tools.IDTypeSection:    {"sectionId"},
				tools.IDTypeCodeObject: {"codeObjIds"},
			},
		},
		map[string]any{
			"sectionId":  "explicit-section",
			"codeObjIds": []any{"callable-code", "mapped-code", "missing-code"},
		},
		&projectView,
	)
	if err != nil {
		t.Fatalf("resolve tool targets: %v", err)
	}

	if !reflect.DeepEqual(resolved.sectionIDs, []string{"explicit-section", "section-a", "section-b"}) {
		t.Fatalf("unexpected target section ids %#v", resolved.sectionIDs)
	}
	if !reflect.DeepEqual(resolved.unmappedCodeObjIDs, []string{"missing-code"}) {
		t.Fatalf("unexpected unmapped code object ids %#v", resolved.unmappedCodeObjIDs)
	}
}

func TestResolveToolTargetsFallsBackToSingletonSection(t *testing.T) {
	t.Parallel()

	projectView := testTargetResolutionProjectView()
	resolved, err := resolveToolTargets(
		tools.Metadata{
			DefaultTargetSingletonSection: "GenPythonCode",
		},
		nil,
		&projectView,
	)
	if err != nil {
		t.Fatalf("resolve tool targets: %v", err)
	}

	if !reflect.DeepEqual(resolved.sectionIDs, []string{"singleton-gen-python"}) {
		t.Fatalf("unexpected singleton target ids %#v", resolved.sectionIDs)
	}
	if len(resolved.unmappedCodeObjIDs) != 0 {
		t.Fatalf("expected no unmapped code object ids, got %#v", resolved.unmappedCodeObjIDs)
	}
}

func TestResolveToolTargetsRequiresProjectViewForCodeObjectMappings(t *testing.T) {
	t.Parallel()

	_, err := resolveToolTargets(
		tools.Metadata{
			IDPathsByType: map[tools.IDType][]string{
				tools.IDTypeCodeObject: {"codeObjId"},
			},
		},
		map[string]any{
			"codeObjId": "mapped-code",
		},
		nil,
	)
	if err == nil {
		t.Fatal("expected code object mapping to require a project view")
	}
	if err.Error() != "mcpx: project view is required for code object target mapping" {
		t.Fatalf("unexpected error %q", err)
	}
}

func testTargetResolutionProjectView() projectview.SingleConfig {
	sectionAVariantID := "section-a-variant"
	sectionBVariantID := "section-b-variant"
	genPythonSingletonID := "singleton-gen-python"

	return projectview.SingleConfig{
		Sections: map[string]projectview.Core{
			"section-a": {
				ID:             "section-a",
				Variants:       []string{sectionAVariantID},
				DefaultVariant: targetResolutionStringPointer(sectionAVariantID),
				SharedModifier: testRawJSONObject(),
			},
			"section-b": {
				ID:             "section-b",
				Variants:       []string{sectionBVariantID},
				DefaultVariant: targetResolutionStringPointer(sectionBVariantID),
				SharedModifier: testRawJSONObject(),
			},
		},
		SectionImpls: map[string]json.RawMessage{
			"impl-a": json.RawMessage(`{"codeObjVariantMap":{"mapped-code":"variant-a"}}`),
			"impl-b": json.RawMessage(`{"callable":"callable-code"}`),
		},
		SectionVariants: map[string]projectview.Variant{
			sectionAVariantID: {
				ID:       sectionAVariantID,
				Impl:     "impl-a",
				Modifier: testRawJSONObject(),
			},
			sectionBVariantID: {
				ID:       sectionBVariantID,
				Impl:     "impl-b",
				Modifier: testRawJSONObject(),
			},
		},
		ProjectConfig: projectview.ProjectConfig{
			SectionVariantMap: map[string]string{},
		},
		SingletonSections: projectview.SingletonSections{
			GenPythonCode: &genPythonSingletonID,
		},
	}
}

func testRawJSONObject() json.RawMessage {
	return json.RawMessage(`{}`)
}

func targetResolutionStringPointer(value string) *string {
	return &value
}

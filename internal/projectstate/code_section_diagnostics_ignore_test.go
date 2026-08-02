package projectstate

import (
	"encoding/json"
	"errors"
	"testing"
)

// Shared diagnostics ignore fields should persist on the section core so every
// variant sees the same mute state unless the field is explicitly unshared.
func TestProjectSetCodeSectionDiagnosticsMuteStoresSharedModifier(t *testing.T) {
	t.Parallel()

	project := ignoreStateTestProject(t, ignoreStateTestProjectOptions{})
	if err := project.SetCodeSectionDiagnosticsMute("section-1", true); err != nil {
		t.Fatalf("set diagnostics mute: %v", err)
	}

	sharedModifier := rawProjectObject(t, project.Sections["section-1"].SharedModifier)
	ignoreState := ignoreStateFromObject(t, sharedModifier["diagnosticsIgnoreState"])
	if !ignoreState.Muted {
		t.Fatalf("expected muted ignore state in shared modifier, got %#v", ignoreState)
	}
	if len(ignoreState.SuppressedCodes) != 0 {
		t.Fatalf("expected no suppressed codes, got %#v", ignoreState.SuppressedCodes)
	}
}

// Unshared ignore fields on non-preset implementations should persist on the
// backing impl payload so the active variant keeps its own diagnostics state.
func TestProjectSetCodeSectionDiagnosticCodeSuppressionStoresImplPayload(t *testing.T) {
	t.Parallel()

	project := ignoreStateTestProject(t, ignoreStateTestProjectOptions{
		unshared: true,
	})
	if err := project.SetCodeSectionDiagnosticCodeSuppression("section-1", float64(7), true); err != nil {
		t.Fatalf("set code suppression: %v", err)
	}

	payload := rawProjectObject(t, project.SectionImpls["impl-1"].Payload)
	ignoreState := ignoreStateFromObject(t, payload["diagnosticsIgnoreState"])
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != 7 {
		t.Fatalf("expected integer suppression in impl payload, got %#v", ignoreState.SuppressedCodes)
	}
}

// Unshared ignore fields on preset implementations should persist on the
// active variant modifier, matching the frontend effective-impl update rules.
func TestProjectSetCodeSectionDiagnosticCodeSuppressionStoresPresetVariantModifier(t *testing.T) {
	t.Parallel()

	project := ignoreStateTestProject(t, ignoreStateTestProjectOptions{
		unshared: true,
		preset:   true,
	})
	if err := project.SetCodeSectionDiagnosticCodeSuppression("section-1", "reportFoo", true); err != nil {
		t.Fatalf("set code suppression: %v", err)
	}

	modifier := rawProjectObject(t, project.SectionVariants["variant-1"].Modifier)
	ignoreState := ignoreStateFromObject(t, modifier["diagnosticsIgnoreState"])
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected variant modifier suppression, got %#v", ignoreState.SuppressedCodes)
	}

	resolved, err := project.CodeSectionDiagnosticsIgnoreStateForSection("section-1")
	if err != nil {
		t.Fatalf("resolve code section ignore state: %v", err)
	}
	if len(resolved.SuppressedCodes) != 1 || resolved.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected effective suppression to resolve from variant modifier, got %#v", resolved.SuppressedCodes)
	}
}

func TestCodeSectionDiagnosticsIgnoreStateFromValueNormalizesSupportedSuppressedCodes(t *testing.T) {
	t.Parallel()

	state, err := codeSectionDiagnosticsIgnoreStateFromValue(map[string]any{
		"suppressedCodes": []any{json.Number("7"), float64(9), "reportFoo"},
	})
	if err != nil {
		t.Fatalf("decode ignore state: %v", err)
	}

	expected := []any{7, 9, "reportFoo"}
	if len(state.SuppressedCodes) != len(expected) {
		t.Fatalf("expected %#v suppressed codes, got %#v", expected, state.SuppressedCodes)
	}
	for index, want := range expected {
		if state.SuppressedCodes[index] != want {
			t.Fatalf("expected suppressed code %d to be %#v, got %#v", index, want, state.SuppressedCodes[index])
		}
	}
}

func TestCodeSectionDiagnosticsIgnoreStateFromValueRejectsInvalidSuppressedCode(t *testing.T) {
	t.Parallel()

	_, err := codeSectionDiagnosticsIgnoreStateFromValue(map[string]any{
		"suppressedCodes": []any{json.Number("7.5")},
	})
	if !errors.Is(err, ErrInvalidCodeSectionDiagnosticCode) {
		t.Fatalf("expected invalid code error, got %v", err)
	}
}

func TestApplyCodeSectionDiagnosticsIgnoreMatchesEquivalentNumericCodes(t *testing.T) {
	t.Parallel()

	filtered := applyCodeSectionDiagnosticsIgnore(
		[]LSPDiagnostic{
			{Message: "string", Code: "reportFoo"},
			{Message: "int64", Code: int64(7)},
			{Message: "float", Code: float64(8)},
			{Message: "keep", Code: json.Number("9")},
		},
		CodeSectionDiagnosticsIgnoreState{
			SuppressedCodes: []any{"reportFoo", json.Number("7"), int8(8)},
		},
	)

	if len(filtered) != 1 {
		t.Fatalf("expected one remaining diagnostic, got %#v", filtered)
	}
	if filtered[0].Message != "keep" {
		t.Fatalf("expected unmatched diagnostic to remain, got %#v", filtered[0])
	}
}

type ignoreStateTestProjectOptions struct {
	unshared bool
	preset   bool
}

func ignoreStateTestProject(t *testing.T, options ignoreStateTestProjectOptions) Project {
	t.Helper()

	section := Section{
		ID:               "section-1",
		Name:             "Section",
		VariantIDs:       []string{"variant-1"},
		DefaultVariantID: "variant-1",
	}
	if options.unshared {
		section.UnsharedKeys = []string{"diagnosticsIgnoreState"}
	}

	implPayload := map[string]any{
		"id":           "impl-1",
		"type":         "Code",
		"code":         "print('hello')\n",
		"codeLanguage": "python",
		"children":     []any{},
	}
	if options.preset {
		implPayload["isPreset"] = true
	}

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-1",
		Projects: map[string]Project{
			"project-1": {
				ID:   "project-1",
				Name: "Project",
				SectionVariantMap: map[string]string{
					"section-1": "variant-1",
				},
				Sections: map[string]Section{
					"section-1": section,
				},
				SectionVariants: map[string]SectionVariant{
					"variant-1": {
						ID:     "variant-1",
						ImplID: "impl-1",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"impl-1": {
						ID:   "impl-1",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
						},
						Payload: mustIgnoreStateRawJSON(t, implPayload),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize ignore state test document: %v", err)
	}
	return document.Projects["project-1"]
}

func rawProjectObject(t *testing.T, raw RawJSON) map[string]any {
	t.Helper()

	object, err := rawObjectFromProjectPayload(raw)
	if err != nil {
		t.Fatalf("decode raw project object: %v", err)
	}
	return object
}

func ignoreStateFromObject(t *testing.T, value any) CodeSectionDiagnosticsIgnoreState {
	t.Helper()

	state, err := codeSectionDiagnosticsIgnoreStateFromValue(value)
	if err != nil {
		t.Fatalf("decode ignore state: %v", err)
	}
	return state
}

func mustIgnoreStateRawJSON(t *testing.T, value map[string]any) RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return RawJSON(encoded)
}

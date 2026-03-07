package projectstate

import (
	"context"
	"errors"
	"testing"
)

// Auto-refetch should reuse the current callable name, force a signature
// refresh, and update the existing callable graph in place.
func TestProjectRefetchCallableParamsReusesCurrentCallable(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Documentation: "Refetched docs.",
			Status:        SignatureHelpStatusMatched,
			Params: []CallableParamProposal{
				{
					Name:           "items",
					Description:    "Items to process.",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "list[str]",
				},
			},
		},
	}

	didUpdate, err := project.RefetchCallableParams(
		context.Background(),
		[]string{"callable-section"},
		resolver,
	)
	if err != nil {
		t.Fatalf("refetch callable params: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected refetch to report an update")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	payload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", "callable-1")
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(payload, "children")
	if len(children) != 1 {
		t.Fatalf("expected one refetched child param, got %#v", children)
	}

	paramPayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", children[0])
	if err != nil {
		t.Fatalf("resolve refetched param payload: %v", err)
	}
	if got := payloadStringField(paramPayload, "typeAnnotation"); got != "list[str]" {
		t.Fatalf("expected updated type annotation, got %q", got)
	}
}

// Missing callable code objects are a hard data bug and should fail loudly
// instead of silently dropping sections from auto-refetch.
func TestProjectRefetchCallableParamsFailsOnMissingCallableCodeObject(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	delete(project.CodeObjs, "callable-1")

	_, err := project.RefetchCallableParams(context.Background(), []string{"callable-section"}, nil)
	if !errors.Is(err, ErrCodeObjNotFound) {
		t.Fatalf("expected missing callable code object error, got %v", err)
	}
}

// Empty settings documents should fall back to the schema default so mismatch
// refetch keeps working before a settings project is ever saved.
func TestAutoRefetchCallableParamsOnLSPMismatchEnabledDefaultsTrue(t *testing.T) {
	t.Parallel()

	enabled, err := AutoRefetchCallableParamsOnLSPMismatchEnabled(Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	})
	if err != nil {
		t.Fatalf("lookup mismatch refetch default: %v", err)
	}
	if !enabled {
		t.Fatal("expected default mismatch refetch setting to be true")
	}
}

// The backend settings flag should be read from the normalized settings project
// instead of being hard-coded in the refetch path.
func TestAutoRefetchCallableParamsOnLSPMismatchEnabledReadsBackendSetting(t *testing.T) {
	t.Parallel()

	document := settingsBackendTestDocument(t, "false")
	enabled, err := AutoRefetchCallableParamsOnLSPMismatchEnabled(document)
	if err != nil {
		t.Fatalf("lookup mismatch refetch setting: %v", err)
	}
	if enabled {
		t.Fatal("expected explicit false mismatch refetch setting")
	}
}

// Invalid stored switch values should fail loudly so the runtime does not guess
// mismatch-refetch policy from malformed state.
func TestAutoRefetchCallableParamsOnLSPMismatchEnabledRejectsInvalidValue(t *testing.T) {
	t.Parallel()

	document := settingsBackendTestDocument(t, "not-a-bool")
	_, err := AutoRefetchCallableParamsOnLSPMismatchEnabled(document)
	if !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected invalid settings value error, got %v", err)
	}
}

// Empty settings documents should use the schema default for rename refactors
// so rename flows can start from one deterministic mode in Go.
func TestRenameRefactorModeForDocumentDefaultsAlwaysAsk(t *testing.T) {
	t.Parallel()

	mode, err := RenameRefactorModeForDocument(Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	})
	if err != nil {
		t.Fatalf("lookup rename refactor mode default: %v", err)
	}
	if mode != RenameRefactorModeAlwaysAsk {
		t.Fatalf("expected default rename mode ALWAYS_ASK, got %q", mode)
	}
}

// The backend rename mode should come from the settings runtime rather than a
// route-local default so later rename flows have one source of truth.
func TestRenameRefactorModeForDocumentReadsBackendSetting(t *testing.T) {
	t.Parallel()

	mode, err := RenameRefactorModeForDocument(
		settingsBackendSettingTestDocument(t, "renameRefactorMode", "ALWAYS_RENAME"),
	)
	if err != nil {
		t.Fatalf("lookup rename refactor mode: %v", err)
	}
	if mode != RenameRefactorModeAlwaysRename {
		t.Fatalf("expected ALWAYS_RENAME mode, got %q", mode)
	}
}

// Invalid stored rename modes should fail loudly instead of silently guessing
// which rename flow the backend should follow.
func TestRenameRefactorModeForDocumentRejectsInvalidValue(t *testing.T) {
	t.Parallel()

	_, err := RenameRefactorModeForDocument(
		settingsBackendSettingTestDocument(t, "renameRefactorMode", "SOMETHING_ELSE"),
	)
	if !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected invalid settings value error, got %v", err)
	}
}

func settingsBackendTestDocument(t *testing.T, rawValue string) Document {
	t.Helper()

	return settingsBackendSettingTestDocument(
		t,
		"autoRefetchCallableParamsOnLSPMismatch",
		rawValue,
	)
}

func settingsBackendSettingTestDocument(t *testing.T, settingName string, rawValue string) Document {
	t.Helper()

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]Project{
			"settings-home": {
				ID:   "settings-home",
				Name: "Settings Home",
				TopLevelSectionIDs: []string{
					"backend-section",
				},
				SectionVariantMap: map[string]string{
					"backend-section": "backend-variant",
				},
				Sections: map[string]Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"backend-variant": {
						ID:     "backend-variant",
						ImplID: "backend-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: SectionKind("dict"),
						Payload: RawJSON(`{
							"id":"backend-impl",
							"type":"Dict",
							"topLevelParamId":"backend-root",
							"codeObjVariantMap":{
								"backend-root":"backend-root-variant",
								"setting-refetch":"setting-refetch-variant"
							}
						}`),
					},
				},
				CodeObjs: map[string]CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"setting-refetch": {
						ID:               "setting-refetch",
						Name:             settingName,
						VariantIDs:       []string{"setting-refetch-variant"},
						DefaultVariantID: "setting-refetch-variant",
					},
				},
				CodeObjVariants: map[string]CodeObjectVariant{
					"backend-root-variant": {
						ID:     "backend-root-variant",
						ImplID: "backend-root-impl",
					},
					"setting-refetch-variant": {
						ID:     "setting-refetch-variant",
						ImplID: "setting-refetch-impl",
					},
				},
				CodeObjImpls: map[string]CodeObjectImpl{
					"backend-root-impl": {
						ID:   "backend-root-impl",
						Type: "NestedParam",
						Payload: RawJSON(`{
							"id":"backend-root-impl",
							"type":"NestedParam",
							"children":["setting-refetch"]
						}`),
					},
					"setting-refetch-impl": {
						ID:   "setting-refetch-impl",
						Type: "SwitchParam",
						Payload: RawJSON(`{
							"id":"setting-refetch-impl",
							"type":"SwitchParam",
							"value":"` + rawValue + `"
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize settings backend test document: %v", err)
	}
	return document
}

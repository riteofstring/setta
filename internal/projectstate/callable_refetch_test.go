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

// Skipped auto-refetches should leave runtime history untouched so the source
// no-op branch does not create undo noise in Go either.
func TestRuntimeRefetchCallableParamsSkippedKeepsRevisionAndHistory(t *testing.T) {
	t.Parallel()

	runtime := openCallableTestRuntime(t)
	initialSnapshot := runtime.Snapshot()
	initialHistoryLen := runtimeHistoryLen(t, runtime)
	resolver := &stubCallableSignatureResolver{ok: false}

	snapshot, didUpdate, err := runtime.RefetchCallableParams(
		context.Background(),
		"project-alpha",
		[]string{"callable-section"},
		resolver,
	)
	if err != nil {
		t.Fatalf("runtime refetch callable params: %v", err)
	}
	if didUpdate {
		t.Fatal("expected skipped refetch to report no update")
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected skipped refetch revision %d, got %d", initialSnapshot.Revision, snapshot.Revision)
	}
	if got := runtimeHistoryLen(t, runtime); got != initialHistoryLen {
		t.Fatalf("expected skipped refetch history len %d, got %d", initialHistoryLen, got)
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}
}

// Missing section ids should be ignored instead of mutating project history or
// raising a route-visible error for an otherwise valid project.
func TestRuntimeRefetchCallableParamsIgnoresMissingSection(t *testing.T) {
	t.Parallel()

	runtime := openCallableTestRuntime(t)
	initialSnapshot := runtime.Snapshot()
	initialHistoryLen := runtimeHistoryLen(t, runtime)

	snapshot, didUpdate, err := runtime.RefetchCallableParams(
		context.Background(),
		"project-alpha",
		[]string{"missing-section"},
		nil,
	)
	if err != nil {
		t.Fatalf("runtime refetch callable params missing section: %v", err)
	}
	if didUpdate {
		t.Fatal("expected missing section refetch to report no update")
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected missing section revision %d, got %d", initialSnapshot.Revision, snapshot.Revision)
	}
	if got := runtimeHistoryLen(t, runtime); got != initialHistoryLen {
		t.Fatalf("expected missing section history len %d, got %d", initialHistoryLen, got)
	}
}

// Go rejects malformed callable code-object names during normalization, so the
// blank-name source branch fails closed before runtime auto-refetch can run.
func TestDocumentNormalizedRejectsBlankCallableCodeObjectName(t *testing.T) {
	t.Parallel()

	document := rawCallableTestDocument(t)
	project := document.Projects["project-alpha"]
	callable := project.CodeObjs["callable-1"]
	callable.Name = "   "
	project.CodeObjs["callable-1"] = callable
	document.Projects["project-alpha"] = project

	if _, err := document.Normalized(); !errors.Is(err, ErrCodeObjNameRequired) {
		t.Fatalf("expected blank callable name normalization error, got %v", err)
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

func openCallableTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(callableTestDocument(t))
	if err != nil {
		t.Fatalf("open callable test runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close callable test runtime: %v", err)
		}
	})
	return runtime
}

func callableTestDocument(t *testing.T) Document {
	t.Helper()

	document, err := rawCallableTestDocument(t).Normalized()
	if err != nil {
		t.Fatalf("normalize callable test document: %v", err)
	}
	return document
}

func rawCallableTestDocument(t *testing.T) Document {
	t.Helper()

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": callableTestProject(t),
		},
	}
}

func runtimeHistoryLen(t *testing.T, runtime *Runtime) int {
	t.Helper()

	historyLen := 0
	if _, err := runtime.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			historyLen = len(state.history)
			return snapshotFromState(*state), nil
		},
	}); err != nil {
		t.Fatalf("inspect runtime history len: %v", err)
	}
	return historyLen
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

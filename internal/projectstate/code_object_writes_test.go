package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestDocumentSetSectionCodeObjectValuePersists(t *testing.T) {
	t.Parallel()

	document := testCodeObjectMutationDocument()
	if err := document.SetSectionCodeObjectValue("project-alpha", "params-section", "param-text", "2"); err != nil {
		t.Fatalf("set section code object value: %v", err)
	}

	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("params-section", "param-text")
	if err != nil {
		t.Fatalf("resolve section code object: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "2" {
		t.Fatalf("expected updated value 2, got %q", got)
	}
}

func TestProjectSetSectionCodeObjectValueRejectsPasswordParams(t *testing.T) {
	t.Parallel()

	project := testCodeObjectMutationDocument().Projects["project-alpha"]
	project.CodeObjs["param-password"] = CodeObject{
		ID:               "param-password",
		Name:             "password_param",
		VariantIDs:       []string{"param-password-variant"},
		DefaultVariantID: "param-password-variant",
	}
	project.CodeObjVariants["param-password-variant"] = CodeObjectVariant{
		ID:     "param-password-variant",
		ImplID: "param-password-impl",
	}
	project.CodeObjImpls["param-password-impl"] = CodeObjectImpl{
		ID:      "param-password-impl",
		Type:    "PasswordParam",
		Payload: RawJSON(`{"id":"param-password-impl","type":"PasswordParam","value":"ignored"}`),
	}
	project.SectionImpls["params-impl"] = SectionImpl{
		ID:      "params-impl",
		Kind:    SectionKind("dict"),
		Payload: RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant","param-password":"param-password-variant"},"ignoreTypeErrors":{"callable":false,"params":{}}}`),
	}

	err := project.SetSectionCodeObjectValue("params-section", "param-password", "secret")
	if !errors.Is(err, ErrPasswordParamMutationUnsupported) {
		t.Fatalf("expected ErrPasswordParamMutationUnsupported, got %v", err)
	}
}

// Password direct writes should key runtime secrets by impl id while leaving
// the visible project-state payload blank and marked as secret-backed.
func TestProjectSetSectionCodeObjectValueStoresPasswordSecretByImplID(t *testing.T) {
	t.Parallel()

	project := passwordParamNameAndValueTestProject(t)
	passwordSecrets, err := NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	project.passwordSecrets = passwordSecrets

	if err := project.SetSectionCodeObjectValue("dict-a", "shared-secret", "hunter2"); err != nil {
		t.Fatalf("set password param value: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve shared-secret after password write: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "" {
		t.Fatalf("expected password payload value blank, got %q", got)
	}
	if !payloadBoolField(payload, "hasSecret") {
		t.Fatalf("expected password payload hasSecret true, got %#v", payload)
	}

	secret, err := project.passwordSecrets.Get("shared-secret-impl")
	if err != nil {
		t.Fatalf("read stored password secret by impl id: %v", err)
	}
	if secret != "hunter2" {
		t.Fatalf("expected password secret hunter2 at impl id, got %q", secret)
	}

	secret, err = project.passwordSecrets.Get("shared-secret")
	if err != nil {
		t.Fatalf("read password secret by code object id: %v", err)
	}
	if secret != "" {
		t.Fatalf("expected no password secret at code object id, got %q", secret)
	}
}

// Direct dropzone value writes should preserve only the configured number of
// attachments so hydrated latest-state payloads never exceed maxAttachments.
func TestProjectSetSectionCodeObjectValueTruncatesStatefulDropzoneAttachments(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "DropzoneParam"); err != nil {
		t.Fatalf("change meta control impl to dropzone: %v", err)
	}
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{"maxAttachments": 1}); err != nil {
		t.Fatalf("set dropzone maxAttachments: %v", err)
	}

	input := `{"version":1,"attachments":[{"kind":"text","id":"text:first","name":"Dropped text","text":"first"},{"kind":"text","id":"text:second","name":"Dropped text","text":"second"}]}`
	if err := project.SetSectionCodeObjectValue("meta-section", "meta-param", input); err != nil {
		t.Fatalf("set dropzone value: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve dropzone param: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != `{"attachments":[{"id":"text:first","kind":"text","name":"Dropped text","text":"first"}],"version":1}` {
		t.Fatalf("expected truncated dropzone payload, got %q", got)
	}
}

// Stateless dropzones should discard uploaded payload JSON on direct writes so
// state only reflects the stateless transport contract.
func TestProjectSetSectionCodeObjectValueClearsStatelessDropzoneValue(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "DropzoneParam"); err != nil {
		t.Fatalf("change meta control impl to dropzone: %v", err)
	}
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{"mode": "STATELESS"}); err != nil {
		t.Fatalf("set dropzone mode stateless: %v", err)
	}

	input := `{"version":1,"attachments":[{"kind":"text","id":"text:first","name":"Dropped text","text":"first"}]}`
	if err := project.SetSectionCodeObjectValue("meta-section", "meta-param", input); err != nil {
		t.Fatalf("set stateless dropzone value: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve stateless dropzone param: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "" {
		t.Fatalf("expected stateless dropzone value to clear, got %q", got)
	}
}

// Parsed stateful dropzone payloads with no attachments should collapse to
// blank even when the JSON omits the attachments key entirely.
func TestProjectSetSectionCodeObjectValueClearsParsedStatefulDropzonePayloadWithoutAttachments(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "DropzoneParam"); err != nil {
		t.Fatalf("change meta control impl to dropzone: %v", err)
	}

	if err := project.SetSectionCodeObjectValue("meta-section", "meta-param", `{"version":1}`); err != nil {
		t.Fatalf("set stateful dropzone value without attachments: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve stateful dropzone param: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "" {
		t.Fatalf("expected parsed-empty stateful dropzone payload to clear, got %q", got)
	}
}

func TestProjectSetTypeErrorIgnorePersistsCallableAndParamFlags(t *testing.T) {
	t.Parallel()

	project := testCodeObjectMutationDocument().Projects["project-alpha"]

	if err := project.SetTypeErrorIgnore("params-section", stringPointer("param-text"), true); err != nil {
		t.Fatalf("set type error ignore param: %v", err)
	}
	state, err := project.TypeErrorIgnoreStateForSection("params-section")
	if err != nil {
		t.Fatalf("type error ignore state: %v", err)
	}
	if !state.Params["param-text"] {
		t.Fatalf("expected param-text ignore state, got %#v", state)
	}

	if err := project.SetTypeErrorIgnore("params-section", nil, true); err != nil {
		t.Fatalf("set type error ignore callable: %v", err)
	}
	state, err = project.TypeErrorIgnoreStateForSection("params-section")
	if err != nil {
		t.Fatalf("type error ignore state after callable update: %v", err)
	}
	if !state.Callable {
		t.Fatalf("expected callable ignore state, got %#v", state)
	}

	if err := project.SetTypeErrorIgnore("params-section", stringPointer("param-text"), false); err != nil {
		t.Fatalf("clear type error ignore param: %v", err)
	}
	state, err = project.TypeErrorIgnoreStateForSection("params-section")
	if err != nil {
		t.Fatalf("type error ignore state after clear: %v", err)
	}
	if state.Params["param-text"] {
		t.Fatalf("expected param-text ignore state cleared, got %#v", state)
	}
}

func TestRuntimeSetCodeObjectDisplayNamePersists(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(testCodeObjectMutationDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetCodeObjectDisplayName(context.Background(), "project-alpha", "param-text", "Height"); err != nil {
		t.Fatalf("set code object display name: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if got := project.CodeObjs["param-text"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func testCodeObjectMutationDocument() Document {
	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"params-section": "params-variant",
				},
				Sections: map[string]Section{
					"params-section": {
						ID:               "params-section",
						Name:             "Params",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"params-impl": {
						ID:      "params-impl",
						Kind:    SectionKind("dict"),
						Payload: RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"},"ignoreTypeErrors":{"callable":false,"params":{}}}`),
					},
				},
				CodeObjs: map[string]CodeObject{
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
				},
				CodeObjVariants: map[string]CodeObjectVariant{
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
				},
				CodeObjImpls: map[string]CodeObjectImpl{
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"1"}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func stringPointer(value string) *string {
	return &value
}

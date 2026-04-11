package projectstate

import (
	"errors"
	"testing"
)

// Param-to-param impl changes should preserve the callable-edit metadata that
// controls naming and call-site rendering.
func TestProjectChangeParamImplPreservesParamMetadata(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.setSectionCodeObjectField("callable-section", "callable-param", "coreNameEditable", true); err != nil {
		t.Fatalf("set coreNameEditable: %v", err)
	}
	if err := project.setSectionCodeObjectField("callable-section", "callable-param", "coreNameType", "CODE"); err != nil {
		t.Fatalf("set coreNameType: %v", err)
	}
	if err := project.setSectionCodeObjectField("callable-section", "callable-param", "passingStyle", "KWARGS"); err != nil {
		t.Fatalf("set passingStyle: %v", err)
	}
	if err := project.setSectionCodeObjectField("callable-section", "callable-param", "typeAnnotation", "str"); err != nil {
		t.Fatalf("set typeAnnotation: %v", err)
	}

	if err := project.ChangeParamImpl("callable-section", "callable-param", "DropdownParam"); err != nil {
		t.Fatalf("change callable param impl: %v", err)
	}

	payload, _, _, impl, err := project.ResolveSectionCodeObject("callable-section", "callable-param")
	if err != nil {
		t.Fatalf("resolve callable param after impl change: %v", err)
	}
	if impl.Type != "DropdownParam" {
		t.Fatalf("expected DropdownParam impl, got %q", impl.Type)
	}
	if !payloadBoolField(payload, "coreNameEditable") {
		t.Fatalf("expected coreNameEditable to persist, got %#v", payload)
	}
	if got := payloadStringField(payload, "coreNameType"); got != "CODE" {
		t.Fatalf("expected coreNameType CODE, got %q", got)
	}
	if got := payloadStringField(payload, "passingStyle"); got != "KWARGS" {
		t.Fatalf("expected passingStyle KWARGS, got %q", got)
	}
	if got := payloadRawStringField(payload, "typeAnnotation"); got != "str" {
		t.Fatalf("expected typeAnnotation str, got %q", got)
	}
}

// Switching to numeric controls should convert the previous raw value through
// the new impl's bounds instead of preserving an invalid string literal.
func TestProjectChangeParamImplConvertsValueForNumericControls(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetSectionCodeObjectValue("dict-a", "shared-child", "150"); err != nil {
		t.Fatalf("seed text param value: %v", err)
	}

	if err := project.ChangeParamImpl("dict-a", "shared-child", "SliderParam"); err != nil {
		t.Fatalf("change dict param impl: %v", err)
	}

	payload, _, _, impl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve dict param after impl change: %v", err)
	}
	if impl.Type != "SliderParam" {
		t.Fatalf("expected SliderParam impl, got %q", impl.Type)
	}
	if got := payloadRawStringField(payload, "value"); got != "100" {
		t.Fatalf("expected clamped slider value 100, got %q", got)
	}
}

// Meta controls should be able to switch into control-only impls that are not
// valid for regular callable/dict parameter sections.
func TestProjectChangeParamImplAllowsMetaControlButtonParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "ButtonParam"); err != nil {
		t.Fatalf("change meta control impl: %v", err)
	}

	payload, _, _, impl, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve meta param after impl change: %v", err)
	}
	if impl.Type != "ButtonParam" {
		t.Fatalf("expected ButtonParam impl, got %q", impl.Type)
	}
	if got := payloadStringField(payload, "label"); got != "Trigger" {
		t.Fatalf("expected default button label Trigger, got %q", got)
	}
}

// Regular section params must reject control-only impls instead of silently
// broadening the allowed surface.
func TestProjectChangeParamImplRejectsControlOnlyImplForSectionParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.ChangeParamImpl("dict-a", "shared-child", "ButtonParam")
	if !errors.Is(err, ErrChangeParamImplCodeObjTypeNotAllowed) {
		t.Fatalf("expected ErrChangeParamImplCodeObjTypeNotAllowed, got %v", err)
	}
}

// Password transitions should move the secret into the runtime store, keep the
// project-state value blank, and clear the old secret when switching back out.
func TestProjectChangeParamImplMigratesPasswordSecretsAndSupportsFollowOnWrites(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	secrets := NewMemoryPasswordSecretStore()
	project.passwordSecrets = secrets

	if err := project.SetSectionCodeObjectValue("dict-a", "shared-child", "open-sesame"); err != nil {
		t.Fatalf("seed text param value: %v", err)
	}
	if err := project.ChangeParamImpl("dict-a", "shared-child", "PasswordParam"); err != nil {
		t.Fatalf("change text param to password: %v", err)
	}

	passwordPayload, _, _, passwordImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve password param after impl change: %v", err)
	}
	if passwordImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl, got %q", passwordImpl.Type)
	}
	if got := payloadRawStringField(passwordPayload, "value"); got != "" {
		t.Fatalf("expected password value to stay blank, got %q", got)
	}
	if !payloadBoolField(passwordPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true, got %#v", passwordPayload)
	}
	secret, err := secrets.Get(passwordImpl.ID)
	if err != nil {
		t.Fatalf("read stored password secret after impl change: %v", err)
	}
	if secret != "open-sesame" {
		t.Fatalf("expected migrated secret open-sesame, got %q", secret)
	}

	if err := project.SetSectionCodeObjectValue("dict-a", "shared-child", "hunter2"); err != nil {
		t.Fatalf("write password param value: %v", err)
	}
	secret, err = secrets.Get(passwordImpl.ID)
	if err != nil {
		t.Fatalf("read stored password secret after follow-on write: %v", err)
	}
	if secret != "hunter2" {
		t.Fatalf("expected updated password secret hunter2, got %q", secret)
	}

	if err := project.ChangeParamImpl("dict-a", "shared-child", "TextParam"); err != nil {
		t.Fatalf("change password param back to text: %v", err)
	}

	secret, err = secrets.Get(passwordImpl.ID)
	if err != nil {
		t.Fatalf("read old password secret after switch back: %v", err)
	}
	if secret != "" {
		t.Fatalf("expected old password secret to clear, got %q", secret)
	}

	textPayload, _, _, textImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve text param after switching back: %v", err)
	}
	if textImpl.Type != "TextParam" {
		t.Fatalf("expected TextParam impl, got %q", textImpl.Type)
	}
	if got := payloadRawStringField(textPayload, "value"); got != "" {
		t.Fatalf("expected text value to stay blank after password switch-back, got %q", got)
	}
}

// Switching between distinct password impls should preserve the stored secret,
// clear the old impl store entry, and keep the section payload sanitized.
func TestProjectChangeParamImplTransfersPasswordSecretsBetweenPasswordImpls(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	secrets := NewMemoryPasswordSecretStore()
	project.passwordSecrets = secrets

	if err := project.ChangeParamImpl("dict-a", "shared-child", "PasswordParam"); err != nil {
		t.Fatalf("change text param to password: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("dict-a", "shared-child", "open-sesame"); err != nil {
		t.Fatalf("write initial password value: %v", err)
	}

	passwordPayload, _, _, oldPasswordImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve initial password impl: %v", err)
	}
	if !payloadBoolField(passwordPayload, "hasSecret") {
		t.Fatalf("expected initial password impl to report hasSecret, got %#v", passwordPayload)
	}

	replacementImpl, err := newCodeObjectImplForType("PasswordParam")
	if err != nil {
		t.Fatalf("create replacement password impl: %v", err)
	}
	project.CodeObjImpls[replacementImpl.ID] = replacementImpl

	if err := project.ChangeParamImpl("dict-a", "shared-child", replacementImpl.ID); err != nil {
		t.Fatalf("change password param to replacement impl: %v", err)
	}

	replacementPayload, _, _, resolvedReplacementImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve replacement password impl: %v", err)
	}
	if resolvedReplacementImpl.ID != replacementImpl.ID {
		t.Fatalf("expected replacement impl %q, got %q", replacementImpl.ID, resolvedReplacementImpl.ID)
	}
	if got := payloadRawStringField(replacementPayload, "value"); got != "" {
		t.Fatalf("expected replacement password value to stay blank, got %q", got)
	}
	if !payloadBoolField(replacementPayload, "hasSecret") {
		t.Fatalf("expected replacement password impl to report hasSecret, got %#v", replacementPayload)
	}

	replacementSecret, err := secrets.Get(replacementImpl.ID)
	if err != nil {
		t.Fatalf("read replacement password secret: %v", err)
	}
	if replacementSecret != "open-sesame" {
		t.Fatalf("expected replacement secret open-sesame, got %q", replacementSecret)
	}

	oldSecret, err := secrets.Get(oldPasswordImpl.ID)
	if err != nil {
		t.Fatalf("read old password secret after replacement: %v", err)
	}
	if oldSecret != "" {
		t.Fatalf("expected old password secret to clear, got %q", oldSecret)
	}

	oldImplPayload := codeObjImplPayloadObject(project.CodeObjImpls[oldPasswordImpl.ID])
	if payloadBoolField(oldImplPayload, "hasSecret") {
		t.Fatalf("expected old password impl payload to clear hasSecret, got %#v", oldImplPayload)
	}
}

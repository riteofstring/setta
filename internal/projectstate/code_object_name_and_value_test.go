package projectstate

import (
	"errors"
	"testing"
)

// Combined param edits should persist both the normalized param name and the
// current section value through one project-state owner.
func TestProjectSetParamNameAndValueUpdatesNameAndValue(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetParamNameAndValue("dict-a", "shared-child", "user-id@v2", "42"); err != nil {
		t.Fatalf("set param name and value: %v", err)
	}

	if got := project.CodeObjs["shared-child"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after combined update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "42" {
		t.Fatalf("expected updated param value 42, got %q", got)
	}
}

// Invalid rename validation must fail before any value update so callers do not
// observe partial combined writes.
func TestProjectSetParamNameAndValueDoesNotPartiallyApplyOnInvalidName(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.SetParamNameAndValue("callable-section", "callable-param", "invalid name", "changed")
	if !IsInvalidCodeObjectNameError(err) {
		t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
	}

	if got := project.CodeObjs["callable-param"].Name; got != "callable_param" {
		t.Fatalf("expected callable-param name to remain callable_param, got %q", got)
	}
	payload, _, _, _, resolveErr := project.ResolveSectionCodeObject("callable-section", "callable-param")
	if resolveErr != nil {
		t.Fatalf("resolve callable-param after invalid combined update: %v", resolveErr)
	}
	if got := payloadRawStringField(payload, "value"); got != "seed" {
		t.Fatalf("expected callable-param value to remain seed, got %q", got)
	}
}

// Unsupported value mutations must not rename the code object before the owner
// discovers the value-side constraint.
func TestProjectSetParamNameAndValueDoesNotPartiallyApplyOnUnsupportedValueMutation(t *testing.T) {
	t.Parallel()

	project := passwordParamNameAndValueTestProject(t)
	err := project.SetParamNameAndValue("dict-a", "shared-secret", "secret_key", "updated")
	if !errors.Is(err, ErrPasswordParamMutationUnsupported) {
		t.Fatalf("expected ErrPasswordParamMutationUnsupported, got %v", err)
	}

	if got := project.CodeObjs["shared-secret"].Name; got != "secret_item" {
		t.Fatalf("expected shared-secret name to remain secret_item, got %q", got)
	}
	payload, _, _, _, resolveErr := project.ResolveSectionCodeObject("dict-a", "shared-secret")
	if resolveErr != nil {
		t.Fatalf("resolve shared-secret after unsupported combined update: %v", resolveErr)
	}
	if got := payloadRawStringField(payload, "value"); got != "hidden" {
		t.Fatalf("expected shared-secret value to remain hidden, got %q", got)
	}
}

func passwordParamNameAndValueTestProject(t *testing.T) Project {
	t.Helper()

	project := codeObjectNameTestProject(t)
	project.CodeObjs["shared-secret"] = CodeObject{
		ID:               "shared-secret",
		Name:             "secret_item",
		VariantIDs:       []string{"shared-secret-variant"},
		DefaultVariantID: "shared-secret-variant",
	}
	project.CodeObjVariants["shared-secret-variant"] = CodeObjectVariant{
		ID:     "shared-secret-variant",
		ImplID: "shared-secret-impl",
	}
	project.CodeObjImpls["shared-secret-impl"] = CodeObjectImpl{
		ID:      "shared-secret-impl",
		Type:    "PasswordParam",
		Payload: mustMarshalProjectObject(map[string]any{"id": "shared-secret-impl", "type": "PasswordParam", "value": "hidden"}),
	}
	project.CodeObjImpls["shared-root-impl"] = CodeObjectImpl{
		ID:      "shared-root-impl",
		Type:    "NestedParam",
		Payload: mustMarshalProjectObject(map[string]any{"id": "shared-root-impl", "type": "NestedParam", "children": []string{"shared-child", "shared-other", "shared-secret"}}),
	}
	project.SectionImpls["dict-a-impl"] = SectionImpl{
		ID:      "dict-a-impl",
		Kind:    SectionKind("dict"),
		Payload: mustMarshalProjectObject(map[string]any{"id": "dict-a-impl", "type": "Dict", "topLevelParamId": "shared-root", "codeObjVariantMap": map[string]string{"shared-root": "shared-root-variant", "shared-child": "shared-child-variant", "shared-other": "shared-other-variant", "shared-secret": "shared-secret-variant"}}),
	}
	project.SectionImpls["dict-b-impl"] = SectionImpl{
		ID:      "dict-b-impl",
		Kind:    SectionKind("dict"),
		Payload: mustMarshalProjectObject(map[string]any{"id": "dict-b-impl", "type": "Dict", "topLevelParamId": "shared-root", "codeObjVariantMap": map[string]string{"shared-root": "shared-root-variant", "shared-child": "shared-child-variant", "shared-other": "shared-other-variant", "shared-secret": "shared-secret-variant"}}),
	}
	return project
}

package projectstate

import "testing"

func TestProjectSetCodeObjectFieldForVariantStoresSharedModifier(t *testing.T) {
	t.Parallel()

	project := codeObjectFieldTargetTestProject(t, codeObjectFieldTargetTestOptions{})
	if err := project.setCodeObjectFieldForVariant("code-1", "variant-1", "label", "shared-label"); err != nil {
		t.Fatalf("set code object field: %v", err)
	}

	sharedModifier := rawProjectObject(t, project.CodeObjs["code-1"].SharedModifier)
	if got := payloadStringField(sharedModifier, "label"); got != "shared-label" {
		t.Fatalf("expected shared modifier label, got %#v", sharedModifier["label"])
	}
	implPayload := rawProjectObject(t, project.CodeObjImpls["impl-1"].Payload)
	if got := payloadStringField(implPayload, "label"); got != "base-label" {
		t.Fatalf("expected impl payload label to stay unchanged, got %#v", implPayload["label"])
	}
	variantModifier := rawProjectObject(t, project.CodeObjVariants["variant-1"].Modifier)
	if _, ok := variantModifier["label"]; ok {
		t.Fatalf("expected variant modifier label to stay empty, got %#v", variantModifier["label"])
	}
}

func TestProjectSetCodeObjectFieldForVariantStoresImplPayloadForUnsharedField(t *testing.T) {
	t.Parallel()

	project := codeObjectFieldTargetTestProject(t, codeObjectFieldTargetTestOptions{})
	if err := project.setCodeObjectFieldForVariant("code-1", "variant-1", "value", "impl-value"); err != nil {
		t.Fatalf("set code object field: %v", err)
	}

	sharedModifier := rawProjectObject(t, project.CodeObjs["code-1"].SharedModifier)
	if _, ok := sharedModifier["value"]; ok {
		t.Fatalf("expected shared modifier value to stay empty, got %#v", sharedModifier["value"])
	}
	implPayload := rawProjectObject(t, project.CodeObjImpls["impl-1"].Payload)
	if got := payloadStringField(implPayload, "value"); got != "impl-value" {
		t.Fatalf("expected impl payload value, got %#v", implPayload["value"])
	}
	variantModifier := rawProjectObject(t, project.CodeObjVariants["variant-1"].Modifier)
	if _, ok := variantModifier["value"]; ok {
		t.Fatalf("expected variant modifier value to stay empty, got %#v", variantModifier["value"])
	}

	effectivePayload, err := effectiveCodeObjectPayloadForVariant(project, "code-1", "variant-1")
	if err != nil {
		t.Fatalf("effective code object payload: %v", err)
	}
	if got := payloadStringField(effectivePayload, "value"); got != "impl-value" {
		t.Fatalf("expected effective payload value from impl payload, got %#v", effectivePayload["value"])
	}
}

func TestProjectSetCodeObjectFieldForVariantStoresPresetVariantModifierForUnsharedField(t *testing.T) {
	t.Parallel()

	project := codeObjectFieldTargetTestProject(t, codeObjectFieldTargetTestOptions{
		preset: true,
	})
	if err := project.setCodeObjectFieldForVariant("code-1", "variant-1", "value", "variant-value"); err != nil {
		t.Fatalf("set code object field: %v", err)
	}

	implPayload := rawProjectObject(t, project.CodeObjImpls["impl-1"].Payload)
	if got := payloadStringField(implPayload, "value"); got != "base-value" {
		t.Fatalf("expected preset impl payload value to stay unchanged, got %#v", implPayload["value"])
	}
	variantModifier := rawProjectObject(t, project.CodeObjVariants["variant-1"].Modifier)
	if got := payloadStringField(variantModifier, "value"); got != "variant-value" {
		t.Fatalf("expected preset variant modifier value, got %#v", variantModifier["value"])
	}

	effectivePayload, err := effectiveCodeObjectPayloadForVariant(project, "code-1", "variant-1")
	if err != nil {
		t.Fatalf("effective code object payload: %v", err)
	}
	if got := payloadStringField(effectivePayload, "value"); got != "variant-value" {
		t.Fatalf("expected effective payload value from variant modifier, got %#v", effectivePayload["value"])
	}
}

type codeObjectFieldTargetTestOptions struct {
	preset bool
}

func codeObjectFieldTargetTestProject(t *testing.T, options codeObjectFieldTargetTestOptions) Project {
	t.Helper()

	implPayload := map[string]any{
		"id":    "impl-1",
		"type":  codeParamType,
		"label": "base-label",
		"value": "base-value",
	}
	if options.preset {
		implPayload["isPreset"] = true
	}

	return Project{
		CodeObjs: map[string]CodeObject{
			"code-1": {
				ID:               "code-1",
				Name:             "code_1",
				VariantIDs:       []string{"variant-1"},
				DefaultVariantID: "variant-1",
				SharedModifier:   mustMarshalProjectObject(map[string]any{}),
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"variant-1": {
				ID:       "variant-1",
				ImplID:   "impl-1",
				Modifier: mustMarshalProjectObject(map[string]any{}),
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"impl-1": {
				ID:      "impl-1",
				Type:    codeParamType,
				Payload: mustMarshalProjectObject(implPayload),
			},
		},
	}
}

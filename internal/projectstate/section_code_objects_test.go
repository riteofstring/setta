package projectstate

import "testing"

func TestProjectResolveSectionCodeObjectWorksForNonCallableSection(t *testing.T) {
	t.Parallel()

	project := testSectionCodeObjectProject()

	payload, codeObj, variant, impl, err := project.ResolveSectionCodeObject("params-section", "param-text")
	if err != nil {
		t.Fatalf("resolve section code object: %v", err)
	}
	if codeObj.ID != "param-text" {
		t.Fatalf("expected code object param-text, got %q", codeObj.ID)
	}
	if variant.ID != "param-text-variant" {
		t.Fatalf("expected variant param-text-variant, got %q", variant.ID)
	}
	if impl.Type != "TextParam" {
		t.Fatalf("expected TextParam impl type, got %q", impl.Type)
	}
	if got := payloadRawStringField(payload, "value"); got != "1" {
		t.Fatalf("expected value 1, got %q", got)
	}
}

func TestProjectSetSectionCodeObjectValueUpdatesNonCallableSection(t *testing.T) {
	t.Parallel()

	project := testSectionCodeObjectProject()

	if err := project.SetSectionCodeObjectValue("params-section", "param-text", "2"); err != nil {
		t.Fatalf("set section code object value: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("params-section", "param-text")
	if err != nil {
		t.Fatalf("resolve updated section code object: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "2" {
		t.Fatalf("expected updated value 2, got %q", got)
	}
}

func testSectionCodeObjectProject() Project {
	return Project{
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
				Payload: RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"}}`),
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
	}
}

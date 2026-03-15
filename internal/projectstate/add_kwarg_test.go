package projectstate

import (
	"errors"
	"testing"
)

// Callable sections should append a new editable CodeParam under the active
// callable and return the created code-object id for follow-on mutations.
func TestProjectAddKwargAppendsCallableParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	result, err := project.AddKwarg("callable-section")
	if err != nil {
		t.Fatalf("add kwarg to callable section: %v", err)
	}
	if result.CodeObjID == "" {
		t.Fatal("expected created callable param id")
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", "callable-root")
	if err != nil {
		t.Fatalf("resolve callable root after add_kwarg: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 || children[0] != "callable-param" || children[1] != result.CodeObjID {
		t.Fatalf("unexpected callable children %#v", children)
	}

	createdPayload, createdCodeObj, _, createdImpl, err := project.ResolveSectionCodeObject("callable-section", result.CodeObjID)
	if err != nil {
		t.Fatalf("resolve created callable param: %v", err)
	}
	if createdCodeObj.Name == "" {
		t.Fatal("expected created callable param name")
	}
	if _, err := validateCodeObjectNameForSection(project, "callable-section", result.CodeObjID, createdCodeObj.Name); err != nil {
		t.Fatalf("expected created callable param name to remain valid, got %q with error %v", createdCodeObj.Name, err)
	}
	if createdImpl.Type != codeParamType {
		t.Fatalf("expected created callable param type CodeParam, got %q", createdImpl.Type)
	}
	if !payloadBoolField(createdPayload, "coreNameEditable") {
		t.Fatalf("expected created callable param to be editable, got %#v", createdPayload)
	}
	if got := payloadRawStringField(createdPayload, "value"); got != "" {
		t.Fatalf("expected created callable param value to start empty, got %q", got)
	}
}

// Dict sections sharing a top-level param should receive the new param through
// the shared code-object variant map so every section can address it directly.
func TestProjectAddKwargSharesDictParamAcrossSections(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	result, err := project.AddKwarg("dict-a")
	if err != nil {
		t.Fatalf("add kwarg to shared dict section: %v", err)
	}
	if result.CodeObjID == "" {
		t.Fatal("expected created dict param id")
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared dict root after add_kwarg: %v", err)
	}
	children := payloadStringArrayField(rootPayload, "children")
	if len(children) != 3 || children[2] != result.CodeObjID {
		t.Fatalf("expected new dict child appended to shared root, got %#v", children)
	}

	dictAPayload, dictACodeObj, _, dictAImpl, err := project.ResolveSectionCodeObject("dict-a", result.CodeObjID)
	if err != nil {
		t.Fatalf("resolve created dict param from dict-a: %v", err)
	}
	if dictACodeObj.Name == "" {
		t.Fatal("expected created dict param name")
	}
	if _, err := validateCodeObjectNameForSection(project, "dict-a", result.CodeObjID, dictACodeObj.Name); err != nil {
		t.Fatalf("expected created dict param name to remain valid, got %q with error %v", dictACodeObj.Name, err)
	}
	if dictAImpl.Type != codeParamType {
		t.Fatalf("expected created dict param type CodeParam, got %q", dictAImpl.Type)
	}
	if !payloadBoolField(dictAPayload, "coreNameEditable") {
		t.Fatalf("expected created dict param to be editable, got %#v", dictAPayload)
	}
	if got := payloadRawStringField(dictAPayload, "value"); got != "" {
		t.Fatalf("expected created dict param value to start empty, got %q", got)
	}

	if _, _, _, _, err := project.ResolveSectionCodeObject("dict-b", result.CodeObjID); err != nil {
		t.Fatalf("expected dict-b to reference created shared param, got %v", err)
	}
}

// GlobalVariables shares the same kwargs controls as Dict, so add_kwarg must
// append a new editable child under the global top-level param root.
func TestProjectAddKwargSupportsGlobalVariables(t *testing.T) {
	t.Parallel()

	project, err := edgeIOTestProject().Normalized()
	if err != nil {
		t.Fatalf("normalize global add_kwarg project: %v", err)
	}

	result, err := project.AddKwarg("global-section")
	if err != nil {
		t.Fatalf("add kwarg to global-section: %v", err)
	}
	if result.CodeObjID == "" {
		t.Fatal("expected created global param id")
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("global-section", "global-root")
	if err != nil {
		t.Fatalf("resolve global root after add_kwarg: %v", err)
	}
	children := payloadStringArrayField(rootPayload, "children")
	if len(children) != 2 || children[0] != "global-param" || children[1] != result.CodeObjID {
		t.Fatalf("unexpected global children %#v", children)
	}

	createdPayload, createdCodeObj, _, createdImpl, err := project.ResolveSectionCodeObject("global-section", result.CodeObjID)
	if err != nil {
		t.Fatalf("resolve created global param: %v", err)
	}
	if createdCodeObj.Name == "" {
		t.Fatal("expected created global param name")
	}
	if _, err := validateCodeObjectNameForSection(project, "global-section", result.CodeObjID, createdCodeObj.Name); err != nil {
		t.Fatalf("expected created global param name to remain valid, got %q with error %v", createdCodeObj.Name, err)
	}
	if createdImpl.Type != codeParamType {
		t.Fatalf("expected created global param type CodeParam, got %q", createdImpl.Type)
	}
	if !payloadBoolField(createdPayload, "coreNameEditable") {
		t.Fatalf("expected created global param to be editable, got %#v", createdPayload)
	}
}

// Dict sections without a root should lazily create the NestedParam parent
// before appending the first editable CodeParam child.
func TestProjectAddKwargInitializesMissingDictRoot(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
		},
		Sections: map[string]Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"dict-variant": {
				ID:     "dict-variant",
				ImplID: "dict-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"dict-impl": {
				ID:      "dict-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "dict-impl", "type": "Dict", "codeObjVariantMap": map[string]string{}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize dict-root test project: %v", err)
	}

	result, err := project.AddKwarg("dict-section")
	if err != nil {
		t.Fatalf("add kwarg to dict section without root: %v", err)
	}
	if result.CodeObjID == "" {
		t.Fatal("expected created dict param id")
	}

	section, _, impl, err := project.ResolveSection("dict-section")
	if err != nil {
		t.Fatalf("resolve dict section after add_kwarg: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, section.DefaultVariantID)
	if err != nil {
		t.Fatalf("effective dict payload after add_kwarg: %v", err)
	}
	topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		t.Fatal("expected dict root to be initialized")
	}
	rootPayload, rootCodeObj, _, rootImpl, err := project.ResolveSectionCodeObject("dict-section", topLevelParamID)
	if err != nil {
		t.Fatalf("resolve initialized dict root: %v", err)
	}
	if rootCodeObj.Name != addKwargDictRootName {
		t.Fatalf("expected initialized dict root name %q, got %q", addKwargDictRootName, rootCodeObj.Name)
	}
	if rootImpl.Type != nestedParamCodeObjType {
		t.Fatalf("expected initialized dict root type NestedParam, got %q", rootImpl.Type)
	}
	children := payloadStringArrayField(rootPayload, "children")
	if len(children) != 1 || children[0] != result.CodeObjID {
		t.Fatalf("expected initialized dict root children [%q], got %#v", result.CodeObjID, children)
	}
	if payloadStringField(sectionPayload, "type") == "" && fallbackSectionType(impl) == "" {
		t.Fatalf("expected dict section type to remain available after add_kwarg")
	}
}

// Callable sections without an active callable should fail loudly instead of
// guessing where the new param belongs.
func TestProjectAddKwargRejectsCallableWithoutSelection(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	project.SectionImpls["callable-impl"] = SectionImpl{
		ID:      "callable-impl",
		Kind:    SectionKind("callable"),
		Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "Callable", "callable": nil, "codeObjVariantMap": map[string]string{"callable-root": "callable-root-variant"}}),
	}

	_, err := project.AddKwarg("callable-section")
	if !errors.Is(err, ErrAddKwargCallableUnset) {
		t.Fatalf("expected ErrAddKwargCallableUnset, got %v", err)
	}
}

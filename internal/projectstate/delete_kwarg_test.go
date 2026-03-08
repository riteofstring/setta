package projectstate

import (
	"errors"
	"reflect"
	"testing"
)

// Callable delete_kwarg should remove the last callable child and prune the
// deleted code object even when the removed param is not core-name editable.
func TestProjectDeleteKwargRemovesLastCallableParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)

	result, err := project.DeleteKwarg("callable-section")
	if err != nil {
		t.Fatalf("delete kwarg from callable section: %v", err)
	}
	if result.CodeObjID != "callable-param" {
		t.Fatalf("expected deleted callable codeObjId callable-param, got %q", result.CodeObjID)
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", "callable-root")
	if err != nil {
		t.Fatalf("resolve callable root after delete_kwarg: %v", err)
	}
	if children := payloadStringArrayField(callablePayload, "children"); len(children) != 0 {
		t.Fatalf("expected callable children to be empty, got %#v", children)
	}

	section, variant, _, err := project.ResolveSection("callable-section")
	if err != nil {
		t.Fatalf("resolve callable section after delete_kwarg: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective callable payload after delete_kwarg: %v", err)
	}
	if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")[result.CodeObjID]; ok {
		t.Fatalf("did not expect deleted callable param in codeObjVariantMap, got %#v", payloadStringMapField(sectionPayload, "codeObjVariantMap"))
	}
	if _, ok := project.CodeObjs[result.CodeObjID]; ok {
		t.Fatalf("expected deleted callable param to be pruned, got %#v", project.CodeObjs[result.CodeObjID])
	}
}

// Dict delete_kwarg should remove the shared last child across all sections
// that point at the same top-level param root.
func TestProjectDeleteKwargRemovesLastSharedDictParamAcrossSections(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)

	result, err := project.DeleteKwarg("dict-a")
	if err != nil {
		t.Fatalf("delete kwarg from dict section: %v", err)
	}
	if result.CodeObjID != "shared-other" {
		t.Fatalf("expected deleted dict codeObjId shared-other, got %q", result.CodeObjID)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared root after delete_kwarg: %v", err)
	}
	if children := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(children, []string{"shared-child"}) {
		t.Fatalf("expected shared root children [shared-child], got %#v", children)
	}

	for _, sectionID := range []string{"dict-a", "dict-b"} {
		section, variant, _, err := project.ResolveSection(sectionID)
		if err != nil {
			t.Fatalf("resolve %s after delete_kwarg: %v", sectionID, err)
		}
		sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
		if err != nil {
			t.Fatalf("effective payload %s after delete_kwarg: %v", sectionID, err)
		}
		if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")[result.CodeObjID]; ok {
			t.Fatalf("did not expect deleted dict param in %s codeObjVariantMap, got %#v", sectionID, payloadStringMapField(sectionPayload, "codeObjVariantMap"))
		}
	}
	if _, ok := project.CodeObjs[result.CodeObjID]; ok {
		t.Fatalf("expected deleted dict param to be pruned, got %#v", project.CodeObjs[result.CodeObjID])
	}
}

// GlobalVariables shares the same kwargs controls as Dict, so delete_kwarg
// must remove the last child from the global top-level param root.
func TestProjectDeleteKwargSupportsGlobalVariables(t *testing.T) {
	t.Parallel()

	project, err := edgeIOTestProject().Normalized()
	if err != nil {
		t.Fatalf("normalize global delete_kwarg project: %v", err)
	}

	result, err := project.DeleteKwarg("global-section")
	if err != nil {
		t.Fatalf("delete kwarg from global-section: %v", err)
	}
	if result.CodeObjID != "global-param" {
		t.Fatalf("expected deleted global codeObjId global-param, got %q", result.CodeObjID)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("global-section", "global-root")
	if err != nil {
		t.Fatalf("resolve global root after delete_kwarg: %v", err)
	}
	if children := payloadStringArrayField(rootPayload, "children"); len(children) != 0 {
		t.Fatalf("expected global root children to be empty, got %#v", children)
	}

	section, variant, _, err := project.ResolveSection("global-section")
	if err != nil {
		t.Fatalf("resolve global-section after delete_kwarg: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective global payload after delete_kwarg: %v", err)
	}
	if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")[result.CodeObjID]; ok {
		t.Fatalf("did not expect deleted global param in codeObjVariantMap, got %#v", payloadStringMapField(sectionPayload, "codeObjVariantMap"))
	}
	if _, ok := project.CodeObjs[result.CodeObjID]; ok {
		t.Fatalf("expected deleted global param to be pruned, got %#v", project.CodeObjs[result.CodeObjID])
	}
}

// Convenience deletion should still clear edge-input state and incoming edges
// for the removed last child instead of leaving stale section-local references.
func TestProjectDeleteKwargCleansRemovedEdgeInputState(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	added, err := project.AddKwarg("dict-a")
	if err != nil {
		t.Fatalf("add kwarg before delete_kwarg cleanup test: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "edgeInputParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set edgeInputParams before delete_kwarg: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "pinnedParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set pinnedParams before delete_kwarg: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "selectedParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set selectedParams before delete_kwarg: %v", err)
	}
	if err := project.setCurrentTypeErrorIgnoreState("dict-a", TypeErrorIgnoreState{
		Params: map[string]bool{added.CodeObjID: true},
	}); err != nil {
		t.Fatalf("set ignoreTypeErrors before delete_kwarg: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("dict-a", added.CodeObjID, "connected"); err != nil {
		t.Fatalf("set param value before delete_kwarg: %v", err)
	}
	project.Edges = []Edge{{
		ID:              "edge-1",
		SourceSectionID: "meta-section",
		SourceVariantID: "meta-variant",
		TargetSectionID: "dict-a",
		TargetVariantID: "dict-a-variant",
		TargetPortID:    added.CodeObjID,
	}}

	result, err := project.DeleteKwarg("dict-a")
	if err != nil {
		t.Fatalf("delete kwarg with edge input state: %v", err)
	}
	if result.CodeObjID != added.CodeObjID {
		t.Fatalf("expected deleted codeObjId %q, got %q", added.CodeObjID, result.CodeObjID)
	}

	section, variant, _, err := project.ResolveSection("dict-a")
	if err != nil {
		t.Fatalf("resolve dict-a after delete_kwarg cleanup: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload dict-a after delete_kwarg cleanup: %v", err)
	}
	if got := payloadStringArrayField(sectionPayload, "edgeInputParams"); len(got) != 0 {
		t.Fatalf("expected edgeInputParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(sectionPayload, "pinnedParams"); len(got) != 0 {
		t.Fatalf("expected pinnedParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(sectionPayload, "selectedParams"); len(got) != 0 {
		t.Fatalf("expected selectedParams cleared, got %#v", got)
	}
	ignoreState, err := project.TypeErrorIgnoreStateForSection("dict-a")
	if err != nil {
		t.Fatalf("type error ignore state after delete_kwarg cleanup: %v", err)
	}
	if ignoreState.Params[added.CodeObjID] {
		t.Fatalf("expected ignoreTypeErrors params to drop %q, got %#v", added.CodeObjID, ignoreState.Params)
	}
	if len(project.Edges) != 0 {
		t.Fatalf("expected incoming edge to removed edge-input param to be deleted, got %#v", project.Edges)
	}
}

// Callable sections without an active callable should fail loudly instead of
// guessing a deletion parent.
func TestProjectDeleteKwargRejectsCallableWithoutSelection(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	project.SectionImpls["callable-impl"] = SectionImpl{
		ID:      "callable-impl",
		Kind:    SectionKind("callable"),
		Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "Callable", "callable": nil, "codeObjVariantMap": map[string]string{"callable-root": "callable-root-variant"}}),
	}

	_, err := project.DeleteKwarg("callable-section")
	if !errors.Is(err, ErrDeleteKwargCallableUnset) {
		t.Fatalf("expected ErrDeleteKwargCallableUnset, got %v", err)
	}
}

// Dict sections with no top-level param root have no kwargs to remove, so the
// owner should fail with a clear no-params error instead of mutating anything.
func TestProjectDeleteKwargRejectsDictWithoutParams(t *testing.T) {
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
			"dict-variant": {ID: "dict-variant", ImplID: "dict-impl"},
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
		t.Fatalf("normalize delete_kwarg no-param project: %v", err)
	}

	_, err = project.DeleteKwarg("dict-section")
	if !errors.Is(err, ErrDeleteKwargNoParams) {
		t.Fatalf("expected ErrDeleteKwargNoParams, got %v", err)
	}
}

package projectstate

import (
	"reflect"
	"testing"
)

// Dict param deletion should remove the shared child from the visible
// hierarchy, scrub section-local state, drop active edges, and prune the now
// unreachable code object from every dict section sharing the root.
func TestProjectDeleteSelectedParamsRemovesSharedDictParamAndSectionState(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	added, err := project.AddKwarg("dict-a")
	if err != nil {
		t.Fatalf("add kwarg to dict-a: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "pinnedParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set pinned params: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "selectedParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set selected params: %v", err)
	}
	if err := project.setCurrentTypeErrorIgnoreState("dict-a", TypeErrorIgnoreState{
		Params: map[string]bool{added.CodeObjID: true},
	}); err != nil {
		t.Fatalf("set ignoreTypeErrors params: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "edgeInputParams", []string{added.CodeObjID}); err != nil {
		t.Fatalf("set edgeInputParams: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("dict-a", added.CodeObjID, "connected"); err != nil {
		t.Fatalf("set param value before deletion: %v", err)
	}
	project.Edges = []Edge{{
		ID:              "edge-1",
		SourceSectionID: "meta-section",
		SourceVariantID: "meta-variant",
		TargetSectionID: "dict-a",
		TargetVariantID: "dict-a-variant",
		TargetPortID:    added.CodeObjID,
	}}

	result, err := project.DeleteSelectedParams(DeleteSelectedParamsInput{
		SectionID:    "dict-a",
		ParamInfoIDs: []string{added.CodeObjID, added.CodeObjID},
	})
	if err != nil {
		t.Fatalf("DeleteSelectedParams returned error: %v", err)
	}
	if !reflect.DeepEqual(result.ParamInfoIDs, []string{added.CodeObjID}) {
		t.Fatalf("expected deleted ids [%s], got %#v", added.CodeObjID, result.ParamInfoIDs)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after delete: %v", err)
	}
	if children := payloadStringArrayField(rootPayload, "children"); containsString(children, added.CodeObjID) {
		t.Fatalf("expected shared-root children to drop %q, got %#v", added.CodeObjID, children)
	}

	dictASection, dictAVariant, _, err := project.ResolveSection("dict-a")
	if err != nil {
		t.Fatalf("resolve dict-a after delete: %v", err)
	}
	dictAPayload, err := effectiveSectionPayload(project, dictASection.ID, dictAVariant.ID)
	if err != nil {
		t.Fatalf("effective payload dict-a after delete: %v", err)
	}
	if got := payloadStringArrayField(dictAPayload, "pinnedParams"); len(got) != 0 {
		t.Fatalf("expected pinnedParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(dictAPayload, "selectedParams"); len(got) != 0 {
		t.Fatalf("expected selectedParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(dictAPayload, "edgeInputParams"); len(got) != 0 {
		t.Fatalf("expected edgeInputParams cleared, got %#v", got)
	}
	if _, ok := payloadStringMapField(dictAPayload, "codeObjVariantMap")[added.CodeObjID]; ok {
		t.Fatalf("did not expect deleted param in dict-a codeObjVariantMap, got %#v", payloadStringMapField(dictAPayload, "codeObjVariantMap"))
	}

	dictBSection, dictBVariant, _, err := project.ResolveSection("dict-b")
	if err != nil {
		t.Fatalf("resolve dict-b after delete: %v", err)
	}
	dictBPayload, err := effectiveSectionPayload(project, dictBSection.ID, dictBVariant.ID)
	if err != nil {
		t.Fatalf("effective payload dict-b after delete: %v", err)
	}
	if _, ok := payloadStringMapField(dictBPayload, "codeObjVariantMap")[added.CodeObjID]; ok {
		t.Fatalf("did not expect deleted param in dict-b codeObjVariantMap, got %#v", payloadStringMapField(dictBPayload, "codeObjVariantMap"))
	}

	ignoreState, err := project.TypeErrorIgnoreStateForSection("dict-a")
	if err != nil {
		t.Fatalf("type error ignore state for dict-a: %v", err)
	}
	if ignoreState.Params[added.CodeObjID] {
		t.Fatalf("expected ignoreTypeErrors params to drop %q, got %#v", added.CodeObjID, ignoreState.Params)
	}
	if len(project.Edges) != 0 {
		t.Fatalf("expected edges to removed edge-input param to be deleted, got %#v", project.Edges)
	}
	if _, ok := project.CodeObjs[added.CodeObjID]; ok {
		t.Fatalf("expected deleted param code object to be pruned, got %#v", project.CodeObjs[added.CodeObjID])
	}
}

// Callable param deletion should remove the created child and prune its
// code-object records while leaving existing protected params intact.
func TestProjectDeleteSelectedParamsRemovesCallableParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	added, err := project.AddKwarg("callable-section")
	if err != nil {
		t.Fatalf("add kwarg to callable-section: %v", err)
	}

	result, err := project.DeleteSelectedParams(DeleteSelectedParamsInput{
		SectionID:    "callable-section",
		ParamInfoIDs: []string{added.CodeObjID},
	})
	if err != nil {
		t.Fatalf("DeleteSelectedParams returned error: %v", err)
	}
	if !reflect.DeepEqual(result.ParamInfoIDs, []string{added.CodeObjID}) {
		t.Fatalf("expected deleted ids [%s], got %#v", added.CodeObjID, result.ParamInfoIDs)
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", "callable-root")
	if err != nil {
		t.Fatalf("resolve callable-root after delete: %v", err)
	}
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"callable-param"}) {
		t.Fatalf("expected callable children [callable-param], got %#v", got)
	}

	section, variant, _, err := project.ResolveSection("callable-section")
	if err != nil {
		t.Fatalf("resolve callable-section after delete: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload callable-section after delete: %v", err)
	}
	if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")[added.CodeObjID]; ok {
		t.Fatalf("did not expect deleted callable param in codeObjVariantMap, got %#v", payloadStringMapField(sectionPayload, "codeObjVariantMap"))
	}
	if _, ok := project.CodeObjs[added.CodeObjID]; ok {
		t.Fatalf("expected callable param code object to be pruned, got %#v", project.CodeObjs[added.CodeObjID])
	}
}

// Protected params should be skipped instead of failing the whole mutation.
func TestProjectDeleteSelectedParamsSkipsNonEditableParams(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)

	result, err := project.DeleteSelectedParams(DeleteSelectedParamsInput{
		SectionID:    "callable-section",
		ParamInfoIDs: []string{"callable-param"},
	})
	if err != nil {
		t.Fatalf("DeleteSelectedParams returned error: %v", err)
	}
	if len(result.ParamInfoIDs) != 0 {
		t.Fatalf("expected no deleted ids for non-editable param, got %#v", result.ParamInfoIDs)
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", "callable-root")
	if err != nil {
		t.Fatalf("resolve callable-root after skipped delete: %v", err)
	}
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"callable-param"}) {
		t.Fatalf("expected callable children unchanged, got %#v", got)
	}
	if _, ok := project.CodeObjs["callable-param"]; !ok {
		t.Fatalf("expected non-editable callable-param to remain present")
	}
}

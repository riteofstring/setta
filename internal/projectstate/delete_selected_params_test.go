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
	seedDictParamDeletionState(t, &project, added.CodeObjID)

	result, err := project.DeleteSelectedParams(DeleteSelectedParamsInput{
		SectionID:    "dict-a",
		ParamInfoIDs: []string{added.CodeObjID, added.CodeObjID},
	})
	if err != nil {
		t.Fatalf("DeleteSelectedParams returned error: %v", err)
	}
	assertDeletedParamIDs(t, result, []string{added.CodeObjID})

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after delete: %v", err)
	}
	assertCodeObjectChildrenDropParam(t, rootPayload, "shared-root", added.CodeObjID)
	assertSectionPayloadClearedAfterParamDelete(t, project, "dict-a", added.CodeObjID)
	assertSectionCodeObjVariantMapMissing(t, project, "dict-b", added.CodeObjID)
	assertDictParamDeletionStateCleared(t, project, added.CodeObjID)
}

func seedDictParamDeletionState(t *testing.T, project *Project, paramID string) {
	t.Helper()

	if err := project.setCurrentSectionField("dict-a", "pinnedParams", []string{paramID}); err != nil {
		t.Fatalf("set pinned params: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "selectedParams", []string{paramID}); err != nil {
		t.Fatalf("set selected params: %v", err)
	}
	if err := project.setCurrentTypeErrorIgnoreState("dict-a", TypeErrorIgnoreState{
		Params: map[string]bool{paramID: true},
	}); err != nil {
		t.Fatalf("set ignoreTypeErrors params: %v", err)
	}
	if err := project.setCurrentSectionField("dict-a", "edgeInputParams", []string{paramID}); err != nil {
		t.Fatalf("set edgeInputParams: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("dict-a", paramID, "connected"); err != nil {
		t.Fatalf("set param value before deletion: %v", err)
	}
	project.Edges = []Edge{{
		ID:              "edge-1",
		SourceSectionID: "meta-section",
		SourceVariantID: "meta-variant",
		TargetSectionID: "dict-a",
		TargetVariantID: "dict-a-variant",
		TargetPortID:    paramID,
	}}
}

func assertDeletedParamIDs(t *testing.T, result DeleteSelectedParamsResult, want []string) {
	t.Helper()

	if !reflect.DeepEqual(result.ParamInfoIDs, want) {
		t.Fatalf("expected deleted ids %#v, got %#v", want, result.ParamInfoIDs)
	}
}

func assertCodeObjectChildrenDropParam(t *testing.T, payload map[string]any, codeObjID string, paramID string) {
	t.Helper()

	if children := payloadStringArrayField(payload, "children"); containsString(children, paramID) {
		t.Fatalf("expected %s children to drop %q, got %#v", codeObjID, paramID, children)
	}
}

func assertSectionPayloadClearedAfterParamDelete(t *testing.T, project Project, sectionID string, paramID string) {
	t.Helper()

	payload := effectivePayloadForSection(t, project, sectionID, "after delete")
	for _, field := range []string{"pinnedParams", "selectedParams", "edgeInputParams"} {
		if got := payloadStringArrayField(payload, field); len(got) != 0 {
			t.Fatalf("expected %s cleared for %s, got %#v", field, sectionID, got)
		}
	}
	assertPayloadCodeObjVariantMapMissing(t, payload, sectionID, paramID)
}

func assertSectionCodeObjVariantMapMissing(t *testing.T, project Project, sectionID string, paramID string) {
	t.Helper()

	payload := effectivePayloadForSection(t, project, sectionID, "after delete")
	assertPayloadCodeObjVariantMapMissing(t, payload, sectionID, paramID)
}

func effectivePayloadForSection(t *testing.T, project Project, sectionID string, contextLabel string) map[string]any {
	t.Helper()

	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		t.Fatalf("resolve %s %s: %v", sectionID, contextLabel, err)
	}
	payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload %s %s: %v", sectionID, contextLabel, err)
	}
	return payload
}

func assertPayloadCodeObjVariantMapMissing(t *testing.T, payload map[string]any, sectionID string, paramID string) {
	t.Helper()

	codeObjVariantMap := payloadStringMapField(payload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap[paramID]; ok {
		t.Fatalf("did not expect deleted param in %s codeObjVariantMap, got %#v", sectionID, codeObjVariantMap)
	}
}

func assertDictParamDeletionStateCleared(t *testing.T, project Project, paramID string) {
	t.Helper()

	ignoreState, err := project.TypeErrorIgnoreStateForSection("dict-a")
	if err != nil {
		t.Fatalf("type error ignore state for dict-a: %v", err)
	}
	if ignoreState.Params[paramID] {
		t.Fatalf("expected ignoreTypeErrors params to drop %q, got %#v", paramID, ignoreState.Params)
	}
	if len(project.Edges) != 0 {
		t.Fatalf("expected edges to removed edge-input param to be deleted, got %#v", project.Edges)
	}
	if _, ok := project.CodeObjs[paramID]; ok {
		t.Fatalf("expected deleted param code object to be pruned, got %#v", project.CodeObjs[paramID])
	}
}

// GlobalVariables uses the same caller-backed kwargs controls, so deleting
// selected params must prune the global param and clear section-local state.
func TestProjectDeleteSelectedParamsSupportsGlobalVariables(t *testing.T) {
	t.Parallel()

	project, err := edgeIOTestProject().Normalized()
	if err != nil {
		t.Fatalf("normalize global delete-selected project: %v", err)
	}
	if err := project.setCurrentSectionField("global-section", "pinnedParams", []string{"global-param"}); err != nil {
		t.Fatalf("set global pinned params: %v", err)
	}
	if err := project.setCurrentSectionField("global-section", "selectedParams", []string{"global-param"}); err != nil {
		t.Fatalf("set global selected params: %v", err)
	}
	if err := project.setCurrentSectionField("global-section", "edgeInputParams", []string{"global-param"}); err != nil {
		t.Fatalf("set global edgeInputParams: %v", err)
	}

	result, err := project.DeleteSelectedParams(DeleteSelectedParamsInput{
		SectionID:    "global-section",
		ParamInfoIDs: []string{"global-param"},
	})
	if err != nil {
		t.Fatalf("DeleteSelectedParams global-section returned error: %v", err)
	}
	if !reflect.DeepEqual(result.ParamInfoIDs, []string{"global-param"}) {
		t.Fatalf("expected deleted ids [global-param], got %#v", result.ParamInfoIDs)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("global-section", "global-root")
	if err != nil {
		t.Fatalf("resolve global-root after delete: %v", err)
	}
	if children := payloadStringArrayField(rootPayload, "children"); len(children) != 0 {
		t.Fatalf("expected global-root children to be empty, got %#v", children)
	}

	section, variant, _, err := project.ResolveSection("global-section")
	if err != nil {
		t.Fatalf("resolve global-section after delete: %v", err)
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload global-section after delete: %v", err)
	}
	if got := payloadStringArrayField(sectionPayload, "pinnedParams"); len(got) != 0 {
		t.Fatalf("expected pinnedParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(sectionPayload, "selectedParams"); len(got) != 0 {
		t.Fatalf("expected selectedParams cleared, got %#v", got)
	}
	if got := payloadStringArrayField(sectionPayload, "edgeInputParams"); len(got) != 0 {
		t.Fatalf("expected edgeInputParams cleared, got %#v", got)
	}
	if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")["global-param"]; ok {
		t.Fatalf("did not expect deleted global param in codeObjVariantMap, got %#v", payloadStringMapField(sectionPayload, "codeObjVariantMap"))
	}
	if _, ok := project.CodeObjs["global-param"]; ok {
		t.Fatalf("expected deleted global param code object to be pruned, got %#v", project.CodeObjs["global-param"])
	}
}

// Callable param deletion should remove only the targeted child and prune its
// code-object records while leaving existing protected and editable siblings
// intact.
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
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"callable-param", "editable-kwarg"}) {
		t.Fatalf("expected callable children [callable-param editable-kwarg], got %#v", got)
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

// Protected params should be skipped instead of failing the whole mutation or
// disturbing other existing callable children.
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
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"callable-param", "editable-kwarg"}) {
		t.Fatalf("expected callable children unchanged, got %#v", got)
	}
	if _, ok := project.CodeObjs["callable-param"]; !ok {
		t.Fatalf("expected non-editable callable-param to remain present")
	}
}

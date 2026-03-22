package projectstate

import (
	"reflect"
	"testing"
)

func mustAddKwargCodeObjID(t *testing.T, project *Project, sectionID string) string {
	t.Helper()

	result, err := project.AddKwarg(sectionID)
	if err != nil {
		t.Fatalf("add kwarg to %s: %v", sectionID, err)
	}
	return result.CodeObjID
}

// Reordering within one parent should preserve the selected order while
// rewriting the root children list to the requested insertion index.
func TestProjectMoveParamsReordersWithinParent(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedParamID := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.MoveParams(MoveParamsInput{
		SectionID:   "dict-a",
		ParamIDs:    []string{addedParamID},
		NewParentID: "shared-root",
		NewIndex:    0,
	}); err != nil {
		t.Fatalf("MoveParams returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after reorder: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{addedParamID, "shared-child", "shared-other"}) {
		t.Fatalf("expected reordered dict children, got %#v", got)
	}
}

// Whitespace-only param filters stay persisted as raw strings, but they should
// not block reordering because only nonblank filters disable param moves.
func TestProjectMoveParamsAllowsWhitespaceOnlyParamFilter(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.setCurrentSectionField("dict-a", "paramFilter", "   "); err != nil {
		t.Fatalf("set whitespace paramFilter: %v", err)
	}
	addedParamID := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.MoveParams(MoveParamsInput{
		SectionID:   "dict-a",
		ParamIDs:    []string{addedParamID},
		NewParentID: "shared-root",
		NewIndex:    0,
	}); err != nil {
		t.Fatalf("MoveParams with whitespace-only paramFilter returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after whitespace-filter reorder: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{addedParamID, "shared-child", "shared-other"}) {
		t.Fatalf("expected reordered dict children with whitespace-only paramFilter, got %#v", got)
	}
}

// Moving into an already nested parent should append under that parent without
// flattening it back into the root list.
func TestProjectMoveParamsReparentsIntoExistingNestedParent(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedParamID := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.IndentParams(IndentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{"shared-other"},
	}); err != nil {
		t.Fatalf("seed indent for nested parent: %v", err)
	}

	if err := project.MoveParams(MoveParamsInput{
		SectionID:   "dict-a",
		ParamIDs:    []string{addedParamID},
		NewParentID: "shared-child",
		NewIndex:    1,
	}); err != nil {
		t.Fatalf("MoveParams into existing nested parent returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after reparent: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{"shared-child"}) {
		t.Fatalf("expected reparent to leave only shared-child at root, got %#v", got)
	}

	parentPayload, _, _, parentImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after reparent: %v", err)
	}
	if got := effectiveCodeObjType(parentPayload, parentImpl); got != nestedParamCodeObjType {
		t.Fatalf("expected shared-child to remain NestedParam, got %q", got)
	}
	if got := payloadStringArrayField(parentPayload, "children"); !reflect.DeepEqual(got, []string{"shared-other", addedParamID}) {
		t.Fatalf("expected nested children [shared-other %s], got %#v", addedParamID, got)
	}
}

// Sequential param-group moves should be applied against the progressively
// mutated tree so frontend keyboard move batches stay deterministic.
func TestProjectMoveParamGroupsAppliesMovesSequentially(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedA := mustAddKwargCodeObjID(t, &project, "dict-a")
	addedB := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.MoveParamGroups(MoveParamGroupsInput{
		SectionID: "dict-a",
		Moves: []MoveParamGroupInput{
			{
				ParamIDs:    []string{"shared-child"},
				NewParentID: "shared-root",
				NewIndex:    3,
			},
			{
				ParamIDs:    []string{addedA},
				NewParentID: "shared-root",
				NewIndex:    0,
			},
		},
	}); err != nil {
		t.Fatalf("MoveParamGroups returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after move groups: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{addedA, "shared-other", addedB, "shared-child"}) {
		t.Fatalf("expected sequential move-group order, got %#v", got)
	}
}

// Indenting should convert the previous sibling into a nested parent when
// needed and move the contiguous selected group beneath it.
func TestProjectIndentParamsConvertsPreviousSiblingAndMovesGroup(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedA := mustAddKwargCodeObjID(t, &project, "dict-a")
	addedB := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.IndentParams(IndentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{"shared-other", addedA, addedB},
	}); err != nil {
		t.Fatalf("IndentParams returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after indent: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{"shared-child"}) {
		t.Fatalf("expected indent to collapse selection under shared-child, got %#v", got)
	}

	parentPayload, _, _, parentImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after indent: %v", err)
	}
	if got := effectiveCodeObjType(parentPayload, parentImpl); got != nestedParamCodeObjType {
		t.Fatalf("expected shared-child to convert to NestedParam, got %q", got)
	}
	if got := payloadStringArrayField(parentPayload, "children"); !reflect.DeepEqual(got, []string{"shared-other", addedA, addedB}) {
		t.Fatalf("expected nested children [shared-other %s %s], got %#v", addedA, addedB, got)
	}
}

// Non-contiguous selections should indent as independent groups so keyboard
// batches keep the same grouping semantics as the source helper behavior.
func TestProjectIndentParamsProcessesNonContiguousGroupsIndependently(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedA := mustAddKwargCodeObjID(t, &project, "dict-a")
	addedB := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.IndentParams(IndentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{"shared-other", addedB},
	}); err != nil {
		t.Fatalf("IndentParams non-contiguous groups returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after non-contiguous indent: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{"shared-child", addedA}) {
		t.Fatalf("expected root children [shared-child %s] after non-contiguous indent, got %#v", addedA, got)
	}

	firstParentPayload, _, _, firstParentImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after non-contiguous indent: %v", err)
	}
	if got := effectiveCodeObjType(firstParentPayload, firstParentImpl); got != nestedParamCodeObjType {
		t.Fatalf("expected shared-child to convert to NestedParam, got %q", got)
	}
	if got := payloadStringArrayField(firstParentPayload, "children"); !reflect.DeepEqual(got, []string{"shared-other"}) {
		t.Fatalf("expected shared-child nested children [shared-other], got %#v", got)
	}

	secondParentPayload, _, _, secondParentImpl, err := project.ResolveSectionCodeObject("dict-a", addedA)
	if err != nil {
		t.Fatalf("resolve %s after non-contiguous indent: %v", addedA, err)
	}
	if got := effectiveCodeObjType(secondParentPayload, secondParentImpl); got != nestedParamCodeObjType {
		t.Fatalf("expected %s to convert to NestedParam, got %q", addedA, got)
	}
	if got := payloadStringArrayField(secondParentPayload, "children"); !reflect.DeepEqual(got, []string{addedB}) {
		t.Fatalf("expected %s nested children [%s], got %#v", addedA, addedB, got)
	}
}

// Unindenting the last nested child should promote it after the parent and
// convert the now-empty nested parent back into a CodeParam with "{}".
func TestProjectUnindentParamsRestoresEmptyNestedParentToCodeParam(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedParamID := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.MoveParams(MoveParamsInput{
		SectionID:   "dict-a",
		ParamIDs:    []string{addedParamID},
		NewParentID: "shared-child",
		NewIndex:    0,
	}); err != nil {
		t.Fatalf("seed nested param move: %v", err)
	}

	if err := project.UnindentParams(UnindentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{addedParamID},
	}); err != nil {
		t.Fatalf("UnindentParams returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after unindent: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{"shared-child", addedParamID, "shared-other"}) {
		t.Fatalf("expected unindented child to sit after parent, got %#v", got)
	}

	parentPayload, _, _, parentImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after unindent: %v", err)
	}
	if got := effectiveCodeObjType(parentPayload, parentImpl); got != codeParamType {
		t.Fatalf("expected shared-child to convert back to CodeParam, got %q", got)
	}
	if value := payloadStringField(parentPayload, "value"); value != "{}" {
		t.Fatalf("expected restored CodeParam value {}, got %q", value)
	}
}

// Multi-parent unindent selections should process each parent independently
// while preserving overall root order and restoring emptied parents.
func TestProjectUnindentParamsProcessesMultipleParents(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	addedA := mustAddKwargCodeObjID(t, &project, "dict-a")
	addedB := mustAddKwargCodeObjID(t, &project, "dict-a")

	if err := project.IndentParams(IndentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{"shared-other", addedB},
	}); err != nil {
		t.Fatalf("seed non-contiguous indent before multi-parent unindent: %v", err)
	}

	if err := project.UnindentParams(UnindentParamsInput{
		SectionID: "dict-a",
		ParamIDs:  []string{"shared-other", addedB},
	}); err != nil {
		t.Fatalf("UnindentParams multi-parent selection returned error: %v", err)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root after multi-parent unindent: %v", err)
	}
	if got := payloadStringArrayField(rootPayload, "children"); !reflect.DeepEqual(got, []string{"shared-child", "shared-other", addedA, addedB}) {
		t.Fatalf("expected fully restored root order after multi-parent unindent, got %#v", got)
	}

	firstParentPayload, _, _, firstParentImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after multi-parent unindent: %v", err)
	}
	if got := effectiveCodeObjType(firstParentPayload, firstParentImpl); got != codeParamType {
		t.Fatalf("expected shared-child to convert back to CodeParam, got %q", got)
	}
	if value := payloadStringField(firstParentPayload, "value"); value != "{}" {
		t.Fatalf("expected shared-child value {}, got %q", value)
	}

	secondParentPayload, _, _, secondParentImpl, err := project.ResolveSectionCodeObject("dict-a", addedA)
	if err != nil {
		t.Fatalf("resolve %s after multi-parent unindent: %v", addedA, err)
	}
	if got := effectiveCodeObjType(secondParentPayload, secondParentImpl); got != codeParamType {
		t.Fatalf("expected %s to convert back to CodeParam, got %q", addedA, got)
	}
	if value := payloadStringField(secondParentPayload, "value"); value != "{}" {
		t.Fatalf("expected %s value {}, got %q", addedA, value)
	}
}

// GlobalVariables shares the same dict-like param tree semantics, so moving a
// child under another global param should convert the new parent in-place.
func TestProjectMoveParamsSupportsGlobalVariables(t *testing.T) {
	t.Parallel()

	project, err := edgeIOTestProject().Normalized()
	if err != nil {
		t.Fatalf("normalize global param move project: %v", err)
	}
	addedParamID := mustAddKwargCodeObjID(t, &project, "global-section")

	if err := project.MoveParams(MoveParamsInput{
		SectionID:   "global-section",
		ParamIDs:    []string{addedParamID},
		NewParentID: "global-param",
		NewIndex:    0,
	}); err != nil {
		t.Fatalf("MoveParams global-section returned error: %v", err)
	}

	parentPayload, _, _, parentImpl, err := project.ResolveSectionCodeObject("global-section", "global-param")
	if err != nil {
		t.Fatalf("resolve global-param after move: %v", err)
	}
	if got := effectiveCodeObjType(parentPayload, parentImpl); got != nestedParamCodeObjType {
		t.Fatalf("expected global-param to convert to NestedParam, got %q", got)
	}
	if got := payloadStringArrayField(parentPayload, "children"); !reflect.DeepEqual(got, []string{addedParamID}) {
		t.Fatalf("expected global nested child [%s], got %#v", addedParamID, got)
	}
}

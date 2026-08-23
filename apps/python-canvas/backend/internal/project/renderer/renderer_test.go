package renderer

import (
	"reflect"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestRenderBlankProjectKeepsSettaStateConventionWithoutMath(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-empty", Name: "Untitled Python Canvas", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables:    []aggregate.Callable{},
	}
	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	const wantBody = "class SettaState:\n    def __init__(state):\n        pass"
	const wantCode = "\n\nclass SettaState:\n    def __init__(state):\n        pass\n\nstate = SettaState()"
	if result.Body != wantBody || result.Code != wantCode {
		t.Fatalf("blank render = %#v, want body %q and code %q", result, wantBody, wantCode)
	}
	if strings.Contains(result.Code, "math") || len(result.SourceRangesByTargetID) != 0 || len(result.CallableCallPositionsByID) != 0 {
		t.Fatalf("blank render has demo-derived content: %#v", result)
	}
	if result.PrefixRange != (ByteRange{}) || result.GeneratedBodyRange != (ByteRange{Start: 2, End: 2 + len(wantBody)}) ||
		result.SuffixRange != (ByteRange{Start: 4 + len(wantBody), End: len(wantCode)}) {
		t.Fatalf("blank outer ranges = %#v", result)
	}
}

func TestRenderWholeSnapshotUsesDynamicRangesAndAllPassingStyles(t *testing.T) {
	t.Parallel()

	state := multiCallableState()
	first, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	second, err := Render(state)
	if err != nil {
		t.Fatalf("second Render() error = %v", err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("Render() is not byte-stable:\nfirst: %#v\nsecond: %#v", first, second)
	}
	if first.Code[first.GeneratedBodyRange.Start:first.GeneratedBodyRange.End] != first.Body {
		t.Fatalf("protected body range does not locate body")
	}
	if first.Code[first.PrefixRange.Start:first.PrefixRange.End] != "import fixture" ||
		first.Code[first.SuffixRange.Start:first.SuffixRange.End] != "state = SettaState()" {
		t.Fatalf("outer ranges do not locate authored target")
	}

	wantRanges := map[string]string{
		"parameter-app":     "factor_value",
		"parameter-right":   "right_value",
		"parameter-rest":    "rest_value",
		"parameter-left":    "left_value",
		"parameter-scale":   "scale_value",
		"parameter-flag":    "flag_value",
		"parameter-options": "options_value",
		"callable-first":    "fixture.first",
		"callable-second":   "fixture.second",
	}
	if len(first.SourceRangesByTargetID) != len(wantRanges) {
		t.Fatalf("dynamic source ranges = %#v", first.SourceRangesByTargetID)
	}
	for targetID, want := range wantRanges {
		rangeForTarget, found := first.SourceRangesByTargetID[targetID]
		if !found {
			t.Fatalf("source range for %q missing", targetID)
		}
		if got := first.Code[rangeForTarget.Start:rangeForTarget.End]; got != want {
			t.Fatalf("source range %q = %q, want %q", targetID, got, want)
		}
	}
	if got := assignmentPath(t, first.Code, first.SourceRangesByTargetID["callable-first"]); got != "First_callable" {
		t.Fatalf("readable callable path = %q, want %q", got, "First_callable")
	}
	if _, found := first.SourceRangesByTargetID["parameter-empty-app"]; found {
		t.Fatal("incomplete app-authored row received a generated source range")
	}

	parameterPaths := make(map[string]string)
	for _, targetID := range []string{
		"parameter-app", "parameter-right", "parameter-rest", "parameter-left", "parameter-scale", "parameter-flag", "parameter-options",
	} {
		parameterPaths[targetID] = assignmentPath(t, first.Code, first.SourceRangesByTargetID[targetID])
	}
	callableRange := first.SourceRangesByTargetID["callable-first"]
	position := first.CallableCallPositionsByID["callable-first"]
	call := first.Code[callableRange.Start:position.End]
	wantCall := "fixture.first(\n" +
		"            state." + parameterPaths["parameter-left"] + ",\n" +
		"            state." + parameterPaths["parameter-right"] + ",\n" +
		"            *state." + parameterPaths["parameter-rest"] + ",\n" +
		"            factor=state." + parameterPaths["parameter-app"] + ",\n" +
		"            scale=state." + parameterPaths["parameter-scale"] + ",\n" +
		"            flag=state." + parameterPaths["parameter-flag"] + ",\n" +
		"            **state." + parameterPaths["parameter-options"] + ",\n" +
		"        )"
	if call != wantCall {
		t.Fatalf("rendered all-style call = %q, want %q", call, wantCall)
	}
	assertCallableCallPosition(t, first.Code, callableRange, position, wantCall)
	if first.CallableCallPositionsByID["callable-second"].Offset <= position.End {
		t.Fatalf("second callable position = %#v, want a second dynamic call after first", first.CallableCallPositionsByID)
	}

	orderedAssignments := []string{"parameter-app", "parameter-right", "parameter-rest", "parameter-left", "parameter-scale", "parameter-flag", "parameter-options"}
	previousStart := -1
	for _, targetID := range orderedAssignments {
		start := first.SourceRangesByTargetID[targetID].Start
		if start <= previousStart {
			t.Fatalf("assignment order does not match current parameter order at %q", targetID)
		}
		previousStart = start
	}
}

func TestRenderPathsRemainCollisionSafeWhenNamesSanitizeAlike(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-collision", Name: "Collision", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-a", Name: "same value", AuthoredExpression: "fixture.first", Parameters: []aggregate.Parameter{}},
			{ID: "callable-b", Name: "same-value", AuthoredExpression: "fixture.second", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-a", "callable-b"},
	}
	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	firstPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-a"])
	secondPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-b"])
	if firstPath == secondPath {
		t.Fatalf("collision-safe paths are equal: %q", firstPath)
	}
	if firstPath != "same_value" || secondPath != "same_value_2" {
		t.Fatalf("readable collision-safe paths = %q and %q", firstPath, secondPath)
	}
}

func TestRenderReservesListChildPathsAgainstTopLevelSections(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-list-path-collision", Name: "List path collision", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-top-level", Name: "Things__0", AuthoredExpression: "fixture.top_level", Parameters: []aggregate.Parameter{}},
			{ID: "callable-list-child", Name: "Child", AuthoredExpression: "fixture.child", Parameters: []aggregate.Parameter{}},
		},
		Lists:              []aggregate.List{{ID: "list-things", Name: "Things", ChildSectionIDs: []string{"callable-list-child"}}},
		TopLevelSectionIDs: []string{"callable-top-level", "list-things"},
	}

	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	topLevelPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-top-level"])
	childPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-list-child"])
	listPath := assignmentPath(t, result.Code, result.CompositionRangesByTargetID["list-things"])
	if topLevelPath == childPath || topLevelPath == listPath || childPath == listPath {
		t.Fatalf("top-level, list child, and list paths must be distinct: %q, %q, %q", topLevelPath, childPath, listPath)
	}
	if got := assignmentValue(t, result.Body, topLevelPath); got != "fixture.top_level()" {
		t.Fatalf("top-level state value = %q, want fixture.top_level()", got)
	}
	if got := assignmentValue(t, result.Body, childPath); got != "fixture.child()" {
		t.Fatalf("list child state value = %q, want fixture.child()", got)
	}
	if got := assignmentValue(t, result.Body, listPath); got != "[state."+childPath+"]" {
		t.Fatalf("list state value = %q, want child lookup", got)
	}
}

func TestRenderCallablePathsRemainValidPythonIdentifiers(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-identifiers", Name: "Identifiers", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-keyword", Name: "class", AuthoredExpression: "fixture.first", Parameters: []aggregate.Parameter{}},
			{ID: "callable-number", Name: "123 value", AuthoredExpression: "fixture.second", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-keyword", "callable-number"},
	}
	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if got := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-keyword"]); got != "_class" {
		t.Fatalf("keyword callable path = %q, want %q", got, "_class")
	}
	if got := assignmentPath(t, result.Code, result.SourceRangesByTargetID["callable-number"]); got != "_123_value" {
		t.Fatalf("number-leading callable path = %q, want %q", got, "_123_value")
	}
}

func TestRenderForestUsesPostOrderPathsAndSeparatesCompositionRanges(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-forest", Name: "Forest", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-child", Name: "Child", AuthoredExpression: "fixture.child", Parameters: []aggregate.Parameter{}},
			{ID: "callable-nested", Name: "Nested", AuthoredExpression: "fixture.nested", Parameters: []aggregate.Parameter{}},
		},
		ParameterDictionaries: []aggregate.ParameterDictionary{
			{
				ID: "dictionary-options", Name: "Options", Entries: []aggregate.DictionaryEntry{
					{ID: "entry-radius", Name: "radius", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "missing_radius"}},
					{ID: "entry-options", Name: "options", Parent: &aggregate.DictionaryParent{Children: []aggregate.DictionaryEntry{
						{ID: "entry-scale", Name: "scale", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "2"}},
					}}},
				},
			},
			{
				ID: "dictionary-child", Name: "Child options", Entries: []aggregate.DictionaryEntry{
					{ID: "entry-value", Name: "value", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "3"}},
				},
			},
		},
		Lists: []aggregate.List{
			{ID: "list-outer", Name: "Things", ChildSectionIDs: []string{"callable-child", "dictionary-child", "list-nested"}},
			{ID: "list-nested", Name: "Nested things", ChildSectionIDs: []string{"callable-nested"}},
		},
		TopLevelSectionIDs: []string{"dictionary-options", "list-outer"},
	}

	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	for _, expected := range []string{
		"state.Options__radius = missing_radius",
		"state.Options__options__scale = 2",
		"state.Options__options = {\"scale\": state.Options__options__scale}",
		"state.Options = {\"radius\": state.Options__radius, \"options\": state.Options__options}",
		"state.Things__0 = fixture.child()",
		"state.Things__1__value = 3",
		"state.Things__1 = {\"value\": state.Things__1__value}",
		"state.Things__2__0 = fixture.nested()",
		"state.Things__2 = [state.Things__2__0]",
		"state.Things = [state.Things__0, state.Things__1, state.Things__2]",
	} {
		if !strings.Contains(result.Body, expected) {
			t.Fatalf("rendered body did not include %q:\n%s", expected, result.Body)
		}
	}
	if strings.Index(result.Body, "state.Things__2__0") > strings.Index(result.Body, "state.Things__2 =") ||
		strings.Index(result.Body, "state.Things__2 =") > strings.Index(result.Body, "state.Things =") {
		t.Fatalf("list did not render children before parents:\n%s", result.Body)
	}
	if got := result.Code[result.SourceRangesByTargetID["entry-radius"].Start:result.SourceRangesByTargetID["entry-radius"].End]; got != "missing_radius" {
		t.Fatalf("dictionary leaf source range = %q", got)
	}
	for _, targetID := range []string{"entry-options", "dictionary-options", "dictionary-child", "list-nested", "list-outer"} {
		if _, exists := result.SourceRangesByTargetID[targetID]; exists {
			t.Fatalf("generated composition %q received a field source range", targetID)
		}
		if _, exists := result.CompositionRangesByTargetID[targetID]; !exists {
			t.Fatalf("generated composition range for %q is missing", targetID)
		}
	}
}

func TestRenderReservesNestedDictionaryPathsAgainstSiblings(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-dictionary-path-collision", Name: "Dictionary path collision", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		ParameterDictionaries: []aggregate.ParameterDictionary{
			{
				ID: "dictionary-values", Name: "Values", Entries: []aggregate.DictionaryEntry{
					{ID: "entry-a", Name: "a", Parent: &aggregate.DictionaryParent{Children: []aggregate.DictionaryEntry{
						{ID: "entry-a-b", Name: "b", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "nested_value"}},
					}}},
					{ID: "entry-a-b-sibling", Name: "a__b", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "sibling_value"}},
				},
			},
		},
		TopLevelSectionIDs: []string{"dictionary-values"},
	}

	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	nestedPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["entry-a-b"])
	siblingPath := assignmentPath(t, result.Code, result.SourceRangesByTargetID["entry-a-b-sibling"])
	parentPath := assignmentPath(t, result.Code, result.CompositionRangesByTargetID["entry-a"])
	dictionaryPath := assignmentPath(t, result.Code, result.CompositionRangesByTargetID["dictionary-values"])
	if nestedPath == siblingPath || nestedPath == parentPath || siblingPath == parentPath {
		t.Fatalf("nested dictionary paths must be distinct: %q, %q, %q", nestedPath, siblingPath, parentPath)
	}
	if got := assignmentValue(t, result.Body, nestedPath); got != "nested_value" {
		t.Fatalf("nested state value = %q, want nested_value", got)
	}
	if got := assignmentValue(t, result.Body, siblingPath); got != "sibling_value" {
		t.Fatalf("sibling state value = %q, want sibling_value", got)
	}
	if got := assignmentValue(t, result.Body, parentPath); got != "{\"b\": state."+nestedPath+"}" {
		t.Fatalf("parent dictionary value = %q, want nested lookup", got)
	}
	if got := assignmentValue(t, result.Body, dictionaryPath); got != "{\"a\": state."+parentPath+", \"a__b\": state."+siblingPath+"}" {
		t.Fatalf("dictionary state value = %q, want distinct nested and sibling lookups", got)
	}
}

func multiCallableState() aggregate.State {
	firstType := "int"
	secondType := "tuple[int, ...]"
	thirdType := "float"
	fourthType := "bool"
	fifthType := "dict[str, object]"
	return aggregate.State{
		Project:      aggregate.Project{ID: "project-dynamic", Name: "Dynamic project", Revision: 4},
		PythonTarget: aggregate.PythonTarget{Prefix: "import fixture", Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{
				ID: "callable-first", Name: "First callable", AuthoredExpression: "fixture.first",
				Parameters: []aggregate.Parameter{
					{ID: "parameter-app", Name: "factor", NameEditable: true, PassingStyle: aggregate.PassingStylePositionalOrKeyword, AuthoredExpression: "factor_value"},
					{ID: "parameter-right", Name: "right", PassingStyle: aggregate.PassingStylePositionalOnly, TypeAnnotation: &firstType, ProviderOrdinal: intPointer(1), AuthoredExpression: "right_value"},
					{ID: "parameter-rest", Name: "rest", PassingStyle: aggregate.PassingStyleVariadicPositional, TypeAnnotation: &secondType, ProviderOrdinal: intPointer(2), AuthoredExpression: "rest_value"},
					{ID: "parameter-left", Name: "left", PassingStyle: aggregate.PassingStylePositionalOnly, TypeAnnotation: &firstType, ProviderOrdinal: intPointer(0), AuthoredExpression: "left_value"},
					{ID: "parameter-scale", Name: "scale", PassingStyle: aggregate.PassingStylePositionalOrKeyword, TypeAnnotation: &thirdType, ProviderOrdinal: intPointer(3), AuthoredExpression: "scale_value"},
					{ID: "parameter-flag", Name: "flag", PassingStyle: aggregate.PassingStyleKeywordOnly, TypeAnnotation: &fourthType, ProviderOrdinal: intPointer(4), AuthoredExpression: "flag_value"},
					{ID: "parameter-options", Name: "options", PassingStyle: aggregate.PassingStyleVariadicKeyword, TypeAnnotation: &fifthType, ProviderOrdinal: intPointer(5), AuthoredExpression: "options_value"},
					{ID: "parameter-empty-app", NameEditable: true, PassingStyle: aggregate.PassingStylePositionalOrKeyword, AuthoredExpression: "omitted_value"},
				},
			},
			{ID: "callable-second", Name: "Second callable", AuthoredExpression: "fixture.second", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-first", "callable-second"},
	}
}

func assignmentPath(t *testing.T, code string, valueRange ByteRange) string {
	t.Helper()
	lineStart := strings.LastIndex(code[:valueRange.Start], "\n") + 1
	assignment := code[lineStart:valueRange.Start]
	const prefix = "        state."
	if !strings.HasPrefix(assignment, prefix) || !strings.HasSuffix(assignment, " = ") {
		t.Fatalf("assignment prefix = %q", assignment)
	}
	return strings.TrimSuffix(strings.TrimPrefix(assignment, prefix), " = ")
}

func assignmentValue(t *testing.T, body string, path string) string {
	t.Helper()
	prefix := stateBodyIndent + "state." + path + " = "
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, prefix) {
			return strings.TrimPrefix(line, prefix)
		}
	}
	t.Fatalf("assignment for state.%s is missing from %q", path, body)
	return ""
}

func assertCallableCallPosition(t *testing.T, code string, callableRange ByteRange, position CallPosition, wantCall string) {
	t.Helper()
	callStart := strings.Index(wantCall, "(") + 1
	if position.Offset != callableRange.End+1 || code[position.Offset:position.End] != wantCall[callStart:] {
		t.Fatalf("call position = %#v, want exact signature-help coordinates for %q", position, wantCall)
	}
}

func intPointer(value int) *int {
	return &value
}

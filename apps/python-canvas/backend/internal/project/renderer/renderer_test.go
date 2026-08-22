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
	wantCall := "fixture.first(" +
		"state." + parameterPaths["parameter-left"] + ", " +
		"state." + parameterPaths["parameter-right"] + ", " +
		"*state." + parameterPaths["parameter-rest"] + ", " +
		"factor=state." + parameterPaths["parameter-app"] + ", " +
		"scale=state." + parameterPaths["parameter-scale"] + ", " +
		"flag=state." + parameterPaths["parameter-flag"] + ", " +
		"**state." + parameterPaths["parameter-options"] + ")"
	if call != wantCall {
		t.Fatalf("rendered all-style call = %q, want %q", call, wantCall)
	}
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
	if !strings.Contains(firstPath, "63616c6c61626c652d61") || !strings.Contains(secondPath, "63616c6c61626c652d62") {
		t.Fatalf("paths do not carry stable IDs: %q and %q", firstPath, secondPath)
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

func intPointer(value int) *int {
	return &value
}

package codegen

import (
	"reflect"
	"testing"
)

func TestRenderProducesDeterministicPositionalOnlyModuleAndExactRanges(t *testing.T) {
	t.Parallel()

	input := Input{
		Prefix: "import math",
		Suffix: "state = SettaState()",
		Callable: Callable{
			ID:           "callable:square-root",
			Name:         "Square Root",
			Expression:   "math.sqrt",
			ParameterIDs: []string{"parameter:square-root:1"},
		},
		Parameters: []Parameter{{
			ID:           "parameter:square-root:1",
			Name:         "x",
			PassingStyle: ParameterPassingStylePositionalOnly,
			Expression:   "3",
		}},
	}

	first, err := Render(input)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	second, err := Render(input)
	if err != nil {
		t.Fatalf("second Render() error = %v", err)
	}

	const wantBody = "class SettaState:\n    def __init__(state):\n        state.Square_Root__x = 3\n        state.Square_Root = math.sqrt(state.Square_Root__x)"
	const wantCode = "import math\n\n" + wantBody + "\n\nstate = SettaState()"
	if first.Code != wantCode {
		t.Fatalf("Render().Code = %q, want %q", first.Code, wantCode)
	}
	if first.Body != wantBody {
		t.Fatalf("Render().Body = %q, want %q", first.Body, wantBody)
	}
	wantRanges := []SourceRange{
		{TargetID: "parameter:square-root:1", Start: 87, End: 88},
		{TargetID: "callable:square-root", Start: 117, End: 126},
	}
	if !reflect.DeepEqual(first.SourceRanges, wantRanges) {
		t.Fatalf("Render().SourceRanges = %#v, want %#v", first.SourceRanges, wantRanges)
	}
	if first.CallableCallOffset != 127 {
		t.Fatalf("Render().CallableCallOffset = %d, want 127", first.CallableCallOffset)
	}
	if first.CallableCallEnd != 148 {
		t.Fatalf("Render().CallableCallEnd = %d, want 148", first.CallableCallEnd)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("second Render() = %#v, want byte-identical %#v", second, first)
	}
}

func TestRenderOmitsBlankParameterExpressionUntilItIsAuthored(t *testing.T) {
	t.Parallel()

	result, err := Render(Input{
		Prefix: "import math",
		Suffix: "state = SettaState()",
		Callable: Callable{
			ID:           "callable:square-root",
			Name:         "Square Root",
			Expression:   "math.sqrt",
			ParameterIDs: []string{"parameter:square-root:1"},
		},
		Parameters: []Parameter{{
			ID:           "parameter:square-root:1",
			Name:         "x",
			PassingStyle: ParameterPassingStylePositionalOnly,
			Expression:   "",
		}},
	})
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}

	const wantCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root = math.sqrt()\n\nstate = SettaState()"
	if result.Code != wantCode {
		t.Fatalf("Render().Code = %q, want %q", result.Code, wantCode)
	}
	wantRanges := []SourceRange{{TargetID: "callable:square-root", Start: 84, End: 93}}
	if !reflect.DeepEqual(result.SourceRanges, wantRanges) {
		t.Fatalf("Render().SourceRanges = %#v, want %#v", result.SourceRanges, wantRanges)
	}
	if result.CallableCallOffset != 94 {
		t.Fatalf("Render().CallableCallOffset = %d, want 94", result.CallableCallOffset)
	}
	if result.CallableCallEnd != 95 {
		t.Fatalf("Render().CallableCallEnd = %d, want 95", result.CallableCallEnd)
	}
}

func TestRenderEscapesPythonKeywordsInGeneratedPaths(t *testing.T) {
	t.Parallel()

	result, err := Render(Input{
		Prefix: "import math",
		Suffix: "state = SettaState()",
		Callable: Callable{
			ID:           "callable:keyword",
			Name:         "class",
			Expression:   "math.sqrt",
			ParameterIDs: []string{"parameter:keyword"},
		},
		Parameters: []Parameter{{
			ID:           "parameter:keyword",
			Name:         "class",
			PassingStyle: ParameterPassingStylePositionalOrKeyword,
			Expression:   "3",
		}},
	})
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}

	const wantCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.class___class_ = 3\n        state.class_ = math.sqrt(class_=state.class___class_)\n\nstate = SettaState()"
	if result.Code != wantCode {
		t.Fatalf("Render().Code = %q, want %q", result.Code, wantCode)
	}
}

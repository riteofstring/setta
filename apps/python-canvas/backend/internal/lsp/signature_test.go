package lsp

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestNormalizeSignatureHelpPreservesPositionalOnlyMetadata(t *testing.T) {
	parameterLabel, err := json.Marshal("x: SupportsFloat")
	if err != nil {
		t.Fatalf("marshal parameter label: %v", err)
	}
	signature, err := normalizeSignatureHelp(SignatureHelpResult{Signatures: []SignatureInformation{{
		Label: "sqrt(x: SupportsFloat, /) -> float",
		Parameters: []ParameterInformation{{
			Label: parameterLabel,
		}},
	}}})
	if err != nil {
		t.Fatalf("normalizeSignatureHelp() error = %v", err)
	}
	if len(signature.Parameters) != 1 {
		t.Fatalf("parameters = %#v", signature.Parameters)
	}
	parameter := signature.Parameters[0]
	if parameter.Name != "x" || parameter.TypeAnnotation != "SupportsFloat" ||
		parameter.PassingStyle != codegen.ParameterPassingStylePositionalOnly || parameter.Default != nil {
		t.Fatalf("normalized parameter = %#v", parameter)
	}
}

func TestParameterLabelUTF16OffsetsRespectSupplementaryCharacters(t *testing.T) {
	label := "call(😀x: float)"
	start := 7 // UTF-16: call( is 5 units and 😀 is 2 units.
	end := start + len("x: float")
	raw, err := json.Marshal([]int{start, end})
	if err != nil {
		t.Fatalf("marshal offsets: %v", err)
	}
	if got := parameterLabelText(label, raw); got != "x: float" {
		t.Fatalf("parameterLabelText() = %q, want x: float", got)
	}
}

func TestNormalizeSignatureParametersPreservesEachPassingStyleInOrder(t *testing.T) {
	labels := []string{
		"left: int",
		"scale: float = 1.0",
		"*rest: tuple[int, ...]",
		"flag: bool",
		"**options: dict[str, object]",
	}
	parameters := make([]ParameterInformation, 0, len(labels))
	for _, label := range labels {
		raw, err := json.Marshal(label)
		if err != nil {
			t.Fatalf("marshal label %q: %v", label, err)
		}
		parameters = append(parameters, ParameterInformation{Label: raw})
	}
	normalized, err := normalizeSignatureParameters(SignatureHelpResult{Signatures: []SignatureInformation{{
		Label:      "fixture.call(left: int, /, scale: float = 1.0, *rest: tuple[int, ...], flag: bool, **options: dict[str, object]) -> None",
		Parameters: parameters,
	}}})
	if err != nil {
		t.Fatalf("normalizeSignatureParameters() error = %v", err)
	}
	if got := len(normalized); got != len(labels) {
		t.Fatalf("normalized count = %d, want %d", got, len(labels))
	}
	wantStyles := []aggregate.PassingStyle{
		aggregate.PassingStylePositionalOnly,
		aggregate.PassingStylePositionalOrKeyword,
		aggregate.PassingStyleVariadicPositional,
		aggregate.PassingStyleKeywordOnly,
		aggregate.PassingStyleVariadicKeyword,
	}
	gotStyles := make([]aggregate.PassingStyle, 0, len(normalized))
	gotNames := make([]string, 0, len(normalized))
	for _, parameter := range normalized {
		gotStyles = append(gotStyles, parameter.PassingStyle)
		gotNames = append(gotNames, parameter.Name)
	}
	if !reflect.DeepEqual(gotStyles, wantStyles) {
		t.Fatalf("passing styles = %#v, want %#v", gotStyles, wantStyles)
	}
	if wantNames := []string{"left", "scale", "rest", "flag", "options"}; !reflect.DeepEqual(gotNames, wantNames) {
		t.Fatalf("names = %#v, want %#v", gotNames, wantNames)
	}
	if normalized[1].Default == nil || *normalized[1].Default != "1.0" {
		t.Fatalf("default = %#v, want 1.0", normalized[1].Default)
	}
}

func TestNormalizeSignatureParametersAcceptsZeroParameterCallable(t *testing.T) {
	t.Parallel()

	parameters, err := normalizeSignatureParameters(SignatureHelpResult{Signatures: []SignatureInformation{{
		Label:      "fixture.zero() -> None",
		Parameters: []ParameterInformation{},
	}}})
	if err != nil {
		t.Fatalf("normalizeSignatureParameters() error = %v", err)
	}
	if len(parameters) != 0 {
		t.Fatalf("parameters = %#v, want none", parameters)
	}
}

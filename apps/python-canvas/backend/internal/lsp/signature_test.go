package lsp

import (
	"encoding/json"
	"testing"

	"github.com/setta/python-canvas/backend/internal/codegen"
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

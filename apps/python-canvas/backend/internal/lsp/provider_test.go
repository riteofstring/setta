package lsp

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
)

func TestNormalizeDiagnosticsRejectsMalformedProviderEntries(t *testing.T) {
	for _, diagnostic := range []Diagnostic{
		{
			Range:    Range{Start: Position{Line: 0, Character: 0}, End: Position{Line: 0, Character: 9}},
			Message:  "outside the document",
			Severity: 1,
		},
		{
			Range:    Range{Start: Position{}, End: Position{}},
			Message:  " ",
			Severity: 1,
		},
	} {
		if _, err := normalizeDiagnostics("value", []Diagnostic{diagnostic}); err == nil {
			t.Fatalf("normalizeDiagnostics(%#v) succeeded for malformed provider data", diagnostic)
		}
	}
}

func TestNormalizeCompletionItemsRejectsBlankLabels(t *testing.T) {
	if _, err := normalizeCompletionItems(CompletionResult{Items: []CompletionItem{{Label: " "}}}); err == nil {
		t.Fatal("normalizeCompletionItems() accepted a blank provider label")
	}
}

func TestWaitForExactDiagnosticsReturnsNotReadyFailureAfterCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	provider := &BasedpyrightProvider{}
	_, err := provider.waitForExactDiagnostics(ctx, coordinator.GeneratedDocumentRequest{
		Revision: 1,
	}, newDiagnosticWaiter())
	if !errors.Is(err, ErrDiagnosticsNotReady) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want explicit not-ready failure", err)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want cancellation cause", err)
	}
}

func TestParseSignatureParameterKeepsUnannotatedMetadataNull(t *testing.T) {
	parameter, err := parseSignatureParameter("value", aggregate.PassingStylePositionalOrKeyword)
	if err != nil {
		t.Fatalf("parseSignatureParameter() error = %v", err)
	}
	if parameter.TypeAnnotation != nil {
		t.Fatalf("unannotated parameter type = %#v, want nil", parameter.TypeAnnotation)
	}
}

func TestSignatureParameterStylesRejectMalformedMarkerSequences(t *testing.T) {
	t.Parallel()

	for _, label := range []string{
		"fixture(*rest, /)",
		"fixture(left, /, right, /)",
		"fixture(left, *, *, option)",
		"fixture(left, *, **options)",
		"fixture(*rest, *, option)",
		"fixture(**options, value)",
	} {
		t.Run(label, func(t *testing.T) {
			_, err := signatureParameterStyles(label)
			if !errors.Is(err, ErrMalformedSignature) {
				t.Fatalf("signatureParameterStyles(%q) error = %v, want malformed signature", label, err)
			}
		})
	}
}

func TestSignatureParameterStylesPreserveValidMarkerSequence(t *testing.T) {
	t.Parallel()

	styles, err := signatureParameterStyles("fixture(left, /, scale, *rest, flag, **options)")
	if err != nil {
		t.Fatalf("signatureParameterStyles() error = %v", err)
	}
	want := []aggregate.PassingStyle{
		aggregate.PassingStylePositionalOnly,
		aggregate.PassingStylePositionalOrKeyword,
		aggregate.PassingStyleVariadicPositional,
		aggregate.PassingStyleKeywordOnly,
		aggregate.PassingStyleVariadicKeyword,
	}
	if !reflect.DeepEqual(styles, want) {
		t.Fatalf("styles = %#v, want %#v", styles, want)
	}
}

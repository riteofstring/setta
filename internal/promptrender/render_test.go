package promptrender

import "testing"

func TestRenderJinjaReportsMissingVariables(t *testing.T) {
	t.Parallel()

	result := RenderJinja("Hello {{ name }}", map[string]string{})
	if result.RenderedText != "" {
		t.Fatalf("expected empty rendered text, got %q", result.RenderedText)
	}
	if len(result.MissingVariables) != 1 || result.MissingVariables[0] != "name" {
		t.Fatalf("expected missingVariables [name], got %#v", result.MissingVariables)
	}
	if result.RenderError == nil || *result.RenderError != "Missing variables: name" {
		t.Fatalf("expected Missing variables error, got %#v", result.RenderError)
	}
}

func TestRenderJinjaRendersWithProvidedInputs(t *testing.T) {
	t.Parallel()

	result := RenderJinja("Hello {{ name }}", map[string]string{"name": "Ada"})
	if result.RenderedText != "Hello Ada" {
		t.Fatalf("expected Hello Ada, got %q", result.RenderedText)
	}
	if len(result.MissingVariables) != 0 {
		t.Fatalf("expected no missing variables, got %#v", result.MissingVariables)
	}
	if result.RenderError != nil {
		t.Fatalf("expected nil render error, got %#v", result.RenderError)
	}
}

func TestRenderJinjaAllowsLocalsIntroducedInsideTheTemplate(t *testing.T) {
	t.Parallel()

	result := RenderJinja(`{% set name = "Ada" %}Hello {{ name }}`, map[string]string{})
	if result.RenderedText != "Hello Ada" {
		t.Fatalf("expected Hello Ada, got %q", result.RenderedText)
	}
	if len(result.MissingVariables) != 0 {
		t.Fatalf("expected no missing variables, got %#v", result.MissingVariables)
	}
	if result.RenderError != nil {
		t.Fatalf("expected nil render error, got %#v", result.RenderError)
	}
}

func TestRenderJinjaIgnoresLoopLocalsWhenCollectingMissingVariables(t *testing.T) {
	t.Parallel()

	result := RenderJinja(`{% for item in items %}{{ item }}{% endfor %}`, map[string]string{})
	if len(result.MissingVariables) != 1 || result.MissingVariables[0] != "items" {
		t.Fatalf("expected missingVariables [items], got %#v", result.MissingVariables)
	}
}

func TestRenderJinjaReportsSyntaxErrors(t *testing.T) {
	t.Parallel()

	result := RenderJinja("Hello {{ name ", map[string]string{})
	if result.RenderedText != "" {
		t.Fatalf("expected empty rendered text, got %q", result.RenderedText)
	}
	if len(result.MissingVariables) != 0 {
		t.Fatalf("expected no missing variables on syntax error, got %#v", result.MissingVariables)
	}
	if result.RenderError == nil || *result.RenderError == "" {
		t.Fatal("expected syntax error")
	}
}

func TestRenderJinjaReportsRenderErrors(t *testing.T) {
	t.Parallel()

	result := RenderJinja("Hello {{ name | missing_filter }}", map[string]string{"name": "Ada"})
	if result.RenderedText != "" {
		t.Fatalf("expected empty rendered text, got %q", result.RenderedText)
	}
	if len(result.MissingVariables) != 0 {
		t.Fatalf("expected no missing variables on render error, got %#v", result.MissingVariables)
	}
	if result.RenderError == nil || *result.RenderError == "" {
		t.Fatal("expected render error")
	}
}

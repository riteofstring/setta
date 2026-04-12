package promptrender

import (
	"reflect"
	"sort"
	"testing"

	"github.com/nikolalohinski/gonja/v2/nodes"
	"github.com/nikolalohinski/gonja/v2/tokens"
)

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

func TestRenderJinjaTracksBranchDeclarationsAndMacroArguments(t *testing.T) {
	t.Parallel()

	result := RenderJinja(`
		{% if flag %}
			{% set shared = first %}
		{% else %}
			{% set shared = second %}
		{% endif %}
		{% macro greet(name) %}{{ name }} {{ outer }}{% endmacro %}
		{{ shared }} {{ greet(person) }}
	`, map[string]string{})

	wantMissing := []string{"first", "flag", "outer", "person", "second"}
	if !reflect.DeepEqual(result.MissingVariables, wantMissing) {
		t.Fatalf("expected missingVariables %#v, got %#v", wantMissing, result.MissingVariables)
	}
	if result.RenderError == nil || *result.RenderError != "Missing variables: first, flag, outer, person, second" {
		t.Fatalf("expected combined missing variable error, got %#v", result.RenderError)
	}
}

func TestUndeclaredCollectorVisitsNestedAccessAndOperatorExpressions(t *testing.T) {
	t.Parallel()

	expression := &nodes.Call{
		Func: &nodes.GetAttribute{
			Node:      nameExpression("user"),
			Attribute: "full_name",
		},
		Args: []nodes.Expression{
			&nodes.GetItem{
				Node: nameExpression("items"),
				Arg:  nameExpression("index"),
			},
			&nodes.UnaryExpression{
				Term: nameExpression("delta"),
			},
			&nodes.BinaryExpression{
				Left:  nameExpression("left"),
				Right: nameExpression("right"),
			},
		},
		Kwargs: map[string]nodes.Expression{
			"slice": &nodes.GetSlice{
				Node:  nameExpression("values"),
				Start: nameExpression("start"),
				End:   nameExpression("end"),
			},
		},
	}

	missing := collectMissingExpressionNames(expression)
	want := []string{"delta", "end", "index", "items", "left", "right", "start", "user", "values"}
	if !reflect.DeepEqual(missing, want) {
		t.Fatalf("expected missing %#v, got %#v", want, missing)
	}
}

func TestUndeclaredCollectorVisitsPipelineAndCollectionExpressions(t *testing.T) {
	t.Parallel()

	expression := &nodes.Tuple{
		Val: []nodes.Expression{
			&nodes.FilteredExpression{
				Expression: nameExpression("subject"),
				Filters: []*nodes.FilterCall{
					{
						Name: "replace",
						Args: []nodes.Expression{nameExpression("old")},
						Kwargs: map[string]nodes.Expression{
							"new": nameExpression("replacement"),
						},
					},
				},
			},
			&nodes.TestExpression{
				Expression: nameExpression("candidate"),
				Test: &nodes.TestCall{
					Name: "equalto",
					Args: []nodes.Expression{nameExpression("other")},
					Kwargs: map[string]nodes.Expression{
						"fallback": nameExpression("fallback"),
					},
				},
			},
			&nodes.Dict{
				Pairs: []*nodes.Pair{
					{
						Key:   nameExpression("known"),
						Value: &nodes.List{Val: []nodes.Expression{nameExpression("item")}},
					},
				},
			},
		},
	}

	missing := collectMissingExpressionNames(expression, "known")
	want := []string{"candidate", "fallback", "item", "old", "other", "replacement", "subject"}
	if !reflect.DeepEqual(missing, want) {
		t.Fatalf("expected missing %#v, got %#v", want, missing)
	}
}

func collectMissingExpressionNames(expression nodes.Expression, declared ...string) []string {
	collector := &undeclaredCollector{
		scope:   newScope(nil),
		missing: map[string]struct{}{},
	}
	for _, name := range declared {
		collector.scope.declare(name)
	}

	collector.visitExpression(expression)

	missing := make([]string, 0, len(collector.missing))
	for name := range collector.missing {
		missing = append(missing, name)
	}
	sort.Strings(missing)
	return missing
}

func nameExpression(name string) *nodes.Name {
	return &nodes.Name{Name: &tokens.Token{Val: name}}
}

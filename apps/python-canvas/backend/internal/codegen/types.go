// Package codegen renders the validated semantic Python Canvas records into
// deterministic Python source. It intentionally has no filesystem, process,
// HTTP, or LSP dependencies.
package codegen

import "errors"

var ErrInvalidInput = errors.New("codegen: invalid renderer input")

// ParameterPassingStyle describes the normalized call syntax a parameter
// needs in the generated callable expression.
type ParameterPassingStyle string

const (
	ParameterPassingStylePositionalOnly      ParameterPassingStyle = "positional_only"
	ParameterPassingStylePositionalOrKeyword ParameterPassingStyle = "positional_or_keyword"
)

// Input is the complete validated semantic state needed to render the one
// Callable section supported by the first Python Canvas slice.
type Input struct {
	Prefix     string
	Suffix     string
	Callable   Callable
	Parameters []Parameter
}

// Callable is the semantic callable section record consumed by the renderer.
type Callable struct {
	ID           string
	Name         string
	Expression   string
	ParameterIDs []string
}

// Parameter is the semantic parameter record consumed by the renderer.
type Parameter struct {
	ID           string
	Name         string
	PassingStyle ParameterPassingStyle
	Expression   string
}

// SourceRange is a byte range in Result.Code for a generated semantic value.
type SourceRange struct {
	TargetID string
	Start    int
	End      int
}

// Result is the immutable output of one renderer invocation.
type Result struct {
	Code         string
	Body         string
	SourceRanges []SourceRange
	// CallableCallOffset is the byte offset immediately inside the rendered
	// callable's opening parenthesis, or -1 when no callable is rendered.
	CallableCallOffset int
	// CallableCallEnd is the byte offset immediately after the rendered
	// callable's closing parenthesis, or -1 when no callable is rendered.
	// It stays renderer-owned so the project can recognize provider call issues
	// whose source range names an argument rather than the callable expression.
	CallableCallEnd int
}

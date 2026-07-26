package artifactdoc

import (
	"fmt"
	"strings"
)

// Code is a stable compiler failure code. The dynamic-tool failure path reports
// it verbatim, so a code is part of the contract and is never reworded.
type Code string

const (
	// CodeSourceEmpty means the document carried no statements at all.
	CodeSourceEmpty Code = "source_empty"
	// CodeSourceTooLarge means the source exceeded MaxSourceBytes.
	CodeSourceTooLarge Code = "source_too_large"
	// CodeInvalidUTF8 means the source was not valid UTF-8.
	CodeInvalidUTF8 Code = "invalid_utf8"
	// CodeSyntax means the source did not parse.
	CodeSyntax Code = "syntax_error"
	// CodeUnsupportedSyntax means the source used an OpenUI feature outside
	// Setta's static profile.
	CodeUnsupportedSyntax Code = "unsupported_syntax"
	// CodeMissingRoot means no usable root document assignment was found.
	CodeMissingRoot Code = "missing_root"
	// CodeDuplicateStatement means one statement name was assigned twice.
	CodeDuplicateStatement Code = "duplicate_statement"
	// CodeUnknownReference means a reference named no statement.
	CodeUnknownReference Code = "unknown_reference"
	// CodeCyclicReference means references formed a cycle.
	CodeCyclicReference Code = "cyclic_reference"
	// CodeUnusedStatement means a statement was never reached from root, so its
	// content would silently never render.
	CodeUnusedStatement Code = "unused_statement"
	// CodeUnknownComponent means a component is not registered in the catalog.
	CodeUnknownComponent Code = "unknown_component"
	// CodeArgumentCount means a component call passed more arguments than the
	// catalog declares.
	CodeArgumentCount Code = "argument_count"
	// CodeMissingProperty means a required property had no argument.
	CodeMissingProperty Code = "missing_property"
	// CodeInvalidValue means a value did not match its declared type.
	CodeInvalidValue Code = "invalid_value"
	// CodeRowWidthMismatch means a table row did not match the column count.
	CodeRowWidthMismatch Code = "row_width_mismatch"
	// CodeLimitExceeded means the document exceeded a Go-owned limit.
	CodeLimitExceeded Code = "limit_exceeded"
	// CodeUnsafeValue means a value carried markup, a link protocol, or a path
	// the artifact surface will not render.
	CodeUnsafeValue Code = "unsafe_value"
)

// AllCodes returns every failure code the compiler can report. The dynamic-tool
// failure mapping and the conformance corpus both enumerate from here, so a new
// code cannot be added without deciding how it reaches the model.
func AllCodes() []Code {
	return []Code{
		CodeSourceEmpty,
		CodeSourceTooLarge,
		CodeInvalidUTF8,
		CodeSyntax,
		CodeUnsupportedSyntax,
		CodeMissingRoot,
		CodeDuplicateStatement,
		CodeUnknownReference,
		CodeCyclicReference,
		CodeUnusedStatement,
		CodeUnknownComponent,
		CodeArgumentCount,
		CodeMissingProperty,
		CodeInvalidValue,
		CodeRowWidthMismatch,
		CodeLimitExceeded,
		CodeUnsafeValue,
	}
}

// Position is a 1-based source location in the submitted document.
type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

// Diagnostic is one structured compiler failure.
//
// Message says what is wrong and Correction says what to do about it, because
// the consumer is a model correcting its own output inside the same turn. No
// parser internals, offsets, or stack traces belong in either.
type Diagnostic struct {
	Code       Code          `json:"code"`
	Message    string        `json:"message"`
	Correction string        `json:"correction"`
	Position   Position      `json:"position"`
	Statement  string        `json:"statement"`
	Component  ComponentName `json:"component"`
	Property   string        `json:"property"`
}

// Field is the dotted field path reported alongside the failure. The tool input
// carries the document as source, so every path is rooted there.
func (diagnostic Diagnostic) Field() string {
	parts := []string{"source"}
	if diagnostic.Statement != "" {
		parts = append(parts, diagnostic.Statement)
	}
	if diagnostic.Property != "" {
		parts = append(parts, diagnostic.Property)
	}
	return strings.Join(parts, ".")
}

// Error renders one diagnostic as a single reviewable line.
func (diagnostic Diagnostic) Error() string {
	location := fmt.Sprintf("line %d, column %d", diagnostic.Position.Line, diagnostic.Position.Column)
	if diagnostic.Component != "" {
		location = fmt.Sprintf("%s (%s)", location, diagnostic.Component)
	}
	return fmt.Sprintf("%s: %s at %s. %s", diagnostic.Code, diagnostic.Message, location, diagnostic.Correction)
}

// CompileError carries every diagnostic one compile produced.
type CompileError struct {
	Diagnostics []Diagnostic
}

// Error renders every diagnostic, newest last, in source order.
func (err *CompileError) Error() string {
	lines := make([]string, 0, len(err.Diagnostics))
	for _, diagnostic := range err.Diagnostics {
		lines = append(lines, diagnostic.Error())
	}
	return strings.Join(lines, "\n")
}

// Codes returns the failure codes in report order.
func (err *CompileError) Codes() []Code {
	codes := make([]Code, 0, len(err.Diagnostics))
	for _, diagnostic := range err.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return codes
}

// Has reports whether the compile produced the given code.
func (err *CompileError) Has(code Code) bool {
	for _, diagnostic := range err.Diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}

func singleDiagnosticError(diagnostic Diagnostic) *CompileError {
	return &CompileError{Diagnostics: []Diagnostic{diagnostic}}
}

func newDiagnostic(code Code, position Position, message string, correction string) Diagnostic {
	return Diagnostic{Code: code, Message: message, Correction: correction, Position: position}
}

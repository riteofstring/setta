// Package renderer compiles one validated authored project into its complete
// deterministic Python document and renderer-owned semantic coordinates.
package renderer

import (
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

const (
	generatedCodeSeparator = "\n\n"
	stateClassHeader       = "class SettaState:\n    def __init__(state):\n"
	stateBodyIndent        = "        "
)

// ByteRange is a half-open UTF-8 byte range in a rendered document.
type ByteRange struct {
	Start int
	End   int
}

// CallPosition locates the complete rendered call so a provider can request
// signature help immediately inside its opening parenthesis.
type CallPosition struct {
	Offset int
	End    int
}

// Result is the immutable rendering of one complete authored aggregate.
type Result struct {
	Code string
	Body string

	PrefixRange        ByteRange
	GeneratedBodyRange ByteRange
	SuffixRange        ByteRange

	SourceRangesByTargetID    map[string]ByteRange
	CallableCallPositionsByID map[string]CallPosition
}

// Render accepts one complete validated aggregate and has no filesystem, LSP,
// process, HTTP, or UI dependency.
func Render(state aggregate.State) (Result, error) {
	if err := state.Validate(); err != nil {
		return Result{}, fmt.Errorf("render validated project: %w", err)
	}
	body, ranges, callPositions := renderBody(state)
	bodyStart := len(state.PythonTarget.Prefix) + len(generatedCodeSeparator)
	bodyEnd := bodyStart + len(body)
	suffixStart := bodyEnd + len(generatedCodeSeparator)

	for targetID, sourceRange := range ranges {
		sourceRange.Start += bodyStart
		sourceRange.End += bodyStart
		ranges[targetID] = sourceRange
	}
	for targetID, position := range callPositions {
		position.Offset += bodyStart
		position.End += bodyStart
		callPositions[targetID] = position
	}

	return Result{
		Code:                      state.PythonTarget.Prefix + generatedCodeSeparator + body + generatedCodeSeparator + state.PythonTarget.Suffix,
		Body:                      body,
		PrefixRange:               ByteRange{Start: 0, End: len(state.PythonTarget.Prefix)},
		GeneratedBodyRange:        ByteRange{Start: bodyStart, End: bodyEnd},
		SuffixRange:               ByteRange{Start: suffixStart, End: suffixStart + len(state.PythonTarget.Suffix)},
		SourceRangesByTargetID:    ranges,
		CallableCallPositionsByID: callPositions,
	}, nil
}

func renderBody(state aggregate.State) (string, map[string]ByteRange, map[string]CallPosition) {
	var body strings.Builder
	body.WriteString(stateClassHeader)
	ranges := make(map[string]ByteRange)
	callPositions := make(map[string]CallPosition)
	wroteStatement := false

	for _, callable := range state.Callables {
		if callable.AuthoredExpression == "" {
			continue
		}
		callablePath := generatedPath("callable", callable.Name, callable.ID)
		renderedParameters := make([]renderedParameter, 0, len(callable.Parameters))
		for _, parameter := range callable.Parameters {
			if !isRenderedParameter(parameter) {
				continue
			}
			path := callablePath + "__" + generatedPath("parameter", parameter.Name, parameter.ID)
			renderedParameters = append(renderedParameters, renderedParameter{parameter: parameter, path: path})
			writeStatementPrefix(&body, &wroteStatement)
			body.WriteString("state.")
			body.WriteString(path)
			body.WriteString(" = ")
			start := body.Len()
			body.WriteString(parameter.AuthoredExpression)
			ranges[parameter.ID] = ByteRange{Start: start, End: body.Len()}
		}

		writeStatementPrefix(&body, &wroteStatement)
		body.WriteString("state.")
		body.WriteString(callablePath)
		body.WriteString(" = ")
		callableStart := body.Len()
		body.WriteString(callable.AuthoredExpression)
		body.WriteByte('(')
		callOffset := body.Len()
		body.WriteString(renderCallArguments(renderedParameters))
		body.WriteByte(')')
		ranges[callable.ID] = ByteRange{Start: callableStart, End: callableStart + len(callable.AuthoredExpression)}
		callPositions[callable.ID] = CallPosition{Offset: callOffset, End: body.Len()}
	}

	if !wroteStatement {
		body.WriteString(stateBodyIndent)
		body.WriteString("pass")
	}
	return body.String(), ranges, callPositions
}

func writeStatementPrefix(body *strings.Builder, wroteStatement *bool) {
	if *wroteStatement {
		body.WriteByte('\n')
	}
	*wroteStatement = true
	body.WriteString(stateBodyIndent)
}

type renderedParameter struct {
	parameter aggregate.Parameter
	path      string
}

func isRenderedParameter(parameter aggregate.Parameter) bool {
	if parameter.AuthoredExpression == "" {
		return false
	}
	return !parameter.NameEditable || parameter.Name != ""
}

func renderCallArguments(parameters []renderedParameter) string {
	positionalOnly := make([]renderedParameter, 0, len(parameters))
	variadicPositional := make([]renderedParameter, 0, len(parameters))
	middle := make([]renderedParameter, 0, len(parameters))
	variadicKeyword := make([]renderedParameter, 0, len(parameters))
	for _, parameter := range parameters {
		switch parameter.parameter.PassingStyle {
		case aggregate.PassingStylePositionalOnly:
			positionalOnly = append(positionalOnly, parameter)
		case aggregate.PassingStyleVariadicPositional:
			variadicPositional = append(variadicPositional, parameter)
		case aggregate.PassingStylePositionalOrKeyword, aggregate.PassingStyleKeywordOnly:
			middle = append(middle, parameter)
		case aggregate.PassingStyleVariadicKeyword:
			variadicKeyword = append(variadicKeyword, parameter)
		}
	}
	sort.Slice(positionalOnly, func(left int, right int) bool {
		return *positionalOnly[left].parameter.ProviderOrdinal < *positionalOnly[right].parameter.ProviderOrdinal
	})

	arguments := make([]string, 0, len(parameters))
	for _, parameter := range positionalOnly {
		arguments = append(arguments, "state."+parameter.path)
	}
	for _, parameter := range variadicPositional {
		arguments = append(arguments, "*state."+parameter.path)
	}
	for _, parameter := range middle {
		arguments = append(arguments, parameter.parameter.Name+"=state."+parameter.path)
	}
	for _, parameter := range variadicKeyword {
		arguments = append(arguments, "**state."+parameter.path)
	}
	return strings.Join(arguments, ", ")
}

// generatedPath intentionally includes the stable opaque ID. Two names that
// sanitize alike therefore cannot collide, and a rename can affect a path only
// through this renderer.
func generatedPath(kind string, name string, id string) string {
	return kind + "_" + sanitizedPathName(name) + "_" + hex.EncodeToString([]byte(id))
}

func sanitizedPathName(value string) string {
	var builder strings.Builder
	lastSeparator := false
	for _, character := range strings.TrimSpace(value) {
		if character == '_' || unicode.IsLetter(character) || unicode.IsDigit(character) {
			builder.WriteRune(character)
			lastSeparator = false
			continue
		}
		if !lastSeparator {
			builder.WriteByte('_')
			lastSeparator = true
		}
	}
	if builder.Len() == 0 {
		return "value"
	}
	return builder.String()
}

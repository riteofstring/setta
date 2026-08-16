package codegen

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

type dependencyGraph struct {
	parameters []dependencyNode
	callable   dependencyNode
}

type dependencyNode struct {
	targetID     string
	name         string
	path         string
	expression   string
	passingStyle ParameterPassingStyle
	dependencies []string
}

func buildDependencyGraph(input Input) (dependencyGraph, error) {
	if strings.TrimSpace(input.Prefix) == "" {
		return dependencyGraph{}, invalidInput("prefix must not be empty")
	}
	if strings.TrimSpace(input.Suffix) == "" {
		return dependencyGraph{}, invalidInput("suffix must not be empty")
	}
	if strings.TrimSpace(input.Callable.ID) == "" {
		return dependencyGraph{}, invalidInput("callable ID must not be empty")
	}
	if strings.TrimSpace(input.Callable.Name) == "" {
		return dependencyGraph{}, invalidInput("callable name must not be empty")
	}
	if len(input.Parameters) != len(input.Callable.ParameterIDs) {
		return dependencyGraph{}, invalidInput("callable parameter IDs must match parameters")
	}
	if input.Callable.Expression == "" && len(input.Parameters) != 0 {
		return dependencyGraph{}, invalidInput("an empty callable cannot have parameters")
	}

	sectionPath := sanitizePythonPath(input.Callable.Name)
	parameterNodes := make([]dependencyNode, 0, len(input.Parameters))
	parameterIDs := make([]string, 0, len(input.Parameters))
	seenIDs := make(map[string]struct{}, len(input.Parameters)+1)
	seenIDs[input.Callable.ID] = struct{}{}
	for index, parameter := range input.Parameters {
		if strings.TrimSpace(parameter.ID) == "" {
			return dependencyGraph{}, invalidInput(fmt.Sprintf("parameter %d ID must not be empty", index))
		}
		if parameter.ID != input.Callable.ParameterIDs[index] {
			return dependencyGraph{}, invalidInput(fmt.Sprintf("parameter %d does not match callable order", index))
		}
		if _, exists := seenIDs[parameter.ID]; exists {
			return dependencyGraph{}, invalidInput(fmt.Sprintf("parameter %d ID must be unique", index))
		}
		if strings.TrimSpace(parameter.Name) == "" {
			return dependencyGraph{}, invalidInput(fmt.Sprintf("parameter %d name must not be empty", index))
		}
		if !isSupportedPassingStyle(parameter.PassingStyle) {
			return dependencyGraph{}, invalidInput(fmt.Sprintf("parameter %d passing style is unsupported", index))
		}

		seenIDs[parameter.ID] = struct{}{}
		parameterIDs = append(parameterIDs, parameter.ID)
		parameterName := sanitizePythonPath(parameter.Name)
		parameterNodes = append(parameterNodes, dependencyNode{
			targetID:     parameter.ID,
			name:         parameterName,
			path:         sectionPath + "__" + parameterName,
			expression:   parameter.Expression,
			passingStyle: parameter.PassingStyle,
		})
	}

	return dependencyGraph{
		parameters: parameterNodes,
		callable: dependencyNode{
			targetID:     input.Callable.ID,
			path:         sectionPath,
			expression:   input.Callable.Expression,
			dependencies: parameterIDs,
		},
	}, nil
}

func invalidInput(problem string) error {
	return fmt.Errorf("%w: %s", ErrInvalidInput, problem)
}

func isSupportedPassingStyle(style ParameterPassingStyle) bool {
	switch style {
	case ParameterPassingStylePositionalOnly, ParameterPassingStylePositionalOrKeyword:
		return true
	default:
		return false
	}
}

func sanitizePythonPath(value string) string {
	var builder strings.Builder
	previousSeparator := false
	for _, character := range strings.TrimSpace(value) {
		if character == '_' || unicode.IsLetter(character) || unicode.IsDigit(character) {
			builder.WriteRune(character)
			previousSeparator = false
			continue
		}
		if !previousSeparator {
			builder.WriteByte('_')
			previousSeparator = true
		}
	}

	path := builder.String()
	if path == "" {
		return "value"
	}
	first, _ := utf8.DecodeRuneInString(path)
	if unicode.IsDigit(first) {
		return "_" + path
	}
	return path
}

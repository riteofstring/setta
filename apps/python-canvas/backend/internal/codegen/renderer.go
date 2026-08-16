package codegen

import "strings"

const (
	generatedCodeSeparator = "\n\n"
	stateClassHeader       = "class SettaState:\n    def __init__(state):\n"
	stateBodyIndent        = "        "
)

// Render turns one validated Callable section into a complete Python module.
func Render(input Input) (Result, error) {
	graph, err := buildDependencyGraph(input)
	if err != nil {
		return Result{}, err
	}

	body, ranges := renderBody(graph)
	prefixOffset := len(input.Prefix) + len(generatedCodeSeparator)
	for index := range ranges {
		ranges[index].Start += prefixOffset
		ranges[index].End += prefixOffset
	}

	return Result{
		Code:         input.Prefix + generatedCodeSeparator + body + generatedCodeSeparator + input.Suffix,
		Body:         body,
		SourceRanges: ranges,
	}, nil
}

func renderBody(graph dependencyGraph) (string, []SourceRange) {
	var body strings.Builder
	body.WriteString(stateClassHeader)
	if graph.callable.expression == "" {
		body.WriteString(stateBodyIndent)
		body.WriteString("pass")
		return body.String(), []SourceRange{}
	}

	ranges := make([]SourceRange, 0, len(graph.parameters)+1)
	for _, parameter := range graph.parameters {
		if parameter.expression == "" {
			continue
		}
		body.WriteString(stateBodyIndent)
		body.WriteString("state.")
		body.WriteString(parameter.path)
		body.WriteString(" = ")
		valueStart := body.Len()
		body.WriteString(parameter.expression)
		ranges = append(ranges, SourceRange{
			TargetID: parameter.targetID,
			Start:    valueStart,
			End:      body.Len(),
		})
		body.WriteByte('\n')
	}

	body.WriteString(stateBodyIndent)
	body.WriteString("state.")
	body.WriteString(graph.callable.path)
	body.WriteString(" = ")
	callableStart := body.Len()
	body.WriteString(graph.callable.expression)
	body.WriteByte('(')
	body.WriteString(renderCallArguments(graph.parameters))
	body.WriteByte(')')
	ranges = append(ranges, SourceRange{
		TargetID: graph.callable.targetID,
		Start:    callableStart,
		End:      callableStart + len(graph.callable.expression),
	})

	return body.String(), ranges
}

func renderCallArguments(parameters []dependencyNode) string {
	arguments := make([]string, 0, len(parameters))
	for _, parameter := range parameters {
		if parameter.expression == "" {
			continue
		}
		value := "state." + parameter.path
		if parameter.passingStyle == ParameterPassingStylePositionalOrKeyword {
			value = parameter.name + "=" + value
		}
		arguments = append(arguments, value)
	}
	return strings.Join(arguments, ", ")
}

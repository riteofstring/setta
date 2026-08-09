package codegen

import (
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

func BuildPythonEdgeExpression(project projectstate.Project, edge projectstate.Edge) (string, error) {
	exported, ok, err := project.PythonCodegenExport()
	if err != nil {
		return "", err
	}
	if !ok {
		return "", projectstate.ErrProjectCodegenPythonTargetMissing
	}

	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		return "", err
	}
	sourceNode, ok := graph.Node(PythonSectionDependencyKey(edge.SourceSectionID))
	if !ok {
		return "", fmt.Errorf("%w: section=%q", ErrPythonDependencyNodeNotFound, edge.SourceSectionID)
	}

	sourceSection, err := exported.ResolveSectionWithVariant(edge.SourceSectionID, edge.SourceVariantID)
	if err != nil {
		return "", err
	}
	accessor, ok := pythonEdgeOutputAccessor(sourceSection, edge.SourcePortID)
	if !ok {
		return "", fmt.Errorf(
			"%w: section=%q port=%q",
			projectstate.ErrEdgeSourcePortNotFound,
			edge.SourceSectionID,
			edge.SourcePortID,
		)
	}
	return PythonGeneratedStateInstanceName + "." + sourceNode.Base().FullPathName + accessor, nil
}

func pythonEdgeOutputAccessor(section projectstate.PythonCodegenSection, portID string) (string, bool) {
	rawPorts, ok := section.Payload["edgeOutputPorts"]
	if !ok {
		return "", false
	}
	ports, ok := rawPorts.([]any)
	if !ok {
		return "", false
	}
	trimmedPortID := strings.TrimSpace(portID)
	for _, rawPort := range ports {
		portObject, ok := rawPort.(map[string]any)
		if !ok {
			continue
		}
		id, _ := portObject["id"].(string)
		if strings.TrimSpace(id) != trimmedPortID {
			continue
		}
		accessor, _ := portObject["accessor"].(string)
		return accessor, true
	}
	return "", false
}

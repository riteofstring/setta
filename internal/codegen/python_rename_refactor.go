package codegen

import (
	"errors"
	"fmt"
	"sort"
)

var ErrPythonRenameRefactorGraphRequired = errors.New("codegen: python rename refactor graph is required")

type PythonRenameReferenceChangedValue struct {
	DepKey   PythonDependencyKey
	NewValue string
}

type pythonRenameDetails struct {
	OldName string
	NewName string
}

type pythonStringReplacement struct {
	Position int
	Old      string
	New      string
}

func PlanPythonRenameReferenceChangedValues(
	oldGraph *PythonDependencyGraph,
	newGraph *PythonDependencyGraph,
) ([]PythonRenameReferenceChangedValue, error) {
	if oldGraph == nil || newGraph == nil {
		return nil, ErrPythonRenameRefactorGraphRequired
	}

	renamings := collectPythonRenameDetails(oldGraph, newGraph)
	if len(renamings) == 0 {
		return nil, nil
	}

	changedValues := []PythonRenameReferenceChangedValue{}
	for _, key := range newGraph.NodeOrder {
		changedValue, err := planPythonRenameReferenceChangedValue(key, oldGraph, newGraph, renamings)
		if err != nil {
			return nil, err
		}
		if changedValue == nil {
			continue
		}
		changedValues = append(changedValues, *changedValue)
	}

	return changedValues, nil
}

func collectPythonRenameDetails(
	oldGraph *PythonDependencyGraph,
	newGraph *PythonDependencyGraph,
) map[PythonDependencyKey]pythonRenameDetails {
	renamings := make(map[PythonDependencyKey]pythonRenameDetails)
	for key, oldNode := range oldGraph.Nodes {
		newNode, ok := newGraph.Node(key)
		if !ok || oldNode.Base().FullPathName == newNode.Base().FullPathName {
			continue
		}
		renamings[key] = pythonRenameDetails{
			OldName: oldNode.Base().FullPathName,
			NewName: newNode.Base().FullPathName,
		}
	}
	return renamings
}

func planPythonRenameReferenceChangedValue(
	key PythonDependencyKey,
	oldGraph *PythonDependencyGraph,
	newGraph *PythonDependencyGraph,
	renamings map[PythonDependencyKey]pythonRenameDetails,
) (*PythonRenameReferenceChangedValue, error) {
	literalPayload, refs, ok := pythonRenameLiteralPayloadAndRefs(key, newGraph)
	if !ok {
		return nil, nil
	}

	replacements := collectPythonRenameReplacements(refs, oldGraph, renamings)
	if len(replacements) == 0 {
		return nil, nil
	}

	newValue, err := replacePythonStringAtPositions(literalPayload, replacements)
	if err != nil {
		return nil, fmt.Errorf("plan rename reference changed value for %+v: %w", key, err)
	}

	return &PythonRenameReferenceChangedValue{
		DepKey:   key,
		NewValue: newValue,
	}, nil
}

func pythonRenameLiteralPayloadAndRefs(
	key PythonDependencyKey,
	graph *PythonDependencyGraph,
) (string, map[string][]int, bool) {
	refs := graph.PotentialRefs[key]
	if len(refs) == 0 {
		return "", nil, false
	}

	node, ok := graph.Node(key)
	if !ok {
		return "", nil, false
	}
	literal, ok := node.Base().Value.(LiteralDependencyValue)
	if !ok {
		return "", nil, false
	}

	return literal.Payload, refs, true
}

func collectPythonRenameReplacements(
	refs map[string][]int,
	oldGraph *PythonDependencyGraph,
	renamings map[PythonDependencyKey]pythonRenameDetails,
) []pythonStringReplacement {
	replacements := []pythonStringReplacement{}
	for _, ref := range sortedStringKeys(refs) {
		depKey, ok := oldGraph.FullPathNameToKey[ref]
		if !ok {
			continue
		}
		renameDetails, ok := renamings[depKey]
		if !ok {
			continue
		}
		for _, position := range refs[ref] {
			replacements = append(replacements, pythonStringReplacement{
				Position: position,
				Old:      renameDetails.OldName,
				New:      renameDetails.NewName,
			})
		}
	}
	return replacements
}

func replacePythonStringAtPositions(input string, replacements []pythonStringReplacement) (string, error) {
	if len(replacements) == 0 {
		return input, nil
	}

	sort.Slice(replacements, func(i int, j int) bool {
		if replacements[i].Position != replacements[j].Position {
			return replacements[i].Position > replacements[j].Position
		}
		if replacements[i].Old != replacements[j].Old {
			return replacements[i].Old > replacements[j].Old
		}
		return replacements[i].New > replacements[j].New
	})

	output := []byte(input)
	for _, replacement := range replacements {
		if replacement.Position < 0 || replacement.Position > len(input) {
			return "", fmt.Errorf("replacement position %d is out of bounds", replacement.Position)
		}
		if replacement.Position+len(replacement.Old) > len(output) {
			return "", fmt.Errorf("replacement %q at position %d exceeds input bounds", replacement.Old, replacement.Position)
		}
		if string(output[replacement.Position:replacement.Position+len(replacement.Old)]) != replacement.Old {
			return "", fmt.Errorf(
				"expected %q at position %d, found %q",
				replacement.Old,
				replacement.Position,
				string(output[replacement.Position:replacement.Position+len(replacement.Old)]),
			)
		}

		output = append(
			output[:replacement.Position],
			append([]byte(replacement.New), output[replacement.Position+len(replacement.Old):]...)...,
		)
	}

	return string(output), nil
}

func cloneStringSliceIntMap(input map[string][]int) map[string][]int {
	if input == nil {
		return nil
	}
	cloned := make(map[string][]int, len(input))
	for key, values := range input {
		cloned[key] = append([]int(nil), values...)
	}
	return cloned
}

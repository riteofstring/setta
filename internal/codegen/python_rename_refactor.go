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

	renamings := map[PythonDependencyKey]pythonRenameDetails{}
	for key, oldNode := range oldGraph.Nodes {
		newNode, ok := newGraph.Node(key)
		if !ok {
			continue
		}
		if oldNode.Base().FullPathName == newNode.Base().FullPathName {
			continue
		}
		renamings[key] = pythonRenameDetails{
			OldName: oldNode.Base().FullPathName,
			NewName: newNode.Base().FullPathName,
		}
	}
	if len(renamings) == 0 {
		return nil, nil
	}

	changedValues := []PythonRenameReferenceChangedValue{}
	for _, key := range newGraph.NodeOrder {
		refs := newGraph.PotentialRefs[key]
		if len(refs) == 0 {
			continue
		}

		node, ok := newGraph.Node(key)
		if !ok {
			continue
		}
		literal, ok := node.Base().Value.(LiteralDependencyValue)
		if !ok {
			continue
		}

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
		if len(replacements) == 0 {
			continue
		}

		newValue, err := replacePythonStringAtPositions(literal.Payload, replacements)
		if err != nil {
			return nil, fmt.Errorf("plan rename reference changed value for %+v: %w", key, err)
		}
		changedValues = append(changedValues, PythonRenameReferenceChangedValue{
			DepKey:   key,
			NewValue: newValue,
		})
	}

	return changedValues, nil
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

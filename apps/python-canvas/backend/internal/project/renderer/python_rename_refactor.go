package renderer

import (
	"fmt"
	"sort"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func RewriteStateReferences(
	state aggregate.State,
	oldPaths map[string]string,
	newPaths map[string]string,
) (aggregate.State, error) {
	if err := state.Validate(); err != nil {
		return aggregate.State{}, fmt.Errorf("rewrite references for validated project: %w", err)
	}
	replacements := targetPathReplacements(oldPaths, newPaths)
	if len(replacements) == 0 {
		return state.Clone(), nil
	}

	rewritten := state.Clone()
	for callableIndex := range rewritten.Callables {
		expression, err := rewriteStateReferencesInExpression(rewritten.Callables[callableIndex].AuthoredExpression, replacements)
		if err != nil {
			return aggregate.State{}, fmt.Errorf("rewrite callable %q: %w", rewritten.Callables[callableIndex].ID, err)
		}
		rewritten.Callables[callableIndex].AuthoredExpression = expression
		for parameterIndex := range rewritten.Callables[callableIndex].Parameters {
			parameter := &rewritten.Callables[callableIndex].Parameters[parameterIndex]
			expression, err := rewriteStateReferencesInExpression(parameter.AuthoredExpression, replacements)
			if err != nil {
				return aggregate.State{}, fmt.Errorf("rewrite parameter %q: %w", parameter.ID, err)
			}
			parameter.AuthoredExpression = expression
		}
	}
	for dictionaryIndex := range rewritten.ParameterDictionaries {
		if err := rewriteDictionaryEntryReferences(rewritten.ParameterDictionaries[dictionaryIndex].Entries, replacements); err != nil {
			return aggregate.State{}, fmt.Errorf("rewrite dictionary %q: %w", rewritten.ParameterDictionaries[dictionaryIndex].ID, err)
		}
	}
	return rewritten, nil
}

func targetPathReplacements(oldPaths map[string]string, newPaths map[string]string) map[string]string {
	replacements := make(map[string]string)
	for targetID, oldPath := range oldPaths {
		newPath, survives := newPaths[targetID]
		if !survives || oldPath == newPath {
			continue
		}
		replacements[oldPath] = newPath
	}
	return replacements
}

func rewriteDictionaryEntryReferences(entries []aggregate.DictionaryEntry, replacements map[string]string) error {
	for entryIndex := range entries {
		entry := &entries[entryIndex]
		if entry.Leaf != nil {
			expression, err := rewriteStateReferencesInExpression(entry.Leaf.AuthoredExpression, replacements)
			if err != nil {
				return fmt.Errorf("rewrite dictionary entry %q: %w", entry.ID, err)
			}
			entry.Leaf.AuthoredExpression = expression
			continue
		}
		if err := rewriteDictionaryEntryReferences(entry.Parent.Children, replacements); err != nil {
			return err
		}
	}
	return nil
}

type pythonStateReplacement struct {
	range_ ByteRange
	old    string
	new    string
}

func rewriteStateReferencesInExpression(expression string, replacementsByPath map[string]string) (string, error) {
	if expression == "" || len(replacementsByPath) == 0 {
		return expression, nil
	}
	replacements, err := stateReferenceReplacements(expression, replacementsByPath)
	if err != nil {
		return "", err
	}
	return applyStateReplacements(expression, replacements)
}

func stateReferenceReplacements(expression string, replacementsByPath map[string]string) ([]pythonStateReplacement, error) {
	references, err := findPythonStateReferences(expression)
	if err != nil {
		return nil, err
	}
	replacements := make([]pythonStateReplacement, 0, len(references))
	for _, reference := range references {
		newPath, replace := replacementsByPath[reference.Path]
		if !replace {
			continue
		}
		replacements = append(replacements, pythonStateReplacement{
			range_: reference.Range,
			old:    "state." + reference.Path,
			new:    "state." + newPath,
		})
	}
	return replacements, nil
}

func applyStateReplacements(expression string, replacements []pythonStateReplacement) (string, error) {
	if len(replacements) == 0 {
		return expression, nil
	}
	sort.Slice(replacements, func(left int, right int) bool {
		return replacements[left].range_.Start > replacements[right].range_.Start
	})

	output := []byte(expression)
	lastStart := len(expression) + 1
	for _, replacement := range replacements {
		if err := validateStateReplacement(expression, output, lastStart, replacement); err != nil {
			return "", err
		}
		output = append(
			output[:replacement.range_.Start],
			append([]byte(replacement.new), output[replacement.range_.End:]...)...,
		)
		lastStart = replacement.range_.Start
	}
	return string(output), nil
}

func validateStateReplacement(expression string, output []byte, lastStart int, replacement pythonStateReplacement) error {
	if replacement.range_.Start < 0 || replacement.range_.End < replacement.range_.Start || replacement.range_.End > len(expression) {
		return fmt.Errorf("replacement range %#v is out of bounds", replacement.range_)
	}
	if replacement.range_.End > lastStart {
		return fmt.Errorf("replacement ranges overlap at %#v", replacement.range_)
	}
	if string(output[replacement.range_.Start:replacement.range_.End]) != replacement.old {
		return fmt.Errorf("expected %q at %#v", replacement.old, replacement.range_)
	}
	return nil
}

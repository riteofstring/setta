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
	replacements := targetPathReplacements(oldPaths, newPaths)
	sectionIDs := make([]string, 0, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists))
	for _, callable := range state.Callables {
		sectionIDs = append(sectionIDs, callable.ID)
	}
	for _, dictionary := range state.ParameterDictionaries {
		sectionIDs = append(sectionIDs, dictionary.ID)
	}
	for _, list := range state.Lists {
		sectionIDs = append(sectionIDs, list.ID)
	}
	return RewriteSectionReferences(state, sectionIDs, replacements)
}

func RewriteSectionReferences(
	state aggregate.State,
	sectionIDs []string,
	replacements map[string]string,
) (aggregate.State, error) {
	if err := state.Validate(); err != nil {
		return aggregate.State{}, fmt.Errorf("rewrite references for validated project: %w", err)
	}
	selected, err := selectedSectionIDs(state, sectionIDs)
	if err != nil {
		return aggregate.State{}, err
	}
	if len(replacements) == 0 || len(selected) == 0 {
		return state.Clone(), nil
	}

	rewritten := state.Clone()
	if err := rewriteSelectedCallableReferences(&rewritten, selected, replacements); err != nil {
		return aggregate.State{}, err
	}
	if err := rewriteSelectedDictionaryReferences(&rewritten, selected, replacements); err != nil {
		return aggregate.State{}, err
	}
	return rewritten, nil
}

func rewriteSelectedCallableReferences(
	state *aggregate.State,
	selected map[string]struct{},
	replacements map[string]string,
) error {
	for callableIndex := range state.Callables {
		callable := &state.Callables[callableIndex]
		if _, rewrite := selected[callable.ID]; !rewrite {
			continue
		}
		expression, err := rewriteStateReferencesInExpression(callable.AuthoredExpression, replacements)
		if err != nil {
			return fmt.Errorf("rewrite callable %q: %w", callable.ID, err)
		}
		callable.AuthoredExpression = expression
		if err := rewriteCallableParameterReferences(callable.Parameters, replacements); err != nil {
			return err
		}
	}
	return nil
}

func rewriteCallableParameterReferences(parameters []aggregate.Parameter, replacements map[string]string) error {
	for parameterIndex := range parameters {
		parameter := &parameters[parameterIndex]
		expression, err := rewriteStateReferencesInExpression(parameter.AuthoredExpression, replacements)
		if err != nil {
			return fmt.Errorf("rewrite parameter %q: %w", parameter.ID, err)
		}
		parameter.AuthoredExpression = expression
	}
	return nil
}

func rewriteSelectedDictionaryReferences(
	state *aggregate.State,
	selected map[string]struct{},
	replacements map[string]string,
) error {
	for dictionaryIndex := range state.ParameterDictionaries {
		dictionary := &state.ParameterDictionaries[dictionaryIndex]
		if _, rewrite := selected[dictionary.ID]; !rewrite {
			continue
		}
		if err := rewriteDictionaryEntryReferences(dictionary.Entries, replacements); err != nil {
			return fmt.Errorf("rewrite dictionary %q: %w", dictionary.ID, err)
		}
	}
	return nil
}

func selectedSectionIDs(state aggregate.State, sectionIDs []string) (map[string]struct{}, error) {
	known := make(map[string]struct{}, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists))
	for _, callable := range state.Callables {
		known[callable.ID] = struct{}{}
	}
	for _, dictionary := range state.ParameterDictionaries {
		known[dictionary.ID] = struct{}{}
	}
	for _, list := range state.Lists {
		known[list.ID] = struct{}{}
	}
	selected := make(map[string]struct{}, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		if _, exists := known[sectionID]; !exists {
			return nil, fmt.Errorf("rewrite references for unknown section %q", sectionID)
		}
		selected[sectionID] = struct{}{}
	}
	return selected, nil
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

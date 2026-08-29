package aggregate

import (
	"fmt"
	"sort"
)

type sectionKind string

const (
	sectionKindCallable            sectionKind = "callable"
	sectionKindParameterDictionary sectionKind = "parameter dictionary"
	sectionKindList                sectionKind = "list"
)

func validateParameterDictionariesAndForest(state State, claimedIDs map[string]struct{}) error {
	if len(state.ParameterDictionaries) > maxParameterDictionaries {
		return validationError("project has too many parameter dictionaries")
	}
	if len(state.Lists) > maxLists {
		return validationError("project has too many lists")
	}
	sections := make(map[string]sectionKind, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists))
	for _, callable := range state.Callables {
		sections[callable.ID] = sectionKindCallable
	}
	for dictionaryIndex, dictionary := range state.ParameterDictionaries {
		if err := validateParameterDictionary(dictionaryIndex, dictionary, claimedIDs); err != nil {
			return err
		}
		sections[dictionary.ID] = sectionKindParameterDictionary
	}
	for listIndex, list := range state.Lists {
		if err := validateList(listIndex, list, claimedIDs); err != nil {
			return err
		}
		sections[list.ID] = sectionKindList
	}
	return validateSectionForest(state, sections)
}

func validateParameterDictionary(
	dictionaryIndex int,
	dictionary ParameterDictionary,
	claimedIDs map[string]struct{},
) error {
	label := fmt.Sprintf("parameter dictionary %d", dictionaryIndex)
	if err := claimID(claimedIDs, label, dictionary.ID); err != nil {
		return err
	}
	if err := validateCanonicalSectionName(label, dictionary.Name); err != nil {
		return err
	}
	entryCount := 0
	return validateDictionaryEntries(label, dictionary.Entries, claimedIDs, &entryCount)
}

func validateDictionaryEntries(
	parentLabel string,
	entries []DictionaryEntry,
	claimedIDs map[string]struct{},
	entryCount *int,
) error {
	names := make(map[string]struct{}, len(entries))
	for entryIndex, entry := range entries {
		*entryCount = *entryCount + 1
		if *entryCount > maxDictionaryEntries {
			return validationError("%s has too many entries", parentLabel)
		}
		entryLabel := fmt.Sprintf("%s entry %d", parentLabel, entryIndex)
		if err := claimID(claimedIDs, entryLabel, entry.ID); err != nil {
			return err
		}
		if err := validateCanonicalDictionaryEntryName(entryLabel, entry.Name); err != nil {
			return err
		}
		if _, exists := names[entry.Name]; exists {
			return validationError("%s repeats entry name %q", parentLabel, entry.Name)
		}
		names[entry.Name] = struct{}{}
		if (entry.Leaf == nil) == (entry.Parent == nil) {
			return validationError("%s must be exactly one of leaf or parent", entryLabel)
		}
		if entry.Leaf != nil {
			if err := validateParameterExpression(entry.Leaf.AuthoredExpression); err != nil {
				return fmt.Errorf("%s: %w", entryLabel, err)
			}
			continue
		}
		if err := validateDictionaryEntries(entryLabel, entry.Parent.Children, claimedIDs, entryCount); err != nil {
			return err
		}
	}
	return nil
}

func validateCanonicalSectionName(kind string, name string) error {
	canonical, err := canonicalDisplayName(kind, name)
	if err != nil {
		return err
	}
	if canonical != name {
		return validationError("%s name must be canonical", kind)
	}
	return nil
}

func validateCanonicalDictionaryEntryName(kind string, name string) error {
	canonical, err := canonicalDisplayName(kind, name)
	if err != nil {
		return err
	}
	if canonical != name {
		return validationError("%s name must be canonical", kind)
	}
	return nil
}

func validateList(listIndex int, list List, claimedIDs map[string]struct{}) error {
	label := fmt.Sprintf("list %d", listIndex)
	if err := claimID(claimedIDs, label, list.ID); err != nil {
		return err
	}
	if err := validateCanonicalSectionName(label, list.Name); err != nil {
		return err
	}
	if len(list.ChildSectionIDs) > maxListChildren {
		return validationError("%s has too many children", label)
	}
	return nil
}

func validateSectionForest(state State, sections map[string]sectionKind) error {
	placements := make(map[string]string, len(sections))
	for index, sectionID := range state.TopLevelSectionIDs {
		if err := claimSectionPlacement(sectionID, fmt.Sprintf("top-level section %d", index), sections, placements); err != nil {
			return err
		}
	}
	listChildren := make(map[string][]string, len(state.Lists))
	for listIndex, list := range state.Lists {
		children := cloneStrings(list.ChildSectionIDs)
		listChildren[list.ID] = children
		for childIndex, sectionID := range children {
			if err := claimSectionPlacement(
				sectionID,
				fmt.Sprintf("list %d child %d", listIndex, childIndex),
				sections,
				placements,
			); err != nil {
				return err
			}
		}
	}
	for _, sectionID := range sortedSectionIDs(sections) {
		if _, exists := placements[sectionID]; !exists {
			return validationError("section %q is not placed in the forest", sectionID)
		}
	}
	if err := validateListCycles(listChildren, sections); err != nil {
		return err
	}
	return validateForestReachability(state.TopLevelSectionIDs, listChildren, sections)
}

func claimSectionPlacement(
	sectionID string,
	location string,
	sections map[string]sectionKind,
	placements map[string]string,
) error {
	if err := validateID(location, sectionID); err != nil {
		return err
	}
	if _, exists := sections[sectionID]; !exists {
		return validationError("%s references unknown section %q", location, sectionID)
	}
	if prior, exists := placements[sectionID]; exists {
		return validationError("section %q has multiple forest parents (%s and %s)", sectionID, prior, location)
	}
	placements[sectionID] = location
	return nil
}

func validateListCycles(children map[string][]string, sections map[string]sectionKind) error {
	colors := make(map[string]uint8, len(children))
	var visit func(string) error
	visit = func(listID string) error {
		switch colors[listID] {
		case 1:
			return validationError("section forest contains a list cycle at %q", listID)
		case 2:
			return nil
		}
		colors[listID] = 1
		for _, childID := range children[listID] {
			if sections[childID] != sectionKindList {
				continue
			}
			if err := visit(childID); err != nil {
				return err
			}
		}
		colors[listID] = 2
		return nil
	}
	for _, listID := range sortedSectionIDsByKind(sections, sectionKindList) {
		if err := visit(listID); err != nil {
			return err
		}
	}
	return nil
}

func validateForestReachability(
	topLevelSectionIDs []string,
	children map[string][]string,
	sections map[string]sectionKind,
) error {
	reachable := make(map[string]struct{}, len(sections))
	var visit func(string)
	visit = func(sectionID string) {
		if _, exists := reachable[sectionID]; exists {
			return
		}
		reachable[sectionID] = struct{}{}
		if sections[sectionID] != sectionKindList {
			return
		}
		for _, childID := range children[sectionID] {
			visit(childID)
		}
	}
	for _, sectionID := range topLevelSectionIDs {
		visit(sectionID)
	}
	for _, sectionID := range sortedSectionIDs(sections) {
		if _, exists := reachable[sectionID]; !exists {
			return validationError("section %q is not reachable from the top level", sectionID)
		}
	}
	return nil
}

func sortedSectionIDsByKind(sections map[string]sectionKind, kind sectionKind) []string {
	result := make([]string, 0, len(sections))
	for sectionID, sectionKind := range sections {
		if sectionKind == kind {
			result = append(result, sectionID)
		}
	}
	// Keep validation errors deterministic even though this map is internal.
	sort.Strings(result)
	return result
}

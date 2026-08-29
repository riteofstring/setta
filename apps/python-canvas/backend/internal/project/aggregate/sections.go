package aggregate

import (
	"fmt"
	"sort"
)

// CreateParameterDictionary appends one empty Parameter Dictionary to the
// top-level forest in the same candidate as its typed collection record.
func (state State) CreateParameterDictionary(
	command CreateParameterDictionaryCommand,
	nextID IDGenerator,
) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("parameter dictionary", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	id, err := newStableID(nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	candidate.ParameterDictionaries = append(candidate.ParameterDictionaries, ParameterDictionary{
		ID:      id,
		Name:    name,
		Entries: []DictionaryEntry{},
	})
	candidate.TopLevelSectionIDs = append(candidate.TopLevelSectionIDs, id)
	return changedCandidate(candidate)
}

// RenameParameterDictionary changes only the display name of one dictionary.
func (state State) RenameParameterDictionary(
	command RenameParameterDictionaryCommand,
) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("parameter dictionary", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	index, err := state.parameterDictionaryIndex(command.DictionaryID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	if candidate.ParameterDictionaries[index].Name == name {
		return Candidate{State: candidate}, nil
	}
	candidate.ParameterDictionaries[index].Name = name
	return changedCandidate(candidate)
}

// DeleteParameterDictionary removes the target section from whichever forest
// location owns it. A dictionary has no section descendants of its own.
func (state State) DeleteParameterDictionary(
	command DeleteParameterDictionaryCommand,
) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if _, err := state.parameterDictionaryIndex(command.DictionaryID); err != nil {
		return Candidate{}, err
	}
	return state.deleteSectionSubtree(command.DictionaryID)
}

// SetParameterDictionaryEntries validates and replaces one entire recursive
// dictionary tree. This command cannot affect another section's payload or
// placement.
func (state State) SetParameterDictionaryEntries(
	command SetParameterDictionaryEntriesCommand,
) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	index, err := state.parameterDictionaryIndex(command.DictionaryID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	entries := cloneDictionaryEntries(command.Entries)
	currentEntries := candidate.ParameterDictionaries[index].Entries
	if sameDictionaryEntries(currentEntries, entries) && sameDictionaryEntryUIs(candidate, entries, command.UIOverrides) {
		return Candidate{State: candidate}, nil
	}
	candidate.ParameterDictionaries[index].Entries = entries
	replaceDictionaryEntryUIs(&candidate, currentEntries, entries, command.UIOverrides)
	return changedCandidate(candidate)
}

// CreateList appends one empty List of Objects to the top-level forest in the
// same candidate as its typed collection record.
func (state State) CreateList(command CreateListCommand, nextID IDGenerator) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("list", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	id, err := newStableID(nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	candidate.Lists = append(candidate.Lists, List{ID: id, Name: name, ChildSectionIDs: []string{}})
	candidate.TopLevelSectionIDs = append(candidate.TopLevelSectionIDs, id)
	return changedCandidate(candidate)
}

// RenameList changes only a List of Objects display name.
func (state State) RenameList(command RenameListCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("list", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	index, err := state.listIndex(command.ListID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	if candidate.Lists[index].Name == name {
		return Candidate{State: candidate}, nil
	}
	candidate.Lists[index].Name = name
	return changedCandidate(candidate)
}

// DeleteList removes a List of Objects with all of its nested child sections.
func (state State) DeleteList(command DeleteListCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if _, err := state.listIndex(command.ListID); err != nil {
		return Candidate{}, err
	}
	return state.deleteSectionSubtree(command.ListID)
}

// IncrementListChildren appends Count fresh empty Callable children atomically.
func (state State) IncrementListChildren(
	command IncrementListChildrenCommand,
	nextID IDGenerator,
) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if command.Count <= 0 {
		return Candidate{}, validationError("list child increment count must be positive")
	}
	listIndex, err := state.listIndex(command.ListID)
	if err != nil {
		return Candidate{}, err
	}
	if len(state.Lists[listIndex].ChildSectionIDs)+command.Count > maxListChildren {
		return Candidate{}, validationError("list has too many children")
	}
	candidate := state.Clone()
	claimedIDs := candidate.targetIDs()
	for count := 0; count < command.Count; count++ {
		id, err := newStableID(nextID, claimedIDs)
		if err != nil {
			return Candidate{}, err
		}
		claimedIDs[id] = struct{}{}
		candidate.Callables = append(candidate.Callables, Callable{
			ID:         id,
			Name:       candidate.nextSectionName("Callable"),
			Parameters: []Parameter{},
		})
		candidate.Lists[listIndex].ChildSectionIDs = append(candidate.Lists[listIndex].ChildSectionIDs, id)
	}
	return changedCandidate(candidate)
}

// DecrementListChildren removes the last Count child subtrees, capped at the
// current child count. Decrementing an empty list is idempotent.
func (state State) DecrementListChildren(command DecrementListChildrenCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if command.Count <= 0 {
		return Candidate{}, validationError("list child decrement count must be positive")
	}
	listIndex, err := state.listIndex(command.ListID)
	if err != nil {
		return Candidate{}, err
	}
	children := state.Lists[listIndex].ChildSectionIDs
	removeCount := command.Count
	if removeCount > len(children) {
		removeCount = len(children)
	}
	candidate := state.Clone()
	if removeCount == 0 {
		return Candidate{State: candidate}, nil
	}
	roots := cloneStrings(children[len(children)-removeCount:])
	candidate.Lists[listIndex].ChildSectionIDs = cloneStrings(children[:len(children)-removeCount])
	if err := candidate.removeSectionSubtrees(roots); err != nil {
		return Candidate{}, err
	}
	return changedCandidate(candidate)
}

// ReplaceSectionForest applies a complete list of forest placements without
// accepting any typed section data in the same mutation.
func (state State) ReplaceSectionForest(command ReplaceSectionForestCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if len(command.ListChildren) != len(state.Lists) {
		return Candidate{}, validationError("section forest must provide every list's child order")
	}
	candidate := state.Clone()
	seenLists := make(map[string]struct{}, len(command.ListChildren))
	for proposalIndex, proposal := range command.ListChildren {
		if err := validateID(fmt.Sprintf("section forest list %d", proposalIndex), proposal.ListID); err != nil {
			return Candidate{}, err
		}
		if _, exists := seenLists[proposal.ListID]; exists {
			return Candidate{}, validationError("section forest repeats list %q", proposal.ListID)
		}
		seenLists[proposal.ListID] = struct{}{}
		listIndex, err := candidate.listIndex(proposal.ListID)
		if err != nil {
			return Candidate{}, err
		}
		candidate.Lists[listIndex].ChildSectionIDs = cloneStrings(proposal.ChildSectionIDs)
	}
	candidate.TopLevelSectionIDs = cloneStrings(command.TopLevelSectionIDs)
	if sameSectionForest(state, candidate) {
		return Candidate{State: candidate}, nil
	}
	return changedCandidate(candidate)
}

func (state State) parameterDictionaryIndex(dictionaryID string) (int, error) {
	for index, dictionary := range state.ParameterDictionaries {
		if dictionary.ID == dictionaryID {
			return index, nil
		}
	}
	return 0, fmt.Errorf("%w: %q", ErrParameterDictionaryNotFound, dictionaryID)
}

func (state State) listIndex(listID string) (int, error) {
	for index, list := range state.Lists {
		if list.ID == listID {
			return index, nil
		}
	}
	return 0, fmt.Errorf("%w: %q", ErrListNotFound, listID)
}

func (state State) deleteSectionSubtree(sectionID string) (Candidate, error) {
	candidate := state.Clone()
	if err := candidate.removeSectionSubtrees([]string{sectionID}); err != nil {
		return Candidate{}, err
	}
	return changedCandidate(candidate)
}

func (state *State) removeSectionSubtrees(roots []string) error {
	removed := make(map[string]struct{})
	for _, root := range roots {
		if err := state.collectSectionSubtree(root, removed, make(map[string]bool)); err != nil {
			return err
		}
	}
	state.TopLevelSectionIDs = filterSectionIDs(state.TopLevelSectionIDs, removed)
	state.Callables = filterCallables(state.Callables, removed)
	state.ParameterDictionaries = filterParameterDictionaries(state.ParameterDictionaries, removed)
	state.Lists = filterLists(state.Lists, removed)
	state.retainParameterUIOverrides()
	return nil
}

func (state State) collectSectionSubtree(sectionID string, removed map[string]struct{}, visiting map[string]bool) error {
	if _, exists := removed[sectionID]; exists {
		return nil
	}
	if visiting[sectionID] {
		return validationError("section deletion encountered a cycle at %q", sectionID)
	}
	if !state.hasSection(sectionID) {
		return validationError("section deletion references unknown section %q", sectionID)
	}
	visiting[sectionID] = true
	if index, err := state.listIndex(sectionID); err == nil {
		for _, childID := range state.Lists[index].ChildSectionIDs {
			if err := state.collectSectionSubtree(childID, removed, visiting); err != nil {
				return err
			}
		}
	}
	visiting[sectionID] = false
	removed[sectionID] = struct{}{}
	return nil
}

func (state State) hasSection(sectionID string) bool {
	if _, err := state.callableIndex(sectionID); err == nil {
		return true
	}
	if _, err := state.parameterDictionaryIndex(sectionID); err == nil {
		return true
	}
	_, err := state.listIndex(sectionID)
	return err == nil
}

func filterSectionIDs(values []string, removed map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, exists := removed[value]; !exists {
			result = append(result, value)
		}
	}
	return result
}

func filterCallables(values []Callable, removed map[string]struct{}) []Callable {
	result := make([]Callable, 0, len(values))
	for _, value := range values {
		if _, exists := removed[value.ID]; !exists {
			result = append(result, value)
		}
	}
	return result
}

func filterParameterDictionaries(values []ParameterDictionary, removed map[string]struct{}) []ParameterDictionary {
	result := make([]ParameterDictionary, 0, len(values))
	for _, value := range values {
		if _, exists := removed[value.ID]; !exists {
			result = append(result, value)
		}
	}
	return result
}

func filterLists(values []List, removed map[string]struct{}) []List {
	result := make([]List, 0, len(values))
	for _, value := range values {
		if _, exists := removed[value.ID]; exists {
			continue
		}
		value.ChildSectionIDs = filterSectionIDs(value.ChildSectionIDs, removed)
		result = append(result, value)
	}
	return result
}

func (state State) nextSectionName(base string) string {
	used := make(map[string]struct{}, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists))
	for _, callable := range state.Callables {
		used[callable.Name] = struct{}{}
	}
	for _, dictionary := range state.ParameterDictionaries {
		used[dictionary.Name] = struct{}{}
	}
	for _, list := range state.Lists {
		used[list.Name] = struct{}{}
	}
	if _, exists := used[base]; !exists {
		return base
	}
	for suffix := 2; ; suffix++ {
		candidate := fmt.Sprintf("%s %d", base, suffix)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
}

func cloneParameterDictionaries(values []ParameterDictionary) []ParameterDictionary {
	result := make([]ParameterDictionary, len(values))
	for index, value := range values {
		result[index] = ParameterDictionary{
			ID:      value.ID,
			Name:    value.Name,
			Entries: cloneDictionaryEntries(value.Entries),
		}
	}
	return result
}

func cloneDictionaryEntries(values []DictionaryEntry) []DictionaryEntry {
	result := make([]DictionaryEntry, len(values))
	for index, value := range values {
		result[index] = cloneDictionaryEntry(value)
	}
	return result
}

func cloneDictionaryEntry(value DictionaryEntry) DictionaryEntry {
	clone := DictionaryEntry{ID: value.ID, Name: value.Name}
	if value.Leaf != nil {
		clone.Leaf = &DictionaryLeaf{AuthoredExpression: value.Leaf.AuthoredExpression}
	}
	if value.Parent != nil {
		clone.Parent = &DictionaryParent{Children: cloneDictionaryEntries(value.Parent.Children)}
	}
	return clone
}

func cloneLists(values []List) []List {
	result := make([]List, len(values))
	for index, value := range values {
		result[index] = List{ID: value.ID, Name: value.Name, ChildSectionIDs: cloneStrings(value.ChildSectionIDs)}
	}
	return result
}

func cloneStrings(values []string) []string {
	result := make([]string, len(values))
	copy(result, values)
	return result
}

func sameDictionaryEntries(left []DictionaryEntry, right []DictionaryEntry) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !sameDictionaryEntry(left[index], right[index]) {
			return false
		}
	}
	return true
}

func sameDictionaryEntry(left DictionaryEntry, right DictionaryEntry) bool {
	if left.ID != right.ID || left.Name != right.Name || (left.Leaf == nil) != (right.Leaf == nil) || (left.Parent == nil) != (right.Parent == nil) {
		return false
	}
	if left.Leaf != nil && left.Leaf.AuthoredExpression != right.Leaf.AuthoredExpression {
		return false
	}
	if left.Parent != nil {
		return sameDictionaryEntries(left.Parent.Children, right.Parent.Children)
	}
	return true
}

func sameSectionForest(left State, right State) bool {
	if !sameStrings(left.TopLevelSectionIDs, right.TopLevelSectionIDs) || len(left.Lists) != len(right.Lists) {
		return false
	}
	for index := range left.Lists {
		if left.Lists[index].ID != right.Lists[index].ID || !sameStrings(left.Lists[index].ChildSectionIDs, right.Lists[index].ChildSectionIDs) {
			return false
		}
	}
	return true
}

func sameStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func claimDictionaryEntryIDs(claimed map[string]struct{}, entries []DictionaryEntry) {
	for _, entry := range entries {
		claimed[entry.ID] = struct{}{}
		if entry.Parent != nil {
			claimDictionaryEntryIDs(claimed, entry.Parent.Children)
		}
	}
}

func sortedSectionIDs(sections map[string]sectionKind) []string {
	result := make([]string, 0, len(sections))
	for id := range sections {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}

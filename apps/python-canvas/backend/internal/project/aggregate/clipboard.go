package aggregate

import "fmt"

const (
	SectionClipboardVersionV1 = 1
	maxClipboardSections      = 768
	maxClipboardTargets       = 8192
	clipboardProjectIDBase    = "python-canvas:clipboard"
	clipboardProjectName      = "Python Canvas Clipboard"
)

type SectionClipboardPayload struct {
	Version               int
	RootSectionIDs        []string
	Callables             []Callable
	ParameterDictionaries []ParameterDictionary
	ParameterUIOverrides  map[string]ParameterUI
	Lists                 []List
}

type CopySectionClipboardCommand struct {
	ProjectID        string
	ObservedRevision int
	RootSectionIDs   []string
}

type PasteSectionClipboardCommand struct {
	ProjectID        string
	ExpectedRevision int
	Payload          SectionClipboardPayload
}

type SectionClipboardPasteCandidate struct {
	Candidate              Candidate
	SourceState            State
	SourceToDestinationIDs map[string]string
	ClonedSectionIDs       []string
	PastedRootSectionIDs   []string
}

func (payload SectionClipboardPayload) Clone() SectionClipboardPayload {
	return SectionClipboardPayload{
		Version:               payload.Version,
		RootSectionIDs:        cloneStrings(payload.RootSectionIDs),
		Callables:             cloneCallables(payload.Callables),
		ParameterDictionaries: cloneParameterDictionaries(payload.ParameterDictionaries),
		ParameterUIOverrides:  cloneParameterUIOverrides(payload.ParameterUIOverrides),
		Lists:                 cloneLists(payload.Lists),
	}
}

func (payload SectionClipboardPayload) State() (State, error) {
	if payload.Version != SectionClipboardVersionV1 {
		return State{}, validationError("section clipboard version %d is unsupported", payload.Version)
	}
	if payload.RootSectionIDs == nil || payload.Callables == nil || payload.ParameterDictionaries == nil || payload.Lists == nil {
		return State{}, validationError("section clipboard collections must be present")
	}
	if len(payload.RootSectionIDs) == 0 {
		return State{}, validationError("section clipboard must have at least one root")
	}
	sectionCount := len(payload.Callables) + len(payload.ParameterDictionaries) + len(payload.Lists)
	if sectionCount > maxClipboardSections {
		return State{}, validationError("section clipboard has too many sections")
	}
	projectID := clipboardProjectID(payload)
	state := State{
		Project: Project{
			ID:       projectID,
			Name:     clipboardProjectName,
			Revision: 1,
		},
		PythonTarget:          PythonTarget{Suffix: DefaultPythonSuffix},
		Callables:             cloneCallables(payload.Callables),
		ParameterDictionaries: cloneParameterDictionaries(payload.ParameterDictionaries),
		ParameterUIOverrides:  cloneParameterUIOverrides(payload.ParameterUIOverrides),
		Lists:                 cloneLists(payload.Lists),
		TopLevelSectionIDs:    cloneStrings(payload.RootSectionIDs),
	}
	if state.ParameterUIOverrides == nil {
		state.ParameterUIOverrides = map[string]ParameterUI{}
	}
	if len(state.targetIDs())-1 > maxClipboardTargets {
		return State{}, validationError("section clipboard has too many targets")
	}
	if err := state.Validate(); err != nil {
		return State{}, fmt.Errorf("validate section clipboard: %w", err)
	}
	return state, nil
}

func (state State) CopySectionClipboard(command CopySectionClipboardCommand) (SectionClipboardPayload, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ObservedRevision); err != nil {
		return SectionClipboardPayload{}, err
	}
	if err := validateClipboardRoots(state, command.RootSectionIDs); err != nil {
		return SectionClipboardPayload{}, err
	}
	sectionOrder := clipboardSectionOrder(state, command.RootSectionIDs)
	if len(sectionOrder) > maxClipboardSections {
		return SectionClipboardPayload{}, validationError("section clipboard has too many sections")
	}
	payload := captureSectionClipboard(state, command.RootSectionIDs, sectionOrder)
	if _, err := payload.State(); err != nil {
		return SectionClipboardPayload{}, err
	}
	return payload, nil
}

func (state State) PasteSectionClipboard(
	command PasteSectionClipboardCommand,
	nextID IDGenerator,
) (SectionClipboardPasteCandidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return SectionClipboardPasteCandidate{}, err
	}
	source, err := command.Payload.State()
	if err != nil {
		return SectionClipboardPasteCandidate{}, err
	}
	if err := validateClipboardPasteCapacity(state, source); err != nil {
		return SectionClipboardPasteCandidate{}, err
	}
	sectionOrder := clipboardSectionOrder(source, source.TopLevelSectionIDs)
	claimed := state.targetIDs()
	idMap, err := allocateClipboardTargetIDs(source, sectionOrder, claimed, nextID)
	if err != nil {
		return SectionClipboardPasteCandidate{}, err
	}
	nameMap := allocateClipboardSectionNames(state, source, sectionOrder)
	candidate := state.Clone()
	appendClipboardSections(&candidate, source, sectionOrder, idMap, nameMap)
	appendClipboardUIOverrides(&candidate, source, idMap)
	pastedRoots := remapSectionIDs(source.TopLevelSectionIDs, idMap)
	candidate.TopLevelSectionIDs = append(candidate.TopLevelSectionIDs, pastedRoots...)
	changed, err := changedCandidate(candidate)
	if err != nil {
		return SectionClipboardPasteCandidate{}, err
	}
	return SectionClipboardPasteCandidate{
		Candidate:              changed,
		SourceState:            source,
		SourceToDestinationIDs: cloneIDMap(idMap),
		ClonedSectionIDs:       remapSectionIDs(sectionOrder, idMap),
		PastedRootSectionIDs:   pastedRoots,
	}, nil
}

func validateClipboardPasteCapacity(state State, source State) error {
	if len(state.ParameterDictionaries)+len(source.ParameterDictionaries) > maxParameterDictionaries {
		return validationError("section clipboard would create too many parameter dictionaries")
	}
	if len(state.Lists)+len(source.Lists) > maxLists {
		return validationError("section clipboard would create too many lists")
	}
	return nil
}

func clipboardProjectID(payload SectionClipboardPayload) string {
	claimed := make(map[string]struct{}, len(payload.Callables)+len(payload.ParameterDictionaries)+len(payload.Lists))
	for _, callable := range payload.Callables {
		claimed[callable.ID] = struct{}{}
		for _, parameter := range callable.Parameters {
			claimed[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range payload.ParameterDictionaries {
		claimed[dictionary.ID] = struct{}{}
		claimDictionaryEntryIDs(claimed, dictionary.Entries)
	}
	for _, list := range payload.Lists {
		claimed[list.ID] = struct{}{}
	}
	projectID := clipboardProjectIDBase
	for suffix := 2; ; suffix++ {
		if _, exists := claimed[projectID]; !exists {
			return projectID
		}
		projectID = fmt.Sprintf("%s:%d", clipboardProjectIDBase, suffix)
	}
}

func validateClipboardRoots(state State, roots []string) error {
	if len(roots) == 0 {
		return validationError("section clipboard roots must be present")
	}
	if len(roots) > maxClipboardSections {
		return validationError("section clipboard has too many roots")
	}
	selected := make(map[string]struct{}, len(roots))
	for index, rootID := range roots {
		if err := validateID(fmt.Sprintf("section clipboard root %d", index), rootID); err != nil {
			return err
		}
		if !state.hasSection(rootID) {
			return validationError("section clipboard references unknown root %q", rootID)
		}
		if _, exists := selected[rootID]; exists {
			return validationError("section clipboard repeats root %q", rootID)
		}
		selected[rootID] = struct{}{}
	}
	parents := sectionParents(state)
	for _, rootID := range roots {
		for parentID, hasParent := parents[rootID]; hasParent; parentID, hasParent = parents[parentID] {
			if _, selectedAncestor := selected[parentID]; selectedAncestor {
				return validationError("section clipboard root %q descends from selected root %q", rootID, parentID)
			}
		}
	}
	return nil
}

func sectionParents(state State) map[string]string {
	parents := make(map[string]string)
	for _, list := range state.Lists {
		for _, childID := range list.ChildSectionIDs {
			parents[childID] = list.ID
		}
	}
	return parents
}

func clipboardSectionOrder(state State, roots []string) []string {
	lists := make(map[string]List, len(state.Lists))
	for _, list := range state.Lists {
		lists[list.ID] = list
	}
	seen := make(map[string]struct{})
	result := make([]string, 0)
	var visit func(string)
	visit = func(sectionID string) {
		if _, exists := seen[sectionID]; exists {
			return
		}
		seen[sectionID] = struct{}{}
		result = append(result, sectionID)
		for _, childID := range lists[sectionID].ChildSectionIDs {
			visit(childID)
		}
	}
	for _, rootID := range roots {
		visit(rootID)
	}
	return result
}

func captureSectionClipboard(state State, roots []string, sectionOrder []string) SectionClipboardPayload {
	sections := newClipboardSectionIndexes(state)
	payload := SectionClipboardPayload{
		Version:               SectionClipboardVersionV1,
		RootSectionIDs:        cloneStrings(roots),
		Callables:             []Callable{},
		ParameterDictionaries: []ParameterDictionary{},
		ParameterUIOverrides:  map[string]ParameterUI{},
		Lists:                 []List{},
	}
	for _, sectionID := range sectionOrder {
		appendClipboardSection(&payload, sections, sectionID)
	}
	copyClipboardUIOverrides(&payload, state.ParameterUIOverrides)
	return payload
}

func appendClipboardSection(payload *SectionClipboardPayload, sections clipboardSectionIndexes, sectionID string) {
	if callable, exists := sections.callables[sectionID]; exists {
		payload.Callables = append(payload.Callables, cloneCallable(callable))
		return
	}
	if dictionary, exists := sections.dictionaries[sectionID]; exists {
		payload.ParameterDictionaries = append(payload.ParameterDictionaries, ParameterDictionary{
			ID:      dictionary.ID,
			Name:    dictionary.Name,
			Entries: cloneDictionaryEntries(dictionary.Entries),
		})
		return
	}
	list := sections.lists[sectionID]
	payload.Lists = append(payload.Lists, List{
		ID:              list.ID,
		Name:            list.Name,
		ChildSectionIDs: cloneStrings(list.ChildSectionIDs),
	})
}

func copyClipboardUIOverrides(payload *SectionClipboardPayload, source map[string]ParameterUI) {
	copiedTargets := make(map[string]struct{})
	for _, callable := range payload.Callables {
		for _, parameter := range callable.Parameters {
			copiedTargets[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range payload.ParameterDictionaries {
		collectConfigurableDictionaryEntryIDs(dictionary.Entries, copiedTargets)
	}
	for targetID, ui := range source {
		if _, copied := copiedTargets[targetID]; copied {
			payload.ParameterUIOverrides[targetID] = ui.Clone()
		}
	}
}

func allocateClipboardTargetIDs(
	source State,
	sectionOrder []string,
	claimed map[string]struct{},
	nextID IDGenerator,
) (map[string]string, error) {
	sections := newClipboardSectionIndexes(source)
	result := make(map[string]string)
	allocate := func(sourceID string) error {
		id, err := newStableID(nextID, claimed)
		if err != nil {
			return err
		}
		claimed[id] = struct{}{}
		result[sourceID] = id
		return nil
	}
	for _, sectionID := range sectionOrder {
		if err := allocate(sectionID); err != nil {
			return nil, err
		}
		if callable, exists := sections.callables[sectionID]; exists {
			for _, parameter := range callable.Parameters {
				if err := allocate(parameter.ID); err != nil {
					return nil, err
				}
			}
		}
		if dictionary, exists := sections.dictionaries[sectionID]; exists {
			if err := allocateDictionaryEntryIDs(dictionary.Entries, allocate); err != nil {
				return nil, err
			}
		}
	}
	return result, nil
}

func allocateDictionaryEntryIDs(entries []DictionaryEntry, allocate func(string) error) error {
	for _, entry := range entries {
		if err := allocate(entry.ID); err != nil {
			return err
		}
		if entry.Parent != nil {
			if err := allocateDictionaryEntryIDs(entry.Parent.Children, allocate); err != nil {
				return err
			}
		}
	}
	return nil
}

func allocateClipboardSectionNames(state State, source State, sectionOrder []string) map[string]string {
	used := make(map[string]struct{}, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists)+len(sectionOrder))
	for _, callable := range state.Callables {
		used[callable.Name] = struct{}{}
	}
	for _, dictionary := range state.ParameterDictionaries {
		used[dictionary.Name] = struct{}{}
	}
	for _, list := range state.Lists {
		used[list.Name] = struct{}{}
	}
	sections := newClipboardSectionIndexes(source)
	result := make(map[string]string, len(sectionOrder))
	for _, sectionID := range sectionOrder {
		base := sections.lists[sectionID].Name
		if callable, exists := sections.callables[sectionID]; exists {
			base = callable.Name
		}
		if dictionary, exists := sections.dictionaries[sectionID]; exists {
			base = dictionary.Name
		}
		name := nextClipboardSectionName(base, used)
		used[name] = struct{}{}
		result[sectionID] = name
	}
	return result
}

func nextClipboardSectionName(base string, used map[string]struct{}) string {
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

func appendClipboardSections(
	candidate *State,
	source State,
	sectionOrder []string,
	idMap map[string]string,
	nameMap map[string]string,
) {
	sections := newClipboardSectionIndexes(source)
	for _, sectionID := range sectionOrder {
		if callable, exists := sections.callables[sectionID]; exists {
			clone := cloneCallable(callable)
			clone.ID = idMap[callable.ID]
			clone.Name = nameMap[callable.ID]
			for index := range clone.Parameters {
				clone.Parameters[index].ID = idMap[clone.Parameters[index].ID]
			}
			candidate.Callables = append(candidate.Callables, clone)
			continue
		}
		if dictionary, exists := sections.dictionaries[sectionID]; exists {
			candidate.ParameterDictionaries = append(candidate.ParameterDictionaries, ParameterDictionary{
				ID:      idMap[dictionary.ID],
				Name:    nameMap[dictionary.ID],
				Entries: remapDictionaryEntries(dictionary.Entries, idMap),
			})
			continue
		}
		list := sections.lists[sectionID]
		candidate.Lists = append(candidate.Lists, List{
			ID:              idMap[list.ID],
			Name:            nameMap[list.ID],
			ChildSectionIDs: remapSectionIDs(list.ChildSectionIDs, idMap),
		})
	}
}

func appendClipboardUIOverrides(candidate *State, source State, idMap map[string]string) {
	if candidate.ParameterUIOverrides == nil {
		candidate.ParameterUIOverrides = map[string]ParameterUI{}
	}
	for sourceID, ui := range source.ParameterUIOverrides {
		if destinationID, copied := idMap[sourceID]; copied {
			candidate.ParameterUIOverrides[destinationID] = ui.Clone()
		}
	}
}

type clipboardSectionIndexes struct {
	callables    map[string]Callable
	dictionaries map[string]ParameterDictionary
	lists        map[string]List
}

func newClipboardSectionIndexes(source State) clipboardSectionIndexes {
	result := clipboardSectionIndexes{
		callables:    make(map[string]Callable, len(source.Callables)),
		dictionaries: make(map[string]ParameterDictionary, len(source.ParameterDictionaries)),
		lists:        make(map[string]List, len(source.Lists)),
	}
	for _, callable := range source.Callables {
		result.callables[callable.ID] = callable
	}
	for _, dictionary := range source.ParameterDictionaries {
		result.dictionaries[dictionary.ID] = dictionary
	}
	for _, list := range source.Lists {
		result.lists[list.ID] = list
	}
	return result
}

func remapDictionaryEntries(entries []DictionaryEntry, idMap map[string]string) []DictionaryEntry {
	result := make([]DictionaryEntry, len(entries))
	for index, entry := range entries {
		clone := cloneDictionaryEntry(entry)
		clone.ID = idMap[entry.ID]
		if clone.Parent != nil {
			clone.Parent.Children = remapDictionaryEntries(entry.Parent.Children, idMap)
		}
		result[index] = clone
	}
	return result
}

func remapSectionIDs(values []string, idMap map[string]string) []string {
	result := make([]string, len(values))
	for index, value := range values {
		result[index] = idMap[value]
	}
	return result
}

func cloneCallables(values []Callable) []Callable {
	result := make([]Callable, len(values))
	for index, value := range values {
		result[index] = cloneCallable(value)
	}
	return result
}

func cloneCallable(value Callable) Callable {
	result := value
	result.Parameters = make([]Parameter, len(value.Parameters))
	for index, parameter := range value.Parameters {
		parameter.TypeAnnotation = cloneString(parameter.TypeAnnotation)
		parameter.Default = cloneString(parameter.Default)
		parameter.ProviderOrdinal = cloneInt(parameter.ProviderOrdinal)
		result.Parameters[index] = parameter
	}
	return result
}

func cloneIDMap(values map[string]string) map[string]string {
	result := make(map[string]string, len(values))
	for source, destination := range values {
		result[source] = destination
	}
	return result
}

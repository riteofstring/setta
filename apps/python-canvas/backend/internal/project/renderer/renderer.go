package renderer

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

const (
	generatedCodeSeparator              = "\n\n"
	stateClassHeader                    = "class SettaState:\n    def __init__(state):\n"
	stateBodyIndent                     = "        "
	collectionContinuationIndent        = stateBodyIndent + "    "
	maxInlineCollectionChars            = 88
	multilineCollectionMinimumItemCount = 4
)

type ByteRange struct {
	Start int
	End   int
}

type CallPosition struct {
	Offset int
	End    int
}

type Result struct {
	Code string
	Body string

	PrefixRange        ByteRange
	GeneratedBodyRange ByteRange
	SuffixRange        ByteRange

	SourceRangesByTargetID      map[string]ByteRange
	CompositionRangesByTargetID map[string]ByteRange
	CallableCallPositionsByID   map[string]CallPosition
	TargetPathsByID             map[string]string
	DependencyCycleTargetIDs    []string
}

func Render(state aggregate.State) (Result, error) {
	if err := state.Validate(); err != nil {
		return Result{}, fmt.Errorf("render validated project: %w", err)
	}
	graph, err := buildAssignmentGraph(state)
	if err != nil {
		return Result{}, fmt.Errorf("build assignment graph: %w", err)
	}
	body, ranges, compositions, callPositions := renderGraphBody(graph)
	bodyStart := len(state.PythonTarget.Prefix) + len(generatedCodeSeparator)
	bodyEnd := bodyStart + len(body)
	suffixStart := bodyEnd + len(generatedCodeSeparator)

	offsetRanges(ranges, bodyStart)
	offsetRanges(compositions, bodyStart)
	for targetID, position := range callPositions {
		position.Offset += bodyStart
		position.End += bodyStart
		callPositions[targetID] = position
	}

	return Result{
		Code:                        state.PythonTarget.Prefix + generatedCodeSeparator + body + generatedCodeSeparator + state.PythonTarget.Suffix,
		Body:                        body,
		PrefixRange:                 ByteRange{Start: 0, End: len(state.PythonTarget.Prefix)},
		GeneratedBodyRange:          ByteRange{Start: bodyStart, End: bodyEnd},
		SuffixRange:                 ByteRange{Start: suffixStart, End: suffixStart + len(state.PythonTarget.Suffix)},
		SourceRangesByTargetID:      ranges,
		CompositionRangesByTargetID: compositions,
		CallableCallPositionsByID:   callPositions,
		TargetPathsByID:             cloneTargetPaths(graph.paths),
		DependencyCycleTargetIDs:    append([]string(nil), graph.cycleTargetIDs...),
	}, nil
}

func offsetRanges(ranges map[string]ByteRange, offset int) {
	for targetID, sourceRange := range ranges {
		sourceRange.Start += offset
		sourceRange.End += offset
		ranges[targetID] = sourceRange
	}
}

type renderedParameter struct {
	parameter aggregate.Parameter
	path      string
}

func isRenderedParameter(parameter aggregate.Parameter) bool {
	if parameter.AuthoredExpression == "" {
		return false
	}
	return !parameter.NameEditable || parameter.Name != ""
}

func shouldMultilineCollection(items []string, inline string) bool {
	for _, item := range items {
		if strings.Contains(item, "\n") {
			return true
		}
	}
	return len(items) >= multilineCollectionMinimumItemCount || len(inline) > maxInlineCollectionChars
}

func renderCallArgumentItems(parameters []renderedParameter) []string {
	positionalOnly := make([]renderedParameter, 0, len(parameters))
	variadicPositional := make([]renderedParameter, 0, len(parameters))
	middle := make([]renderedParameter, 0, len(parameters))
	variadicKeyword := make([]renderedParameter, 0, len(parameters))
	for _, parameter := range parameters {
		switch parameter.parameter.PassingStyle {
		case aggregate.PassingStylePositionalOnly:
			positionalOnly = append(positionalOnly, parameter)
		case aggregate.PassingStyleVariadicPositional:
			variadicPositional = append(variadicPositional, parameter)
		case aggregate.PassingStylePositionalOrKeyword, aggregate.PassingStyleKeywordOnly:
			middle = append(middle, parameter)
		case aggregate.PassingStyleVariadicKeyword:
			variadicKeyword = append(variadicKeyword, parameter)
		}
	}
	sort.Slice(positionalOnly, func(left int, right int) bool {
		return *positionalOnly[left].parameter.ProviderOrdinal < *positionalOnly[right].parameter.ProviderOrdinal
	})

	arguments := make([]string, 0, len(parameters))
	for _, parameter := range positionalOnly {
		arguments = append(arguments, "state."+parameter.path)
	}
	for _, parameter := range variadicPositional {
		arguments = append(arguments, "*state."+parameter.path)
	}
	for _, parameter := range middle {
		arguments = append(arguments, parameter.parameter.Name+"=state."+parameter.path)
	}
	for _, parameter := range variadicKeyword {
		arguments = append(arguments, "**state."+parameter.path)
	}
	return arguments
}

type pathCandidate struct {
	id   string
	base string
}

type pathReservation struct {
	id   string
	path string
}

type pathAllocator struct {
	paths        map[string]string
	used         map[string]struct{}
	callables    map[string]aggregate.Callable
	dictionaries map[string]aggregate.ParameterDictionary
	lists        map[string]aggregate.List
}

func allocateForestPaths(
	state aggregate.State,
	callables map[string]aggregate.Callable,
	dictionaries map[string]aggregate.ParameterDictionary,
	lists map[string]aggregate.List,
) map[string]string {
	allocator := pathAllocator{
		paths:        make(map[string]string),
		used:         make(map[string]struct{}),
		callables:    callables,
		dictionaries: dictionaries,
		lists:        lists,
	}
	candidates := make([]pathCandidate, 0, len(state.TopLevelSectionIDs))
	for _, sectionID := range state.TopLevelSectionIDs {
		candidates = append(candidates, pathCandidate{id: sectionID, base: sanitizedPathName(sectionName(sectionID, callables, dictionaries, lists))})
	}
	sortPathCandidates(candidates)
	for _, candidate := range candidates {
		allocator.allocateTopLevelSection(candidate)
	}
	return allocator.paths
}

func (allocator *pathAllocator) allocateTopLevelSection(candidate pathCandidate) {
	if _, isList := allocator.lists[candidate.id]; isList {
		allocator.allocateList(candidate.id, candidate.base)
		return
	}
	allocator.paths[candidate.id] = allocator.allocatePath(candidate.base)
	allocator.allocateSectionContents(candidate.id)
}

func (allocator *pathAllocator) allocateList(listID string, base string) {
	for suffix := 1; ; suffix++ {
		path := pathWithSuffix(base, suffix)
		reservations := allocator.listSectionPaths(listID, path)
		if !allocator.pathsAreAvailable(reservations) {
			continue
		}
		for _, reservation := range reservations {
			allocator.paths[reservation.id] = reservation.path
			allocator.used[reservation.path] = struct{}{}
		}
		allocator.allocateSectionContents(listID)
		return
	}
}

func (allocator *pathAllocator) listSectionPaths(sectionID string, path string) []pathReservation {
	reservations := []pathReservation{{id: sectionID, path: path}}
	list, isList := allocator.lists[sectionID]
	if !isList {
		return reservations
	}
	for index, childID := range list.ChildSectionIDs {
		childPath := fmt.Sprintf("%s__%d", path, index)
		reservations = append(reservations, allocator.listSectionPaths(childID, childPath)...)
	}
	return reservations
}

func (allocator *pathAllocator) pathsAreAvailable(reservations []pathReservation) bool {
	reserved := make(map[string]struct{}, len(reservations))
	for _, reservation := range reservations {
		if _, used := allocator.used[reservation.path]; used {
			return false
		}
		if _, duplicate := reserved[reservation.path]; duplicate {
			return false
		}
		reserved[reservation.path] = struct{}{}
	}
	return true
}

func (allocator *pathAllocator) allocateSectionContents(sectionID string) {
	if callable, isCallable := allocator.callables[sectionID]; isCallable {
		allocator.allocateCallableParameters(callable, allocator.paths[sectionID])
		return
	}
	if dictionary, isDictionary := allocator.dictionaries[sectionID]; isDictionary {
		allocator.allocateDictionaryEntries(allocator.paths[sectionID], dictionary.Entries)
		return
	}
	for _, childID := range allocator.lists[sectionID].ChildSectionIDs {
		allocator.allocateSectionContents(childID)
	}
}

func (allocator *pathAllocator) allocateCallableParameters(callable aggregate.Callable, path string) {
	candidates := make([]pathCandidate, 0, len(callable.Parameters))
	for _, parameter := range callable.Parameters {
		if !isRenderedParameter(parameter) {
			continue
		}
		candidates = append(candidates, pathCandidate{id: parameter.ID, base: path + "__" + parameter.Name})
	}
	allocator.allocateCandidates(candidates)
}

func (allocator *pathAllocator) allocateDictionaryEntries(parentPath string, entries []aggregate.DictionaryEntry) {
	orderedEntries := append([]aggregate.DictionaryEntry(nil), entries...)
	sort.Slice(orderedEntries, func(left int, right int) bool {
		return orderedEntries[left].ID < orderedEntries[right].ID
	})
	for _, entry := range orderedEntries {
		if entry.Leaf != nil && entry.Leaf.AuthoredExpression == "" {
			continue
		}
		allocator.paths[entry.ID] = allocator.allocatePath(parentPath + "__" + sanitizedPathName(entry.Name))
	}
	for _, entry := range orderedEntries {
		if entry.Parent != nil {
			allocator.allocateDictionaryEntries(allocator.paths[entry.ID], entry.Parent.Children)
		}
	}
}

func (allocator *pathAllocator) allocateCandidates(candidates []pathCandidate) {
	sortPathCandidates(candidates)
	for _, candidate := range candidates {
		allocator.paths[candidate.id] = allocator.allocatePath(candidate.base)
	}
}

func (allocator *pathAllocator) allocatePath(base string) string {
	for suffix := 1; ; suffix++ {
		path := pathWithSuffix(base, suffix)
		if _, used := allocator.used[path]; used {
			continue
		}
		allocator.used[path] = struct{}{}
		return path
	}
}

func pathWithSuffix(base string, suffix int) string {
	if suffix == 1 {
		return base
	}
	return fmt.Sprintf("%s_%d", base, suffix)
}

func sectionName(
	sectionID string,
	callables map[string]aggregate.Callable,
	dictionaries map[string]aggregate.ParameterDictionary,
	lists map[string]aggregate.List,
) string {
	if callable, exists := callables[sectionID]; exists {
		return callable.Name
	}
	if dictionary, exists := dictionaries[sectionID]; exists {
		return dictionary.Name
	}
	return lists[sectionID].Name
}

func sortPathCandidates(candidates []pathCandidate) {
	sort.Slice(candidates, func(left int, right int) bool {
		return candidates[left].id < candidates[right].id
	})
}

func sanitizedPathName(value string) string {
	var builder strings.Builder
	for _, character := range strings.TrimSpace(value) {
		if character == '_' || unicode.IsLetter(character) || unicode.IsDigit(character) {
			builder.WriteRune(character)
			continue
		}
		builder.WriteByte('_')
	}
	if builder.Len() == 0 {
		return "_"
	}
	path := builder.String()
	first, _ := utf8.DecodeRuneInString(path)
	if unicode.IsDigit(first) {
		path = "_" + path
	}
	for _, keyword := range aggregate.PythonKeywords() {
		if path == keyword {
			return "_" + path
		}
	}
	return path
}

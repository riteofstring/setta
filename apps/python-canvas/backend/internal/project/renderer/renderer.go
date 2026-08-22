// Package renderer compiles one validated authored project into its complete
// deterministic Python document and renderer-owned semantic coordinates.
package renderer

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

const (
	generatedCodeSeparator = "\n\n"
	stateClassHeader       = "class SettaState:\n    def __init__(state):\n"
	stateBodyIndent        = "        "
)

// ByteRange is a half-open UTF-8 byte range in a rendered document.
type ByteRange struct {
	Start int
	End   int
}

// CallPosition locates the complete rendered call so a provider can request
// signature help immediately inside its opening parenthesis.
type CallPosition struct {
	Offset int
	End    int
}

// Result is the immutable rendering of one complete authored aggregate.
type Result struct {
	Code string
	Body string

	PrefixRange        ByteRange
	GeneratedBodyRange ByteRange
	SuffixRange        ByteRange

	// SourceRangesByTargetID contains only authored expression targets. It is
	// intentionally separate from generated composition ranges so diagnostics
	// on a dict/list composition stay in Generated Python.
	SourceRangesByTargetID      map[string]ByteRange
	CompositionRangesByTargetID map[string]ByteRange
	CallableCallPositionsByID   map[string]CallPosition
}

// Render accepts one complete validated aggregate and has no filesystem, LSP,
// process, HTTP, or UI dependency.
func Render(state aggregate.State) (Result, error) {
	if err := state.Validate(); err != nil {
		return Result{}, fmt.Errorf("render validated project: %w", err)
	}
	body, ranges, compositions, callPositions := renderBody(state)
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
	}, nil
}

func offsetRanges(ranges map[string]ByteRange, offset int) {
	for targetID, sourceRange := range ranges {
		sourceRange.Start += offset
		sourceRange.End += offset
		ranges[targetID] = sourceRange
	}
}

func renderBody(state aggregate.State) (string, map[string]ByteRange, map[string]ByteRange, map[string]CallPosition) {
	renderer := newForestRenderer(state)
	renderer.body.WriteString(stateClassHeader)
	for _, sectionID := range state.TopLevelSectionIDs {
		renderer.renderSection(sectionID, renderer.topLevelPaths[sectionID])
	}
	if !renderer.wroteStatement {
		renderer.body.WriteString(stateBodyIndent)
		renderer.body.WriteString("pass")
	}
	return renderer.body.String(), renderer.sourceRanges, renderer.compositionRanges, renderer.callPositions
}

type forestRenderer struct {
	body              strings.Builder
	wroteStatement    bool
	sourceRanges      map[string]ByteRange
	compositionRanges map[string]ByteRange
	callPositions     map[string]CallPosition
	topLevelPaths     map[string]string
	callables         map[string]aggregate.Callable
	dictionaries      map[string]aggregate.ParameterDictionary
	lists             map[string]aggregate.List
}

func newForestRenderer(state aggregate.State) *forestRenderer {
	callables := make(map[string]aggregate.Callable, len(state.Callables))
	for _, callable := range state.Callables {
		callables[callable.ID] = callable
	}
	dictionaries := make(map[string]aggregate.ParameterDictionary, len(state.ParameterDictionaries))
	for _, dictionary := range state.ParameterDictionaries {
		dictionaries[dictionary.ID] = dictionary
	}
	lists := make(map[string]aggregate.List, len(state.Lists))
	for _, list := range state.Lists {
		lists[list.ID] = list
	}
	return &forestRenderer{
		sourceRanges:      make(map[string]ByteRange),
		compositionRanges: make(map[string]ByteRange),
		callPositions:     make(map[string]CallPosition),
		topLevelPaths:     allocateTopLevelPaths(state, callables, dictionaries, lists),
		callables:         callables,
		dictionaries:      dictionaries,
		lists:             lists,
	}
}

func (renderer *forestRenderer) renderSection(sectionID string, path string) {
	if callable, exists := renderer.callables[sectionID]; exists {
		renderer.renderCallable(callable, path)
		return
	}
	if dictionary, exists := renderer.dictionaries[sectionID]; exists {
		renderer.renderDictionary(dictionary, path)
		return
	}
	renderer.renderList(renderer.lists[sectionID], path)
}

func (renderer *forestRenderer) renderCallable(callable aggregate.Callable, path string) {
	renderedParameters := make([]renderedParameter, 0, len(callable.Parameters))
	for _, parameter := range callable.Parameters {
		if !isRenderedParameter(parameter) {
			continue
		}
		parameterPath := path + "__" + parameter.Name
		renderedParameters = append(renderedParameters, renderedParameter{parameter: parameter, path: parameterPath})
		start := renderer.writeAssignmentPrefix(parameterPath)
		renderer.body.WriteString(parameter.AuthoredExpression)
		renderer.sourceRanges[parameter.ID] = ByteRange{Start: start, End: renderer.body.Len()}
	}

	start := renderer.writeAssignmentPrefix(path)
	if callable.AuthoredExpression == "" {
		renderer.body.WriteString("None")
		return
	}
	renderer.body.WriteString(callable.AuthoredExpression)
	renderer.sourceRanges[callable.ID] = ByteRange{Start: start, End: start + len(callable.AuthoredExpression)}
	renderer.body.WriteByte('(')
	callOffset := renderer.body.Len()
	renderer.body.WriteString(renderCallArguments(renderedParameters))
	renderer.body.WriteByte(')')
	renderer.callPositions[callable.ID] = CallPosition{Offset: callOffset, End: renderer.body.Len()}
}

func (renderer *forestRenderer) renderDictionary(dictionary aggregate.ParameterDictionary, path string) {
	items := renderer.renderDictionaryEntries(path, dictionary.Entries)
	start := renderer.writeAssignmentPrefix(path)
	renderer.writeDictionary(items)
	renderer.compositionRanges[dictionary.ID] = ByteRange{Start: start, End: renderer.body.Len()}
}

type renderedDictionaryItem struct {
	name string
	path string
}

func (renderer *forestRenderer) renderDictionaryEntries(path string, entries []aggregate.DictionaryEntry) []renderedDictionaryItem {
	paths := allocateDictionaryEntryPaths(path, entries)
	items := make([]renderedDictionaryItem, 0, len(entries))
	for _, entry := range entries {
		entryPath := paths[entry.ID]
		if entry.Leaf != nil {
			if entry.Leaf.AuthoredExpression == "" {
				continue
			}
			start := renderer.writeAssignmentPrefix(entryPath)
			renderer.body.WriteString(entry.Leaf.AuthoredExpression)
			renderer.sourceRanges[entry.ID] = ByteRange{Start: start, End: renderer.body.Len()}
			items = append(items, renderedDictionaryItem{name: entry.Name, path: entryPath})
			continue
		}
		children := renderer.renderDictionaryEntries(entryPath, entry.Parent.Children)
		start := renderer.writeAssignmentPrefix(entryPath)
		renderer.writeDictionary(children)
		renderer.compositionRanges[entry.ID] = ByteRange{Start: start, End: renderer.body.Len()}
		items = append(items, renderedDictionaryItem{name: entry.Name, path: entryPath})
	}
	return items
}

func (renderer *forestRenderer) writeDictionary(items []renderedDictionaryItem) {
	renderer.body.WriteByte('{')
	for index, item := range items {
		if index > 0 {
			renderer.body.WriteString(", ")
		}
		renderer.body.WriteString(strconv.Quote(item.name))
		renderer.body.WriteString(": state.")
		renderer.body.WriteString(item.path)
	}
	renderer.body.WriteByte('}')
}

func (renderer *forestRenderer) renderList(list aggregate.List, path string) {
	for index, childID := range list.ChildSectionIDs {
		renderer.renderSection(childID, fmt.Sprintf("%s__%d", path, index))
	}
	start := renderer.writeAssignmentPrefix(path)
	renderer.body.WriteByte('[')
	for index := range list.ChildSectionIDs {
		if index > 0 {
			renderer.body.WriteString(", ")
		}
		renderer.body.WriteString("state.")
		renderer.body.WriteString(fmt.Sprintf("%s__%d", path, index))
	}
	renderer.body.WriteByte(']')
	renderer.compositionRanges[list.ID] = ByteRange{Start: start, End: renderer.body.Len()}
}

func (renderer *forestRenderer) writeAssignmentPrefix(path string) int {
	if renderer.wroteStatement {
		renderer.body.WriteByte('\n')
	}
	renderer.wroteStatement = true
	renderer.body.WriteString(stateBodyIndent)
	renderer.body.WriteString("state.")
	renderer.body.WriteString(path)
	renderer.body.WriteString(" = ")
	return renderer.body.Len()
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

func renderCallArguments(parameters []renderedParameter) string {
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
	return strings.Join(arguments, ", ")
}

type pathCandidate struct {
	id   string
	base string
}

func allocateTopLevelPaths(
	state aggregate.State,
	callables map[string]aggregate.Callable,
	dictionaries map[string]aggregate.ParameterDictionary,
	lists map[string]aggregate.List,
) map[string]string {
	candidates := make([]pathCandidate, 0, len(state.TopLevelSectionIDs))
	for _, sectionID := range state.TopLevelSectionIDs {
		candidates = append(candidates, pathCandidate{id: sectionID, base: sanitizedPathName(sectionName(sectionID, callables, dictionaries, lists))})
	}
	return allocatePaths(candidates)
}

func allocateDictionaryEntryPaths(parentPath string, entries []aggregate.DictionaryEntry) map[string]string {
	candidates := make([]pathCandidate, 0, len(entries))
	for _, entry := range entries {
		candidates = append(candidates, pathCandidate{id: entry.ID, base: parentPath + "__" + sanitizedPathName(entry.Name)})
	}
	return allocatePaths(candidates)
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

// allocatePaths keeps names human-readable and assigns collision suffixes by
// stable ID, independent of the authored rendering order.
func allocatePaths(candidates []pathCandidate) map[string]string {
	sort.Slice(candidates, func(left int, right int) bool {
		return candidates[left].id < candidates[right].id
	})
	paths := make(map[string]string, len(candidates))
	used := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		path := candidate.base
		for suffix := 2; ; suffix++ {
			if _, exists := used[path]; !exists {
				break
			}
			path = fmt.Sprintf("%s_%d", candidate.base, suffix)
		}
		used[path] = struct{}{}
		paths[candidate.id] = path
	}
	return paths
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

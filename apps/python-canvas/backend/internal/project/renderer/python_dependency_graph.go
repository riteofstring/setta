package renderer

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

// TargetPaths allocates the exact generated paths renderer will use for a
// validated aggregate. The returned map is independent of the caller.
func TargetPaths(state aggregate.State) (map[string]string, error) {
	if err := state.Validate(); err != nil {
		return nil, fmt.Errorf("allocate target paths for validated project: %w", err)
	}
	sections := newSectionIndex(state)
	return cloneTargetPaths(allocateForestPaths(state, sections.callables, sections.dictionaries, sections.lists)), nil
}

type sectionIndex struct {
	callables    map[string]aggregate.Callable
	dictionaries map[string]aggregate.ParameterDictionary
	lists        map[string]aggregate.List
}

func newSectionIndex(state aggregate.State) sectionIndex {
	sections := sectionIndex{
		callables:    make(map[string]aggregate.Callable, len(state.Callables)),
		dictionaries: make(map[string]aggregate.ParameterDictionary, len(state.ParameterDictionaries)),
		lists:        make(map[string]aggregate.List, len(state.Lists)),
	}
	for _, callable := range state.Callables {
		sections.callables[callable.ID] = callable
	}
	for _, dictionary := range state.ParameterDictionaries {
		sections.dictionaries[dictionary.ID] = dictionary
	}
	for _, list := range state.Lists {
		sections.lists[list.ID] = list
	}
	return sections
}

func cloneTargetPaths(paths map[string]string) map[string]string {
	cloned := make(map[string]string, len(paths))
	for targetID, path := range paths {
		cloned[targetID] = path
	}
	return cloned
}

type assignmentNodeKind uint8

const (
	assignmentExpression assignmentNodeKind = iota
	assignmentCallable
	assignmentCollection
)

// assignmentNode is one emitted state assignment. Dependencies point from the
// consumer node to every assignment that must run before it.
type assignmentNode struct {
	targetID        string
	path            string
	kind            assignmentNodeKind
	expression      string
	collectionOpen  string
	collectionClose string
	collectionItems []string
	dependencies    []assignmentDependency
}

type assignmentDependency struct {
	targetID   string
	expression bool
}

func (node *assignmentNode) addDependency(targetID string, expression bool) {
	if targetID == "" {
		return
	}
	for index := range node.dependencies {
		if node.dependencies[index].targetID != targetID {
			continue
		}
		node.dependencies[index].expression = node.dependencies[index].expression || expression
		return
	}
	node.dependencies = append(node.dependencies, assignmentDependency{
		targetID:   targetID,
		expression: expression,
	})
}

func (node *assignmentNode) hasAuthoredExpression() bool {
	return node.expression != "" && (node.kind == assignmentExpression || node.kind == assignmentCallable)
}

type assignmentGraph struct {
	paths            map[string]string
	pathsToTargetIDs map[string]string
	nodes            map[string]*assignmentNode
	nodeOrder        []string
	cycleTargetIDs   []string
}

func buildAssignmentGraph(state aggregate.State) (*assignmentGraph, error) {
	sections := newSectionIndex(state)
	graph := &assignmentGraph{
		paths:            allocateForestPaths(state, sections.callables, sections.dictionaries, sections.lists),
		pathsToTargetIDs: make(map[string]string),
		nodes:            make(map[string]*assignmentNode),
		nodeOrder:        []string{},
	}
	builder := assignmentGraphBuilder{graph: graph, sections: sections}
	for _, sectionID := range state.TopLevelSectionIDs {
		builder.buildSection(sectionID)
	}
	for _, targetID := range graph.nodeOrder {
		node := graph.nodes[targetID]
		graph.pathsToTargetIDs[node.path] = targetID
	}
	if err := graph.resolveExpressionReferences(); err != nil {
		return nil, err
	}
	graph.cycleTargetIDs = graph.findCycleTargetIDs()
	return graph, nil
}

type assignmentGraphBuilder struct {
	graph    *assignmentGraph
	sections sectionIndex
}

func (builder *assignmentGraphBuilder) buildSection(sectionID string) {
	if callable, exists := builder.sections.callables[sectionID]; exists {
		builder.buildCallable(callable)
		return
	}
	if dictionary, exists := builder.sections.dictionaries[sectionID]; exists {
		builder.buildDictionary(dictionary)
		return
	}
	builder.buildList(builder.sections.lists[sectionID])
}

func (builder *assignmentGraphBuilder) buildCallable(callable aggregate.Callable) {
	if _, exists := builder.graph.nodes[callable.ID]; exists {
		return
	}

	parameters := make([]renderedParameter, 0, len(callable.Parameters))
	parameterIDs := make([]string, 0, len(callable.Parameters))
	for _, parameter := range callable.Parameters {
		if !isRenderedParameter(parameter) {
			continue
		}
		path := builder.graph.paths[parameter.ID]
		builder.addNode(&assignmentNode{
			targetID:   parameter.ID,
			path:       path,
			kind:       assignmentExpression,
			expression: parameter.AuthoredExpression,
		})
		parameters = append(parameters, renderedParameter{parameter: parameter, path: path})
		parameterIDs = append(parameterIDs, parameter.ID)
	}

	node := builder.addNode(&assignmentNode{
		targetID:        callable.ID,
		path:            builder.graph.paths[callable.ID],
		kind:            assignmentCallable,
		expression:      callable.AuthoredExpression,
		collectionOpen:  callable.AuthoredExpression + "(",
		collectionClose: ")",
		collectionItems: renderCallArgumentItems(parameters),
	})
	for _, parameterID := range parameterIDs {
		node.addDependency(parameterID, false)
	}
}

func (builder *assignmentGraphBuilder) buildDictionary(dictionary aggregate.ParameterDictionary) {
	if _, exists := builder.graph.nodes[dictionary.ID]; exists {
		return
	}
	items := builder.buildDictionaryEntries(dictionary.Entries)
	node := builder.addNode(newDictionaryAssignmentNode(dictionary.ID, builder.graph.paths[dictionary.ID], items))
	for _, item := range items {
		node.addDependency(item.targetID, false)
	}
}

type dictionaryAssignmentItem struct {
	targetID string
	name     string
	path     string
}

func (builder *assignmentGraphBuilder) buildDictionaryEntries(entries []aggregate.DictionaryEntry) []dictionaryAssignmentItem {
	items := make([]dictionaryAssignmentItem, 0, len(entries))
	for _, entry := range entries {
		path := builder.graph.paths[entry.ID]
		if entry.Leaf != nil {
			if entry.Leaf.AuthoredExpression == "" {
				continue
			}
			builder.addNode(&assignmentNode{
				targetID:   entry.ID,
				path:       path,
				kind:       assignmentExpression,
				expression: entry.Leaf.AuthoredExpression,
			})
			items = append(items, dictionaryAssignmentItem{targetID: entry.ID, name: entry.Name, path: path})
			continue
		}

		children := builder.buildDictionaryEntries(entry.Parent.Children)
		node := builder.addNode(newDictionaryAssignmentNode(entry.ID, path, children))
		for _, child := range children {
			node.addDependency(child.targetID, false)
		}
		items = append(items, dictionaryAssignmentItem{targetID: entry.ID, name: entry.Name, path: path})
	}
	return items
}

func newDictionaryAssignmentNode(targetID string, path string, items []dictionaryAssignmentItem) *assignmentNode {
	renderedItems := make([]string, 0, len(items))
	for _, item := range items {
		renderedItems = append(renderedItems, strconv.Quote(item.name)+": state."+item.path)
	}
	return &assignmentNode{
		targetID:        targetID,
		path:            path,
		kind:            assignmentCollection,
		collectionOpen:  "{",
		collectionClose: "}",
		collectionItems: renderedItems,
	}
}

func (builder *assignmentGraphBuilder) buildList(list aggregate.List) {
	if _, exists := builder.graph.nodes[list.ID]; exists {
		return
	}
	for _, childID := range list.ChildSectionIDs {
		builder.buildSection(childID)
	}
	items := make([]string, 0, len(list.ChildSectionIDs))
	for _, childID := range list.ChildSectionIDs {
		items = append(items, "state."+builder.graph.paths[childID])
	}
	node := builder.addNode(&assignmentNode{
		targetID:        list.ID,
		path:            builder.graph.paths[list.ID],
		kind:            assignmentCollection,
		collectionOpen:  "[",
		collectionClose: "]",
		collectionItems: items,
	})
	for _, childID := range list.ChildSectionIDs {
		node.addDependency(childID, false)
	}
}

func (builder *assignmentGraphBuilder) addNode(node *assignmentNode) *assignmentNode {
	if existing, exists := builder.graph.nodes[node.targetID]; exists {
		return existing
	}
	builder.graph.nodes[node.targetID] = node
	builder.graph.nodeOrder = append(builder.graph.nodeOrder, node.targetID)
	return node
}

func (graph *assignmentGraph) resolveExpressionReferences() error {
	for _, targetID := range graph.nodeOrder {
		node := graph.nodes[targetID]
		if !node.hasAuthoredExpression() {
			continue
		}
		references, err := findPythonStateReferences(node.expression)
		if err != nil {
			return fmt.Errorf("parse expression for %q: %w", targetID, err)
		}
		for _, reference := range references {
			dependencyID, exists := graph.pathsToTargetIDs[reference.Path]
			if !exists {
				continue
			}
			node.addDependency(dependencyID, true)
		}
	}
	return nil
}

// stableDependencyOrder preserves the existing structural post-order for
// unrelated nodes while putting every resolved dependency before its consumer.
// A back edge is skipped at traversal time so a cyclic project remains
// renderable and deterministic for inspection.
func (graph *assignmentGraph) stableDependencyOrder() []string {
	ordered := make([]string, 0, len(graph.nodeOrder))
	emitted := make(map[string]struct{}, len(graph.nodeOrder))
	active := make(map[string]struct{}, len(graph.nodeOrder))
	var visit func(string)
	visit = func(targetID string) {
		if _, done := emitted[targetID]; done {
			return
		}
		if _, visiting := active[targetID]; visiting {
			return
		}
		node, exists := graph.nodes[targetID]
		if !exists {
			return
		}
		active[targetID] = struct{}{}
		for _, dependency := range node.dependencies {
			visit(dependency.targetID)
		}
		delete(active, targetID)
		emitted[targetID] = struct{}{}
		ordered = append(ordered, targetID)
	}
	for _, targetID := range graph.nodeOrder {
		visit(targetID)
	}
	return ordered
}

func (graph *assignmentGraph) findCycleTargetIDs() []string {
	indices := make(map[string]int, len(graph.nodeOrder))
	lowLinks := make(map[string]int, len(graph.nodeOrder))
	onStack := make(map[string]bool, len(graph.nodeOrder))
	componentByTargetID := make(map[string]int, len(graph.nodeOrder))
	componentSizes := []int{}
	stack := []string{}
	nextIndex := 0

	var visit func(string)
	visit = func(targetID string) {
		indices[targetID] = nextIndex
		lowLinks[targetID] = nextIndex
		nextIndex++
		stack = append(stack, targetID)
		onStack[targetID] = true

		for _, dependency := range graph.nodes[targetID].dependencies {
			if _, exists := graph.nodes[dependency.targetID]; !exists {
				continue
			}
			if _, visited := indices[dependency.targetID]; !visited {
				visit(dependency.targetID)
				if lowLinks[dependency.targetID] < lowLinks[targetID] {
					lowLinks[targetID] = lowLinks[dependency.targetID]
				}
				continue
			}
			if onStack[dependency.targetID] && indices[dependency.targetID] < lowLinks[targetID] {
				lowLinks[targetID] = indices[dependency.targetID]
			}
		}

		if lowLinks[targetID] != indices[targetID] {
			return
		}
		componentID := len(componentSizes)
		size := 0
		for {
			last := len(stack) - 1
			member := stack[last]
			stack = stack[:last]
			onStack[member] = false
			componentByTargetID[member] = componentID
			size++
			if member == targetID {
				break
			}
		}
		componentSizes = append(componentSizes, size)
	}

	for _, targetID := range graph.nodeOrder {
		if _, visited := indices[targetID]; !visited {
			visit(targetID)
		}
	}

	cycleTargets := make(map[string]struct{})
	for _, targetID := range graph.nodeOrder {
		node := graph.nodes[targetID]
		for _, dependency := range node.dependencies {
			if !dependency.expression || componentByTargetID[targetID] != componentByTargetID[dependency.targetID] {
				continue
			}
			componentID := componentByTargetID[targetID]
			if componentSizes[componentID] > 1 || targetID == dependency.targetID {
				cycleTargets[targetID] = struct{}{}
			}
		}
	}

	ordered := make([]string, 0, len(cycleTargets))
	for _, targetID := range graph.nodeOrder {
		if _, exists := cycleTargets[targetID]; exists {
			ordered = append(ordered, targetID)
		}
	}
	return ordered
}

func renderGraphBody(graph *assignmentGraph) (string, map[string]ByteRange, map[string]ByteRange, map[string]CallPosition) {
	emitter := assignmentEmitter{
		sourceRanges:      make(map[string]ByteRange),
		compositionRanges: make(map[string]ByteRange),
		callPositions:     make(map[string]CallPosition),
	}
	emitter.body.WriteString(stateClassHeader)
	for _, targetID := range graph.stableDependencyOrder() {
		emitter.emit(graph.nodes[targetID])
	}
	if !emitter.wroteStatement {
		emitter.body.WriteString(stateBodyIndent)
		emitter.body.WriteString("pass")
	}
	return emitter.body.String(), emitter.sourceRanges, emitter.compositionRanges, emitter.callPositions
}

type assignmentEmitter struct {
	body              strings.Builder
	wroteStatement    bool
	sourceRanges      map[string]ByteRange
	compositionRanges map[string]ByteRange
	callPositions     map[string]CallPosition
}

func (emitter *assignmentEmitter) emit(node *assignmentNode) {
	start := emitter.writeAssignmentPrefix(node.path)
	switch node.kind {
	case assignmentExpression:
		emitter.body.WriteString(node.expression)
		emitter.sourceRanges[node.targetID] = ByteRange{Start: start, End: emitter.body.Len()}
	case assignmentCallable:
		if node.expression == "" {
			emitter.body.WriteString("None")
			return
		}
		emitter.sourceRanges[node.targetID] = ByteRange{Start: start, End: start + len(node.expression)}
		callOffset := start + len(node.expression) + 1
		emitter.writeCollection(node.collectionOpen, node.collectionClose, node.collectionItems)
		emitter.callPositions[node.targetID] = CallPosition{Offset: callOffset, End: emitter.body.Len()}
	case assignmentCollection:
		emitter.writeCollection(node.collectionOpen, node.collectionClose, node.collectionItems)
		emitter.compositionRanges[node.targetID] = ByteRange{Start: start, End: emitter.body.Len()}
	}
}

func (emitter *assignmentEmitter) writeAssignmentPrefix(path string) int {
	if emitter.wroteStatement {
		emitter.body.WriteByte('\n')
	}
	emitter.wroteStatement = true
	emitter.body.WriteString(stateBodyIndent)
	emitter.body.WriteString("state.")
	emitter.body.WriteString(path)
	emitter.body.WriteString(" = ")
	return emitter.body.Len()
}

func (emitter *assignmentEmitter) writeCollection(opening string, closing string, items []string) {
	inline := opening + strings.Join(items, ", ") + closing
	if !shouldMultilineCollection(items, inline) {
		emitter.body.WriteString(inline)
		return
	}
	emitter.body.WriteString(opening)
	for _, item := range items {
		emitter.body.WriteByte('\n')
		emitter.body.WriteString(collectionContinuationIndent)
		emitter.body.WriteString(item)
		emitter.body.WriteByte(',')
	}
	emitter.body.WriteByte('\n')
	emitter.body.WriteString(stateBodyIndent)
	emitter.body.WriteString(closing)
}

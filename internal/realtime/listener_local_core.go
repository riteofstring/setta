package realtime

import (
	"fmt"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
)

func BuildListenerRealtimeDependencyValuesFromCatalog(
	catalog ListenerDependencyCatalog,
	currentDependencyValues ListenerRenderedDependencyValues,
	deltas []ListenerRealtimeDelta,
) (ListenerRenderedDependencyValues, error) {
	graph, err := buildListenerDependencyGraphFromRealtimeCatalog(catalog)
	if err != nil {
		return ListenerRenderedDependencyValues{}, err
	}
	currentValuesByKey, err := realtimeCurrentDependencyValues(currentDependencyValues)
	if err != nil {
		return ListenerRenderedDependencyValues{}, err
	}
	values, err := buildListenerRealtimeDependencyValuesFromMetadataGraph(
		graph,
		currentValuesByKey,
		deltas,
	)
	if err != nil {
		return ListenerRenderedDependencyValues{}, err
	}
	if values == nil {
		return ListenerRenderedDependencyValues{}, nil
	}
	return *values, nil
}

func buildListenerDependencyGraphFromRealtimeCatalog(
	catalog ListenerDependencyCatalog,
) (*codegen.PythonDependencyGraph, error) {
	graph := &codegen.PythonDependencyGraph{
		Nodes:             map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{},
		NodeOrder:         make([]codegen.PythonDependencyKey, 0, len(catalog.Entries)),
		FullPathNameToKey: map[string]codegen.PythonDependencyKey{},
		PotentialRefs:     map[codegen.PythonDependencyKey]map[string][]int{},
		PasswordSecrets:   map[string]string{},
	}
	for _, entry := range catalog.Entries {
		key, ok := listenerDependencyGraphKey(entry.DependencyKey)
		if !ok {
			return nil, fmt.Errorf("listener local core: invalid dependency key %q", entry.DependencyKey)
		}
		deps := map[codegen.PythonDependencyKey]bool{}
		depOrder := make([]codegen.PythonDependencyKey, 0, len(entry.Dependencies))
		for _, dependency := range entry.Dependencies {
			dependencyKey, ok := listenerDependencyGraphKey(dependency)
			if !ok {
				return nil, fmt.Errorf(
					"listener local core: invalid dependency %q for %q",
					dependency,
					entry.DependencyKey,
				)
			}
			deps[dependencyKey] = true
			depOrder = append(depOrder, dependencyKey)
		}
		base := codegen.PythonDependencyNodeBase{
			ID:               entry.DependencyKey,
			Name:             strings.TrimSpace(entry.Name),
			FullPathName:     strings.TrimSpace(entry.FullPathName),
			Deps:             deps,
			DepOrder:         depOrder,
			IncludeInCodegen: entry.IncludeInCodegen,
		}
		node, err := buildRealtimeCatalogDependencyNode(entry, base)
		if err != nil {
			return nil, err
		}
		graph.Nodes[key] = node
		graph.NodeOrder = append(graph.NodeOrder, key)
		if base.FullPathName != "" {
			graph.FullPathNameToKey[base.FullPathName] = key
		}
	}
	return graph, nil
}

func buildRealtimeCatalogDependencyNode(
	entry ListenerDependencyCatalogEntry,
	base codegen.PythonDependencyNodeBase,
) (codegen.PythonDependencyNode, error) {
	hasSectionType := strings.TrimSpace(entry.SectionType) != ""
	hasCodeObjType := strings.TrimSpace(entry.CodeObjType) != ""
	switch {
	case hasSectionType && hasCodeObjType:
		return nil, fmt.Errorf(
			"listener local core: dependency %q cannot declare both sectionType and codeObjType",
			entry.DependencyKey,
		)
	case hasCodeObjType:
		return &codegen.PythonParamNode{
			PythonDependencyNodeBase: base,
			CodeObjectType:           strings.TrimSpace(entry.CodeObjType),
			PassingStyle:             strings.TrimSpace(entry.PassingStyle),
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationMode(
				strings.TrimSpace(entry.ValueRepresentation),
			),
		}, nil
	case hasSectionType:
		return &codegen.PythonSectionNode{
			PythonDependencyNodeBase: base,
			SectionType:              strings.TrimSpace(entry.SectionType),
			Representation: projectstate.PythonSectionRepresentationMode(
				strings.TrimSpace(entry.SectionRepresentation),
			),
			ControlCodeObjID:   strings.TrimSpace(entry.ControlCodeObjID),
			ControlCodeObjType: strings.TrimSpace(entry.ControlCodeObjType),
			ControlValueRepresentation: projectstate.PythonCodeObjValueRepresentationMode(
				strings.TrimSpace(entry.ControlValueRepresentation),
			),
		}, nil
	default:
		return nil, fmt.Errorf(
			"listener local core: dependency %q is missing sectionType/codeObjType metadata",
			entry.DependencyKey,
		)
	}
}

func realtimeCurrentDependencyValues(
	values ListenerRenderedDependencyValues,
) (map[codegen.PythonDependencyKey]string, error) {
	rendered := map[codegen.PythonDependencyKey]string{}
	for _, entry := range values.Entries {
		key, ok := listenerDependencyGraphKey(entry.DependencyKey)
		if !ok {
			return nil, fmt.Errorf(
				"listener local core: invalid current dependency key %q",
				entry.DependencyKey,
			)
		}
		rendered[key] = entry.RenderedValue
	}
	return rendered, nil
}

func buildListenerRealtimeDependencyValuesFromMetadataGraph(
	graph *codegen.PythonDependencyGraph,
	currentValues map[codegen.PythonDependencyKey]string,
	deltas []ListenerRealtimeDelta,
) (*ListenerRenderedDependencyValues, error) {
	if graph == nil || len(deltas) == 0 {
		return nil, nil
	}

	overrideExpressions := map[codegen.PythonDependencyKey]string{}
	dirtyKeys := map[codegen.PythonDependencyKey]struct{}{}
	for _, delta := range deltas {
		key, ok := listenerDependencyGraphKey(delta.Dependency)
		if !ok {
			continue
		}
		expression, ok := renderRealtimeDeltaExpression(graph, key, delta)
		if !ok {
			continue
		}
		overrideExpressions[key] = expression
		dirtyKeys[key] = struct{}{}
	}
	if len(dirtyKeys) == 0 {
		return nil, nil
	}

	affectedKeys := buildRealtimeAffectedDependencyKeys(graph, dirtyKeys)
	builder := metadataRenderedListenerValueBuilder{
		graph:     graph,
		overrides: overrideExpressions,
		current:   currentValues,
		affected:  affectedKeys,
		rendered:  map[codegen.PythonDependencyKey]renderedListenerValue{},
		visiting:  map[codegen.PythonDependencyKey]struct{}{},
	}
	entries := make([]ListenerRenderedDependencyValue, 0, len(affectedKeys))
	for _, key := range buildSortedRealtimeDependencyKeys(graph) {
		if _, ok := affectedKeys[key]; !ok {
			continue
		}
		renderedValue, ok := builder.render(key)
		if !ok {
			continue
		}
		entries = append(entries, ListenerRenderedDependencyValue{
			DependencyKey: canonicalRealtimeDependencyKey(key),
			RenderedValue: renderedValue,
		})
	}
	if len(entries) == 0 {
		return nil, nil
	}

	return &ListenerRenderedDependencyValues{Entries: entries}, nil
}

type metadataRenderedListenerValueBuilder struct {
	graph     *codegen.PythonDependencyGraph
	overrides map[codegen.PythonDependencyKey]string
	current   map[codegen.PythonDependencyKey]string
	affected  map[codegen.PythonDependencyKey]struct{}
	rendered  map[codegen.PythonDependencyKey]renderedListenerValue
	visiting  map[codegen.PythonDependencyKey]struct{}
}

func (b *metadataRenderedListenerValueBuilder) render(key codegen.PythonDependencyKey) (string, bool) {
	if renderedValue, ok := b.rendered[key]; ok {
		return renderedValue.value, renderedValue.ok
	}
	if immediate, ok := b.resolveImmediateValue(key); ok {
		return b.cacheRenderedValue(key, immediate)
	}
	node, done, ok := b.beginNodeRender(key)
	if !ok {
		return b.cacheRenderedValue(key, renderedListenerValue{})
	}
	defer done()

	childValues, ok := b.renderChildValues(node)
	if !ok {
		return b.cacheRenderedValue(key, renderedListenerValue{})
	}
	renderedValue, ok := b.formatNodeValue(node, childValues)
	if !ok {
		return b.cacheRenderedValue(key, renderedListenerValue{})
	}
	return b.cacheRenderedValue(
		key,
		renderedListenerValue{
			value: renderedValue,
			ok:    true,
		},
	)
}

func (b *metadataRenderedListenerValueBuilder) resolveImmediateValue(
	key codegen.PythonDependencyKey,
) (renderedListenerValue, bool) {
	if override, ok := b.overrides[key]; ok {
		return renderedListenerValue{
			value: override,
			ok:    true,
		}, true
	}
	if _, ok := b.affected[key]; ok {
		return renderedListenerValue{}, false
	}
	current, ok := b.current[key]
	return renderedListenerValue{
		value: current,
		ok:    ok,
	}, true
}

func (b *metadataRenderedListenerValueBuilder) beginNodeRender(
	key codegen.PythonDependencyKey,
) (codegen.PythonDependencyNode, func(), bool) {
	if b.graph == nil {
		return nil, nil, false
	}
	if _, ok := b.visiting[key]; ok {
		return nil, nil, false
	}
	node, ok := b.graph.Node(key)
	if !ok || !node.Base().IncludeInCodegen {
		return nil, nil, false
	}
	b.visiting[key] = struct{}{}
	return node, func() {
		delete(b.visiting, key)
	}, true
}

func (b *metadataRenderedListenerValueBuilder) renderChildValues(
	node codegen.PythonDependencyNode,
) (map[codegen.PythonDependencyKey]string, bool) {
	childValues := map[codegen.PythonDependencyKey]string{}
	for _, depKey := range orderedRealtimeDependencyKeys(node.Base().Deps, node.Base().DepOrder) {
		if !node.Base().Deps[depKey] {
			continue
		}
		renderedValue, ok := b.render(depKey)
		if !ok {
			return nil, false
		}
		childValues[depKey] = renderedValue
	}
	return childValues, true
}

func (b *metadataRenderedListenerValueBuilder) formatNodeValue(
	node codegen.PythonDependencyNode,
	childValues map[codegen.PythonDependencyKey]string,
) (string, bool) {
	codec := codegen.NewPythonValueCodec(
		b.graph,
		func(depKey codegen.PythonDependencyKey) string {
			return childValues[depKey]
		},
		codegen.PythonValueCodecOptions{
			Mode: codegen.PythonValueModeLiveRuntime,
		},
	)

	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		if typed.CodeObjectType == "PasswordParam" {
			return "", false
		}
		renderedValue, err := codec.FormatParamExpression(typed)
		if err != nil {
			return "", false
		}
		return renderedValue, true
	case *codegen.PythonSectionNode:
		if typed.SectionType == "MetaControl" && typed.ControlCodeObjType == "PasswordParam" {
			return "", false
		}
		renderedValue, handled, err := codec.FormatSection(typed)
		if err != nil || !handled {
			return "", false
		}
		return renderedValue, true
	default:
		return "", false
	}
}

func (b *metadataRenderedListenerValueBuilder) cacheRenderedValue(
	key codegen.PythonDependencyKey,
	value renderedListenerValue,
) (string, bool) {
	b.rendered[key] = value
	return value.value, value.ok
}

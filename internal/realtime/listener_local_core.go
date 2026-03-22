package realtime

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
)

func BuildListenerRealtimeDependencyValuesFromSDKContracts(
	catalog pythonsdkcontracts.ListenerDependencyCatalog,
	currentDependencyValues pythonsdkcontracts.ListenerRenderedDependencyValues,
	deltas []pythonsdkcontracts.LocalCoreListenerRealtimeDelta,
) (pythonsdkcontracts.ListenerRenderedDependencyValues, error) {
	realtimeCatalog := realtimeListenerDependencyCatalogFromContract(catalog)
	realtimeCurrentValues := realtimeListenerRenderedDependencyValuesFromContract(
		currentDependencyValues,
	)
	realtimeDeltas, err := realtimeDeltasFromSDKContracts(deltas)
	if err != nil {
		return pythonsdkcontracts.ListenerRenderedDependencyValues{}, err
	}
	values, err := BuildListenerRealtimeDependencyValuesFromCatalog(
		realtimeCatalog,
		realtimeCurrentValues,
		realtimeDeltas,
	)
	if err != nil {
		return pythonsdkcontracts.ListenerRenderedDependencyValues{}, err
	}
	return contractListenerRenderedDependencyValuesFromRealtime(values), nil
}

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

func realtimeDeltasFromSDKContracts(
	deltas []pythonsdkcontracts.LocalCoreListenerRealtimeDelta,
) ([]ListenerRealtimeDelta, error) {
	converted := make([]ListenerRealtimeDelta, 0, len(deltas))
	for _, delta := range deltas {
		next := ListenerRealtimeDelta{
			Dependency: delta.Dependency,
			Value:      append(json.RawMessage(nil), delta.Value...),
		}
		if delta.BinaryPayloadBase64 != nil {
			payload, err := base64.StdEncoding.DecodeString(
				strings.TrimSpace(*delta.BinaryPayloadBase64),
			)
			if err != nil {
				return nil, fmt.Errorf(
					"listener local core: decode binary payload for %q: %w",
					delta.Dependency,
					err,
				)
			}
			next.BinaryPayload = payload
		}
		converted = append(converted, next)
	}
	return converted, nil
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
	if override, ok := b.overrides[key]; ok {
		b.rendered[key] = renderedListenerValue{
			value: override,
			ok:    true,
		}
		return override, true
	}
	if _, ok := b.affected[key]; !ok {
		if current, ok := b.current[key]; ok {
			b.rendered[key] = renderedListenerValue{
				value: current,
				ok:    true,
			}
			return current, true
		}
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}
	if b.graph == nil {
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}
	if _, ok := b.visiting[key]; ok {
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}
	node, ok := b.graph.Node(key)
	if !ok || !node.Base().IncludeInCodegen {
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}

	b.visiting[key] = struct{}{}
	defer delete(b.visiting, key)

	childValues := map[codegen.PythonDependencyKey]string{}
	for _, depKey := range orderedRealtimeDependencyKeys(node.Base().Deps, node.Base().DepOrder) {
		if !node.Base().Deps[depKey] {
			continue
		}
		renderedValue, ok := b.render(depKey)
		if !ok {
			b.rendered[key] = renderedListenerValue{}
			return "", false
		}
		childValues[depKey] = renderedValue
	}

	codec := codegen.NewPythonValueCodec(
		b.graph,
		func(depKey codegen.PythonDependencyKey) string {
			return childValues[depKey]
		},
		codegen.PythonValueCodecOptions{
			Mode: codegen.PythonValueModeLiveRuntime,
		},
	)
	var (
		renderedValue string
		err           error
	)
	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		if typed.CodeObjectType == "PasswordParam" {
			b.rendered[key] = renderedListenerValue{}
			return "", false
		}
		renderedValue, err = codec.FormatParamExpression(typed)
	case *codegen.PythonSectionNode:
		if typed.SectionType == "MetaControl" && typed.ControlCodeObjType == "PasswordParam" {
			b.rendered[key] = renderedListenerValue{}
			return "", false
		}
		var handled bool
		renderedValue, handled, err = codec.FormatSection(typed)
		if !handled {
			b.rendered[key] = renderedListenerValue{}
			return "", false
		}
	default:
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}
	if err != nil {
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}

	b.rendered[key] = renderedListenerValue{
		value: renderedValue,
		ok:    true,
	}
	return renderedValue, true
}

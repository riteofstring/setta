package listenersnapshot

import (
	"encoding/json"
	"sort"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

type ListenerSnapshotPayload struct {
	ProjectState      json.RawMessage
	DependencyCatalog *realtime.ListenerDependencyCatalog
	DependencyValues  *realtime.ListenerRenderedDependencyValues
}

func BuildListenerSnapshotPayload(document projectstate.Document, projectID string) (ListenerSnapshotPayload, error) {
	projectStateView, err := projectview.SingleConfigByProjectID(document, projectID)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}
	projectStatePayload, err := json.Marshal(projectStateView)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}
	graph, err := buildListenerDependencyGraph(project)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}
	dependencyCatalog := buildListenerDependencyCatalogFromGraph(graph)
	dependencyValues := buildListenerRenderedDependencyValuesFromGraph(graph)

	return ListenerSnapshotPayload{
		ProjectState:      projectStatePayload,
		DependencyCatalog: dependencyCatalog,
		DependencyValues:  dependencyValues,
	}, nil
}

func BuildListenerDependencyCatalog(project projectstate.Project) (*realtime.ListenerDependencyCatalog, error) {
	graph, err := buildListenerDependencyGraph(project)
	if err != nil {
		return nil, err
	}
	return buildListenerDependencyCatalogFromGraph(graph), nil
}

func BuildListenerRenderedDependencyValues(project projectstate.Project) (*realtime.ListenerRenderedDependencyValues, error) {
	graph, err := buildListenerDependencyGraph(project)
	if err != nil {
		return nil, err
	}
	return buildListenerRenderedDependencyValuesFromGraph(graph), nil
}

func buildListenerDependencyGraph(project projectstate.Project) (*codegen.PythonDependencyGraph, error) {
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		return nil, err
	}
	return codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
}

func buildListenerDependencyCatalogFromGraph(graph *codegen.PythonDependencyGraph) *realtime.ListenerDependencyCatalog {
	keys := buildSortedListenerDependencyKeys(graph)
	entries := make([]realtime.ListenerDependencyCatalogEntry, 0, len(keys))
	for _, key := range keys {
		node, ok := graph.Node(key)
		if !ok {
			continue
		}
		entry := realtime.ListenerDependencyCatalogEntry{
			DependencyKey: canonicalListenerDependencyKey(key),
			Name:          strings.TrimSpace(node.Base().Name),
			FullPathName:  strings.TrimSpace(node.Base().FullPathName),
		}
		dependencies := orderedListenerDependencyKeys(node.Base().Deps, node.Base().DepOrder)
		if len(dependencies) > 0 {
			entry.Dependencies = make([]string, 0, len(dependencies))
			for _, depKey := range dependencies {
				if !node.Base().Deps[depKey] {
					continue
				}
				entry.Dependencies = append(
					entry.Dependencies,
					canonicalListenerDependencyKey(depKey),
				)
			}
		}
		switch typed := node.(type) {
		case *codegen.PythonSectionNode:
			entry.SectionType = strings.TrimSpace(typed.SectionType)
			entry.ControlCodeObjID = strings.TrimSpace(typed.ControlCodeObjID)
			entry.ControlCodeObjType = strings.TrimSpace(typed.ControlCodeObjType)
			entry.SectionRepresentation = strings.TrimSpace(string(typed.Representation))
			entry.ControlValueRepresentation = strings.TrimSpace(string(typed.ControlValueRepresentation))
		case *codegen.PythonParamNode:
			entry.CodeObjType = strings.TrimSpace(typed.CodeObjectType)
			entry.ValueRepresentation = strings.TrimSpace(string(typed.ValueRepresentation))
		}
		entries = append(entries, entry)
	}

	return &realtime.ListenerDependencyCatalog{Entries: entries}
}

func buildListenerRenderedDependencyValuesFromGraph(graph *codegen.PythonDependencyGraph) *realtime.ListenerRenderedDependencyValues {
	keys := buildSortedListenerDependencyKeys(graph)
	builder := renderedListenerValueBuilder{
		graph:    graph,
		rendered: map[codegen.PythonDependencyKey]renderedListenerValue{},
		visiting: map[codegen.PythonDependencyKey]struct{}{},
	}
	entries := make([]realtime.ListenerRenderedDependencyValue, 0, len(keys))
	for _, key := range keys {
		renderedValue, ok := builder.render(key)
		if !ok {
			continue
		}
		entries = append(entries, realtime.ListenerRenderedDependencyValue{
			DependencyKey: canonicalListenerDependencyKey(key),
			RenderedValue: renderedValue,
		})
	}

	return &realtime.ListenerRenderedDependencyValues{Entries: entries}
}

func buildSortedListenerDependencyKeys(graph *codegen.PythonDependencyGraph) []codegen.PythonDependencyKey {
	if graph == nil {
		return nil
	}
	keys := append([]codegen.PythonDependencyKey(nil), graph.NodeOrder...)
	if len(keys) == 0 {
		keys = make([]codegen.PythonDependencyKey, 0, len(graph.Nodes))
		for key := range graph.Nodes {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i int, j int) bool {
			return canonicalListenerDependencyKey(keys[i]) < canonicalListenerDependencyKey(keys[j])
		})
	}
	return keys
}

type renderedListenerValueBuilder struct {
	graph    *codegen.PythonDependencyGraph
	rendered map[codegen.PythonDependencyKey]renderedListenerValue
	visiting map[codegen.PythonDependencyKey]struct{}
}

type renderedListenerValue struct {
	value string
	ok    bool
}

func (b *renderedListenerValueBuilder) render(key codegen.PythonDependencyKey) (string, bool) {
	if renderedValue, ok := b.rendered[key]; ok {
		return renderedValue.value, renderedValue.ok
	}
	if b.graph == nil {
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
	for _, depKey := range orderedListenerDependencyKeys(node.Base().Deps, node.Base().DepOrder) {
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
		renderedValue, err = codec.FormatParamExpression(typed)
	case *codegen.PythonSectionNode:
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

	renderedValue = strings.TrimSpace(renderedValue)
	if renderedValue == "" {
		b.rendered[key] = renderedListenerValue{}
		return "", false
	}

	b.rendered[key] = renderedListenerValue{
		value: renderedValue,
		ok:    true,
	}
	return renderedValue, true
}

func orderedListenerDependencyKeys(
	deps map[codegen.PythonDependencyKey]bool,
	depOrder []codegen.PythonDependencyKey,
) []codegen.PythonDependencyKey {
	if len(deps) == 0 {
		return nil
	}
	keys := make([]codegen.PythonDependencyKey, 0, len(deps))
	seen := make(map[codegen.PythonDependencyKey]struct{}, len(depOrder))
	for _, key := range depOrder {
		if _, ok := deps[key]; !ok {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		keys = append(keys, key)
		seen[key] = struct{}{}
	}
	missing := make([]codegen.PythonDependencyKey, 0, len(deps)-len(keys))
	for key := range deps {
		if _, ok := seen[key]; ok {
			continue
		}
		missing = append(missing, key)
	}
	sort.Slice(missing, func(i int, j int) bool {
		return listenerDependencyKeySortString(missing[i]) < listenerDependencyKeySortString(missing[j])
	})
	return append(keys, missing...)
}

func listenerDependencyKeySortString(key codegen.PythonDependencyKey) string {
	return key.SectionID + "\x00" + key.CodeObjectID
}

func canonicalListenerDependencyKey(key codegen.PythonDependencyKey) string {
	sectionID := strings.TrimSpace(key.SectionID)
	codeObjectID := strings.TrimSpace(key.CodeObjectID)
	if codeObjectID == "" {
		return sectionID
	}
	return sectionID + "." + codeObjectID
}

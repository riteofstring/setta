package realtime

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
)

type realtimeDependencyValueWire struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type renderedListenerValue struct {
	value string
	ok    bool
}

func BuildListenerRealtimeDependencyValues(
	project projectstate.Project,
	deltas []ListenerRealtimeDelta,
) (*ListenerRenderedDependencyValues, error) {
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		return nil, err
	}
	passwordSecrets, err := project.PasswordSecretsSnapshot()
	if err != nil {
		return nil, err
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		return nil, err
	}
	return buildListenerRealtimeDependencyValuesFromGraph(graph, deltas)
}

func buildListenerRealtimeDependencyValuesFromGraph(
	graph *codegen.PythonDependencyGraph,
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
	builder := realtimeRenderedListenerValueBuilder{
		graph:     graph,
		overrides: overrideExpressions,
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

type realtimeRenderedListenerValueBuilder struct {
	graph     *codegen.PythonDependencyGraph
	overrides map[codegen.PythonDependencyKey]string
	rendered  map[codegen.PythonDependencyKey]renderedListenerValue
	visiting  map[codegen.PythonDependencyKey]struct{}
}

func (b *realtimeRenderedListenerValueBuilder) render(key codegen.PythonDependencyKey) (string, bool) {
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

	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		if typed.CodeObjectType == "PasswordParam" {
			renderedValue := strconv.Quote(
				b.graph.PasswordSecrets[strings.TrimSpace(typed.CodeObjectImplID)],
			)
			b.rendered[key] = renderedListenerValue{
				value: renderedValue,
				ok:    true,
			}
			return renderedValue, true
		}
	case *codegen.PythonSectionNode:
		if typed.SectionType == "MetaControl" && typed.ControlCodeObjType == "PasswordParam" {
			renderedValue := strconv.Quote(
				b.graph.PasswordSecrets[strings.TrimSpace(typed.ControlCodeObjImplID)],
			)
			b.rendered[key] = renderedListenerValue{
				value: renderedValue,
				ok:    true,
			}
			return renderedValue, true
		}
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

	b.rendered[key] = renderedListenerValue{
		value: renderedValue,
		ok:    true,
	}
	return renderedValue, true
}

func buildRealtimeAffectedDependencyKeys(
	graph *codegen.PythonDependencyGraph,
	dirtyKeys map[codegen.PythonDependencyKey]struct{},
) map[codegen.PythonDependencyKey]struct{} {
	affected := map[codegen.PythonDependencyKey]struct{}{}
	if graph == nil || len(dirtyKeys) == 0 {
		return affected
	}

	dependents := map[codegen.PythonDependencyKey][]codegen.PythonDependencyKey{}
	for key, node := range graph.Nodes {
		for childKey, isUsed := range node.Base().Deps {
			if !isUsed {
				continue
			}
			dependents[childKey] = append(dependents[childKey], key)
		}
	}

	queue := make([]codegen.PythonDependencyKey, 0, len(dirtyKeys))
	for key := range dirtyKeys {
		queue = append(queue, key)
		affected[key] = struct{}{}
	}

	for len(queue) > 0 {
		key := queue[0]
		queue = queue[1:]
		for _, dependentKey := range dependents[key] {
			if _, ok := affected[dependentKey]; ok {
				continue
			}
			affected[dependentKey] = struct{}{}
			queue = append(queue, dependentKey)
		}
	}

	return affected
}

func buildSortedRealtimeDependencyKeys(graph *codegen.PythonDependencyGraph) []codegen.PythonDependencyKey {
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
			return realtimeDependencyKeySortString(keys[i]) < realtimeDependencyKeySortString(keys[j])
		})
	}
	return keys
}

func orderedRealtimeDependencyKeys(
	deps map[codegen.PythonDependencyKey]bool,
	depOrder []codegen.PythonDependencyKey,
) []codegen.PythonDependencyKey {
	if len(deps) == 0 {
		return nil
	}
	keys := make([]codegen.PythonDependencyKey, 0, len(deps))
	seen := map[codegen.PythonDependencyKey]struct{}{}
	for _, key := range depOrder {
		if _, ok := deps[key]; !ok {
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
		return realtimeDependencyKeySortString(missing[i]) < realtimeDependencyKeySortString(missing[j])
	})
	return append(keys, missing...)
}

func realtimeDependencyKeySortString(key codegen.PythonDependencyKey) string {
	return key.SectionID + "\x00" + key.CodeObjectID
}

func canonicalRealtimeDependencyKey(key codegen.PythonDependencyKey) string {
	if strings.TrimSpace(key.CodeObjectID) == "" {
		return strings.TrimSpace(key.SectionID)
	}
	return strings.TrimSpace(key.SectionID) + "." + strings.TrimSpace(key.CodeObjectID)
}

func listenerDependencyGraphKey(canonical string) (codegen.PythonDependencyKey, bool) {
	key, err := DecodeCanonicalDependencyKey(canonical)
	if err != nil {
		return codegen.PythonDependencyKey{}, false
	}
	if strings.TrimSpace(key.CodeObjID) == "" {
		return codegen.PythonSectionDependencyKey(key.SectionID), true
	}
	return codegen.PythonCodeObjectDependencyKey(key.SectionID, key.CodeObjID), true
}

func renderRealtimeDeltaExpression(
	graph *codegen.PythonDependencyGraph,
	key codegen.PythonDependencyKey,
	delta ListenerRealtimeDelta,
) (string, bool) {
	if delta.BinaryPayload != nil {
		return renderPythonBytesLiteral(delta.BinaryPayload), true
	}

	value, ok := decodeRealtimePythonDependencyValue(delta.Value)
	if !ok {
		return "", false
	}

	node, ok := graph.Node(key)
	if !ok {
		return "", false
	}
	codec := codegen.NewPythonValueCodec(
		graph,
		nil,
		codegen.PythonValueCodecOptions{
			Mode: codegen.PythonValueModeLiveRuntime,
		},
	)

	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		if typed.CodeObjectType == "NestedParam" || typed.CodeObjectType == "PasswordParam" {
			return "", false
		}
		next := *typed
		next.PythonDependencyNodeBase = typed.PythonDependencyNodeBase
		next.PythonDependencyNodeBase.Value = value
		renderedValue, err := codec.FormatParamExpression(&next)
		if err != nil {
			return "", false
		}
		return renderedValue, true
	case *codegen.PythonSectionNode:
		if typed.SectionType == "Callable" || typed.SectionType == "ListRoot" || typed.SectionType == "Group" || typed.SectionType == "Dict" {
			return "", false
		}
		if typed.SectionType == "MetaControl" && typed.ControlCodeObjType == "PasswordParam" {
			return "", false
		}
		next := *typed
		next.PythonDependencyNodeBase = typed.PythonDependencyNodeBase
		next.PythonDependencyNodeBase.Value = value
		renderedValue, handled, err := codec.FormatSection(&next)
		if err != nil || !handled {
			return "", false
		}
		return renderedValue, true
	default:
		return "", false
	}
}

func decodeRealtimePythonDependencyValue(raw json.RawMessage) (codegen.PythonDependencyValue, bool) {
	var wire realtimeDependencyValueWire
	if err := json.Unmarshal(raw, &wire); err != nil {
		return nil, false
	}

	switch strings.TrimSpace(wire.Type) {
	case "Literal":
		var payload string
		if err := json.Unmarshal(wire.Payload, &payload); err != nil {
			return nil, false
		}
		return codegen.LiteralDependencyValue{Payload: payload}, true
	case "FileRead":
		var payload string
		if err := json.Unmarshal(wire.Payload, &payload); err != nil {
			return nil, false
		}
		return codegen.FileReadDependencyValue{Path: payload}, true
	default:
		return nil, false
	}
}

func renderPythonBytesLiteral(payload []byte) string {
	var builder strings.Builder
	builder.WriteString("b'")
	for _, b := range payload {
		switch b {
		case '\\':
			builder.WriteString(`\\`)
		case '\'':
			builder.WriteString(`\'`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			if b >= 0x20 && b <= 0x7e {
				builder.WriteByte(b)
				continue
			}
			builder.WriteString(fmt.Sprintf(`\x%02x`, b))
		}
	}
	builder.WriteByte('\'')
	return builder.String()
}

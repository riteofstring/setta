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
	if cached, ok := b.cachedRenderedValue(key); ok {
		return cached.value, cached.ok
	}
	if override, ok := b.overrideValue(key); ok {
		return b.rememberRenderedValue(key, override)
	}
	if b.isVisiting(key) {
		return b.rememberMissingValue(key)
	}
	node, ok := b.renderableNode(key)
	if !ok {
		return b.rememberMissingValue(key)
	}
	if immediateValue, ok := b.immediateNodeValue(node); ok {
		return b.rememberRenderedValue(key, immediateValue)
	}

	b.visiting[key] = struct{}{}
	defer delete(b.visiting, key)

	childValues, ok := b.renderChildValues(node)
	if !ok {
		return b.rememberMissingValue(key)
	}
	renderedValue, ok := b.formatNodeValue(node, childValues)
	if !ok {
		return b.rememberMissingValue(key)
	}
	return b.rememberRenderedValue(key, renderedValue)
}

func (b *realtimeRenderedListenerValueBuilder) cachedRenderedValue(
	key codegen.PythonDependencyKey,
) (renderedListenerValue, bool) {
	renderedValue, ok := b.rendered[key]
	return renderedValue, ok
}

func (b *realtimeRenderedListenerValueBuilder) overrideValue(key codegen.PythonDependencyKey) (string, bool) {
	override, ok := b.overrides[key]
	return override, ok
}

func (b *realtimeRenderedListenerValueBuilder) isVisiting(key codegen.PythonDependencyKey) bool {
	_, ok := b.visiting[key]
	return ok
}

func (b *realtimeRenderedListenerValueBuilder) renderableNode(
	key codegen.PythonDependencyKey,
) (codegen.PythonDependencyNode, bool) {
	if b.graph == nil {
		return nil, false
	}
	node, ok := b.graph.Node(key)
	if !ok || !node.Base().IncludeInCodegen {
		return nil, false
	}
	return node, true
}

func (b *realtimeRenderedListenerValueBuilder) immediateNodeValue(
	node codegen.PythonDependencyNode,
) (string, bool) {
	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		return realtimePasswordSecretExpression(
			b.graph.PasswordSecrets,
			typed.CodeObjectType,
			typed.CodeObjectImplID,
		)
	case *codegen.PythonSectionNode:
		if typed.SectionType != "MetaControl" {
			return "", false
		}
		return realtimePasswordSecretExpression(
			b.graph.PasswordSecrets,
			typed.ControlCodeObjType,
			typed.ControlCodeObjImplID,
		)
	default:
		return "", false
	}
}

func (b *realtimeRenderedListenerValueBuilder) renderChildValues(
	node codegen.PythonDependencyNode,
) (map[codegen.PythonDependencyKey]string, bool) {
	base := node.Base()
	childValues := map[codegen.PythonDependencyKey]string{}
	for _, depKey := range orderedRealtimeDependencyKeys(base.Deps, base.DepOrder) {
		if !base.Deps[depKey] {
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

func (b *realtimeRenderedListenerValueBuilder) formatNodeValue(
	node codegen.PythonDependencyNode,
	childValues map[codegen.PythonDependencyKey]string,
) (string, bool) {
	codec := newRealtimeValueCodec(b.graph, childValues)
	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		renderedValue, err := codec.FormatParamExpression(typed)
		if err != nil {
			return "", false
		}
		return renderedValue, true
	case *codegen.PythonSectionNode:
		renderedValue, handled, err := codec.FormatSection(typed)
		if err != nil || !handled {
			return "", false
		}
		return renderedValue, true
	default:
		return "", false
	}
}

func (b *realtimeRenderedListenerValueBuilder) rememberRenderedValue(
	key codegen.PythonDependencyKey,
	value string,
) (string, bool) {
	b.rendered[key] = renderedListenerValue{
		value: value,
		ok:    true,
	}
	return value, true
}

func (b *realtimeRenderedListenerValueBuilder) rememberMissingValue(
	key codegen.PythonDependencyKey,
) (string, bool) {
	b.rendered[key] = renderedListenerValue{}
	return "", false
}

func newRealtimeValueCodec(
	graph *codegen.PythonDependencyGraph,
	childValues map[codegen.PythonDependencyKey]string,
) *codegen.PythonValueCodec {
	var varLookup codegen.PythonVarLookup
	if childValues != nil {
		varLookup = func(depKey codegen.PythonDependencyKey) string {
			return childValues[depKey]
		}
	}
	return codegen.NewPythonValueCodec(
		graph,
		varLookup,
		codegen.PythonValueCodecOptions{
			Mode: codegen.PythonValueModeLiveRuntime,
		},
	)
}

func realtimePasswordSecretExpression(
	passwordSecrets map[string]string,
	codeObjectType string,
	codeObjectImplID string,
) (string, bool) {
	if codeObjectType != "PasswordParam" {
		return "", false
	}
	return strconv.Quote(passwordSecrets[strings.TrimSpace(codeObjectImplID)]), true
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
	node, ok := renderRealtimeDeltaNode(graph, key)
	if !ok {
		return "", false
	}
	return renderRealtimeDeltaValueExpression(graph, node, value)
}

func renderRealtimeDeltaNode(
	graph *codegen.PythonDependencyGraph,
	key codegen.PythonDependencyKey,
) (codegen.PythonDependencyNode, bool) {
	if graph == nil {
		return nil, false
	}
	node, ok := graph.Node(key)
	return node, ok
}

func renderRealtimeDeltaValueExpression(
	graph *codegen.PythonDependencyGraph,
	node codegen.PythonDependencyNode,
	value codegen.PythonDependencyValue,
) (string, bool) {
	codec := newRealtimeValueCodec(graph, nil)
	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		return renderRealtimeParamDeltaExpression(codec, typed, value)
	case *codegen.PythonSectionNode:
		return renderRealtimeSectionDeltaExpression(codec, typed, value)
	default:
		return "", false
	}
}

func renderRealtimeParamDeltaExpression(
	codec *codegen.PythonValueCodec,
	node *codegen.PythonParamNode,
	value codegen.PythonDependencyValue,
) (string, bool) {
	if !supportsRealtimeParamDelta(node) {
		return "", false
	}
	next := *node
	next.PythonDependencyNodeBase = node.PythonDependencyNodeBase
	next.PythonDependencyNodeBase.Value = value
	renderedValue, err := codec.FormatParamExpression(&next)
	if err != nil {
		return "", false
	}
	return renderedValue, true
}

func supportsRealtimeParamDelta(node *codegen.PythonParamNode) bool {
	return node.CodeObjectType != "NestedParam" && node.CodeObjectType != "PasswordParam"
}

func renderRealtimeSectionDeltaExpression(
	codec *codegen.PythonValueCodec,
	node *codegen.PythonSectionNode,
	value codegen.PythonDependencyValue,
) (string, bool) {
	if !supportsRealtimeSectionDelta(node) {
		return "", false
	}
	next := *node
	next.PythonDependencyNodeBase = node.PythonDependencyNodeBase
	next.PythonDependencyNodeBase.Value = value
	renderedValue, handled, err := codec.FormatSection(&next)
	if err != nil || !handled {
		return "", false
	}
	return renderedValue, true
}

func supportsRealtimeSectionDelta(node *codegen.PythonSectionNode) bool {
	switch node.SectionType {
	case "Callable", "ListRoot", "Group", "Dict":
		return false
	}
	return !(node.SectionType == "MetaControl" && node.ControlCodeObjType == "PasswordParam")
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

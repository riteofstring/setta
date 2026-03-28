package codegen

import (
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
	"unicode"

	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

var (
	ErrPythonDependencyGraphExportRequired = errors.New("codegen: python codegen export is required")
	ErrPythonDependencyGraphSectionType    = errors.New("codegen: python dependency graph section type is unsupported")
	ErrPythonDependencyNodeNotFound        = errors.New("codegen: python dependency node not found")
)

type PythonDependencyGraphOptions struct {
	PasswordSecrets map[string]string
	PromptTemplates *prompttemplates.Store
}

type PythonDependencyKey struct {
	SectionID    string
	CodeObjectID string
}

func PythonSectionDependencyKey(sectionID string) PythonDependencyKey {
	return PythonDependencyKey{SectionID: strings.TrimSpace(sectionID)}
}

func PythonCodeObjectDependencyKey(sectionID string, codeObjectID string) PythonDependencyKey {
	return PythonDependencyKey{
		SectionID:    strings.TrimSpace(sectionID),
		CodeObjectID: strings.TrimSpace(codeObjectID),
	}
}

func (k PythonDependencyKey) IsSection() bool {
	return strings.TrimSpace(k.CodeObjectID) == ""
}

type PythonDependencyValueKind string

const (
	PythonDependencyValueKindLiteral  PythonDependencyValueKind = "literal"
	PythonDependencyValueKindFileRead PythonDependencyValueKind = "file_read"
)

type PythonDependencyValue interface {
	Kind() PythonDependencyValueKind
}

type LiteralDependencyValue struct {
	Payload string
}

func (v LiteralDependencyValue) Kind() PythonDependencyValueKind {
	return PythonDependencyValueKindLiteral
}

type FileReadDependencyValue struct {
	Path string
}

func (v FileReadDependencyValue) Kind() PythonDependencyValueKind {
	return PythonDependencyValueKindFileRead
}

type PythonDependencyNodeBase struct {
	ID               string
	Name             string
	FullPathName     string
	IsTopLevel       bool
	Value            PythonDependencyValue
	Deps             map[PythonDependencyKey]bool
	DepOrder         []PythonDependencyKey
	IncludeInCodegen bool
}

type PythonDependencyNode interface {
	Base() *PythonDependencyNodeBase
	HasNameAndValue() bool
	TypeName() string
}

type PythonSectionNode struct {
	PythonDependencyNodeBase
	SectionType                string
	Representation             projectstate.PythonSectionRepresentationMode
	ControlCodeObjType         string
	ControlCodeObjID           string
	ControlCodeObjImplID       string
	ControlValueRepresentation projectstate.PythonCodeObjValueRepresentationMode
}

func (n *PythonSectionNode) Base() *PythonDependencyNodeBase {
	return &n.PythonDependencyNodeBase
}

func (n *PythonSectionNode) HasNameAndValue() bool {
	return true
}

func (n *PythonSectionNode) TypeName() string {
	return n.SectionType
}

type PythonParamNode struct {
	PythonDependencyNodeBase
	CodeObjectType      string
	PassingStyle        string
	CodeObjectImplID    string
	HasSecret           bool
	ValueRepresentation projectstate.PythonCodeObjValueRepresentationMode
}

func (n *PythonParamNode) Base() *PythonDependencyNodeBase {
	return &n.PythonDependencyNodeBase
}

func (n *PythonParamNode) HasNameAndValue() bool {
	if strings.TrimSpace(n.Name) == "" {
		return false
	}
	if n.CodeObjectType == "PasswordParam" {
		if strings.TrimSpace(n.CodeObjectImplID) == "" {
			return false
		}
		return n.HasSecret
	}
	if n.Value == nil {
		return false
	}
	literal, ok := n.Value.(LiteralDependencyValue)
	if !ok {
		return false
	}
	return literal.Payload != ""
}

func (n *PythonParamNode) TypeName() string {
	return n.CodeObjectType
}

type PythonDependencyGraph struct {
	Nodes             map[PythonDependencyKey]PythonDependencyNode
	NodeOrder         []PythonDependencyKey
	FullPathNameToKey map[string]PythonDependencyKey
	PotentialRefs     map[PythonDependencyKey]map[string][]int
	PasswordSecrets   map[string]string
}

type pythonDependencyGraphBuilder struct {
	export          projectstate.PythonCodegenExport
	graph           *PythonDependencyGraph
	passwordSecrets map[string]string
	promptTemplates *prompttemplates.Store
	potentialRefs   map[PythonDependencyKey]map[string][]int
}

var pythonDependencyGraphSectionExporters = map[string]struct{}{
	"Callable":        {},
	"Dict":            {},
	"ListRoot":        {},
	"Group":           {},
	"GlobalVariables": {},
	"TextBlock":       {},
	"Prompt":          {},
	"Draw":            {},
	"Image":           {},
	"Plugin":          {},
	"MetaControl":     {},
	"Chat":            {},
	"TaskBoard":       {},
	"Spreadsheet":     {},
}

func BuildPythonDependencyGraph(
	export projectstate.PythonCodegenExport,
	options PythonDependencyGraphOptions,
) (*PythonDependencyGraph, error) {
	if strings.TrimSpace(export.ProjectID) == "" {
		return nil, ErrPythonDependencyGraphExportRequired
	}

	builder := &pythonDependencyGraphBuilder{
		export: export,
		graph: &PythonDependencyGraph{
			Nodes:             map[PythonDependencyKey]PythonDependencyNode{},
			NodeOrder:         nil,
			FullPathNameToKey: map[string]PythonDependencyKey{},
			PotentialRefs:     map[PythonDependencyKey]map[string][]int{},
			PasswordSecrets:   cloneStringMap(options.PasswordSecrets),
		},
		passwordSecrets: cloneStringMap(options.PasswordSecrets),
		promptTemplates: options.PromptTemplates,
		potentialRefs:   map[PythonDependencyKey]map[string][]int{},
	}
	if _, _, err := builder.exportSections(export.TopLevelSectionIDs, true, nil); err != nil {
		return nil, err
	}
	builder.resolvePotentialRefs()
	return builder.graph, nil
}

func (g *PythonDependencyGraph) Node(key PythonDependencyKey) (PythonDependencyNode, bool) {
	if g == nil {
		return nil, false
	}
	node, ok := g.Nodes[key]
	return node, ok
}

func SetPythonDependencyValue(
	graph *PythonDependencyGraph,
	key PythonDependencyKey,
	value string,
) error {
	if graph == nil {
		return ErrPythonDependencyNodeNotFound
	}
	node, ok := graph.Node(key)
	if !ok {
		return fmt.Errorf("%w: %+v", ErrPythonDependencyNodeNotFound, key)
	}
	node.Base().Value = LiteralDependencyValue{Payload: value}
	isUsed := node.HasNameAndValue()
	for _, otherNode := range graph.Nodes {
		if _, exists := otherNode.Base().Deps[key]; exists {
			otherNode.Base().Deps[key] = isUsed
		}
	}
	return nil
}

func (b *pythonDependencyGraphBuilder) exportSections(
	sectionIDs []string,
	isTopLevel bool,
	parent PythonDependencyNode,
) (map[PythonDependencyKey]bool, []PythonDependencyKey, error) {
	deps := make(map[PythonDependencyKey]bool)
	order := make([]PythonDependencyKey, 0, len(sectionIDs))
	for index, sectionID := range sectionIDs {
		key, node, err := b.exportSection(sectionID, isTopLevel, parent, index)
		if err != nil {
			return nil, nil, err
		}
		if node == nil {
			continue
		}
		deps[key] = node.HasNameAndValue()
		order = append(order, key)
	}
	return deps, order, nil
}

func (b *pythonDependencyGraphBuilder) exportSection(
	sectionID string,
	isTopLevel bool,
	parent PythonDependencyNode,
	index int,
) (PythonDependencyKey, PythonDependencyNode, error) {
	key := PythonSectionDependencyKey(sectionID)
	if existing, ok := b.graph.Nodes[key]; ok {
		return key, existing, nil
	}

	section, err := b.export.ResolveSection(sectionID)
	if err != nil {
		return PythonDependencyKey{}, nil, err
	}
	if !isPythonDependencyGraphSectionType(section.Type) {
		return key, nil, nil
	}

	fullPathName := b.createFullPathName(parent, index, section.Name)
	switch section.Type {
	case "Callable":
		value, err := callableSectionValue(section)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            value,
				Deps:             map[PythonDependencyKey]bool{},
				DepOrder:         nil,
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		deps, depOrder, err := b.exportSectionParams(section, node, false, section.Policy.IncludeInCodegen)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node.Deps = deps
		node.DepOrder = depOrder
		b.addNode(key, node)
		if literal, ok := value.(LiteralDependencyValue); ok {
			if err := b.recordPotentialRefs(key, literal.Payload); err != nil {
				return PythonDependencyKey{}, nil, err
			}
		}
		return key, node, nil
	case "Dict":
		children := make([]string, 0, len(section.ArrayStringField("children")))
		for _, childID := range section.ArrayStringField("children") {
			childSection, err := b.export.ResolveSection(childID)
			if err != nil {
				return PythonDependencyKey{}, nil, err
			}
			if !isPythonDependencyGraphSectionType(childSection.Type) {
				continue
			}
			children = append(children, childID)
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Deps:             map[PythonDependencyKey]bool{},
				DepOrder:         nil,
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		paramDeps, paramOrder, err := b.exportSectionParams(section, node, false, section.Policy.IncludeInCodegen)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		childDeps, childOrder, err := b.exportSections(children, false, node)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node.Deps, node.DepOrder = mergeDependencyCollections(
			paramDeps,
			paramOrder,
			childDeps,
			childOrder,
		)
		b.addNode(key, node)
		return key, node, nil
	case "GlobalVariables":
		if _, _, err := b.exportSectionParams(section, nil, true, section.Policy.IncludeInCodegen); err != nil {
			return PythonDependencyKey{}, nil, err
		}
		return key, nil, nil
	case "ListRoot", "Group":
		children := make([]string, 0, len(section.ArrayStringField("children")))
		for _, childID := range section.ArrayStringField("children") {
			childSection, err := b.export.ResolveSection(childID)
			if err != nil {
				return PythonDependencyKey{}, nil, err
			}
			if !isPythonDependencyGraphSectionType(childSection.Type) {
				continue
			}
			children = append(children, childID)
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Deps:             map[PythonDependencyKey]bool{},
				DepOrder:         nil,
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		deps, depOrder, err := b.exportSections(children, false, node)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node.Deps = deps
		node.DepOrder = depOrder
		b.addNode(key, node)
		return key, node, nil
	case "TextBlock":
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            LiteralDependencyValue{Payload: section.StringField("text")},
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Prompt":
		promptText := section.StringField("renderedText")
		if b.promptTemplates != nil {
			promptTemplateID := section.StringField("promptTemplateId")
			if promptTemplateID != "" {
				template, err := b.promptTemplates.Get(promptTemplateID)
				if err != nil {
					return PythonDependencyKey{}, nil, fmt.Errorf(
						"codegen: resolve prompt template %q for prompt section %q: %w",
						promptTemplateID,
						section.ID,
						err,
					)
				}
				promptText = template.Template
			}
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            LiteralDependencyValue{Payload: promptText},
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Plugin":
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            LiteralDependencyValue{Payload: renderPythonLiteral(section.Payload["data"])},
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Chat":
		value, representation, err := chatSectionValue(section)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            value,
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Draw":
		value, representation, err := fileBackedSectionValue(
			section.Policy.Representation,
			section.StringField("renderedImagePath"),
			section.ID,
			"Draw",
		)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            value,
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Image":
		value, representation, err := fileBackedSectionValue(
			section.Policy.Representation,
			section.StringField("imagePath"),
			section.ID,
			"Image",
		)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            value,
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "TaskBoard":
		payload := map[string]any{
			"viewMode": section.Payload["viewMode"],
			"columns":  section.Payload["columns"],
			"tasks":    section.Payload["tasks"],
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            LiteralDependencyValue{Payload: renderPythonLiteral(payload)},
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "Spreadsheet":
		payload := map[string]any{
			"filePath":                   section.Payload["filePath"],
			"activeSheet":                section.Payload["activeSheet"],
			"readOnly":                   section.Payload["readOnly"],
			"showRowNumbers":             section.Payload["showRowNumbers"],
			"density":                    section.Payload["density"],
			"autoReloadOnExternalChange": section.Payload["autoReloadOnExternalChange"],
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            LiteralDependencyValue{Payload: renderPythonLiteral(payload)},
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:    section.Type,
			Representation: section.Policy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	case "MetaControl":
		controlParamID := section.StringField("metaControlParamId")
		controlCodeObj, err := section.ResolveCodeObject(controlParamID)
		if err != nil {
			return PythonDependencyKey{}, nil, err
		}
		var value PythonDependencyValue
		if isChildlessPythonCodeObjectType(controlCodeObj.Type) {
			value = LiteralDependencyValue{Payload: controlCodeObj.StringField("value")}
		}
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               section.ID,
				Name:             section.Name,
				FullPathName:     fullPathName,
				IsTopLevel:       isTopLevel,
				Value:            value,
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: section.Policy.IncludeInCodegen,
			},
			SectionType:                section.Type,
			Representation:             section.Policy.Representation,
			ControlCodeObjType:         controlCodeObj.Type,
			ControlCodeObjID:           controlParamID,
			ControlCodeObjImplID:       controlCodeObj.ImplID,
			ControlValueRepresentation: controlCodeObj.ValuePolicy.Representation,
		}
		b.addNode(key, node)
		return key, node, nil
	default:
		return PythonDependencyKey{}, nil, fmt.Errorf("%w: %s", ErrPythonDependencyGraphSectionType, section.Type)
	}
}

func (b *pythonDependencyGraphBuilder) exportSectionParams(
	section projectstate.PythonCodegenSection,
	parent PythonDependencyNode,
	isTopLevel bool,
	includeInCodegen bool,
) (map[PythonDependencyKey]bool, []PythonDependencyKey, error) {
	paramIDs, err := topLevelPythonParamIDs(section)
	if err != nil {
		return nil, nil, err
	}
	return b.exportParams(section, paramIDs, parent, isTopLevel, includeInCodegen)
}

func (b *pythonDependencyGraphBuilder) exportParams(
	section projectstate.PythonCodegenSection,
	paramIDs []string,
	parent PythonDependencyNode,
	isTopLevel bool,
	includeInCodegen bool,
) (map[PythonDependencyKey]bool, []PythonDependencyKey, error) {
	deps := make(map[PythonDependencyKey]bool)
	order := make([]PythonDependencyKey, 0, len(paramIDs))
	for index, paramID := range paramIDs {
		key := PythonCodeObjectDependencyKey(section.ID, paramID)
		if existing, ok := b.graph.Nodes[key]; ok {
			deps[key] = existing.HasNameAndValue()
			order = append(order, key)
			continue
		}

		codeObject, err := section.ResolveCodeObject(paramID)
		if err != nil {
			return nil, nil, err
		}
		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               codeObject.ID,
				Name:             codeObject.Name,
				FullPathName:     b.createFullPathName(parent, index, codeObject.Name),
				IsTopLevel:       isTopLevel,
				Deps:             map[PythonDependencyKey]bool{},
				DepOrder:         nil,
				IncludeInCodegen: includeInCodegen,
			},
			CodeObjectType:      codeObject.Type,
			PassingStyle:        defaultPythonPassingStyle(codeObject.StringField("passingStyle")),
			CodeObjectImplID:    codeObject.ImplID,
			ValueRepresentation: codeObject.ValuePolicy.Representation,
		}
		if isChildlessPythonCodeObjectType(codeObject.Type) {
			node.Value = LiteralDependencyValue{Payload: codeObject.StringField("value")}
			if literal, ok := node.Value.(LiteralDependencyValue); ok {
				if err := b.recordPotentialRefs(key, literal.Payload); err != nil {
					return nil, nil, err
				}
			}
		}
		if codeObject.Type == "PasswordParam" {
			node.HasSecret = strings.TrimSpace(b.passwordSecrets[codeObject.ImplID]) != ""
		}
		if len(codeObject.Children()) > 0 {
			children, childOrder, err := b.exportParams(section, codeObject.Children(), node, false, includeInCodegen)
			if err != nil {
				return nil, nil, err
			}
			node.Deps = children
			node.DepOrder = childOrder
		}
		b.addNode(key, node)
		deps[key] = node.HasNameAndValue()
		order = append(order, key)
	}
	return deps, order, nil
}

func mergeDependencyCollections(
	primaryDeps map[PythonDependencyKey]bool,
	primaryOrder []PythonDependencyKey,
	secondaryDeps map[PythonDependencyKey]bool,
	secondaryOrder []PythonDependencyKey,
) (map[PythonDependencyKey]bool, []PythonDependencyKey) {
	mergedDeps := make(map[PythonDependencyKey]bool, len(primaryDeps)+len(secondaryDeps))
	mergedOrder := make([]PythonDependencyKey, 0, len(primaryOrder)+len(secondaryOrder))
	appendUnique := func(key PythonDependencyKey) {
		for _, existing := range mergedOrder {
			if existing == key {
				return
			}
		}
		mergedOrder = append(mergedOrder, key)
	}

	for key, used := range primaryDeps {
		mergedDeps[key] = used
	}
	for _, key := range primaryOrder {
		appendUnique(key)
	}

	for key, used := range secondaryDeps {
		mergedDeps[key] = used
	}
	for _, key := range secondaryOrder {
		appendUnique(key)
	}

	return mergedDeps, mergedOrder
}

func (b *pythonDependencyGraphBuilder) addNode(key PythonDependencyKey, node PythonDependencyNode) {
	b.graph.Nodes[key] = node
	b.graph.NodeOrder = append(b.graph.NodeOrder, key)
	b.graph.FullPathNameToKey[node.Base().FullPathName] = key
}

func (b *pythonDependencyGraphBuilder) recordPotentialRefs(
	key PythonDependencyKey,
	value string,
) error {
	refs, err := findUndefinedPythonSpecialVarExpressionPositions(value, "state", true)
	if err != nil {
		return err
	}
	if len(refs) == 0 {
		return nil
	}
	b.potentialRefs[key] = refs
	b.graph.PotentialRefs[key] = cloneStringSliceIntMap(refs)
	return nil
}

func (b *pythonDependencyGraphBuilder) resolvePotentialRefs() {
	for key, refs := range b.potentialRefs {
		node, ok := b.graph.Nodes[key]
		if !ok {
			continue
		}
		for _, ref := range sortedStringKeys(refs) {
			targetKey, ok := b.graph.FullPathNameToKey[ref]
			if !ok {
				continue
			}
			targetNode, ok := b.graph.Nodes[targetKey]
			if !ok {
				continue
			}
			if _, exists := node.Base().Deps[targetKey]; !exists {
				node.Base().DepOrder = append(node.Base().DepOrder, targetKey)
			}
			node.Base().Deps[targetKey] = targetNode.HasNameAndValue()
		}
	}
}

func (b *pythonDependencyGraphBuilder) createFullPathName(
	parent PythonDependencyNode,
	index int,
	name string,
) string {
	if parent == nil {
		return sanitizePythonIdentifier(name)
	}

	parentType := parent.TypeName()
	switch parentType {
	case "ListRoot":
		return fmt.Sprintf("%s__%d", parent.Base().FullPathName, index)
	case "Callable", "Group", "Dict", "NestedParam":
		return createUniquePythonName(
			fmt.Sprintf("%s__%s", parent.Base().FullPathName, sanitizePythonIdentifier(name)),
			b.graph.FullPathNameToKey,
		)
	default:
		return sanitizePythonIdentifier(name)
	}
}

func callableSectionValue(section projectstate.PythonCodegenSection) (PythonDependencyValue, error) {
	callableID := section.CallableID()
	if callableID == "" {
		return nil, nil
	}
	callableCodeObj, err := section.ResolveCodeObject(callableID)
	if err != nil {
		return nil, err
	}
	return LiteralDependencyValue{Payload: callableCodeObj.Name}, nil
}

func topLevelPythonParamIDs(section projectstate.PythonCodegenSection) ([]string, error) {
	if callableID := section.CallableID(); callableID != "" {
		callableCodeObj, err := section.ResolveCodeObject(callableID)
		if err != nil {
			return nil, err
		}
		return callableCodeObj.Children(), nil
	}
	if topLevelParamID := section.TopLevelParamID(); topLevelParamID != "" {
		rootCodeObj, err := section.ResolveCodeObject(topLevelParamID)
		if err != nil {
			return nil, err
		}
		return rootCodeObj.Children(), nil
	}
	return nil, nil
}

func chatSectionValue(
	section projectstate.PythonCodegenSection,
) (PythonDependencyValue, projectstate.PythonSectionRepresentationMode, error) {
	statePayload := map[string]any{
		"messages":           section.Payload["messages"],
		"inputText":          section.Payload["inputText"],
		"waitingForResponse": section.Payload["waitingForResponse"],
		"toolCallArguments":  section.Payload["toolCallArguments"],
		"activeBranchId":     section.Payload["activeBranchId"],
		"branches":           section.Payload["branches"],
	}
	stateLiteral := LiteralDependencyValue{Payload: renderPythonLiteral(statePayload)}
	chatID := section.StringField("chatId")
	switch section.Policy.Representation {
	case projectstate.PythonSectionRepresentationExpression:
		return stateLiteral, projectstate.PythonSectionRepresentationExpression, nil
	case projectstate.PythonSectionRepresentationFilePath:
		if chatID == "" {
			return stateLiteral, projectstate.PythonSectionRepresentationExpression, nil
		}
		chatPath := path.Join("setta_files", "chats", chatID+".json")
		return LiteralDependencyValue{Payload: chatPath}, projectstate.PythonSectionRepresentationFilePath, nil
	case projectstate.PythonSectionRepresentationFileRead:
		if chatID == "" {
			return stateLiteral, projectstate.PythonSectionRepresentationExpression, nil
		}
		chatPath := path.Join("setta_files", "chats", chatID+".json")
		return FileReadDependencyValue{Path: chatPath}, projectstate.PythonSectionRepresentationFileRead, nil
	default:
		return nil, "", fmt.Errorf("codegen: unsupported chat representation %q for section %s", section.Policy.Representation, section.ID)
	}
}

func fileBackedSectionValue(
	representation projectstate.PythonSectionRepresentationMode,
	filePath string,
	sectionID string,
	sectionType string,
) (PythonDependencyValue, projectstate.PythonSectionRepresentationMode, error) {
	switch representation {
	case projectstate.PythonSectionRepresentationFileRead:
		if strings.TrimSpace(filePath) == "" {
			return LiteralDependencyValue{Payload: "None"}, projectstate.PythonSectionRepresentationExpression, nil
		}
		return FileReadDependencyValue{Path: filePath}, representation, nil
	case projectstate.PythonSectionRepresentationFilePath:
		if strings.TrimSpace(filePath) == "" {
			return LiteralDependencyValue{Payload: "None"}, projectstate.PythonSectionRepresentationExpression, nil
		}
		return LiteralDependencyValue{Payload: filePath}, representation, nil
	default:
		return nil, "", fmt.Errorf("codegen: unsupported representation %q for %s section %s", representation, sectionType, sectionID)
	}
}

func isPythonDependencyGraphSectionType(sectionType string) bool {
	_, ok := pythonDependencyGraphSectionExporters[sectionType]
	return ok
}

func isChildlessPythonCodeObjectType(codeObjectType string) bool {
	switch codeObjectType {
	case "CodeParam",
		"TextParam",
		"DateParam",
		"TimeParam",
		"SliderParam",
		"RotaryParam",
		"SwitchParam",
		"ColorPickerParam",
		"DropdownParam",
		"PasswordParam",
		"TextAreaParam",
		"DropzoneParam":
		return true
	default:
		return false
	}
}

func defaultPythonPassingStyle(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "DEFAULT"
	}
	return trimmed
}

func sanitizePythonIdentifier(name string) string {
	sanitizedRunes := make([]rune, 0, len(name))
	for _, char := range name {
		if char == '_' || unicode.IsLetter(char) || unicode.IsDigit(char) {
			sanitizedRunes = append(sanitizedRunes, char)
			continue
		}
		sanitizedRunes = append(sanitizedRunes, '_')
	}
	sanitized := string(sanitizedRunes)
	if sanitized == "" {
		sanitized = "_"
	}
	firstRune, _ := utf8DecodeRuneInString(sanitized)
	if unicode.IsDigit(firstRune) {
		sanitized = "_" + sanitized
	}
	if isPythonKeyword(sanitized) {
		sanitized = "_" + sanitized
	}
	return sanitized
}

func createUniquePythonName(name string, used map[string]PythonDependencyKey) string {
	candidate := name
	counter := 2
	for {
		if _, ok := used[candidate]; !ok {
			return candidate
		}
		candidate = fmt.Sprintf("%s_%d", name, counter)
		counter++
	}
}

func renderPythonLiteral(value any) string {
	switch typed := value.(type) {
	case nil:
		return "None"
	case bool:
		if typed {
			return "True"
		}
		return "False"
	case string:
		return renderPythonStringLiteral(typed)
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return fmt.Sprintf("%v", typed)
	case []string:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			items = append(items, renderPythonLiteral(item))
		}
		return "[" + strings.Join(items, ", ") + "]"
	case []int:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			items = append(items, renderPythonLiteral(item))
		}
		return "[" + strings.Join(items, ", ") + "]"
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			items = append(items, renderPythonLiteral(item))
		}
		return "[" + strings.Join(items, ", ") + "]"
	case map[string]string:
		keys := sortedStringKeys(typed)
		items := make([]string, 0, len(keys))
		for _, key := range keys {
			items = append(items, fmt.Sprintf("%s: %s", renderPythonLiteral(key), renderPythonLiteral(typed[key])))
		}
		return "{" + strings.Join(items, ", ") + "}"
	case map[string]any:
		keys := sortedStringKeys(typed)
		items := make([]string, 0, len(keys))
		for _, key := range keys {
			items = append(items, fmt.Sprintf("%s: %s", renderPythonLiteral(key), renderPythonLiteral(typed[key])))
		}
		return "{" + strings.Join(items, ", ") + "}"
	default:
		return renderPythonStringLiteral(fmt.Sprintf("%v", typed))
	}
}

func renderPythonStringLiteral(value string) string {
	var builder strings.Builder
	builder.WriteByte('\'')
	for _, char := range value {
		switch char {
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
		case '\b':
			builder.WriteString(`\b`)
		case '\f':
			builder.WriteString(`\f`)
		default:
			if char < 0x20 {
				builder.WriteString(fmt.Sprintf(`\x%02x`, char))
				continue
			}
			builder.WriteRune(char)
		}
	}
	builder.WriteByte('\'')
	return builder.String()
}

func sortedStringKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func utf8DecodeRuneInString(value string) (rune, int) {
	for _, char := range value {
		return char, 1
	}
	return rune(0), 0
}

func isPythonKeyword(value string) bool {
	switch value {
	case "False", "None", "True", "and", "as", "assert", "async", "await",
		"break", "case", "class", "continue", "def", "del", "elif", "else",
		"except", "finally", "for", "from", "global", "if", "import", "in",
		"is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
		"return", "try", "type", "while", "with", "yield":
		return true
	default:
		return false
	}
}

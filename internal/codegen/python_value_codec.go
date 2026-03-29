package codegen

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"setta/internal/projectstate"
)

type PythonValueMode string

const (
	PythonValueModeLiveRuntime     PythonValueMode = "live_runtime"
	PythonValueModePackagedRuntime PythonValueMode = "packaged_runtime"
)

type PythonVarLookup func(PythonDependencyKey) string

type PythonValueCodecOptions struct {
	Mode                        PythonValueMode
	HelperModuleAlias           string
	CollectionItemIndent        string
	CollectionCloseIndent       string
	MaxInlineCollectionChars    int
	MultilineCollectionMinItems int
}

type PythonValueCodec struct {
	graph                       *PythonDependencyGraph
	varLookup                   PythonVarLookup
	mode                        PythonValueMode
	helperModuleAlias           string
	collectionItemIndent        string
	collectionCloseIndent       string
	maxInlineCollectionChars    int
	multilineCollectionMinItems int
	requiredImports             map[string]struct{}
}

func NewPythonValueCodec(
	graph *PythonDependencyGraph,
	varLookup PythonVarLookup,
	options PythonValueCodecOptions,
) *PythonValueCodec {
	mode := options.Mode
	if mode == "" {
		mode = PythonValueModeLiveRuntime
	}
	helperModuleAlias := strings.TrimSpace(options.HelperModuleAlias)
	if helperModuleAlias == "" {
		helperModuleAlias = "_setta_value_helpers"
	}
	collectionItemIndent := options.CollectionItemIndent
	if collectionItemIndent == "" {
		collectionItemIndent = "    "
	}
	maxInlineCollectionChars := options.MaxInlineCollectionChars
	if maxInlineCollectionChars <= 0 {
		maxInlineCollectionChars = 88
	}
	multilineCollectionMinItems := options.MultilineCollectionMinItems
	if multilineCollectionMinItems <= 0 {
		multilineCollectionMinItems = 4
	}
	if varLookup == nil {
		varLookup = func(PythonDependencyKey) string { return "" }
	}
	return &PythonValueCodec{
		graph:                       graph,
		varLookup:                   varLookup,
		mode:                        mode,
		helperModuleAlias:           helperModuleAlias,
		collectionItemIndent:        collectionItemIndent,
		collectionCloseIndent:       options.CollectionCloseIndent,
		maxInlineCollectionChars:    maxInlineCollectionChars,
		multilineCollectionMinItems: multilineCollectionMinItems,
		requiredImports:             map[string]struct{}{},
	}
}

func (c *PythonValueCodec) ResetUsage() {
	clear(c.requiredImports)
}

func (c *PythonValueCodec) RequiredImports() []string {
	return sortedStringKeys(c.requiredImports)
}

func (c *PythonValueCodec) FormatParamExpression(node *PythonParamNode) (string, error) {
	if node == nil {
		return "", nil
	}
	if node.CodeObjectType == "PasswordParam" {
		if strings.TrimSpace(node.CodeObjectImplID) == "" {
			return "", fmt.Errorf("codegen: missing code object impl id for %s", node.FullPathName)
		}
		return c.formatPasswordValue(node.CodeObjectImplID), nil
	}
	literalValue, err := c.expectLiteral(node)
	if err != nil {
		return "", err
	}
	return c.FormatParamValue(
		node.CodeObjectType,
		literalValue,
		node.Deps,
		node.DepOrder,
		node.ValueRepresentation,
	)
}

func (c *PythonValueCodec) FormatSection(node *PythonSectionNode) (string, bool, error) {
	if node == nil {
		return "", false, nil
	}

	switch node.SectionType {
	case "Callable":
		if node.Value == nil {
			return "None", true, nil
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			return "", false, fmt.Errorf("codegen: callable section %s expected literal payload", node.FullPathName)
		}
		value, err := c.constructCallable(literal.Payload, node.Deps, node.DepOrder)
		return value, true, err
	case "ListRoot":
		value, err := c.FormatList(node.Deps, node.DepOrder)
		return value, true, err
	case "Group", "Dict":
		value, err := c.FormatDict(node.Deps, node.DepOrder)
		return value, true, err
	case "MetaControl":
		value, err := c.formatMetaControlSection(node)
		return value, true, err
	case "TaskBoard", "Spreadsheet":
		if node.Value == nil {
			return "None", true, nil
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			return "", false, fmt.Errorf("codegen: %s section %s expected literal payload", node.SectionType, node.FullPathName)
		}
		return literal.Payload, true, nil
	case "TextBlock", "Prompt":
		if node.Value == nil {
			return "None", true, nil
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			return "", false, fmt.Errorf("codegen: %s section %s expected literal payload", node.SectionType, node.FullPathName)
		}
		return renderPythonStringLiteral(literal.Payload), true, nil
	case "Plugin":
		if node.Value == nil {
			return "None", true, nil
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			return "", false, fmt.Errorf("codegen: plugin section %s expected literal payload", node.FullPathName)
		}
		return literal.Payload, true, nil
	case "Chat":
		value, err := c.formatFileRepresentedSection("Chat", node.FullPathName, node.Value, node.Representation)
		return value, true, err
	case "Image":
		value, err := c.formatFileRepresentedSection("Image", node.FullPathName, node.Value, node.Representation)
		return value, true, err
	case "Draw":
		value, err := c.formatFileRepresentedSection("Draw", node.FullPathName, node.Value, node.Representation)
		return value, true, err
	default:
		return "", false, nil
	}
}

func (c *PythonValueCodec) FormatDependencyValue(value PythonDependencyValue) (string, error) {
	switch typed := value.(type) {
	case LiteralDependencyValue:
		return typed.Payload, nil
	case FileReadDependencyValue:
		return c.formatFileReadValue(typed.Path), nil
	case nil:
		return "", nil
	default:
		return "", fmt.Errorf("codegen: unsupported dependency value %T", value)
	}
}

func (c *PythonValueCodec) FormatDict(
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
) (string, error) {
	parts := make([]string, 0, len(deps))
	for _, depKey := range orderedDependencyKeys(deps, depOrder) {
		if !deps[depKey] {
			continue
		}
		node, ok := c.graphNode(depKey)
		if !ok || !node.Base().IncludeInCodegen {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %s", renderPythonStringLiteral(node.Base().Name), c.varLookup(depKey)))
	}
	return c.formatCollection("{", "}", parts), nil
}

func (c *PythonValueCodec) FormatList(
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
) (string, error) {
	items := make([]string, 0, len(deps))
	for _, depKey := range orderedDependencyKeys(deps, depOrder) {
		if !deps[depKey] {
			continue
		}
		node, ok := c.graphNode(depKey)
		if !ok || !node.Base().IncludeInCodegen {
			continue
		}
		items = append(items, c.varLookup(depKey))
	}
	return c.formatCollection("[", "]", items), nil
}

func (c *PythonValueCodec) FormatParamValue(
	paramType string,
	literalValue string,
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
	representation projectstate.PythonCodeObjValueRepresentationMode,
) (string, error) {
	if paramType == "DropzoneParam" {
		return c.formatDropzoneValue(literalValue, representation)
	}
	switch representation {
	case projectstate.PythonCodeObjValueRepresentationString:
		return renderPythonStringLiteral(literalValue), nil
	case projectstate.PythonCodeObjValueRepresentationJSONParsed:
		parsed, ok := parseJSONLiteral(literalValue)
		if !ok {
			return renderPythonStringLiteral(literalValue), nil
		}
		return renderPythonLiteral(parsed), nil
	case "", projectstate.PythonCodeObjValueRepresentationExpression:
		return c.formatParamLiteral(paramType, literalValue, deps, depOrder)
	default:
		return "", fmt.Errorf("codegen: unsupported representation %q for code object type %s", representation, paramType)
	}
}

func (c *PythonValueCodec) formatParamLiteral(
	paramType string,
	literalValue string,
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
) (string, error) {
	switch paramType {
	case "CodeParam", "SliderParam", "RotaryParam", "DropdownParam":
		return literalValue, nil
	case "TextParam", "DateParam", "TimeParam", "TextAreaParam", "PasswordParam":
		return renderPythonStringLiteral(literalValue), nil
	case "SwitchParam":
		if literalValue == "true" {
			return "True", nil
		}
		return "False", nil
	case "ColorPickerParam":
		return strconv.Quote(literalValue), nil
	case "NestedParam":
		if deps == nil {
			return "", fmt.Errorf("codegen: nested param requires dependency mapping")
		}
		return c.FormatDict(deps, depOrder)
	default:
		return "", fmt.Errorf("codegen: unsupported code object type %s", paramType)
	}
}

func (c *PythonValueCodec) formatMetaControlSection(node *PythonSectionNode) (string, error) {
	if node.Value == nil {
		return "None", nil
	}
	controlType := strings.TrimSpace(node.ControlCodeObjType)
	if controlType == "" {
		return "", fmt.Errorf("codegen: missing control code object type for %s", node.FullPathName)
	}
	if controlType == "PasswordParam" {
		if strings.TrimSpace(node.ControlCodeObjImplID) == "" {
			return "", fmt.Errorf("codegen: missing control code object impl id for %s", node.FullPathName)
		}
		return c.formatPasswordValue(node.ControlCodeObjImplID), nil
	}
	literal, ok := node.Value.(LiteralDependencyValue)
	if !ok {
		return "", fmt.Errorf("codegen: meta control %s expected literal payload", node.FullPathName)
	}
	representation := node.ControlValueRepresentation
	if representation == "" {
		representation = projectstate.PythonCodeObjValueRepresentationExpression
	}
	return c.FormatParamValue(controlType, literal.Payload, nil, nil, representation)
}

func (c *PythonValueCodec) formatFileRepresentedSection(
	sectionType string,
	fullPathName string,
	value PythonDependencyValue,
	representation projectstate.PythonSectionRepresentationMode,
) (string, error) {
	if value == nil {
		return "", fmt.Errorf("codegen: %s section %s missing value", sectionType, fullPathName)
	}
	switch representation {
	case "", projectstate.PythonSectionRepresentationExpression:
		literal, ok := value.(LiteralDependencyValue)
		if !ok {
			return "", fmt.Errorf("codegen: %s section %s expected literal expression payload", sectionType, fullPathName)
		}
		return literal.Payload, nil
	case projectstate.PythonSectionRepresentationFilePath:
		literal, ok := value.(LiteralDependencyValue)
		if !ok {
			return "", fmt.Errorf("codegen: %s section %s expected literal file path payload", sectionType, fullPathName)
		}
		return renderPythonStringLiteral(literal.Payload), nil
	case projectstate.PythonSectionRepresentationFileRead:
		return c.FormatDependencyValue(value)
	default:
		return "", fmt.Errorf("codegen: unsupported representation %q for %s section %s", representation, sectionType, fullPathName)
	}
}

func (c *PythonValueCodec) formatCollection(
	openBracket string,
	closeBracket string,
	items []string,
) string {
	if len(items) == 0 {
		return openBracket + closeBracket
	}
	joined := strings.Join(items, ", ")
	inline := openBracket + joined + closeBracket
	if !c.shouldMultilineCollection(items, inline) {
		return inline
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		lines = append(lines, c.collectionItemIndent+item+",")
	}
	return openBracket + "\n" + strings.Join(lines, "\n") + "\n" + c.collectionCloseIndent + closeBracket
}

func (c *PythonValueCodec) shouldMultilineCollection(items []string, inline string) bool {
	for _, item := range items {
		if strings.Contains(item, "\n") {
			return true
		}
	}
	if len(items) >= c.multilineCollectionMinItems {
		return true
	}
	return len(inline) > c.maxInlineCollectionChars
}

func (c *PythonValueCodec) constructCallable(
	callableName string,
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
) (string, error) {
	items := make([]string, 0, len(deps))
	for _, depKey := range orderedDependencyKeys(deps, depOrder) {
		if !deps[depKey] {
			continue
		}
		node, ok := c.graphNode(depKey)
		if !ok || !node.Base().IncludeInCodegen {
			continue
		}
		paramNode, ok := node.(*PythonParamNode)
		if !ok {
			continue
		}
		varName := c.varLookup(depKey)
		switch paramNode.PassingStyle {
		case "ARGS":
			items = append(items, "*"+varName)
		case "KWARGS":
			items = append(items, "**"+varName)
		case "", "DEFAULT", "KEYWORD_ONLY":
			items = append(items, fmt.Sprintf("%s=%s", paramNode.Name, varName))
		default:
			items = append(items, varName)
		}
	}
	return c.formatCollection(callableName+"(", ")", items), nil
}

func (c *PythonValueCodec) formatDropzoneValue(
	literalValue string,
	representation projectstate.PythonCodeObjValueRepresentationMode,
) (string, error) {
	switch representation {
	case projectstate.PythonCodeObjValueRepresentationFilePath:
		return c.formatDropzoneEntries(literalValue, false), nil
	case projectstate.PythonCodeObjValueRepresentationFileRead:
		return c.formatDropzoneEntries(literalValue, true), nil
	default:
		return "", fmt.Errorf("codegen: unsupported representation for DropzoneParam: %s", representation)
	}
}

func (c *PythonValueCodec) formatDropzoneEntries(
	literalValue string,
	readFiles bool,
) string {
	if literalValue == "" {
		return "[]"
	}
	attachments, ok := parseDropzoneAttachments(literalValue)
	if !ok {
		return renderPythonStringLiteral(literalValue)
	}
	items := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		switch attachment.Kind {
		case "file":
			if readFiles {
				items = append(items, c.formatFileReadValue(attachment.ID))
			} else {
				items = append(items, renderPythonStringLiteral(attachment.ID))
			}
		case "text":
			items = append(items, renderPythonStringLiteral(attachment.Text))
		}
	}
	return c.formatCollection("[", "]", items)
}

func (c *PythonValueCodec) formatFileReadValue(path string) string {
	if c.mode == PythonValueModeLiveRuntime {
		return renderPythonStringLiteral(path)
	}
	helperAlias := c.requireValueHelpers()
	return fmt.Sprintf("%s.read_file_value(%s)", helperAlias, renderPythonStringLiteral(path))
}

func (c *PythonValueCodec) formatPasswordValue(codeObjectImplID string) string {
	helperAlias := c.requireValueHelpers()
	return fmt.Sprintf("%s.read_password_value(%s)", helperAlias, renderPythonStringLiteral(codeObjectImplID))
}

func (c *PythonValueCodec) requireValueHelpers() string {
	importStmt := "from setta.code_gen.python import value_helpers as " + c.helperModuleAlias
	c.requiredImports[importStmt] = struct{}{}
	return c.helperModuleAlias
}

func (c *PythonValueCodec) expectLiteral(node *PythonParamNode) (string, error) {
	if node.Value == nil {
		return "", nil
	}
	literal, ok := node.Value.(LiteralDependencyValue)
	if !ok {
		return "", fmt.Errorf("codegen: unsupported dependency value %T for node %s", node.Value, node.FullPathName)
	}
	return literal.Payload, nil
}

func (c *PythonValueCodec) graphNode(key PythonDependencyKey) (PythonDependencyNode, bool) {
	if c.graph == nil {
		return nil, false
	}
	node, ok := c.graph.Nodes[key]
	return node, ok
}

func orderedDependencyKeys(
	deps map[PythonDependencyKey]bool,
	depOrder []PythonDependencyKey,
) []PythonDependencyKey {
	if len(deps) == 0 {
		return nil
	}
	keys := make([]PythonDependencyKey, 0, len(deps))
	seen := make(map[PythonDependencyKey]struct{}, len(depOrder))
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
	missing := make([]PythonDependencyKey, 0, len(deps)-len(keys))
	for key := range deps {
		if _, ok := seen[key]; ok {
			continue
		}
		missing = append(missing, key)
	}
	sort.Slice(missing, func(i int, j int) bool {
		return dependencyKeySortString(missing[i]) < dependencyKeySortString(missing[j])
	})
	return append(keys, missing...)
}

func dependencyKeySortString(key PythonDependencyKey) string {
	return key.SectionID + "\x00" + key.CodeObjectID
}

func parseJSONLiteral(literalValue string) (any, bool) {
	var parsed any
	if err := json.Unmarshal([]byte(literalValue), &parsed); err != nil {
		return nil, false
	}
	return parsed, true
}

type dropzoneStoredValue struct {
	Attachments json.RawMessage `json:"attachments"`
}

type dropzoneAttachment struct {
	Kind string
	ID   string
	Text string
}

type rawDropzoneAttachment struct {
	Kind string  `json:"kind"`
	ID   *string `json:"id"`
	Name *string `json:"name"`
	Text *string `json:"text"`
}

func parseDropzoneAttachments(literalValue string) ([]dropzoneAttachment, bool) {
	var payload dropzoneStoredValue
	if err := json.Unmarshal([]byte(literalValue), &payload); err != nil {
		return nil, false
	}
	if len(payload.Attachments) == 0 {
		return nil, true
	}
	if bytes.Equal(bytes.TrimSpace(payload.Attachments), []byte("null")) {
		return nil, false
	}
	var rawAttachments []json.RawMessage
	if err := json.Unmarshal(payload.Attachments, &rawAttachments); err != nil {
		return nil, false
	}
	attachments := make([]dropzoneAttachment, 0, len(rawAttachments))
	for _, rawAttachment := range rawAttachments {
		var attachment rawDropzoneAttachment
		if err := json.Unmarshal(rawAttachment, &attachment); err != nil {
			return nil, false
		}
		if attachment.ID == nil || attachment.Name == nil {
			return nil, false
		}
		switch attachment.Kind {
		case "file":
			attachments = append(attachments, dropzoneAttachment{
				Kind: attachment.Kind,
				ID:   *attachment.ID,
			})
		case "text":
			if attachment.Text == nil {
				return nil, false
			}
			attachments = append(attachments, dropzoneAttachment{
				Kind: attachment.Kind,
				ID:   *attachment.ID,
				Text: *attachment.Text,
			})
		default:
			return nil, false
		}
	}
	return attachments, true
}

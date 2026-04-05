package watchcode

import (
	"crypto/sha256"
	"encoding/hex"
	"path"
	"sort"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_python "github.com/tree-sitter/tree-sitter-python/bindings/go"
)

type CallableKind string

const (
	CallableKindFunction      CallableKind = "function"
	CallableKindAsyncFunction CallableKind = "async_function"
	CallableKindClassInit     CallableKind = "class_init"
)

type CallableInfo struct {
	Identity      string
	CanonicalName string
	ModulePath    string
	SymbolName    string
	Kind          CallableKind
	SignatureHash string
	BodyHash      string
	Params        []CallableParam
}

type CallableParam struct {
	Name           string
	DefaultValue   string
	TypeAnnotation string
	PassingStyle   string
}

func ParsePythonCallables(code string, relativeSourcePath string) ([]CallableInfo, bool, error) {
	if strings.TrimSpace(code) == "" {
		return []CallableInfo{}, true, nil
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_python.Language())); err != nil {
		return nil, false, err
	}

	source := []byte(code)
	tree := parser.Parse(source, nil)
	if tree == nil {
		return []CallableInfo{}, true, nil
	}
	defer tree.Close()

	root := tree.RootNode()
	if root == nil {
		return []CallableInfo{}, true, nil
	}
	if root.HasError() {
		return nil, false, nil
	}

	modulePath := modulePathFromRelativePath(relativeSourcePath)
	output := make([]CallableInfo, 0, root.NamedChildCount())
	for i := uint(0); i < root.NamedChildCount(); i++ {
		definition := unwrapDefinition(root.NamedChild(i))
		if definition == nil {
			continue
		}

		switch definition.Kind() {
		case "function_definition":
			symbolName := nodeText(definition.ChildByFieldName("name"), source)
			if strings.TrimSpace(symbolName) == "" {
				continue
			}
			kind := CallableKindFunction
			if isAsyncFunctionDefinition(definition) {
				kind = CallableKindAsyncFunction
			}
			output = append(output, CallableInfo{
				Identity:      buildIdentity(modulePath, symbolName, kind),
				CanonicalName: buildCanonicalName(modulePath, symbolName),
				ModulePath:    modulePath,
				SymbolName:    symbolName,
				Kind:          kind,
				SignatureHash: hashParameterList(definition.ChildByFieldName("parameters"), source, false),
				BodyHash:      hashNode(definition.ChildByFieldName("body"), source),
				Params:        extractCallableParams(definition.ChildByFieldName("parameters"), source, false),
			})
		case "class_definition":
			symbolName := nodeText(definition.ChildByFieldName("name"), source)
			if strings.TrimSpace(symbolName) == "" {
				continue
			}
			initDefinition := findClassInitDefinition(definition, source)
			signatureHash := digestString("")
			if initDefinition != nil {
				signatureHash = hashParameterList(initDefinition.ChildByFieldName("parameters"), source, true)
			}
			output = append(output, CallableInfo{
				Identity:      buildIdentity(modulePath, symbolName, CallableKindClassInit),
				CanonicalName: buildCanonicalName(modulePath, symbolName),
				ModulePath:    modulePath,
				SymbolName:    symbolName,
				Kind:          CallableKindClassInit,
				SignatureHash: signatureHash,
				BodyHash:      hashNode(definition.ChildByFieldName("body"), source),
				Params:        extractCallableParams(initDefinitionParameters(initDefinition), source, true),
			})
		}
	}

	sort.Slice(output, func(i int, j int) bool {
		return output[i].Identity < output[j].Identity
	})
	return output, true, nil
}

func IdentityList(callables []CallableInfo) []string {
	output := make([]string, 0, len(callables))
	for _, callable := range callables {
		output = append(output, callable.Identity)
	}
	return output
}

type callableParamToken struct {
	proposal CallableParam
	marker   string
}

func modulePathFromRelativePath(relativeSourcePath string) string {
	normalized := strings.TrimSpace(relativeSourcePath)
	if normalized == "" {
		return ""
	}
	normalized = strings.ReplaceAll(normalized, "\\", "/")
	normalized = path.Clean(normalized)
	normalized = strings.TrimSuffix(normalized, path.Ext(normalized))
	if normalized == "." {
		return ""
	}
	return strings.ReplaceAll(normalized, "/", ".")
}

func buildCanonicalName(modulePath string, symbolName string) string {
	trimmedSymbolName := strings.TrimSpace(symbolName)
	if trimmedSymbolName == "" {
		return ""
	}
	if strings.TrimSpace(modulePath) == "" {
		return trimmedSymbolName
	}
	return modulePath + "." + trimmedSymbolName
}

func buildIdentity(modulePath string, symbolName string, kind CallableKind) string {
	return buildCanonicalName(modulePath, symbolName) + ":" + string(kind)
}

func unwrapDefinition(node *tree_sitter.Node) *tree_sitter.Node {
	if node == nil {
		return nil
	}
	if node.Kind() != "decorated_definition" {
		return node
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		child := node.NamedChild(i)
		switch child.Kind() {
		case "function_definition", "class_definition":
			return child
		}
	}
	return nil
}

func findClassInitDefinition(classDefinition *tree_sitter.Node, source []byte) *tree_sitter.Node {
	if classDefinition == nil {
		return nil
	}
	body := classDefinition.ChildByFieldName("body")
	if body == nil {
		return nil
	}
	for i := uint(0); i < body.NamedChildCount(); i++ {
		candidate := unwrapDefinition(body.NamedChild(i))
		if candidate == nil || candidate.Kind() != "function_definition" {
			continue
		}
		if nodeText(candidate.ChildByFieldName("name"), source) == "__init__" {
			return candidate
		}
	}
	return nil
}

func isAsyncFunctionDefinition(node *tree_sitter.Node) bool {
	if node == nil {
		return false
	}
	for i := uint(0); i < node.ChildCount(); i++ {
		child := node.Child(i)
		if child == nil {
			continue
		}
		if child.Kind() == "async" {
			return true
		}
	}
	return false
}

func initDefinitionParameters(initDefinition *tree_sitter.Node) *tree_sitter.Node {
	if initDefinition == nil {
		return nil
	}
	return initDefinition.ChildByFieldName("parameters")
}

func extractCallableParams(parameters *tree_sitter.Node, source []byte, dropFirstNamedParam bool) []CallableParam {
	if parameters == nil {
		return []CallableParam{}
	}

	tokens := make([]callableParamToken, 0, parameters.NamedChildCount())
	droppedFirstNamedParam := !dropFirstNamedParam
	for i := uint(0); i < parameters.NamedChildCount(); i++ {
		child := parameters.NamedChild(i)
		if child == nil {
			continue
		}

		token, ok := callableParamTokenFromNode(child, source)
		if !ok {
			continue
		}
		if token.marker == "" && !droppedFirstNamedParam {
			droppedFirstNamedParam = true
			continue
		}
		tokens = append(tokens, token)
	}

	positionalSeparatorIndex := -1
	keywordOnlySeparatorIndex := -1
	for index, token := range tokens {
		switch token.marker {
		case "/":
			positionalSeparatorIndex = index
		case "*":
			keywordOnlySeparatorIndex = index
		default:
			if token.proposal.PassingStyle == "ARGS" {
				keywordOnlySeparatorIndex = index
			}
		}
	}

	params := make([]CallableParam, 0, len(tokens))
	for index, token := range tokens {
		if token.marker != "" {
			continue
		}

		proposal := token.proposal
		switch {
		case proposal.PassingStyle == "ARGS" || proposal.PassingStyle == "KWARGS":
		case positionalSeparatorIndex >= 0 && index < positionalSeparatorIndex:
			proposal.PassingStyle = "POSITIONAL_ONLY"
		case keywordOnlySeparatorIndex >= 0 && index > keywordOnlySeparatorIndex:
			proposal.PassingStyle = "KEYWORD_ONLY"
		default:
			proposal.PassingStyle = "DEFAULT"
		}
		params = append(params, proposal)
	}
	return params
}

func callableParamTokenFromNode(node *tree_sitter.Node, source []byte) (callableParamToken, bool) {
	if node == nil {
		return callableParamToken{}, false
	}

	switch node.Kind() {
	case "identifier":
		name := strings.TrimSpace(nodeText(node, source))
		if name == "" {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{Name: name}}, true
	case "typed_parameter":
		nameNode := node.Child(0)
		name, passingStyle, ok := callableParamNameAndStyle(nameNode, source)
		if !ok {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{
			Name:           name,
			TypeAnnotation: strings.TrimSpace(nodeText(node.ChildByFieldName("type"), source)),
			PassingStyle:   passingStyle,
		}}, true
	case "default_parameter":
		nameNode := node.ChildByFieldName("name")
		name, passingStyle, ok := callableParamNameAndStyle(nameNode, source)
		if !ok {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{
			Name:         name,
			DefaultValue: strings.TrimSpace(nodeText(node.ChildByFieldName("value"), source)),
			PassingStyle: passingStyle,
		}}, true
	case "typed_default_parameter":
		nameNode := node.ChildByFieldName("name")
		name, passingStyle, ok := callableParamNameAndStyle(nameNode, source)
		if !ok {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{
			Name:           name,
			DefaultValue:   strings.TrimSpace(nodeText(node.ChildByFieldName("value"), source)),
			TypeAnnotation: strings.TrimSpace(nodeText(node.ChildByFieldName("type"), source)),
			PassingStyle:   passingStyle,
		}}, true
	case "list_splat_pattern":
		name := strings.TrimSpace(nodeText(node, source))
		if name == "" {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{Name: name, PassingStyle: "ARGS"}}, true
	case "dictionary_splat_pattern":
		name := strings.TrimSpace(nodeText(node, source))
		if name == "" {
			return callableParamToken{}, false
		}
		return callableParamToken{proposal: CallableParam{Name: name, PassingStyle: "KWARGS"}}, true
	case "positional_separator":
		return callableParamToken{marker: "/"}, true
	case "keyword_separator":
		return callableParamToken{marker: "*"}, true
	default:
		return callableParamToken{}, false
	}
}

func callableParamNameAndStyle(node *tree_sitter.Node, source []byte) (string, string, bool) {
	if node == nil {
		return "", "", false
	}

	name := strings.TrimSpace(nodeText(node, source))
	if name == "" {
		return "", "", false
	}

	switch node.Kind() {
	case "list_splat_pattern":
		return name, "ARGS", true
	case "dictionary_splat_pattern":
		return name, "KWARGS", true
	case "tuple_pattern":
		return "", "", false
	default:
		return name, "", true
	}
}

func hashParameterList(parameters *tree_sitter.Node, source []byte, dropFirstNamedParam bool) string {
	if parameters == nil {
		return digestString("")
	}

	var builder strings.Builder
	builder.WriteString("parameters[")
	droppedFirst := false
	skipTrailingComma := false
	for i := uint(0); i < parameters.ChildCount(); i++ {
		child := parameters.Child(i)
		if child == nil {
			continue
		}
		if child.Kind() == "(" || child.Kind() == ")" {
			continue
		}
		if skipTrailingComma {
			skipTrailingComma = false
			if child.Kind() == "," {
				continue
			}
		}
		if dropFirstNamedParam && !droppedFirst && child.IsNamed() {
			droppedFirst = true
			skipTrailingComma = true
			continue
		}
		serializeNode(&builder, child, source)
		builder.WriteString(";")
	}
	builder.WriteString("]")
	return digestString(builder.String())
}

func hashNode(node *tree_sitter.Node, source []byte) string {
	if node == nil {
		return digestString("")
	}
	var builder strings.Builder
	serializeNode(&builder, node, source)
	return digestString(builder.String())
}

func serializeNode(builder *strings.Builder, node *tree_sitter.Node, source []byte) {
	if node == nil {
		return
	}
	builder.WriteString(node.Kind())
	builder.WriteString("{")
	if node.ChildCount() == 0 {
		builder.WriteString(nodeText(node, source))
		builder.WriteString("}")
		return
	}
	for i := uint(0); i < node.ChildCount(); i++ {
		child := node.Child(i)
		if child == nil {
			continue
		}
		serializeNode(builder, child, source)
		builder.WriteString(";")
	}
	builder.WriteString("}")
}

func nodeText(node *tree_sitter.Node, source []byte) string {
	if node == nil {
		return ""
	}
	return node.Utf8Text(source)
}

func digestString(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

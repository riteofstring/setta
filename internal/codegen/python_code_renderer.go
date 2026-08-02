package codegen

import "fmt"

const (
	PythonGeneratedStateInstanceName               = "state"
	pythonGeneratedStateClassDef                   = "class SettaState:\n    def __init__(state):\n"
	PythonGeneratedCodeSeparator                   = "\n\n"
	PythonGeneratedCodeBodyIndent                  = "        "
	PythonGeneratedCodeMultilineContinuationIndent = PythonGeneratedCodeBodyIndent + "    "
)

type PythonCodeLine struct {
	VarString   string
	PrefixLen   int
	ValueLen    int
	Position    int
	HasPosition bool
}

func (l PythonCodeLine) ValuePosStart() (int, bool) {
	if !l.HasPosition {
		return 0, false
	}
	return l.Position + l.PrefixLen, true
}

type PythonCodeRendererOptions struct {
	ValueMode PythonValueMode
	MetaCode  string
}

type PythonCodeRenderer struct {
	graph                 *PythonDependencyGraph
	genCodePrefix         string
	genCodeSuffix         string
	valueMode             PythonValueMode
	metaCode              string
	metaModuleName        string
	metaVariableName      string
	valueCodec            *PythonValueCodec
	VarNameMapping        map[PythonDependencyKey]string
	ReverseVarNameMapping map[string]PythonDependencyKey
	ValuePosStartToKey    map[int]PythonDependencyKey
	GeneratedCode         string
	Code                  string
	Lines                 map[PythonDependencyKey]PythonCodeLine
}

func NewPythonCodeRenderer(
	graph *PythonDependencyGraph,
	genCodePrefix string,
	genCodeSuffix string,
	options PythonCodeRendererOptions,
) *PythonCodeRenderer {
	valueMode := options.ValueMode
	if valueMode == "" {
		valueMode = PythonValueModePackagedRuntime
	}
	renderer := &PythonCodeRenderer{
		graph:            graph,
		genCodePrefix:    genCodePrefix,
		genCodeSuffix:    genCodeSuffix,
		valueMode:        valueMode,
		metaCode:         options.MetaCode,
		metaModuleName:   "setta_gen_meta",
		metaVariableName: "meta",
	}
	renderer.valueCodec = NewPythonValueCodec(graph, renderer.lookupVarName, PythonValueCodecOptions{
		Mode:                  valueMode,
		CollectionItemIndent:  PythonGeneratedCodeMultilineContinuationIndent,
		CollectionCloseIndent: PythonGeneratedCodeBodyIndent,
	})
	renderer.Reset()
	return renderer
}

func (r *PythonCodeRenderer) Reset() {
	r.valueCodec.ResetUsage()
	r.VarNameMapping = map[PythonDependencyKey]string{}
	r.ReverseVarNameMapping = map[string]PythonDependencyKey{}
	r.ValuePosStartToKey = map[int]PythonDependencyKey{}
	r.GeneratedCode = ""
	r.Code = ""
	r.Lines = map[PythonDependencyKey]PythonCodeLine{}
}

func (r *PythonCodeRenderer) GenerateCode() int {
	r.Reset()
	processed := map[PythonDependencyKey]bool{}
	activePath := map[PythonDependencyKey]struct{}{}
	for _, key := range r.orderedNodeKeys() {
		node, ok := r.graphNode(key)
		if !ok || !node.Base().IsTopLevel || !node.HasNameAndValue() || !node.Base().IncludeInCodegen {
			continue
		}
		r.processNodeAndDeps(key, node, processed, activePath)
	}

	prefixOffset := len(r.genCodePrefix) + len(PythonGeneratedCodeSeparator)
	r.GeneratedCode = r.generateWrapperClass(prefixOffset)
	r.Code = r.genCodePrefix + PythonGeneratedCodeSeparator + r.GeneratedCode + PythonGeneratedCodeSeparator + r.genCodeSuffix
	if metaBlock := r.metadataAssignmentBlock(); metaBlock != "" {
		r.Code = r.Code + PythonGeneratedCodeSeparator + metaBlock
	}
	return prefixOffset + len(r.GeneratedCode) + len(PythonGeneratedCodeSeparator)
}

func (r *PythonCodeRenderer) processNodeAndDeps(
	key PythonDependencyKey,
	node PythonDependencyNode,
	processed map[PythonDependencyKey]bool,
	activePath map[PythonDependencyKey]struct{},
) {
	if processed[key] || !node.Base().IncludeInCodegen {
		return
	}
	if _, cycle := activePath[key]; cycle {
		return
	}
	activePath[key] = struct{}{}
	for _, depKey := range orderedDependencyKeys(node.Base().Deps, node.Base().DepOrder) {
		if !node.Base().Deps[depKey] {
			continue
		}
		depNode, ok := r.graphNode(depKey)
		if !ok || !depNode.Base().IncludeInCodegen {
			continue
		}
		r.processNodeAndDeps(depKey, depNode, processed, activePath)
	}
	delete(activePath, key)
	r.createLine(key, node)
	processed[key] = true
}

func (r *PythonCodeRenderer) generateWrapperClass(positionOffset int) string {
	code := pythonGeneratedStateClassDef
	if helperBlock := r.helperImportBlock(); helperBlock != "" {
		code = helperBlock + "\n" + code
	}
	if len(r.Lines) == 0 {
		return code + PythonGeneratedCodeBodyIndent + "pass"
	}
	orderedLines := make([]PythonDependencyKey, 0, len(r.Lines))
	for _, key := range r.orderedNodeKeys() {
		if _, ok := r.Lines[key]; ok {
			orderedLines = append(orderedLines, key)
		}
	}
	lastIndex := len(orderedLines) - 1
	for index, key := range orderedLines {
		line := r.Lines[key]
		currPos := positionOffset + len(code) + len(PythonGeneratedCodeBodyIndent)
		lineString := PythonGeneratedCodeBodyIndent + line.VarString
		code += lineString
		if index < lastIndex {
			code += "\n"
		}
		line.Position = currPos
		line.HasPosition = true
		r.Lines[key] = line
		if valuePosStart, ok := line.ValuePosStart(); ok {
			r.ValuePosStartToKey[valuePosStart] = key
		}
	}
	return code
}

func (r *PythonCodeRenderer) helperImportBlock() string {
	helperImports := append([]string(nil), r.valueCodec.RequiredImports()...)
	if metaImport := r.metaImportLine(); metaImport != "" {
		helperImports = append(helperImports, metaImport)
	}
	if len(helperImports) == 0 {
		return ""
	}
	return joinLines(helperImports)
}

func (r *PythonCodeRenderer) metaImportLine() string {
	if r.metaCode == "" || r.valueMode != PythonValueModePackagedRuntime {
		return ""
	}
	return "from . import " + r.metaModuleName
}

func (r *PythonCodeRenderer) createLine(key PythonDependencyKey, node PythonDependencyNode) {
	if !node.Base().IncludeInCodegen {
		return
	}
	value, err := r.nodeValue(node)
	if err != nil || value == "" {
		return
	}
	if r.shouldWrapMultiline(node, value) {
		value = r.wrapMultilineExpression(value)
	}
	varName := r.createVarName(key, node)
	prefix := varName + " = "
	r.Lines[key] = PythonCodeLine{
		VarString: prefix + value,
		PrefixLen: len(prefix),
		ValueLen:  len(value),
	}
}

func (r *PythonCodeRenderer) shouldWrapMultiline(node PythonDependencyNode, value string) bool {
	if value == "" || !containsNewline(value) {
		return false
	}
	switch typed := node.(type) {
	case *PythonParamNode:
		return typed.CodeObjectType == "CodeParam"
	case *PythonSectionNode:
		return typed.ControlCodeObjType == "CodeParam"
	default:
		return false
	}
}

func (r *PythonCodeRenderer) wrapMultilineExpression(value string) string {
	lines := splitLines(value)
	for index, line := range lines {
		lines[index] = PythonGeneratedCodeMultilineContinuationIndent + line
	}
	return "(\n" + joinLines(lines) + "\n" + PythonGeneratedCodeBodyIndent + ")"
}

func (r *PythonCodeRenderer) metadataAssignmentBlock() string {
	if r.metaCode == "" {
		return ""
	}
	if r.valueMode == PythonValueModePackagedRuntime {
		return PythonGeneratedStateInstanceName + ".__state__ = " + r.metaModuleName + "." + r.metaVariableName
	}
	metaNamespace := "_setta_gen_meta_ns"
	metaSource := renderPythonStringLiteral(r.metaCode)
	return joinLines([]string{
		metaNamespace + ": dict[str, object] = {}",
		"exec(" + metaSource + ", " + metaNamespace + ")",
		PythonGeneratedStateInstanceName + ".__state__ = " + metaNamespace + "[" + renderPythonStringLiteral(r.metaVariableName) + "]",
	})
}

func (r *PythonCodeRenderer) createVarName(key PythonDependencyKey, node PythonDependencyNode) string {
	varName := PythonGeneratedStateInstanceName + "." + node.Base().FullPathName
	r.VarNameMapping[key] = varName
	r.ReverseVarNameMapping[varName] = key
	return varName
}

func (r *PythonCodeRenderer) lookupVarName(key PythonDependencyKey) string {
	return r.VarNameMapping[key]
}

func (r *PythonCodeRenderer) nodeValue(node PythonDependencyNode) (string, error) {
	switch typed := node.(type) {
	case *PythonSectionNode:
		value, handled, err := r.valueCodec.FormatSection(typed)
		if err != nil || !handled {
			return "", err
		}
		return value, nil
	case *PythonParamNode:
		return r.valueCodec.FormatParamExpression(typed)
	default:
		return "", fmt.Errorf("codegen: unsupported node type %T", node)
	}
}

func (r *PythonCodeRenderer) orderedNodeKeys() []PythonDependencyKey {
	if r.graph == nil {
		return nil
	}
	if len(r.graph.NodeOrder) > 0 {
		return r.graph.NodeOrder
	}
	keys := make([]PythonDependencyKey, 0, len(r.graph.Nodes))
	for key := range r.graph.Nodes {
		keys = append(keys, key)
	}
	return orderedDependencyKeys(mapKeysToTrue(keys), nil)
}

func (r *PythonCodeRenderer) graphNode(key PythonDependencyKey) (PythonDependencyNode, bool) {
	if r.graph == nil {
		return nil, false
	}
	node, ok := r.graph.Nodes[key]
	return node, ok
}

func mapKeysToTrue(keys []PythonDependencyKey) map[PythonDependencyKey]bool {
	values := make(map[PythonDependencyKey]bool, len(keys))
	for _, key := range keys {
		values[key] = true
	}
	return values
}

func containsNewline(value string) bool {
	for _, char := range value {
		if char == '\n' {
			return true
		}
	}
	return false
}

func splitLines(value string) []string {
	lines := make([]string, 0, 8)
	start := 0
	for index, char := range value {
		if char != '\n' {
			continue
		}
		lines = append(lines, value[start:index])
		start = index + 1
	}
	return append(lines, value[start:])
}

func joinLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	output := lines[0]
	for _, line := range lines[1:] {
		output += "\n" + line
	}
	return output
}

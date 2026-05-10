package codegen

import (
	"sort"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_python "github.com/tree-sitter/tree-sitter-python/bindings/go"
)

type pythonSpecialVarExpressionFinder struct {
	source       []byte
	specialVar   string
	keepAttrOnly bool
	refs         map[string][]int
	scopeStack   []map[string]struct{}
}

func findUndefinedPythonSpecialVarExpressionPositions(
	code string,
	specialVar string,
	keepAttrOnly bool,
) (map[string][]int, error) {
	if strings.TrimSpace(code) == "" || strings.TrimSpace(specialVar) == "" {
		return nil, nil
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_python.Language())); err != nil {
		return nil, err
	}

	source := []byte(code)
	tree := parser.Parse(source, nil)
	if tree == nil {
		return nil, nil
	}
	defer tree.Close()

	root := tree.RootNode()
	if root == nil || root.HasError() {
		return nil, nil
	}

	finder := &pythonSpecialVarExpressionFinder{
		source:       source,
		specialVar:   specialVar,
		keepAttrOnly: keepAttrOnly,
		refs:         map[string][]int{},
		scopeStack:   []map[string]struct{}{{}},
	}
	finder.visit(root)
	if len(finder.refs) == 0 {
		return nil, nil
	}
	for ref := range finder.refs {
		sort.Ints(finder.refs[ref])
	}
	return finder.refs, nil
}

func (f *pythonSpecialVarExpressionFinder) visit(node *tree_sitter.Node) {
	if node == nil {
		return
	}

	switch node.Kind() {
	case "attribute":
		f.visitAttribute(node)
		return
	case "function_definition":
		f.visitFunctionDefinition(node)
		return
	case "lambda":
		f.visitLambda(node)
		return
	case "for_statement":
		f.visitForStatement(node)
		return
	case "list_comprehension", "dictionary_comprehension", "set_comprehension":
		f.visitComprehension(node)
		return
	case "assignment", "augmented_assignment":
		f.visitAssignment(node)
		return
	case "named_expression":
		f.visitNamedExpression(node)
		return
	}

	for i := uint(0); i < node.NamedChildCount(); i++ {
		f.visit(node.NamedChild(i))
	}
}

func (f *pythonSpecialVarExpressionFinder) visitAttribute(node *tree_sitter.Node) {
	objectNode := node.ChildByFieldName("object")
	if objectNode != nil && objectNode.Kind() == "identifier" && f.nodeText(objectNode) == f.specialVar && !f.isDefined(f.specialVar) {
		attributeNode := node.ChildByFieldName("attribute")
		if attributeNode != nil && attributeNode.Kind() == "identifier" {
			ref := f.nodeText(attributeNode)
			position := int(attributeNode.StartByte())
			if !f.keepAttrOnly {
				ref = f.specialVar + "." + ref
				position = int(node.StartByte())
			}
			f.refs[ref] = append(f.refs[ref], position)
		}
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		f.visit(node.NamedChild(i))
	}
}

func (f *pythonSpecialVarExpressionFinder) visitFunctionDefinition(node *tree_sitter.Node) {
	nameNode := node.ChildByFieldName("name")
	if nameNode != nil && nameNode.Kind() == "identifier" {
		f.define(f.nodeText(nameNode))
	}

	f.pushScope()
	f.defineParameters(node.ChildByFieldName("parameters"))
	f.visit(node.ChildByFieldName("body"))
	f.popScope()
}

func (f *pythonSpecialVarExpressionFinder) visitLambda(node *tree_sitter.Node) {
	f.pushScope()
	f.defineParameters(node.ChildByFieldName("parameters"))
	f.visit(node.ChildByFieldName("body"))
	f.popScope()
}

func (f *pythonSpecialVarExpressionFinder) visitForStatement(node *tree_sitter.Node) {
	f.visitNamedChildrenByField(node, "right")
	f.definePattern(node.ChildByFieldName("left"))
	f.visit(node.ChildByFieldName("body"))
	f.visit(node.ChildByFieldName("alternative"))
}

func (f *pythonSpecialVarExpressionFinder) visitComprehension(node *tree_sitter.Node) {
	f.pushScope()
	for i := uint(0); i < node.NamedChildCount(); i++ {
		child := node.NamedChild(i)
		switch child.Kind() {
		case "for_in_clause":
			f.visitForInClause(child)
		case "if_clause":
			f.visit(child)
		}
	}
	f.visit(node.ChildByFieldName("body"))
	f.popScope()
}

func (f *pythonSpecialVarExpressionFinder) visitForInClause(node *tree_sitter.Node) {
	f.visitNamedChildrenByField(node, "right")
	f.definePattern(node.ChildByFieldName("left"))
}

func (f *pythonSpecialVarExpressionFinder) visitAssignment(node *tree_sitter.Node) {
	f.definePattern(node.ChildByFieldName("left"))
	f.visitNamedChildrenByField(node, "right")
}

func (f *pythonSpecialVarExpressionFinder) visitNamedExpression(node *tree_sitter.Node) {
	f.definePattern(node.ChildByFieldName("name"))
	f.visit(node.ChildByFieldName("value"))
}

func (f *pythonSpecialVarExpressionFinder) visitNamedChildrenByField(node *tree_sitter.Node, field string) {
	for i := uint(0); i < node.NamedChildCount(); i++ {
		if node.FieldNameForNamedChild(uint32(i)) != field {
			continue
		}
		f.visit(node.NamedChild(i))
	}
}

func (f *pythonSpecialVarExpressionFinder) defineParameters(node *tree_sitter.Node) {
	if node == nil {
		return
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		f.definePattern(node.NamedChild(i))
	}
}

func (f *pythonSpecialVarExpressionFinder) definePattern(node *tree_sitter.Node) {
	if node == nil {
		return
	}
	switch node.Kind() {
	case "identifier":
		f.define(f.nodeText(node))
	case "default_parameter", "typed_default_parameter":
		f.definePattern(node.ChildByFieldName("name"))
	case "typed_parameter", "tuple_pattern", "list_pattern", "pattern_list", "list_splat_pattern", "dictionary_splat_pattern":
		for i := uint(0); i < node.NamedChildCount(); i++ {
			f.definePattern(node.NamedChild(i))
		}
	}
}

func (f *pythonSpecialVarExpressionFinder) define(name string) {
	if strings.TrimSpace(name) == "" {
		return
	}
	f.scopeStack[len(f.scopeStack)-1][name] = struct{}{}
}

func (f *pythonSpecialVarExpressionFinder) isDefined(name string) bool {
	for i := len(f.scopeStack) - 1; i >= 0; i-- {
		if _, ok := f.scopeStack[i][name]; ok {
			return true
		}
	}
	return false
}

func (f *pythonSpecialVarExpressionFinder) pushScope() {
	f.scopeStack = append(f.scopeStack, map[string]struct{}{})
}

func (f *pythonSpecialVarExpressionFinder) popScope() {
	if len(f.scopeStack) <= 1 {
		return
	}
	f.scopeStack = f.scopeStack[:len(f.scopeStack)-1]
}

func (f *pythonSpecialVarExpressionFinder) nodeText(node *tree_sitter.Node) string {
	if node == nil {
		return ""
	}
	return node.Utf8Text(f.source)
}

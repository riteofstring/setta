package renderer

import (
	"sort"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_python "github.com/tree-sitter/tree-sitter-python/bindings/go"
)

type pythonStateReference struct {
	Path  string
	Range ByteRange
}

func findPythonStateReferences(expression string) ([]pythonStateReference, error) {
	if strings.TrimSpace(expression) == "" {
		return nil, nil
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_python.Language())); err != nil {
		return nil, err
	}

	source := []byte(expression)
	tree := parser.Parse(source, nil)
	if tree == nil {
		return nil, nil
	}
	defer tree.Close()

	root := tree.RootNode()
	if root == nil || root.HasError() {
		return nil, nil
	}

	finder := pythonStateReferenceFinder{
		source:     source,
		references: []pythonStateReference{},
		scopes:     []map[string]struct{}{{}},
	}
	finder.visit(root)
	if len(finder.references) == 0 {
		return nil, nil
	}
	sort.SliceStable(finder.references, func(left int, right int) bool {
		return finder.references[left].Range.Start < finder.references[right].Range.Start
	})
	return finder.references, nil
}

type pythonStateReferenceFinder struct {
	source     []byte
	references []pythonStateReference
	scopes     []map[string]struct{}
}

func (finder *pythonStateReferenceFinder) visit(node *tree_sitter.Node) {
	if node == nil {
		return
	}

	switch node.Kind() {
	case "attribute":
		finder.visitAttribute(node)
		return
	case "function_definition":
		finder.visitFunctionDefinition(node)
		return
	case "lambda":
		finder.visitLambda(node)
		return
	case "for_statement":
		finder.visitForStatement(node)
		return
	case "list_comprehension", "dictionary_comprehension", "set_comprehension":
		finder.visitComprehension(node)
		return
	case "assignment", "augmented_assignment":
		finder.visitAssignment(node)
		return
	case "named_expression":
		finder.visitNamedExpression(node)
		return
	}

	for index := uint(0); index < node.NamedChildCount(); index++ {
		finder.visit(node.NamedChild(index))
	}
}

func (finder *pythonStateReferenceFinder) visitAttribute(node *tree_sitter.Node) {
	object := node.ChildByFieldName("object")
	if object != nil && object.Kind() == "identifier" && finder.nodeText(object) == "state" && !finder.isDefined("state") {
		attribute := node.ChildByFieldName("attribute")
		if attribute != nil && attribute.Kind() == "identifier" {
			finder.references = append(finder.references, pythonStateReference{
				Path: finder.nodeText(attribute),
				Range: ByteRange{
					Start: int(node.StartByte()),
					End:   int(attribute.EndByte()),
				},
			})
		}
	}
	for index := uint(0); index < node.NamedChildCount(); index++ {
		finder.visit(node.NamedChild(index))
	}
}

func (finder *pythonStateReferenceFinder) visitFunctionDefinition(node *tree_sitter.Node) {
	name := node.ChildByFieldName("name")
	if name != nil && name.Kind() == "identifier" {
		finder.define(finder.nodeText(name))
	}
	finder.pushScope()
	finder.defineParameters(node.ChildByFieldName("parameters"))
	finder.visit(node.ChildByFieldName("body"))
	finder.popScope()
}

func (finder *pythonStateReferenceFinder) visitLambda(node *tree_sitter.Node) {
	finder.pushScope()
	finder.defineParameters(node.ChildByFieldName("parameters"))
	finder.visit(node.ChildByFieldName("body"))
	finder.popScope()
}

func (finder *pythonStateReferenceFinder) visitForStatement(node *tree_sitter.Node) {
	finder.visitNamedChildrenByField(node, "right")
	finder.definePattern(node.ChildByFieldName("left"))
	finder.visit(node.ChildByFieldName("body"))
	finder.visit(node.ChildByFieldName("alternative"))
}

func (finder *pythonStateReferenceFinder) visitComprehension(node *tree_sitter.Node) {
	finder.pushScope()
	for index := uint(0); index < node.NamedChildCount(); index++ {
		child := node.NamedChild(index)
		switch child.Kind() {
		case "for_in_clause":
			finder.visitForInClause(child)
		case "if_clause":
			finder.visit(child)
		}
	}
	finder.visit(node.ChildByFieldName("body"))
	finder.popScope()
}

func (finder *pythonStateReferenceFinder) visitForInClause(node *tree_sitter.Node) {
	finder.visitNamedChildrenByField(node, "right")
	finder.definePattern(node.ChildByFieldName("left"))
}

func (finder *pythonStateReferenceFinder) visitAssignment(node *tree_sitter.Node) {
	finder.definePattern(node.ChildByFieldName("left"))
	finder.visitNamedChildrenByField(node, "right")
}

func (finder *pythonStateReferenceFinder) visitNamedExpression(node *tree_sitter.Node) {
	finder.definePattern(node.ChildByFieldName("name"))
	finder.visit(node.ChildByFieldName("value"))
}

func (finder *pythonStateReferenceFinder) visitNamedChildrenByField(node *tree_sitter.Node, field string) {
	for index := uint(0); index < node.NamedChildCount(); index++ {
		if node.FieldNameForNamedChild(uint32(index)) != field {
			continue
		}
		finder.visit(node.NamedChild(index))
	}
}

func (finder *pythonStateReferenceFinder) defineParameters(node *tree_sitter.Node) {
	if node == nil {
		return
	}
	for index := uint(0); index < node.NamedChildCount(); index++ {
		finder.definePattern(node.NamedChild(index))
	}
}

func (finder *pythonStateReferenceFinder) definePattern(node *tree_sitter.Node) {
	if node == nil {
		return
	}
	switch node.Kind() {
	case "identifier":
		finder.define(finder.nodeText(node))
	case "default_parameter", "typed_default_parameter":
		finder.definePattern(node.ChildByFieldName("name"))
	case "typed_parameter", "tuple_pattern", "list_pattern", "pattern_list", "list_splat_pattern", "dictionary_splat_pattern":
		for index := uint(0); index < node.NamedChildCount(); index++ {
			finder.definePattern(node.NamedChild(index))
		}
	}
}

func (finder *pythonStateReferenceFinder) define(name string) {
	if strings.TrimSpace(name) == "" {
		return
	}
	finder.scopes[len(finder.scopes)-1][name] = struct{}{}
}

func (finder *pythonStateReferenceFinder) isDefined(name string) bool {
	for index := len(finder.scopes) - 1; index >= 0; index-- {
		if _, exists := finder.scopes[index][name]; exists {
			return true
		}
	}
	return false
}

func (finder *pythonStateReferenceFinder) pushScope() {
	finder.scopes = append(finder.scopes, map[string]struct{}{})
}

func (finder *pythonStateReferenceFinder) popScope() {
	if len(finder.scopes) <= 1 {
		return
	}
	finder.scopes = finder.scopes[:len(finder.scopes)-1]
}

func (finder *pythonStateReferenceFinder) nodeText(node *tree_sitter.Node) string {
	if node == nil {
		return ""
	}
	return node.Utf8Text(finder.source)
}

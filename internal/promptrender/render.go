package promptrender

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
	"unsafe"

	"github.com/nikolalohinski/gonja/v2"
	controlStructures "github.com/nikolalohinski/gonja/v2/builtins/control_structures"
	"github.com/nikolalohinski/gonja/v2/config"
	"github.com/nikolalohinski/gonja/v2/exec"
	"github.com/nikolalohinski/gonja/v2/loaders"
	"github.com/nikolalohinski/gonja/v2/nodes"
)

const templateIdentifier = "/prompt"

type Result struct {
	RenderedText     string
	MissingVariables []string
	RenderError      *string
}

type scope struct {
	parent   *scope
	declared map[string]struct{}
}

type undeclaredCollector struct {
	scope   *scope
	missing map[string]struct{}
}

func RenderJinja(template string, inputs map[string]string) Result {
	parsedTemplate, err := parseTemplate(template)
	if err != nil {
		return Result{
			RenderedText:     "",
			MissingVariables: []string{},
			RenderError:      stringPointer(err.Error()),
		}
	}

	missingVariables := collectMissingVariables(parsedTemplate.Root(), inputs)
	if len(missingVariables) > 0 {
		return Result{
			RenderedText:     "",
			MissingVariables: missingVariables,
			RenderError:      stringPointer(fmt.Sprintf("Missing variables: %s", strings.Join(missingVariables, ", "))),
		}
	}

	context := exec.NewContext(inputContext(inputs))
	renderedText, err := parsedTemplate.ExecuteToString(context)
	if err != nil {
		return Result{
			RenderedText:     "",
			MissingVariables: []string{},
			RenderError:      stringPointer(err.Error()),
		}
	}

	return Result{
		RenderedText:     renderedText,
		MissingVariables: []string{},
		RenderError:      nil,
	}
}

func parseTemplate(template string) (*exec.Template, error) {
	loader := loaders.MustNewMemoryLoader(map[string]string{
		templateIdentifier: template,
	})
	configuration := config.New()
	configuration.StrictUndefined = true
	return exec.NewTemplate(templateIdentifier, configuration, loader, execEnvironment())
}

func execEnvironment() *exec.Environment {
	return &exec.Environment{
		Context:           gonja.DefaultContext,
		Filters:           gonja.DefaultEnvironment.Filters,
		Tests:             gonja.DefaultEnvironment.Tests,
		ControlStructures: gonja.DefaultEnvironment.ControlStructures,
		Methods:           gonja.DefaultEnvironment.Methods,
	}
}

var builtinNames = []string{
	"cycler",
	"dict",
	"joiner",
	"lipsum",
	"namespace",
	"range",
}

func inputContext(inputs map[string]string) map[string]any {
	if len(inputs) == 0 {
		return map[string]any{}
	}
	context := make(map[string]any, len(inputs))
	for key, value := range inputs {
		context[key] = value
	}
	return context
}

func collectMissingVariables(root *nodes.Template, inputs map[string]string) []string {
	collector := &undeclaredCollector{
		scope:   newScope(nil),
		missing: map[string]struct{}{},
	}
	for _, builtinName := range builtinNames {
		collector.scope.declare(builtinName)
	}
	collector.scope.declare("gonja")
	for inputName := range inputs {
		collector.scope.declare(inputName)
	}

	collector.visitTemplate(root)

	missingVariables := make([]string, 0, len(collector.missing))
	for variableName := range collector.missing {
		missingVariables = append(missingVariables, variableName)
	}
	sort.Strings(missingVariables)
	return missingVariables
}

func newScope(parent *scope) *scope {
	return &scope{
		parent:   parent,
		declared: map[string]struct{}{},
	}
}

func (s *scope) declare(name string) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return
	}
	s.declared[trimmedName] = struct{}{}
}

func (s *scope) has(name string) bool {
	trimmedName := strings.TrimSpace(name)
	for current := s; current != nil; current = current.parent {
		if _, ok := current.declared[trimmedName]; ok {
			return true
		}
	}
	return false
}

func (c *undeclaredCollector) visitTemplate(root *nodes.Template) {
	if root == nil {
		return
	}
	c.visitNodes(root.Nodes)
	for _, block := range root.Blocks {
		c.visitWrapper(block)
	}
}

func (c *undeclaredCollector) visitNodes(astNodes []nodes.Node) {
	for _, astNode := range astNodes {
		c.visitNode(astNode)
	}
}

func (c *undeclaredCollector) visitNode(astNode nodes.Node) {
	switch typed := astNode.(type) {
	case nil:
		return
	case *nodes.Output:
		c.visitExpression(typed.Expression)
		c.visitExpression(typed.Condition)
		c.visitExpression(typed.Alternative)
	case *nodes.ControlStructureBlock:
		c.visitControlStructure(typed.ControlStructure)
	case *nodes.Template:
		c.visitTemplate(typed)
	case *nodes.Wrapper:
		c.visitWrapper(typed)
	}
}

func (c *undeclaredCollector) visitWrapper(wrapper *nodes.Wrapper) {
	if wrapper == nil {
		return
	}
	c.visitNodes(wrapper.Nodes)
}

func (c *undeclaredCollector) visitControlStructure(controlStructure nodes.ControlStructure) {
	switch typed := controlStructure.(type) {
	case nil:
		return
	case *controlStructures.ForControlStructure:
		c.visitForControlStructure(typed)
	case *controlStructures.IfControlStructure:
		c.visitIfControlStructure(typed)
	case *controlStructures.MacroControlStructure:
		c.visitMacroControlStructure(typed)
	case *controlStructures.FromImportControlStructure:
		c.visitFromImportControlStructure(typed)
	case *controlStructures.AutoescapeControlStructure:
		c.visitWrapper(typed.Wrapper)
	default:
		c.visitReflectedControlStructure(controlStructure)
	}
}

func (c *undeclaredCollector) visitForControlStructure(controlStructure *controlStructures.ForControlStructure) {
	if controlStructure == nil {
		return
	}
	c.visitExpressions(controlStructure.ObjectEvaluator, controlStructure.IfCondition)

	bodyScope := c.pushScope()
	bodyScope.declare(controlStructure.Key)
	bodyScope.declare(controlStructure.Value)
	bodyScope.declare("loop")
	c.visitWrapper(controlStructure.BodyWrapper)
	c.popScope()

	c.pushScope()
	c.visitWrapper(controlStructure.EmptyWrapper)
	c.popScope()
}

func (c *undeclaredCollector) visitIfControlStructure(controlStructure *controlStructures.IfControlStructure) {
	if controlStructure == nil {
		return
	}
	c.visitExpressions(controlStructure.Conditions...)

	declaredByBranches := map[string]struct{}{}
	for _, wrapper := range controlStructure.Wrappers {
		branchScope := c.pushScope()
		c.visitWrapper(wrapper)
		for declaredName := range branchScope.declared {
			declaredByBranches[declaredName] = struct{}{}
		}
		c.popScope()
	}
	for declaredName := range declaredByBranches {
		c.scope.declare(declaredName)
	}
}

func (c *undeclaredCollector) visitMacroControlStructure(controlStructure *controlStructures.MacroControlStructure) {
	if controlStructure == nil || controlStructure.Macro == nil {
		return
	}
	c.visitMacroArguments(controlStructure.Macro.Kwargs)

	macroScope := c.pushScope()
	c.declareMacroArguments(macroScope, controlStructure.Macro.Kwargs)
	c.visitWrapper(controlStructure.Macro.Wrapper)
	c.popScope()

	c.scope.declare(controlStructure.Macro.Name)
}

func (c *undeclaredCollector) visitFromImportControlStructure(controlStructure *controlStructures.FromImportControlStructure) {
	if controlStructure == nil {
		return
	}
	c.visitExpression(controlStructure.FilenameExpression)
	for alias := range controlStructure.As {
		c.scope.declare(alias)
	}
}

func (c *undeclaredCollector) visitMacroArguments(arguments []*nodes.Pair) {
	for _, argument := range arguments {
		if argument == nil {
			continue
		}
		c.visitExpression(argument.Value)
	}
}

func (c *undeclaredCollector) declareMacroArguments(scope *scope, arguments []*nodes.Pair) {
	if scope == nil {
		return
	}
	for _, argument := range arguments {
		if argument == nil {
			continue
		}
		if argumentName, ok := argument.Key.(*nodes.String); ok {
			scope.declare(argumentName.Val)
		}
	}
}

func (c *undeclaredCollector) visitReflectedControlStructure(controlStructure nodes.ControlStructure) {
	switch typed := controlStructure.(type) {
	case *controlStructures.SetControlStructure:
		expression := reflectedExpression(typed, "expression")
		condition := reflectedExpression(typed, "condition")
		alternative := reflectedExpression(typed, "alternative")
		target := reflectedExpression(typed, "target")

		c.visitExpression(expression)
		c.visitExpression(condition)
		c.visitExpression(alternative)

		if name, ok := target.(*nodes.Name); ok {
			c.scope.declare(name.Name.Val)
			return
		}
		c.visitExpression(target)
	case *controlStructures.WithControlStructure:
		for pairName, pairExpression := range reflectedExpressionMap(typed, "pairs") {
			c.visitExpression(pairExpression)
			_ = pairName
		}
		withScope := c.pushScope()
		for pairName := range reflectedExpressionMap(typed, "pairs") {
			withScope.declare(pairName)
		}
		c.visitWrapper(reflectedWrapper(typed, "wrapper"))
		c.popScope()
	case *controlStructures.ImportControlStructure:
		c.visitExpression(reflectedExpression(typed, "filenameExpression"))
		c.scope.declare(reflectedString(typed, "as"))
	case *controlStructures.FilterControlStructure:
		c.visitWrapper(reflectedWrapper(typed, "bodyWrapper"))
		for _, filterCall := range reflectedFilterCalls(typed, "filterChain") {
			c.visitFilterCall(filterCall)
		}
	case *controlStructures.IncludeControlStructure:
		c.visitExpression(reflectedExpression(typed, "filenameExpression"))
	}
}

func (c *undeclaredCollector) visitExpression(expression nodes.Expression) {
	switch typed := expression.(type) {
	case nil:
		return
	case *nodes.Name:
		c.recordMissing(typed.Name.Val)
	case *nodes.Call:
		c.visitCallExpression(typed)
	case *nodes.GetItem, *nodes.GetSlice, *nodes.GetAttribute:
		c.visitAccessExpression(expression)
	case *nodes.Negation, *nodes.UnaryExpression, *nodes.BinaryExpression:
		c.visitOperationExpression(expression)
	case *nodes.FilteredExpression, *nodes.TestExpression:
		c.visitPipelineExpression(expression)
	case *nodes.List, *nodes.Tuple, *nodes.Dict, *nodes.Pair:
		c.visitCollectionExpression(expression)
	}
}

func (c *undeclaredCollector) visitCallExpression(call *nodes.Call) {
	if call == nil {
		return
	}
	c.visitNodeLike(call.Func)
	c.visitArguments(call.Args, call.Kwargs)
}

func (c *undeclaredCollector) visitAccessExpression(expression nodes.Expression) {
	switch typed := expression.(type) {
	case *nodes.GetItem:
		c.visitNodeLikes(typed.Node, typed.Arg)
	case *nodes.GetSlice:
		c.visitNodeLikes(typed.Node, typed.Start, typed.End)
	case *nodes.GetAttribute:
		c.visitNodeLike(typed.Node)
	}
}

func (c *undeclaredCollector) visitOperationExpression(expression nodes.Expression) {
	switch typed := expression.(type) {
	case *nodes.Negation:
		c.visitExpression(typed.Term)
	case *nodes.UnaryExpression:
		c.visitExpression(typed.Term)
	case *nodes.BinaryExpression:
		c.visitExpressions(typed.Left, typed.Right)
	}
}

func (c *undeclaredCollector) visitPipelineExpression(expression nodes.Expression) {
	switch typed := expression.(type) {
	case *nodes.FilteredExpression:
		c.visitExpression(typed.Expression)
		for _, filterCall := range typed.Filters {
			c.visitFilterCall(filterCall)
		}
	case *nodes.TestExpression:
		c.visitExpression(typed.Expression)
		c.visitTestCall(typed.Test)
	}
}

func (c *undeclaredCollector) visitCollectionExpression(expression nodes.Expression) {
	switch typed := expression.(type) {
	case *nodes.List:
		c.visitExpressions(typed.Val...)
	case *nodes.Tuple:
		c.visitExpressions(typed.Val...)
	case *nodes.Dict:
		for _, pair := range typed.Pairs {
			c.visitExpression(pair)
		}
	case *nodes.Pair:
		c.visitExpressions(typed.Key, typed.Value)
	}
}

func (c *undeclaredCollector) visitNodeLike(candidate nodes.Node) {
	if expression, ok := candidate.(nodes.Expression); ok {
		c.visitExpression(expression)
		return
	}
	c.visitNode(candidate)
}

func (c *undeclaredCollector) visitNodeLikes(candidates ...nodes.Node) {
	for _, candidate := range candidates {
		c.visitNodeLike(candidate)
	}
}

func (c *undeclaredCollector) visitExpressions(expressions ...nodes.Expression) {
	for _, expression := range expressions {
		c.visitExpression(expression)
	}
}

func (c *undeclaredCollector) visitFilterCall(filterCall *nodes.FilterCall) {
	if filterCall == nil {
		return
	}
	c.visitArguments(filterCall.Args, filterCall.Kwargs)
}

func (c *undeclaredCollector) visitTestCall(testCall *nodes.TestCall) {
	if testCall == nil {
		return
	}
	c.visitArguments(testCall.Args, testCall.Kwargs)
}

func (c *undeclaredCollector) visitArguments(args []nodes.Expression, kwargs map[string]nodes.Expression) {
	c.visitExpressions(args...)
	for _, argument := range kwargs {
		c.visitExpression(argument)
	}
}

func (c *undeclaredCollector) recordMissing(name string) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" || c.scope.has(trimmedName) {
		return
	}
	c.missing[trimmedName] = struct{}{}
}

func (c *undeclaredCollector) pushScope() *scope {
	c.scope = newScope(c.scope)
	return c.scope
}

func (c *undeclaredCollector) popScope() {
	if c.scope == nil {
		return
	}
	c.scope = c.scope.parent
}

func reflectedExpression(controlStructure any, fieldName string) nodes.Expression {
	value := reflectedField(controlStructure, fieldName)
	if !value.IsValid() || (value.Kind() == reflect.Interface && value.IsNil()) || (value.Kind() == reflect.Pointer && value.IsNil()) {
		return nil
	}
	expression, _ := reflectValueInterface(value).(nodes.Expression)
	return expression
}

func reflectedWrapper(controlStructure any, fieldName string) *nodes.Wrapper {
	value := reflectedField(controlStructure, fieldName)
	if !value.IsValid() || valueIsNil(value) {
		return nil
	}
	wrapper, _ := reflectValueInterface(value).(*nodes.Wrapper)
	return wrapper
}

func reflectedExpressionMap(controlStructure any, fieldName string) map[string]nodes.Expression {
	value := reflectedField(controlStructure, fieldName)
	if !value.IsValid() || value.Kind() != reflect.Map || value.IsNil() {
		return map[string]nodes.Expression{}
	}
	output := make(map[string]nodes.Expression, value.Len())
	for _, key := range value.MapKeys() {
		if key.Kind() != reflect.String {
			continue
		}
		expression, _ := reflectValueInterface(value.MapIndex(key)).(nodes.Expression)
		if expression == nil {
			continue
		}
		output[key.String()] = expression
	}
	return output
}

func reflectedFilterCalls(controlStructure any, fieldName string) []*nodes.FilterCall {
	value := reflectedField(controlStructure, fieldName)
	if !value.IsValid() || value.Kind() != reflect.Slice || valueIsNil(value) {
		return nil
	}
	output := make([]*nodes.FilterCall, 0, value.Len())
	for index := 0; index < value.Len(); index++ {
		filterCall, _ := reflectValueInterface(value.Index(index)).(*nodes.FilterCall)
		if filterCall != nil {
			output = append(output, filterCall)
		}
	}
	return output
}

func reflectedString(controlStructure any, fieldName string) string {
	value := reflectedField(controlStructure, fieldName)
	if !value.IsValid() || value.Kind() != reflect.String {
		return ""
	}
	return value.String()
}

func reflectedField(candidate any, fieldName string) reflect.Value {
	value := reflect.ValueOf(candidate)
	if value.Kind() == reflect.Pointer {
		value = value.Elem()
	}
	if !value.IsValid() {
		return reflect.Value{}
	}
	return value.FieldByName(fieldName)
}

func valueIsNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

// Gonja keeps a few control-structure fields private, so the collector needs
// a narrow escape hatch to read them back without forking the parser.
func reflectValueInterface(value reflect.Value) any {
	if !value.IsValid() {
		return nil
	}
	if value.CanInterface() {
		return value.Interface()
	}
	if value.CanAddr() {
		return reflect.NewAt(value.Type(), unsafe.Pointer(value.UnsafeAddr())).Elem().Interface()
	}
	cloned := reflect.New(value.Type()).Elem()
	cloned.Set(value)
	return cloned.Interface()
}

func stringPointer(value string) *string {
	return &value
}

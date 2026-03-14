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
		c.visitExpression(typed.ObjectEvaluator)
		c.visitExpression(typed.IfCondition)

		bodyScope := c.pushScope()
		bodyScope.declare(typed.Key)
		bodyScope.declare(typed.Value)
		bodyScope.declare("loop")
		c.visitWrapper(typed.BodyWrapper)
		c.popScope()

		c.pushScope()
		c.visitWrapper(typed.EmptyWrapper)
		c.popScope()
	case *controlStructures.IfControlStructure:
		for _, condition := range typed.Conditions {
			c.visitExpression(condition)
		}

		declaredByBranches := map[string]struct{}{}
		for _, wrapper := range typed.Wrappers {
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
	case *controlStructures.MacroControlStructure:
		if typed.Macro == nil {
			return
		}
		for _, argument := range typed.Macro.Kwargs {
			if argument == nil {
				continue
			}
			c.visitExpression(argument.Value)
		}
		macroScope := c.pushScope()
		for _, argument := range typed.Macro.Kwargs {
			if argument == nil {
				continue
			}
			if argumentName, ok := argument.Key.(*nodes.String); ok {
				macroScope.declare(argumentName.Val)
			}
		}
		c.visitWrapper(typed.Macro.Wrapper)
		c.popScope()
		c.scope.declare(typed.Macro.Name)
	case *controlStructures.FromImportControlStructure:
		c.visitExpression(typed.FilenameExpression)
		for alias := range typed.As {
			c.scope.declare(alias)
		}
	case *controlStructures.AutoescapeControlStructure:
		c.visitWrapper(typed.Wrapper)
	default:
		c.visitReflectedControlStructure(controlStructure)
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
		c.visitNodeLike(typed.Func)
		for _, argument := range typed.Args {
			c.visitExpression(argument)
		}
		for _, argument := range typed.Kwargs {
			c.visitExpression(argument)
		}
	case *nodes.GetItem:
		c.visitNodeLike(typed.Node)
		c.visitNodeLike(typed.Arg)
	case *nodes.GetSlice:
		c.visitNodeLike(typed.Node)
		c.visitNodeLike(typed.Start)
		c.visitNodeLike(typed.End)
	case *nodes.GetAttribute:
		c.visitNodeLike(typed.Node)
	case *nodes.Negation:
		c.visitExpression(typed.Term)
	case *nodes.UnaryExpression:
		c.visitExpression(typed.Term)
	case *nodes.BinaryExpression:
		c.visitExpression(typed.Left)
		c.visitExpression(typed.Right)
	case *nodes.FilteredExpression:
		c.visitExpression(typed.Expression)
		for _, filterCall := range typed.Filters {
			c.visitFilterCall(filterCall)
		}
	case *nodes.TestExpression:
		c.visitExpression(typed.Expression)
		c.visitTestCall(typed.Test)
	case *nodes.List:
		for _, element := range typed.Val {
			c.visitExpression(element)
		}
	case *nodes.Tuple:
		for _, element := range typed.Val {
			c.visitExpression(element)
		}
	case *nodes.Dict:
		for _, pair := range typed.Pairs {
			c.visitExpression(pair)
		}
	case *nodes.Pair:
		c.visitExpression(typed.Key)
		c.visitExpression(typed.Value)
	}
}

func (c *undeclaredCollector) visitNodeLike(candidate nodes.Node) {
	if expression, ok := candidate.(nodes.Expression); ok {
		c.visitExpression(expression)
		return
	}
	c.visitNode(candidate)
}

func (c *undeclaredCollector) visitFilterCall(filterCall *nodes.FilterCall) {
	if filterCall == nil {
		return
	}
	for _, argument := range filterCall.Args {
		c.visitExpression(argument)
	}
	for _, argument := range filterCall.Kwargs {
		c.visitExpression(argument)
	}
}

func (c *undeclaredCollector) visitTestCall(testCall *nodes.TestCall) {
	if testCall == nil {
		return
	}
	for _, argument := range testCall.Args {
		c.visitExpression(argument)
	}
	for _, argument := range testCall.Kwargs {
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

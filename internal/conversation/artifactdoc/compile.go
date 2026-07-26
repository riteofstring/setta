package artifactdoc

import (
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// rootStatementName is the one statement every document must assign.
const rootStatementName = "root"

// Node is one compiled component in the rendered tree.
//
// Props values are plain JSON data: string, float64, bool, []any, map[string]any,
// or a nested Node. Omitted optional properties are absent rather than null, so
// two documents that render the same compile to the same tree.
type Node struct {
	Component ComponentName  `json:"component"`
	Props     map[string]any `json:"props"`
}

// Document is one compiled artifact document.
type Document struct {
	Language  DocumentLanguage `json:"language"`
	CatalogID CatalogID        `json:"catalogId"`
	Root      Node             `json:"root"`
}

// ComponentNames lists the distinct components the document renders, sorted so
// the same document always describes itself the same way. Props is a map, so
// first-reached order would not be stable.
func (document Document) ComponentNames() []ComponentName {
	seen := map[ComponentName]bool{}
	var walk func(value any)
	walk = func(value any) {
		switch typed := value.(type) {
		case Node:
			seen[typed.Component] = true
			for _, property := range typed.Props {
				walk(property)
			}
		case []any:
			for _, item := range typed {
				walk(item)
			}
		case map[string]any:
			for _, item := range typed {
				walk(item)
			}
		}
	}
	walk(document.Root)
	names := make([]ComponentName, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

// unsupportedBuiltins are OpenUI features Setta deliberately does not accept.
// Naming them separately turns "unknown component" into a correction the model
// can act on.
var unsupportedBuiltins = map[ComponentName]bool{
	"Action":   true,
	"Bind":     true,
	"Binding":  true,
	"Each":     true,
	"Fetch":    true,
	"For":      true,
	"If":       true,
	"Mutation": true,
	"Patch":    true,
	"Provider": true,
	"Query":    true,
	"State":    true,
	"Tool":     true,
}

// Compile validates source against the catalog and returns the rendered tree.
// A failed compile returns *CompileError and never a partial document.
func Compile(catalog Catalog, source string) (Document, error) {
	if err := validateSource(source); err != nil {
		return Document{}, err
	}
	statements, diagnostic := parseDocument(source)
	if diagnostic != nil {
		return Document{}, singleDiagnosticError(*diagnostic)
	}
	builder := newCompiler(catalog, statements)
	root := builder.compile()
	if len(builder.diagnostics) > 0 {
		return Document{}, &CompileError{Diagnostics: builder.diagnostics}
	}
	return Document{Language: catalog.Language, CatalogID: catalog.ID, Root: root}, nil
}

func validateSource(source string) *CompileError {
	origin := Position{Line: 1, Column: 1}
	if len(source) > MaxSourceBytes {
		return singleDiagnosticError(newDiagnostic(
			CodeSourceTooLarge,
			origin,
			fmt.Sprintf("the document is %d bytes, over the %d byte limit", len(source), MaxSourceBytes),
			"emit a shorter document, or split the deliverable across separate artifacts",
		))
	}
	if !utf8.ValidString(source) {
		return singleDiagnosticError(newDiagnostic(
			CodeInvalidUTF8,
			origin,
			"the document was not valid UTF-8",
			"send the document as UTF-8 text",
		))
	}
	if strings.TrimSpace(source) == "" {
		return singleDiagnosticError(newDiagnostic(
			CodeSourceEmpty,
			origin,
			"the document was empty",
			"assign root to a Document component holding the artifact's content",
		))
	}
	return nil
}

// scope carries the diagnostic context and nesting depth of the value being
// compiled. The current statement lives on the compiler because references move
// it, and the move has to survive the whole nested compile.
type scope struct {
	component ComponentName
	property  string
	depth     int
}

func (current scope) inProperty(component ComponentName, property string) scope {
	current.component = component
	current.property = property
	return current
}

func (current scope) deeper() scope {
	current.depth++
	return current
}

type compiler struct {
	catalog     Catalog
	ordered     []statement
	statements  map[string]statement
	used        map[string]bool
	stack       []string
	statement   string
	nodes       int
	fatal       bool
	diagnostics []Diagnostic
}

func newCompiler(catalog Catalog, statements []statement) *compiler {
	return &compiler{
		catalog:    catalog,
		ordered:    statements,
		statements: make(map[string]statement, len(statements)),
		used:       make(map[string]bool, len(statements)),
	}
}

func (builder *compiler) compile() Node {
	if !builder.indexStatements() {
		return Node{}
	}
	root, ok := builder.statements[rootStatementName]
	if !ok {
		builder.stop(newDiagnostic(
			CodeMissingRoot,
			Position{Line: 1, Column: 1},
			"the document has no root statement",
			fmt.Sprintf("add a root statement, for example root = %s([...])", builder.catalog.Root),
		))
		return Node{}
	}
	builder.statement = rootStatementName
	builder.stack = append(builder.stack, rootStatementName)
	node, _ := builder.compileComponent(root.value, []ComponentName{builder.catalog.Root}, scope{depth: 1})
	builder.stack = builder.stack[:len(builder.stack)-1]
	builder.reportUnusedStatements()
	return node
}

func (builder *compiler) indexStatements() bool {
	if len(builder.ordered) > MaxStatements {
		builder.stop(newDiagnostic(
			CodeLimitExceeded,
			builder.ordered[MaxStatements].position,
			fmt.Sprintf("the document has %d statements, over the %d statement limit", len(builder.ordered), MaxStatements),
			"combine related statements or emit a smaller document",
		))
		return false
	}
	for _, current := range builder.ordered {
		if _, exists := builder.statements[current.name]; exists {
			builder.statement = current.name
			builder.fail(newDiagnostic(
				CodeDuplicateStatement,
				current.position,
				fmt.Sprintf("%q is assigned more than once", current.name),
				"give each statement a unique name",
			))
			continue
		}
		builder.statements[current.name] = current
	}
	builder.statement = ""
	return !builder.fatal
}

func (builder *compiler) reportUnusedStatements() {
	for _, current := range builder.ordered {
		if current.name == rootStatementName || builder.used[current.name] {
			continue
		}
		builder.statement = current.name
		builder.fail(newDiagnostic(
			CodeUnusedStatement,
			current.position,
			fmt.Sprintf("%q is never reachable from root, so nothing it contains would render", current.name),
			"reference the statement from root, or delete it",
		))
	}
}

// resolve follows references until it reaches a real value. The returned
// restore must be called once the resolved expression has been compiled.
func (builder *compiler) resolve(current expression, context scope) (expression, func(), bool) {
	pushed := 0
	previous := builder.statement
	restore := func() {
		builder.stack = builder.stack[:len(builder.stack)-pushed]
		builder.statement = previous
	}
	for current.kind == expressionReference {
		target, ok := builder.statements[current.name]
		if !ok {
			builder.failAt(CodeUnknownReference, current.position, context,
				fmt.Sprintf("%q is not a statement in this document", current.name),
				"assign the statement before referencing it, or write the value inline")
			restore()
			return expression{}, func() {}, false
		}
		if builder.onStack(current.name) {
			builder.failAt(CodeCyclicReference, current.position, context,
				fmt.Sprintf("%q refers back to itself through %s", current.name, strings.Join(builder.stack, " -> ")),
				"break the cycle so every statement resolves to finished content")
			restore()
			return expression{}, func() {}, false
		}
		builder.stack = append(builder.stack, current.name)
		pushed++
		builder.used[current.name] = true
		builder.statement = current.name
		current = target.value
	}
	return current, restore, true
}

func (builder *compiler) onStack(name string) bool {
	for _, entry := range builder.stack {
		if entry == name {
			return true
		}
	}
	return false
}

func (builder *compiler) compileComponent(current expression, allowed []ComponentName, context scope) (Node, bool) {
	if current.kind != expressionComponent {
		builder.failAt(CodeInvalidValue, current.position, context,
			fmt.Sprintf("expected a component call but found %s", current.kind.label()),
			allowedComponentsCorrection(allowed))
		return Node{}, false
	}
	name := ComponentName(current.name)
	component, ok := builder.lookupComponent(name, current.position, allowed, context)
	if !ok {
		return Node{}, false
	}
	if !builder.admitNode(current.position, context) {
		return Node{}, false
	}
	context.component = name
	node := Node{Component: name, Props: builder.compileArguments(component, current, context)}
	builder.validateInvariants(node, current.position, context)
	return node, true
}

func (builder *compiler) lookupComponent(
	name ComponentName,
	position Position,
	allowed []ComponentName,
	context scope,
) (Component, bool) {
	if unsupportedBuiltins[name] {
		builder.failAt(CodeUnsupportedSyntax, position, context,
			fmt.Sprintf("%s is an OpenUI feature outside Setta's artifact document profile", name),
			"artifacts are display-only; build the document from catalog components and literal data")
		return Component{}, false
	}
	component, ok := builder.catalog.Component(name)
	if !ok {
		builder.failAt(CodeUnknownComponent, position, context,
			fmt.Sprintf("%s is not a component in catalog %s", name, builder.catalog.ID),
			allowedComponentsCorrection(allowed))
		return Component{}, false
	}
	if !containsComponent(allowed, name) {
		builder.failAt(CodeInvalidValue, position, context,
			fmt.Sprintf("%s cannot appear here", name),
			allowedComponentsCorrection(allowed))
		return Component{}, false
	}
	return component, true
}

func (builder *compiler) admitNode(position Position, context scope) bool {
	if context.depth > MaxDepth {
		builder.stopAt(CodeLimitExceeded, position, context,
			fmt.Sprintf("components are nested more than %d deep", MaxDepth),
			"flatten the document into sections instead of deeply nested containers")
		return false
	}
	builder.nodes++
	if builder.nodes > MaxNodes {
		builder.stopAt(CodeLimitExceeded, position, context,
			fmt.Sprintf("the document renders more than %d components", MaxNodes),
			"emit fewer components, or split the deliverable across separate artifacts")
		return false
	}
	return true
}

// compileArguments maps positional arguments through the catalog's ordered
// properties.
func (builder *compiler) compileArguments(component Component, current expression, context scope) map[string]any {
	props := make(map[string]any, len(component.Properties))
	if len(current.items) > len(component.Properties) {
		builder.failAt(CodeArgumentCount, current.position, context,
			fmt.Sprintf("%s takes %d arguments but was given %d", component.Name, len(component.Properties), len(current.items)),
			fmt.Sprintf("call it as %s", componentSignature(component)))
		return props
	}
	for index, property := range component.Properties {
		argument, present := argumentAt(current.items, index)
		if !present || argument.kind == expressionNull {
			builder.requireProperty(component, property, current.position, context)
			continue
		}
		value, ok := builder.compileExpression(argument, property.Schema, context.inProperty(component.Name, property.Name))
		if ok {
			props[property.Name] = value
		}
	}
	return props
}

func (builder *compiler) requireProperty(component Component, property Property, position Position, context scope) {
	if !property.Required {
		return
	}
	builder.failAt(CodeMissingProperty, position, context.inProperty(component.Name, property.Name),
		fmt.Sprintf("%s requires %s", component.Name, property.Name),
		fmt.Sprintf("call it as %s", componentSignature(component)))
}

func argumentAt(items []expression, index int) (expression, bool) {
	if index >= len(items) {
		return expression{}, false
	}
	return items[index], true
}

func containsComponent(components []ComponentName, name ComponentName) bool {
	for _, candidate := range components {
		if candidate == name {
			return true
		}
	}
	return false
}

func allowedComponentsCorrection(allowed []ComponentName) string {
	return "use one of: " + joinNames(allowed, ", ")
}

func (builder *compiler) fail(diagnostic Diagnostic) {
	if builder.fatal {
		return
	}
	if diagnostic.Statement == "" {
		diagnostic.Statement = builder.statement
	}
	builder.diagnostics = append(builder.diagnostics, diagnostic)
	if len(builder.diagnostics) >= MaxDiagnostics {
		builder.fatal = true
	}
}

func (builder *compiler) stop(diagnostic Diagnostic) {
	builder.fail(diagnostic)
	builder.fatal = true
}

func (builder *compiler) failAt(code Code, position Position, context scope, message string, correction string) {
	diagnostic := newDiagnostic(code, position, message, correction)
	diagnostic.Component = context.component
	diagnostic.Property = context.property
	builder.fail(diagnostic)
}

func (builder *compiler) stopAt(code Code, position Position, context scope, message string, correction string) {
	builder.failAt(code, position, context, message, correction)
	builder.fatal = true
}

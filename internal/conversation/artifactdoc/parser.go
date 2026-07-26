package artifactdoc

import "fmt"

type expressionKind int

const (
	expressionComponent expressionKind = iota
	expressionReference
	expressionString
	expressionNumber
	expressionBoolean
	expressionNull
	expressionArray
	expressionObject
)

var expressionLabels = map[expressionKind]string{
	expressionComponent: "a component call",
	expressionReference: "a statement reference",
	expressionString:    "a string",
	expressionNumber:    "a number",
	expressionBoolean:   "a boolean",
	expressionNull:      "null",
	expressionArray:     "an array",
	expressionObject:    "an object",
}

func (kind expressionKind) label() string {
	return expressionLabels[kind]
}

// expression is one parsed value. Only the fields that belong to kind carry
// meaning.
type expression struct {
	kind     expressionKind
	position Position
	name     string
	text     string
	number   float64
	boolean  bool
	items    []expression
	members  []objectMember
}

type objectMember struct {
	key      string
	position Position
	value    expression
}

type statement struct {
	name     string
	position Position
	value    expression
}

type parser struct {
	tokens []token
	index  int
}

func parseDocument(source string) ([]statement, *Diagnostic) {
	tokens, diagnostic := lex(source)
	if diagnostic != nil {
		return nil, diagnostic
	}
	reader := &parser{tokens: tokens}
	statements := make([]statement, 0, 8)
	reader.skipNewlines()
	for reader.peek().kind != tokenEOF {
		parsed, diagnostic := reader.parseStatement()
		if diagnostic != nil {
			return nil, diagnostic
		}
		statements = append(statements, parsed)
		if diagnostic := reader.endStatement(); diagnostic != nil {
			return nil, diagnostic
		}
	}
	return statements, nil
}

func (reader *parser) peek() token {
	return reader.tokens[reader.index]
}

func (reader *parser) next() token {
	current := reader.tokens[reader.index]
	if current.kind != tokenEOF {
		reader.index++
	}
	return current
}

func (reader *parser) skipNewlines() {
	for reader.peek().kind == tokenNewline {
		reader.index++
	}
}

func (reader *parser) expect(kind tokenKind) (token, *Diagnostic) {
	current := reader.peek()
	if current.kind != kind {
		return token{}, unexpectedTokenDiagnostic(current, kind.label())
	}
	return reader.next(), nil
}

func (reader *parser) endStatement() *Diagnostic {
	current := reader.peek()
	if current.kind == tokenEOF {
		return nil
	}
	if current.kind != tokenNewline {
		return unexpectedTokenDiagnostic(current, "end of line")
	}
	reader.skipNewlines()
	return nil
}

func (reader *parser) parseStatement() (statement, *Diagnostic) {
	name, diagnostic := reader.expect(tokenIdent)
	if diagnostic != nil {
		return statement{}, diagnostic
	}
	if _, diagnostic := reader.expect(tokenAssign); diagnostic != nil {
		return statement{}, diagnostic
	}
	value, diagnostic := reader.parseExpression()
	if diagnostic != nil {
		return statement{}, diagnostic
	}
	return statement{name: name.text, position: name.position, value: value}, nil
}

func (reader *parser) parseExpression() (expression, *Diagnostic) {
	current := reader.peek()
	switch current.kind {
	case tokenIdent:
		return reader.parseIdentExpression()
	case tokenString:
		reader.next()
		return expression{kind: expressionString, position: current.position, text: current.text}, nil
	case tokenNumber:
		reader.next()
		return expression{kind: expressionNumber, position: current.position, number: current.number}, nil
	case tokenTrue, tokenFalse:
		reader.next()
		return expression{kind: expressionBoolean, position: current.position, boolean: current.kind == tokenTrue}, nil
	case tokenNull:
		reader.next()
		return expression{kind: expressionNull, position: current.position}, nil
	case tokenLeftBracket:
		return reader.parseArray()
	case tokenLeftBrace:
		return reader.parseObject()
	}
	return expression{}, unexpectedTokenDiagnostic(current, "a value")
}

func (reader *parser) parseIdentExpression() (expression, *Diagnostic) {
	name := reader.next()
	if reader.peek().kind == tokenAssign {
		return expression{}, namedArgumentDiagnostic(name)
	}
	if reader.peek().kind != tokenLeftParen {
		return expression{kind: expressionReference, position: name.position, name: name.text}, nil
	}
	reader.next()
	items, diagnostic := reader.parseSequence(tokenRightParen)
	if diagnostic != nil {
		return expression{}, diagnostic
	}
	return expression{kind: expressionComponent, position: name.position, name: name.text, items: items}, nil
}

func (reader *parser) parseArray() (expression, *Diagnostic) {
	open := reader.next()
	items, diagnostic := reader.parseSequence(tokenRightBracket)
	if diagnostic != nil {
		return expression{}, diagnostic
	}
	return expression{kind: expressionArray, position: open.position, items: items}, nil
}

// parseSequence reads comma-separated expressions up to closer. A trailing
// comma is accepted: it is a common generation artifact and rejecting it buys
// nothing but a retry.
func (reader *parser) parseSequence(closer tokenKind) ([]expression, *Diagnostic) {
	items := make([]expression, 0, 4)
	for {
		if reader.peek().kind == closer {
			reader.next()
			return items, nil
		}
		item, diagnostic := reader.parseExpression()
		if diagnostic != nil {
			return nil, diagnostic
		}
		items = append(items, item)
		if reader.peek().kind == tokenComma {
			reader.next()
			continue
		}
		if _, diagnostic := reader.expect(closer); diagnostic != nil {
			return nil, diagnostic
		}
		return items, nil
	}
}

func (reader *parser) parseObject() (expression, *Diagnostic) {
	open := reader.next()
	members := make([]objectMember, 0, 4)
	for {
		if reader.peek().kind == tokenRightBrace {
			reader.next()
			return expression{kind: expressionObject, position: open.position, members: members}, nil
		}
		member, diagnostic := reader.parseObjectMember()
		if diagnostic != nil {
			return expression{}, diagnostic
		}
		members = append(members, member)
		if reader.peek().kind == tokenComma {
			reader.next()
			continue
		}
		if _, diagnostic := reader.expect(tokenRightBrace); diagnostic != nil {
			return expression{}, diagnostic
		}
		return expression{kind: expressionObject, position: open.position, members: members}, nil
	}
}

func (reader *parser) parseObjectMember() (objectMember, *Diagnostic) {
	key := reader.peek()
	if key.kind != tokenIdent && key.kind != tokenString {
		return objectMember{}, unexpectedTokenDiagnostic(key, "a field name")
	}
	reader.next()
	if _, diagnostic := reader.expect(tokenColon); diagnostic != nil {
		return objectMember{}, diagnostic
	}
	value, diagnostic := reader.parseExpression()
	if diagnostic != nil {
		return objectMember{}, diagnostic
	}
	return objectMember{key: key.text, position: key.position, value: value}, nil
}

func unexpectedTokenDiagnostic(found token, expected string) *Diagnostic {
	return syntaxDiagnostic(
		found.position,
		fmt.Sprintf("expected %s but found %s", expected, describeToken(found)),
		"write one assignment per line, in the form name = Component(...)",
	)
}

func describeToken(found token) string {
	if found.kind == tokenIdent {
		return fmt.Sprintf("%q", found.text)
	}
	return found.kind.label()
}

func namedArgumentDiagnostic(name token) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeUnsupportedSyntax,
		name.position,
		fmt.Sprintf("%q was passed as a named argument", name.text),
		"pass component arguments positionally, in the order the catalog lists them, using null to skip an optional one",
	)
	return &diagnostic
}

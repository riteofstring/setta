package artifactdoc

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

type tokenKind int

const (
	tokenEOF tokenKind = iota
	tokenNewline
	tokenIdent
	tokenString
	tokenNumber
	tokenTrue
	tokenFalse
	tokenNull
	tokenAssign
	tokenComma
	tokenColon
	tokenLeftParen
	tokenRightParen
	tokenLeftBracket
	tokenRightBracket
	tokenLeftBrace
	tokenRightBrace
)

var tokenLabels = map[tokenKind]string{
	tokenEOF:          "end of document",
	tokenNewline:      "end of line",
	tokenIdent:        "a name",
	tokenString:       "a string",
	tokenNumber:       "a number",
	tokenTrue:         "true",
	tokenFalse:        "false",
	tokenNull:         "null",
	tokenAssign:       `"="`,
	tokenComma:        `","`,
	tokenColon:        `":"`,
	tokenLeftParen:    `"("`,
	tokenRightParen:   `")"`,
	tokenLeftBracket:  `"["`,
	tokenRightBracket: `"]"`,
	tokenLeftBrace:    `"{"`,
	tokenRightBrace:   `"}"`,
}

func (kind tokenKind) label() string {
	return tokenLabels[kind]
}

var punctuationTokens = map[byte]tokenKind{
	'=': tokenAssign,
	',': tokenComma,
	':': tokenColon,
	'(': tokenLeftParen,
	')': tokenRightParen,
	'[': tokenLeftBracket,
	']': tokenRightBracket,
	'{': tokenLeftBrace,
	'}': tokenRightBrace,
}

var bracketDepthChange = map[tokenKind]int{
	tokenLeftParen:    1,
	tokenLeftBracket:  1,
	tokenLeftBrace:    1,
	tokenRightParen:   -1,
	tokenRightBracket: -1,
	tokenRightBrace:   -1,
}

// operatorCharacters would start an expression the profile never evaluates.
// Naming them turns "unexpected character" into an answer.
var operatorCharacters = map[byte]bool{
	'+': true,
	'*': true,
	'%': true,
	'&': true,
	'|': true,
	'^': true,
	'<': true,
	'>': true,
	'!': true,
	'?': true,
}

var keywordTokens = map[string]tokenKind{
	"true":  tokenTrue,
	"false": tokenFalse,
	"null":  tokenNull,
}

var stringEscapes = map[byte]rune{
	'"':  '"',
	'\\': '\\',
	'/':  '/',
	'b':  '\b',
	'f':  '\f',
	'n':  '\n',
	'r':  '\r',
	't':  '\t',
}

type token struct {
	kind     tokenKind
	text     string
	number   float64
	position Position
}

// lexer turns source into tokens. It tracks bracket depth because a newline
// inside an open bracket is whitespace and everywhere else ends a statement.
type lexer struct {
	source string
	offset int
	line   int
	column int
	depth  int
	tokens []token
}

func lex(source string) ([]token, *Diagnostic) {
	scanner := &lexer{source: source, line: 1, column: 1}
	for {
		scanner.skipSpaces()
		if scanner.offset >= len(scanner.source) {
			scanner.emit(token{kind: tokenEOF, position: scanner.position()})
			return scanner.tokens, nil
		}
		if diagnostic := scanner.lexToken(); diagnostic != nil {
			return nil, diagnostic
		}
	}
}

func (scanner *lexer) position() Position {
	return Position{Line: scanner.line, Column: scanner.column}
}

func (scanner *lexer) emit(next token) {
	scanner.tokens = append(scanner.tokens, next)
}

func (scanner *lexer) advance() rune {
	value, size := utf8.DecodeRuneInString(scanner.source[scanner.offset:])
	scanner.offset += size
	if value == '\n' {
		scanner.line++
		scanner.column = 1
		return value
	}
	scanner.column++
	return value
}

func (scanner *lexer) peek() byte {
	if scanner.offset >= len(scanner.source) {
		return 0
	}
	return scanner.source[scanner.offset]
}

func (scanner *lexer) skipSpaces() {
	for scanner.offset < len(scanner.source) {
		next := scanner.peek()
		insideBrackets := scanner.depth > 0 && (next == '\n' || next == '\r')
		if next != ' ' && next != '\t' && !insideBrackets {
			return
		}
		scanner.advance()
	}
}

func (scanner *lexer) lexToken() *Diagnostic {
	start := scanner.position()
	next := scanner.peek()
	switch {
	case next == '\n' || next == '\r':
		return scanner.lexNewline(start)
	case next == '"':
		return scanner.lexString(start)
	case next == '-' || isDigit(next):
		return scanner.lexNumber(start)
	case isIdentStart(next):
		scanner.lexIdent(start)
		return nil
	case next == '#' || next == '/':
		return commentDiagnostic(start)
	case operatorCharacters[next]:
		return operatorDiagnostic(start, next)
	}
	return scanner.lexPunctuation(start)
}

func (scanner *lexer) lexNewline(start Position) *Diagnostic {
	if scanner.peek() == '\r' {
		scanner.advance()
		if scanner.peek() != '\n' {
			return syntaxDiagnostic(start, "a carriage return appeared without a line feed", "separate statements with a single newline")
		}
	}
	scanner.advance()
	scanner.emit(token{kind: tokenNewline, position: start})
	return nil
}

func (scanner *lexer) lexPunctuation(start Position) *Diagnostic {
	kind, ok := punctuationTokens[scanner.peek()]
	if !ok {
		value := scanner.advance()
		return syntaxDiagnostic(
			start,
			fmt.Sprintf("%q cannot start a value", string(value)),
			"use only component calls, strings, numbers, true, false, null, arrays, objects, and statement names",
		)
	}
	scanner.advance()
	scanner.depth += bracketDepthChange[kind]
	if scanner.depth < 0 {
		return syntaxDiagnostic(start, "a closing bracket had no matching opening bracket", "remove the extra bracket")
	}
	scanner.emit(token{kind: kind, position: start})
	return nil
}

func (scanner *lexer) lexIdent(start Position) {
	begin := scanner.offset
	for scanner.offset < len(scanner.source) && isIdentPart(scanner.peek()) {
		scanner.advance()
	}
	text := scanner.source[begin:scanner.offset]
	if kind, ok := keywordTokens[text]; ok {
		scanner.emit(token{kind: kind, text: text, position: start})
		return
	}
	scanner.emit(token{kind: tokenIdent, text: text, position: start})
}

func (scanner *lexer) lexNumber(start Position) *Diagnostic {
	begin := scanner.offset
	for scanner.offset < len(scanner.source) && isNumberPart(scanner.peek()) {
		scanner.advance()
	}
	text := scanner.source[begin:scanner.offset]
	if diagnostic := checkNumberShape(start, text); diagnostic != nil {
		return diagnostic
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return numberDiagnostic(start, text)
	}
	scanner.emit(token{kind: tokenNumber, text: text, number: value, position: start})
	return nil
}

func (scanner *lexer) lexString(start Position) *Diagnostic {
	scanner.advance()
	var builder strings.Builder
	for scanner.offset < len(scanner.source) {
		if scanner.peek() == '\\' {
			scanner.advance()
			if diagnostic := scanner.lexEscape(&builder); diagnostic != nil {
				return diagnostic
			}
			continue
		}
		value := scanner.advance()
		switch {
		case value == '"':
			scanner.emit(token{kind: tokenString, text: builder.String(), position: start})
			return nil
		case value == '\n':
			return unterminatedStringDiagnostic(start)
		case value < 0x20:
			return controlCharacterDiagnostic(start, value)
		}
		builder.WriteRune(value)
	}
	return unterminatedStringDiagnostic(start)
}

func (scanner *lexer) lexEscape(builder *strings.Builder) *Diagnostic {
	start := scanner.position()
	if scanner.offset >= len(scanner.source) {
		return unterminatedStringDiagnostic(start)
	}
	marker := scanner.peek()
	if decoded, ok := stringEscapes[marker]; ok {
		scanner.advance()
		builder.WriteRune(decoded)
		return nil
	}
	if marker != 'u' {
		return syntaxDiagnostic(
			start,
			fmt.Sprintf("\\%s is not a supported string escape", string(marker)),
			`use \" \\ \/ \b \f \n \r \t or \uXXXX`,
		)
	}
	return scanner.lexUnicodeEscape(builder, start)
}

func (scanner *lexer) lexUnicodeEscape(builder *strings.Builder, start Position) *Diagnostic {
	first, diagnostic := scanner.readHexQuad(start)
	if diagnostic != nil {
		return diagnostic
	}
	if !utf16.IsSurrogate(rune(first)) {
		builder.WriteRune(rune(first))
		return nil
	}
	if !strings.HasPrefix(scanner.source[scanner.offset:], `\u`) {
		return surrogateDiagnostic(start)
	}
	scanner.advance()
	second, diagnostic := scanner.readHexQuad(start)
	if diagnostic != nil {
		return diagnostic
	}
	combined := utf16.DecodeRune(rune(first), rune(second))
	if combined == utf8.RuneError {
		return surrogateDiagnostic(start)
	}
	builder.WriteRune(combined)
	return nil
}

func (scanner *lexer) readHexQuad(start Position) (uint64, *Diagnostic) {
	scanner.advance()
	if scanner.offset+4 > len(scanner.source) {
		return 0, unterminatedStringDiagnostic(start)
	}
	digits := scanner.source[scanner.offset : scanner.offset+4]
	value, err := strconv.ParseUint(digits, 16, 32)
	if err != nil {
		return 0, syntaxDiagnostic(start, `\u must be followed by four hexadecimal digits`, `write the escape as \uXXXX`)
	}
	for range 4 {
		scanner.advance()
	}
	return value, nil
}

func checkNumberShape(start Position, text string) *Diagnostic {
	digits := strings.TrimPrefix(text, "-")
	if digits == "" {
		return numberDiagnostic(start, text)
	}
	if len(digits) > 1 && digits[0] == '0' && isDigit(digits[1]) {
		return numberDiagnostic(start, text)
	}
	return nil
}

func isDigit(value byte) bool {
	return value >= '0' && value <= '9'
}

func isIdentStart(value byte) bool {
	return value == '_' || (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z')
}

func isIdentPart(value byte) bool {
	return isIdentStart(value) || isDigit(value)
}

func isNumberPart(value byte) bool {
	return isDigit(value) || value == '-' || value == '+' || value == '.' || value == 'e' || value == 'E'
}

func syntaxDiagnostic(position Position, message string, correction string) *Diagnostic {
	diagnostic := newDiagnostic(CodeSyntax, position, message, correction)
	return &diagnostic
}

func commentDiagnostic(position Position) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeUnsupportedSyntax,
		position,
		"comments are not part of the artifact document profile",
		"delete the comment; explain the content with a Text or Markdown block instead",
	)
	return &diagnostic
}

func operatorDiagnostic(position Position, operator byte) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeUnsupportedSyntax,
		position,
		fmt.Sprintf("%q begins an expression, and artifact documents are not evaluated", string(operator)),
		"write the finished value directly, for example 2 rather than 1 + 1",
	)
	return &diagnostic
}

func numberDiagnostic(position Position, text string) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeInvalidValue,
		position,
		fmt.Sprintf("%q is not a finite number", text),
		"write plain finite numbers such as 12, -3.5, or 1.2e3",
	)
	return &diagnostic
}

func unterminatedStringDiagnostic(position Position) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeSyntax,
		position,
		"a string literal was never closed",
		`close the string with " and escape any newline as \n`,
	)
	return &diagnostic
}

func controlCharacterDiagnostic(position Position, value rune) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeSyntax,
		position,
		fmt.Sprintf("a string contained the control character U+%04X", value),
		`escape control characters, for example \n or \t`,
	)
	return &diagnostic
}

func surrogateDiagnostic(position Position) *Diagnostic {
	diagnostic := newDiagnostic(
		CodeSyntax,
		position,
		"a Unicode escape used an unpaired surrogate",
		"write the character directly as UTF-8, or pair the surrogate escapes",
	)
	return &diagnostic
}
